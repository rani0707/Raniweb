"""Fail-closed, digest-only rootless deployment agent (Python 3.12+)."""
import argparse
import contextlib
import fcntl
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time
import tomllib
import urllib.request

from policy import ISSUER, REPOSITORY, release_from_attestations, require_digest

HERE = Path(__file__).resolve().parent
SLOTS = ("blue", "green")


def atomic_json(path, value):
    atomic_bytes(path, (json.dumps(value, indent=2) + "\n").encode(), 0o600)


def atomic_bytes(path, value, mode=0o644):
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(value)
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), mode)
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temporary)


def allowed_release(state, release):
    if state.get("paused"):
        raise ValueError("Automatic deployment is paused; use resume after reviewing status")
    if release["digest"] in state.get("failed", []):
        raise ValueError("This digest is quarantined; inspect logs before using retry")
    if state.get("current", {}).get("digest") == release["digest"]:
        return False
    if release["order"] <= state.get("highWater", [0, 0]):
        raise ValueError("Old/replayed release blocked by persistent high-water mark")
    return True


def copy_assets(source, destination):
    """Only additive immutable assets. Reject links, device files and collisions."""
    for path in source.rglob("*"):
        mode = path.lstat().st_mode
        if not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
            raise ValueError("Non-regular static asset rejected")
        target = destination / path.relative_to(source)
        if target.is_symlink():
            raise ValueError("Static asset destination is a symlink")
        if path.is_dir():
            target.mkdir(mode=0o755, exist_ok=True)
            target.chmod(0o755)
        elif target.exists():
            if target.read_bytes() != path.read_bytes():
                raise ValueError(f"Static filename collision: {path.relative_to(source)}")
        else:
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            atomic_bytes(target, path.read_bytes())


