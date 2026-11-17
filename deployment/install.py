"""Install reviewed deployment files for the dedicated rootless Linux user."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from install_tools import install
from policy import REPOSITORY

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True, help="Exact-case GitHub OWNER/REPOSITORY")
    parser.add_argument("--start", action="store_true",
                        help="Deploy the first signed release and enable automatic updates")
    parser.add_argument("--registry-user", help="Prompt for GHCR credentials for a private package")
    args = parser.parse_args()
    if sys.platform != "linux" or os.getuid() == 0:
        raise ValueError("Run as the dedicated unprivileged Ubuntu user")
    if not REPOSITORY.fullmatch(args.repository) or "YOUR_" in args.repository:
        raise ValueError("Supply the actual GitHub repository")
    os.umask(0o077)
    home = Path.home()
    config = home / ".config/raniweb"
    state = home / ".local/state/raniweb"
    destination = home / ".local/lib/raniweb/deployment"
    units = home / ".config/systemd/user"
    for path in (config, state, destination, units, config / "registry"):
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Prevent files/config changing during an in-flight update, including reinstall.
    deployment_lock = open(state / "deploy.lock", "a")
    fcntl.flock(deployment_lock, fcntl.LOCK_EX)
    for path in (state / "assets", state / "gateway"):
        path.mkdir(exist_ok=True)
        path.chmod(0o755)  # Bound read-only into the unprivileged gateway UID.
    config_path = config / "config.toml"
    if config_path.exists():
        import tomllib
        if tomllib.loads(config_path.read_text())["repository"] != args.repository:
            raise ValueError("Existing repository differs; review config and persistent trust state manually")
    else:
        config_path.write_text(f'repository = {json.dumps(args.repository)}\nchannel = "stable"\nworkflow = "docker.yml"\n')
    env_path = config / "app.env"
    if not env_path.exists():
        env_path.write_text("NODE_ENV=production\nPORT=3000\nHOSTNAME=0.0.0.0\n")
    for path in (config_path, env_path):
        path.chmod(0o600)
    for name in ("deploy.py", "policy.py", "tools.lock.json", "gateway.conf"):
        shutil.copyfile(HERE / name, destination / name)
        (destination / name).chmod(0o644)
    shutil.copyfile(HERE.parent / "docker-compose.yml", destination / "docker-compose.yml")
    (destination / "docker-compose.yml").chmod(0o644)
    install(destination.parent / "bin")
    for name in ("raniweb-update.service", "raniweb-update.timer"):
        shutil.copyfile(HERE / "systemd" / name, units / name)
        (units / name).chmod(0o644)
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    deployment_lock.close()

    if args.registry_user:
        subprocess.run([
            "docker", "--config", str(config / "registry"),
            "--host", f"unix:///run/user/{os.getuid()}/docker.sock",
            "login", "ghcr.io", "--username", args.registry_user,
        ], env={key: value for key, value in os.environ.items() if key != "DOCKER_CONTEXT"}, check=True)

    if args.start:
        subprocess.run([sys.executable, str(destination / "deploy.py"), "update"], check=True)
        state_file = state / "state.json"
        if not state_file.exists() or not json.loads(state_file.read_text()).get("current"):
            raise SystemExit("No active release. Check the GitHub Actions publish job and deployment status.")
        subprocess.run(["systemctl", "--user", "enable", "--now", "raniweb-update.timer"], check=True)
        print("Automatic deployment is enabled. Check http://127.0.0.1:18080/api/health.")
    else:
        print(f"Installed in {destination}. Use --start to deploy and enable automatic updates.")


if __name__ == "__main__":
    main()
