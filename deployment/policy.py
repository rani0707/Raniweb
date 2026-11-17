"""Pure validation shared by the publisher and Ubuntu verifier."""
import base64
import json
import re

DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
REPOSITORY = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*\Z")
PREDICATE_TYPE = "https://slsa.dev/provenance/v1"
BUILD_TYPE = "https://raniweb.kr/buildtypes/github-actions/v1"
ISSUER = "https://token.actions.githubusercontent.com"


def require_digest(value):
    if not isinstance(value, str) or not DIGEST.fullmatch(value):
        raise ValueError("Invalid sha256 manifest digest")
    return value


def json_values(text):
    decoder = json.JSONDecoder()
    text = text.strip()
    values = []
    while text:
        value, end = decoder.raw_decode(text)
        values.extend(value if isinstance(value, list) else [value])
        text = text[end:].lstrip()
    return values


def check_index(index, children):
    if index.get("schemaVersion") != 2 or len(index.get("manifests", [])) != 2:
        raise ValueError("Expected a two-platform index")
    expected = {child["arch"]: child for child in children}
    seen = set()
    for descriptor in index["manifests"]:
        platform = descriptor.get("platform", {})
        arch = platform.get("architecture")
        if arch in seen or arch not in expected or platform.get("os") != "linux" or descriptor.get("urls"):
            raise ValueError("Unexpected platform or external manifest URL")
        child = expected[arch]
        if descriptor.get("digest") != child["digest"] or descriptor.get("size") != child["size"]:
            raise ValueError("Index does not match the scanned platform image")
        seen.add(arch)
    if seen != {"amd64", "arm64"}:
        raise ValueError("Missing scanned platform")


def release_from_attestations(text, repository, workflow, image, digest):
    """Input must ONLY be stdout of successful cosign verify-attestation."""
    require_digest(digest)
    valid = []
    for envelope in json_values(text):
        try:
            statement = json.loads(base64.b64decode(envelope["payload"], validate=True))
            if statement.get("predicateType") != PREDICATE_TYPE:
                continue
            subjects = statement.get("subject", [])
            if len(subjects) != 1 or subjects[0].get("digest", {}).get("sha256") != digest[7:]:
                continue
            if subjects[0].get("name") not in [image, image.split("/", 1)[-1]]:
                continue
            definition = statement["predicate"]["buildDefinition"]
            params = definition["externalParameters"]
            if definition["buildType"] != BUILD_TYPE:
                continue
            if (params["repository"], params["ref"], params["workflow"], params["imageDigest"]) != (
                repository, "refs/heads/main", workflow, digest
            ):
                continue
            if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", params["commit"]):
                continue
            order = [params["runNumber"], params["runAttempt"]]
            if not all(type(value) is int and value > 0 for value in order):
                continue
            valid.append({"digest": digest, "order": order, "commit": params["commit"]})
        except (KeyError, TypeError, ValueError):
            continue
    if not valid:
        raise ValueError("No verified main-branch release attestation matches this image")
    return max(valid, key=lambda value: value["order"])
