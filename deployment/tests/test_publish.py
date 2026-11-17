import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import publish
from test_policy import D, IMAGE, REPO, envelope, statement


class Publisher(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for arch in ['amd64', 'arm64']:
            (self.root / f'sbom-{arch}.json').write_text('{"spdxVersion":"SPDX-2.3"}')
        self.environment = dict(GITHUB_REPOSITORY=REPO, GITHUB_SHA='b' * 40,
                                GITHUB_REF='refs/heads/main', GITHUB_RUN_NUMBER='12',
                                GITHUB_RUN_ATTEMPT='1', GITHUB_RUN_ID='123')
        self.commands = []
        self.children = [('amd64', 'sha256:' + 'd' * 64, 100), ('arm64', 'sha256:' + 'e' * 64, 120)]
        self.index = {'schemaVersion': 2, 'manifests': [dict(digest=d, size=s,
            platform={'os': 'linux', 'architecture': a}) for a,d,s in self.children]}
        self.signature_failure = False
        self.wrong_revision = False

    def fake_run(self, *args):
        self.commands.append(args)
        if args[:3] == ('docker', 'image', 'inspect'):
            arch = 'arm64' if 'arm64' in args[-1] else 'amd64'
            return json.dumps([{'Architecture': arch, 'Os': 'linux', 'Config': {'Labels': {
                'org.opencontainers.image.revision': 'a' * 40 if self.wrong_revision else 'b' * 40}}}])
        if args[:2] == ('docker', 'push'):
            child = next(child for child in self.children if args[-1].endswith('-' + child[0]))
            return f'run: digest: {child[1]} size: {child[2]}'
        if args[:3] == ('crane', 'index', 'append'):
            return IMAGE + '@' + D
        if args[:2] == ('crane', 'manifest'):
            self.assertEqual(args[-1], IMAGE + '@' + D)
            return json.dumps(self.index)
        if args[:2] == ('cosign', 'verify') and self.signature_failure:
            raise subprocess.CalledProcessError(1, args)
        if args[:2] == ('cosign', 'verify-attestation'):
            return envelope(statement())
        return ''

    def execute(self):
        with patch.dict(os.environ, self.environment, clear=True), \
             patch('sys.argv', ['publish.py', '--artifacts', str(self.root)]), \
             patch.object(publish, 'run', side_effect=self.fake_run):
            publish.main()

    def test_scanned_artifacts_signed_verified_then_promoted(self):
        self.execute()
        self.assertEqual(self.commands[-1], ('crane', 'tag', IMAGE + '@' + D, 'stable'))
        self.assertFalse(any(args[:2] == ('crane', 'digest') for args in self.commands))
        self.assertEqual(sum(args[:2] == ('docker', 'load') for args in self.commands), 2)
        self.assertEqual(sum(args[:2] == ('docker', 'push') for args in self.commands), 2)
        self.assertEqual(sum(args[:2] == ('cosign', 'sign') for args in self.commands), 1)
        self.assertFalse(any(args[:2] == ('docker', 'build') for args in self.commands))

    def test_substituted_index_never_signed_or_promoted(self):
        self.index['manifests'][0]['digest'] = 'sha256:' + 'f' * 64
        with self.assertRaises(ValueError):
            self.execute()
        self.assertFalse(any(args[:2] in [('cosign', 'sign'), ('crane', 'tag')] for args in self.commands))

    def test_failed_signature_never_promoted(self):
        self.signature_failure = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.execute()
        self.assertFalse(any(args[:2] == ('crane', 'tag') for args in self.commands))

    def test_wrong_source_artifact_never_pushed(self):
        self.wrong_revision = True
        with self.assertRaises(ValueError):
            self.execute()
        self.assertFalse(any(args[:2] == ('docker', 'push') for args in self.commands))

    def test_non_main_never_published(self):
        self.environment['GITHUB_REF'] = 'refs/heads/feature'
        with self.assertRaises(ValueError):
            self.execute()
        self.assertEqual(self.commands, [])


if __name__ == '__main__':
    unittest.main()