class Deployer:
    def __init__(self, home=None):
        self.home = Path(home or Path.home())
        self.config_dir = self.home / ".config/raniweb"
        self.state_dir = self.home / ".local/state/raniweb"
        self.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.state_path = self.state_dir / "state.json"
        self.config = tomllib.loads((self.config_dir / "config.toml").read_text())
        self.repository = self.config["repository"]
        if not REPOSITORY.fullmatch(self.repository) or "YOUR_" in self.repository:
            raise ValueError("Set the exact GitHub OWNER/REPOSITORY in config.toml")
        # Fixed namespace, workflow and channel prevent arbitrary registry/signer policy changes.
        self.image = f"ghcr.io/{self.repository.lower()}"
        if self.config.get("channel", "stable") != "stable" or self.config.get("workflow", "docker.yml") != "docker.yml":
            raise ValueError("Only stable channel and docker.yml workflow are supported")
        self.workflow = "docker.yml"
        self.identity = f"https://github.com/{self.repository}/.github/workflows/{self.workflow}@refs/heads/main"
        self.tools = HERE.parent / "bin"
        self.env = dict(os.environ)
        self.env.pop("DOCKER_CONTEXT", None)
        self.env.update(DOCKER_HOST=f"unix:///run/user/{os.getuid()}/docker.sock",
                        DOCKER_CONFIG=str(self.config_dir / "registry"),
                        PATH=f"{self.tools}:{os.environ.get('PATH', '/usr/bin:/bin')}")
        self.gateway_image = json.loads((HERE / "tools.lock.json").read_text())["gateway"]["image"]
        require_digest(self.gateway_image.split("@", 1)[1])

    def run(self, *args, timeout=300):
        result = subprocess.run(args, env=self.env, check=True, text=True,
                                stdout=subprocess.PIPE, timeout=timeout)
        return result.stdout.strip()

    def rootless_check(self):
        if sys.platform != "linux" or os.getuid() == 0:
            raise ValueError("Run as the dedicated unprivileged Linux deployment user")
        info = json.loads(self.run("docker", "info", "--format", "{{json .}}"))
        if "name=rootless" not in info.get("SecurityOptions", []):
            raise ValueError("Refusing deployment: this Docker daemon is not rootless")
        if (info.get("CgroupVersion") != "2" or info.get("CgroupDriver") != "systemd"
                or not info.get("MemoryLimit") or not info.get("PidsLimit") or not info.get("CpuCfsQuota")):
            raise ValueError("Rootless systemd/cgroup v2 CPU, memory and process limits must be available")
        self.run("docker", "compose", "version")
        for path in (self.config_dir / "config.toml", self.config_dir / "app.env"):
            metadata = path.lstat()
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or metadata.st_mode & 0o077:
                raise ValueError(f"Expected an owner-only regular file: {path}")

    def load(self):
        if not self.state_path.exists():
            return {"highWater": [0, 0], "failed": [], "paused": False, "slots": {}}
        return json.loads(self.state_path.read_text())

    def save(self, state):
        atomic_json(self.state_path, state)

    def verify(self, digest):
        require_digest(digest)
        ref = f"{self.image}@{digest}"
        flags = ["--certificate-identity", self.identity, "--certificate-oidc-issuer", ISSUER]
        self.run("cosign", "verify", *flags, ref)
        text = self.run("cosign", "verify-attestation", *flags, "--type", "slsaprovenance1", "--output", "json", ref)
        return release_from_attestations(text, self.repository, self.workflow, self.image, digest)

    def compose(self, state, slot, *arguments):
        # Both substitutions must be defined even when the other profile is disabled.
        fallback = state["slots"][slot]
        self.env.update(RANIWEB_BLUE_IMAGE=state["slots"].get("blue", fallback),
                        RANIWEB_GREEN_IMAGE=state["slots"].get("green", fallback),
                        RANIWEB_GATEWAY_IMAGE=self.gateway_image,
                        RANIWEB_APP_ENV=str(self.config_dir / "app.env"),
                        RANIWEB_DEPLOY_DIR=str(HERE), RANIWEB_STATE_DIR=str(self.state_dir))
        return self.run("docker", "compose", "--env-file", "/dev/null", "--project-name", "raniweb",
                        "--file", str(HERE / "docker-compose.yml"), "--profile", slot, *arguments)

    def upstream(self, slot):
        if slot not in SLOTS:
            raise ValueError("Invalid deployment slot")
        value = (f"upstream raniweb_backend {{ server raniweb-{slot}:3000; keepalive 16; }}\n"
                 f'map $host $raniweb_slot {{ default "{slot}"; }}\n')
        atomic_bytes(self.state_dir / "gateway/upstream.conf", value.encode())

    def reload(self):
        self.run("docker", "exec", "raniweb-gateway", "nginx", "-t")
        self.run("docker", "exec", "raniweb-gateway", "nginx", "-s", "reload")

    def probe_gateway(self, slot):
        # Disable environment proxy configuration; traffic must stay on this host.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for attempt in range(30):
            try:
                for path in ("/api/health", "/"):
                    with opener.open(f"http://127.0.0.1:18080{path}", timeout=5) as response:
                        if response.status != 200 or response.headers.get("X-Raniweb-Slot") != slot:
                            raise ValueError("Gateway has not switched to the expected slot")
                        if response.geturl() != f"http://127.0.0.1:18080{path}":
                            raise ValueError("Unexpected redirect")
                        response.read(1024)
                return
            except (OSError, ValueError):
                if attempt == 29:
                    raise
                time.sleep(2)

    def restore(self, state):
        previous = state["pending"].get("previous")
        if previous:
            self.upstream(previous["slot"])
            self.compose(state, previous["slot"], "up", "-d", "--no-build", "--pull", "never", "--no-deps", "gateway")
            self.reload()
            self.probe_gateway(previous["slot"])
        else:
            # Initial deployment has no healthy previous version to expose.
            if self.run("docker", "ps", "-aq", "--filter", "name=^/raniweb-gateway$"):
                self.run("docker", "stop", "raniweb-gateway")
        state.pop("pending")
        self.save(state)

    def recover(self, state):
        if "pending" in state:
            print("Recovering interrupted switch to the last committed release", flush=True)
            self.restore(state)

    def prepare(self, release, state, slot):
        ref = f"{self.image}@{release['digest']}"
        self.run("docker", "pull", ref, timeout=600)
        metadata = json.loads(self.run("docker", "image", "inspect", ref))[0]
        if ref not in metadata.get("RepoDigests", []):
            raise ValueError("Docker's pulled repository digest does not match the signed digest")
        if metadata["Config"].get("Labels", {}).get("org.opencontainers.image.revision") != release["commit"]:
            raise ValueError("Pulled image revision differs from signed release")
        state["slots"][slot] = ref
        self.save(state)
        self.compose(state, slot, "up", "-d", "--no-build", "--pull", "never", slot)
        name = f"raniweb-{slot}"
        for attempt in range(90):
            metadata = json.loads(self.run("docker", "inspect", name))[0]
            if metadata["State"].get("Health", {}).get("Status") == "healthy":
                break
            if not metadata["State"]["Running"]:
                raise ValueError("Candidate container stopped")
            if attempt == 89:
                raise ValueError("Candidate health check timed out")
            time.sleep(2)
        script = "(async()=>{for(const [p,status] of [['/api/health',200],['/',200],['/403',403],['/404',404]]){const r=await fetch('http://127.0.0.1:3000'+p);if(r.status!==status)throw Error(p+': '+r.status)}})().catch(e=>{console.error(e);process.exit(1)})"
        self.run("docker", "exec", name, "node", "-e", script)
        with tempfile.TemporaryDirectory(dir=self.state_dir) as temporary:
            self.run("docker", "cp", f"{name}:/app/.next/static/.", temporary)
            copy_assets(Path(temporary), self.state_dir / "assets")

    def activate(self, release, state, rollback=False):
        previous = state.get("current")
        slot = "green" if previous and previous["slot"] == "blue" else "blue"
        try:
            self.prepare(release, state, slot)
            self.run("docker", "pull", self.gateway_image, timeout=600)
            # The durable journal precedes any externally visible traffic change.
            state["pending"] = {"previous": previous, "candidate": dict(release, slot=slot)}
            self.save(state)
            self.upstream(slot)
            self.compose(state, slot, "up", "-d", "--no-build", "--pull", "never", "--no-deps", "gateway")
            self.reload()
            self.probe_gateway(slot)
            state.update(previous=previous, current=dict(release, slot=slot),
                         highWater=max(state.get("highWater", [0, 0]), release["order"]),
                         paused=rollback or state.get("paused", False))
            state.pop("pending")
            self.save(state)
            print(f"Active {slot}: {self.image}@{release['digest']} ({release['commit']})", flush=True)
        except Exception:
            # Reload journal from disk: a failure after save must still be recoverable.
            state = self.load()
            state["failed"] = (state.get("failed", []) + [release["digest"]])[-32:]
            self.save(state)
            if "pending" in state:
                self.restore(state)
            raise

    def command(self, action):
        with open(self.state_dir / "deploy.lock", "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            state = self.load()
            if action == "status":
                print(json.dumps(state, indent=2))
                return
            self.rootless_check()
            self.recover(state)
            if action in ("pause", "resume", "retry"):
                if action == "retry":
                    state["failed"] = []
                else:
                    state["paused"] = action == "pause"
                self.save(state)
                print(f"Saved {action}; status is available with the status command")
                return
            if action == "rollback":
                previous = state.get("previous")
                if not previous:
                    raise ValueError("No previous committed release")
                release = self.verify(previous["digest"])
                self.activate(release, state, rollback=True)
                return
            if state.get("paused"):
                print("Automatic deployment is paused")
                return
            digest = require_digest(self.run("crane", "digest", f"{self.image}:stable"))
            if state.get("current", {}).get("digest") == digest:
                print("No new release")
                return
            release = self.verify(digest)
            if allowed_release(state, release):
                self.activate(release, state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["update", "status", "pause", "resume", "rollback", "retry"])
    args = parser.parse_args()
    try:
        Deployer().command(args.action)
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(f"Deployment blocked: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
