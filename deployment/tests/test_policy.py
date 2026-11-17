import base64
import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from policy import BUILD_TYPE, PREDICATE_TYPE, check_index, json_values, release_from_attestations, require_digest
from publish import pushed_manifest

D = 'sha256:' + 'a' * 64
REPO = 'Example/RaniWeb'
IMAGE = 'ghcr.io/example/raniweb'


def statement():
    return {'predicateType': PREDICATE_TYPE, 'subject': [{'name': IMAGE, 'digest': {'sha256': D[7:]}}],
            'predicate': {'buildDefinition': {'buildType': BUILD_TYPE, 'externalParameters': {
                'repository': REPO, 'ref': 'refs/heads/main', 'workflow': 'docker.yml',
                'commit': 'b' * 40, 'imageDigest': D, 'runNumber': 12, 'runAttempt': 1}}}}


def envelope(value):
    return json.dumps({'payload': base64.b64encode(json.dumps(value).encode()).decode()})


def verify(value):
    return release_from_attestations(envelope(value), REPO, 'docker.yml', IMAGE, D)


class AttestationPolicy(unittest.TestCase):
    def test_exact_release(self):
        self.assertEqual(verify(statement()), {'digest': D, 'commit': 'b' * 40, 'order': [12, 1]})

    def test_wrong_fields_fail_closed(self):
        for key, value in [('repository', 'Attacker/RaniWeb'), ('ref', 'refs/heads/feature'),
                           ('workflow', 'untrusted.yml'), ('commit', 'not-a-commit'),
                           ('imageDigest', 'sha256:' + 'c' * 64), ('runNumber', 0),
                           ('runNumber', True), ('runAttempt', '1')]:
            with self.subTest(key=key, value=value):
                data = statement()
                data['predicate']['buildDefinition']['externalParameters'][key] = value
                with self.assertRaises(ValueError):
                    verify(data)

    def test_subject_and_build_type_fail_closed(self):
        cases = [lambda d: d.update(predicateType='untrusted'),
                 lambda d: d.update(subject=[]),
                 lambda d: d['subject'][0].update(name='ghcr.io/attacker/image'),
                 lambda d: d['subject'][0]['digest'].update(sha256='c' * 64),
                 lambda d: d['predicate']['buildDefinition'].update(buildType='untrusted')]
        for mutate in cases:
            data = statement()
            mutate(data)
            with self.assertRaises(ValueError):
                verify(data)

    def test_jsonl_and_array_output(self):
        first, second = statement(), statement()
        second['predicate']['buildDefinition']['externalParameters']['runAttempt'] = 2
        for text in [envelope(first) + '\n' + envelope(second), '[' + envelope(first) + ',' + envelope(second) + ']']:
            self.assertEqual(release_from_attestations(text, REPO, 'docker.yml', IMAGE, D)['order'], [12, 2])

    def test_unsigned_or_invalid_payload_rejected(self):
        for text in [json.dumps(statement()), '{"payload":"not base64"}', '{}', '[]']:
            with self.assertRaises(ValueError):
                release_from_attestations(text, REPO, 'docker.yml', IMAGE, D)

    def test_malformed_json_rejected(self):
        with self.assertRaises(ValueError):
            json_values('{')

    def test_digest_exact_sha256(self):
        for value in ['latest', D + '\n', D.upper(), D[:-1], None]:
            with self.assertRaises(ValueError):
                require_digest(value)


class IndexPolicy(unittest.TestCase):
    def setUp(self):
        self.children = [{'arch': 'amd64', 'digest': D, 'size': 100},
                         {'arch': 'arm64', 'digest': 'sha256:' + 'b' * 64, 'size': 120}]
        self.index = {'schemaVersion': 2, 'manifests': [dict(digest=c['digest'], size=c['size'],
                      platform={'os': 'linux', 'architecture': c['arch']}) for c in self.children]}

    def test_only_scanned_children(self):
        check_index(self.index, self.children)

    def test_tag_substitution_wrong_digest_size_or_platform_rejected(self):
        for patch in [{'digest': 'sha256:' + 'c' * 64}, {'size': 999}, {'urls': ['https://attacker/image']},
                      {'platform': {'os': 'linux', 'architecture': 's390x'}},
                      {'platform': {'os': 'windows', 'architecture': 'amd64'}}]:
            data = copy.deepcopy(self.index)
            data['manifests'][0].update(patch)
            with self.assertRaises(ValueError):
                check_index(data, self.children)

    def test_missing_or_extra_child_rejected(self):
        for manifests in [self.index['manifests'][:1], self.index['manifests'] * 2]:
            with self.assertRaises(ValueError):
                check_index(dict(self.index, manifests=manifests), self.children)

    def test_push_uses_reported_digest_not_mutable_tag(self):
        self.assertEqual(pushed_manifest('layers...\nrun-1: digest: ' + D + ' size: 100\n'), {'digest': D, 'size': 100})
        for value in ['', D, 'tag: digest: ' + D + ' size: 100\ntag: digest: ' + D + ' size: 100']:
            with self.assertRaises(ValueError):
                pushed_manifest(value)


if __name__ == '__main__':
    unittest.main()
