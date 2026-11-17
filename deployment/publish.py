"""GitHub-hosted publisher. Never rebuild images after their scan/test gate."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from policy import BUILD_TYPE, ISSUER, REPOSITORY, check_index, release_from_attestations, require_digest


def run(*args):
    result = subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE, timeout=900)
    return result.stdout.strip()


def pushed_manifest(output):
    matches = re.findall(r"^\S+: digest: (sha256:[0-9a-f]{64}) size: ([0-9]+)\s*$", output, re.M)
    if len(matches) != 1:
        raise ValueError("Docker push did not report exactly one manifest digest and size")
    return {"digest": require_digest(matches[0][0]), "size": int(matches[0][1])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifacts", required=True, type=Path)
    args = parser.parse_args()
    repo = os.environ["GITHUB_REPOSITORY"]
    sha = os.environ["GITHUB_SHA"]
    if not REPOSITORY.fullmatch(repo) or os.environ["GITHUB_REF"] != "refs/heads/main":
        raise ValueError("Only the configured main branch can publish")
    if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", sha):
        raise ValueError("Invalid source commit")
    number, attempt = int(os.environ["GITHUB_RUN_NUMBER"]), int(os.environ["GITHUB_RUN_ATTEMPT"])
    if min(number, attempt) < 1:
        raise ValueError("Invalid run order")
    image = f"ghcr.io/{repo.lower()}"
    workflow = "docker.yml"
    identity = f"https://github.com/{repo}/.github/workflows/{workflow}@refs/heads/main"
    children = []
    for arch in ("amd64", "arm64"):
        run("docker", "load", "--input", str(args.artifacts / f"image-{arch}.tar"))
        local = f"raniweb:check-{arch}-{sha}"
        metadata = json.loads(run("docker", "image", "inspect", local))[0]
        if (metadata["Architecture"], metadata["Os"], metadata["Config"]["Labels"].get("org.opencontainers.image.revision")) != (arch, "linux", sha):
            raise ValueError("Checked image platform or revision mismatch")
        tag = f"{image}:run-{os.environ['GITHUB_RUN_ID']}-{attempt}-{arch}"
        run("docker", "tag", local, tag)
        child = pushed_manifest(run("docker", "push", tag))
        child["arch"] = arch
        children.append(child)
        sbom = args.artifacts / f"sbom-{arch}.json"
        if json.loads(sbom.read_text()).get("spdxVersion") != "SPDX-2.3":
            raise ValueError("Expected a Trivy SPDX 2.3 SBOM")
        run("cosign", "attest", "--yes", "--type", "spdxjson", "--predicate", str(sbom), f"{image}@{child['digest']}")
    index_tag = f"{image}:run-{os.environ['GITHUB_RUN_ID']}-{attempt}"
    command = ["crane", "index", "append"]
    for child in children:
        command += ["--manifest", f"{image}@{child['digest']}"]
    published = run(*command, "--tag", index_tag)
    digest = require_digest(published.split("@")[-1])
    ref = f"{image}@{digest}"
    check_index(json.loads(run("crane", "manifest", ref)), children)
    params = dict(repository=repo, ref="refs/heads/main", workflow=workflow, commit=sha,
                  imageDigest=digest, runNumber=number, runAttempt=attempt)
    predicate = {
        "buildDefinition": {"buildType": BUILD_TYPE, "externalParameters": params,
                            "internalParameters": {}, "resolvedDependencies": [
                                {"uri": f"git+https://github.com/{repo}@refs/heads/main", "digest": {"gitCommit": sha}}]},
        "runDetails": {"builder": {"id": identity}, "metadata": {
            "invocationId": f"https://github.com/{repo}/actions/runs/{os.environ['GITHUB_RUN_ID']}/attempts/{attempt}"}},
    }
    with tempfile.TemporaryDirectory() as temporary:
        path = Path(temporary) / "release.json"
        path.write_text(json.dumps(predicate))
        run("cosign", "sign", "--yes", ref)
        run("cosign", "attest", "--yes", "--type", "slsaprovenance1", "--predicate", str(path), ref)
    verification = ["--certificate-identity", identity, "--certificate-oidc-issuer", ISSUER]
    run("cosign", "verify", *verification, ref)
    verified = run("cosign", "verify-attestation", *verification, "--type", "slsaprovenance1", "--output", "json", ref)
    release = release_from_attestations(verified, repo, workflow, image, digest)
    if release["order"] != [number, attempt] or release["commit"] != sha:
        raise ValueError("Signed release does not match this run")
    # This is the ONLY mutable deployment channel. Failed gates never reach it.
    run("crane", "tag", ref, "stable")
    summary = f"Released `{ref}`\n\nCommit `{sha}`, run {number}/{attempt}.\n"
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as output:
            output.write(summary)


if __name__ == "__main__":
    main()
