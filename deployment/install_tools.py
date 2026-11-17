#!/usr/bin/env python3
"""Install official Linux binaries using repository-pinned SHA-256, never curl|sh."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parent

def install(destination):
    arch = {"x86_64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine())
    if platform.system() != "Linux" or not arch:
        raise RuntimeError("Use Ubuntu 24.04 amd64/arm64. No system binaries are changed on other platforms.")
    lock = json.loads((ROOT / "tools.lock.json").read_text())
    destination = Path(destination).resolve()
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    names = [("sigstore/cosign", f"cosign-linux-{arch}", "cosign"),
             ("google/go-containerregistry", f"go-containerregistry_Linux_{'x86_64' if arch == 'amd64' else 'arm64'}.tar.gz", "crane")]
    for project, name, binary in names:
        asset = next(a for a in lock[project]["assets"] if a["name"] == name)
        if not asset["sha256"].startswith("sha256:") or len(asset["sha256"]) != 71:
            raise ValueError("Missing pinned SHA-256")
        with urllib.request.urlopen(asset["url"], timeout=120) as response:
            data = response.read(256 * 1024 * 1024 + 1)
        if len(data) > 256 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != asset["sha256"][7:]:
            raise ValueError(f"Checksum rejected: {name}")
        if binary == "crane":
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
                member = archive.getmember("crane")
                if not member.isfile():
                    raise ValueError("Invalid crane archive")
                data = archive.extractfile(member).read()
        with tempfile.NamedTemporaryFile(dir=destination, delete=False) as temporary:
            temporary.write(data)
            temporary.flush()
            os.fsync(temporary.fileno())
            name = temporary.name
        os.chmod(name, 0o700)
        os.replace(name, destination / binary)
        print(f"Installed verified {binary} {lock[project]['version']}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", required=True)
    install(parser.parse_args().destination)
