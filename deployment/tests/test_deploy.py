import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from deploy import Deployer, allowed_release, atomic_json, copy_assets
from test_policy import D, IMAGE, REPO, envelope, statement


class DeploymentPolicy(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        config = self.home / '.config/raniweb'
        config.mkdir(parents=True)
        (config / 'config.toml').write_text(f'repository = "{REPO}"\n')
        self.agent = Deployer(self.home)
        self.release = {'digest': D, 'order': [12, 1], 'commit': 'b' * 40}
        self.old = {'digest': 'sha256:' + 'c' * 64, 'order': [11, 1], 'commit': 'c' * 40, 'slot': 'blue'}
        self.state = {'slots': {'blue': IMAGE + '@' + self.old['digest']}, 'current': self.old,
                      'highWater': [11, 1], 'failed': [], 'paused': False}

    def test_monotonic_order_pause_and_quarantine(self):
        self.assertTrue(allowed_release(self.state, self.release))
        for patch_value in [{'highWater': [12, 1]}, {'highWater': [13, 1]}, {'paused': True}, {'failed': [D]}]:
            with self.assertRaises(ValueError):
                allowed_release(dict(self.state, **patch_value), self.release)
        self.assertFalse(allowed_release(dict(self.state, current=self.release), self.release))

    def test_signature_failure_never_reaches_attestation_or_docker_pull(self):
        with patch.object(self.agent, 'run', side_effect=subprocess.CalledProcessError(1, ['cosign'])) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                self.agent.verify(D)
        self.assertEqual(run.call_count, 1)
        command = run.call_args.args
        self.assertIn('--certificate-identity', command)
        self.assertIn('https://github.com/Example/RaniWeb/.github/workflows/docker.yml@refs/heads/main', command)
        self.assertIn('--certificate-oidc-issuer', command)
        self.assertFalse(any('ignore' in arg for arg in command))

    def test_verified_attestation_parsed_and_reference_is_digest(self):
        with patch.object(self.agent, 'run', side_effect=['[]', envelope(statement())]) as run:
            self.assertEqual(self.agent.verify(D), self.release)
        for call in run.call_args_list:
            self.assertEqual(call.args[-1], IMAGE + '@' + D)

    def test_atomic_state_is_owner_only_and_complete(self):
        path = self.home / 'state.json'
        atomic_json(path, self.state)
        self.assertEqual(json.loads(path.read_text()), self.state)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertFalse(list(self.home.glob('.pending-*')))

    def test_success_journals_before_gateway_change(self):
        self.agent.save(self.state)
        calls = []
        def upstream(slot):
            self.assertIn('pending', self.agent.load())
            calls.append(slot)
        with patch.object(self.agent, 'prepare'), patch.object(self.agent, 'run'), \
             patch.object(self.agent, 'compose'), patch.object(self.agent, 'upstream', side_effect=upstream), \
             patch.object(self.agent, 'reload'), patch.object(self.agent, 'probe_gateway'):
            self.agent.activate(self.release, self.state)
        state = self.agent.load()
        self.assertEqual(calls, ['green'])
        self.assertEqual(state['current']['slot'], 'green')
        self.assertEqual(state['previous'], self.old)
        self.assertEqual(state['highWater'], [12, 1])
        self.assertNotIn('pending', state)

    def test_switch_failure_restores_previous_and_quarantines(self):
        self.agent.save(self.state)
        with patch.object(self.agent, 'prepare'), patch.object(self.agent, 'run'), \
             patch.object(self.agent, 'compose'), patch.object(self.agent, 'upstream') as upstream, \
             patch.object(self.agent, 'reload'), \
             patch.object(self.agent, 'probe_gateway', side_effect=[ValueError('unhealthy'), None]):
            with self.assertRaises(ValueError):
                self.agent.activate(self.release, self.state)
        state = self.agent.load()
        self.assertEqual(state['current'], self.old)
        self.assertEqual(state['highWater'], [11, 1])
        self.assertIn(D, state['failed'])
        self.assertEqual([call.args[0] for call in upstream.call_args_list], ['green', 'blue'])
        self.assertNotIn('pending', state)

    def test_failed_recovery_keeps_journal_for_next_attempt(self):
        self.state['pending'] = {'previous': self.old}
        self.agent.save(self.state)
        with patch.object(self.agent, 'upstream'), patch.object(self.agent, 'compose'), \
             patch.object(self.agent, 'reload', side_effect=ValueError('gateway unavailable')):
            with self.assertRaises(ValueError):
                self.agent.recover(self.state)
        self.assertIn('pending', self.agent.load())

    def test_interrupted_switch_recovers_to_committed_slot(self):
        self.state['pending'] = {'previous': self.old}
        self.agent.save(self.state)
        with patch.object(self.agent, 'upstream') as upstream, patch.object(self.agent, 'compose'), \
             patch.object(self.agent, 'reload'), patch.object(self.agent, 'probe_gateway'):
            self.agent.recover(self.state)
        upstream.assert_called_once_with('blue')
        self.assertNotIn('pending', self.agent.load())

    def test_initial_failed_deploy_with_no_gateway_clears_pending(self):
        state = {'slots': {}, 'pending': {'previous': None}}
        self.agent.save(state)
        with patch.object(self.agent, 'run', return_value=''):
            self.agent.restore(state)
        self.assertNotIn('pending', self.agent.load())

    def test_manual_rollback_preserves_high_water_and_pauses(self):
        self.state['highWater'] = [13, 1]
        self.agent.save(self.state)
        with patch.object(self.agent, 'prepare'), patch.object(self.agent, 'run'), \
             patch.object(self.agent, 'compose'), patch.object(self.agent, 'upstream'), \
             patch.object(self.agent, 'reload'), patch.object(self.agent, 'probe_gateway'):
            self.agent.activate(self.release, self.state, rollback=True)
        self.assertEqual(self.agent.load()['highWater'], [13, 1])
        self.assertTrue(self.agent.load()['paused'])

    def test_cannot_fall_back_to_rootful_socket(self):
        self.assertEqual(self.agent.env['DOCKER_HOST'], f'unix:///run/user/{os.getuid()}/docker.sock')
        self.assertNotIn('DOCKER_CONTEXT', self.agent.env)
        with patch('deploy.sys.platform', 'linux'), patch('deploy.os.getuid', return_value=1001), \
             patch.object(self.agent, 'run', return_value='{"SecurityOptions":["name=seccomp"]}'):
            with self.assertRaises(ValueError):
                self.agent.rootless_check()

    def test_missing_rootless_cgroup_limits_blocked(self):
        info = dict(SecurityOptions=['name=rootless'], CgroupVersion='2', CgroupDriver='systemd',
                    MemoryLimit=False, PidsLimit=True)
        with patch('deploy.sys.platform', 'linux'), patch('deploy.os.getuid', return_value=1001), \
             patch.object(self.agent, 'run', return_value=json.dumps(info)):
            with self.assertRaisesRegex(ValueError, 'limits'):
                self.agent.rootless_check()

    def test_compose_never_builds_or_pulls_mutable_tag(self):
        self.state['slots']['green'] = IMAGE + '@' + D
        with patch.object(self.agent, 'run') as run:
            self.agent.compose(self.state, 'green', 'up', '-d', '--no-build', '--pull', 'never', 'green')
        args = run.call_args.args
        self.assertIn('/dev/null', args)
        self.assertIn('--no-build', args)
        self.assertEqual(self.agent.env['RANIWEB_GREEN_IMAGE'], IMAGE + '@' + D)


class Assets(unittest.TestCase):
    def test_immutable_additions_and_collision(self):
        with tempfile.TemporaryDirectory() as directory:
            source, dest = Path(directory) / 'source', Path(directory) / 'dest'
            source.mkdir()
            dest.mkdir()
            (source / 'chunks').mkdir()
            asset = source / 'chunks/abc.js'
            asset.write_text('one')
            old = os.umask(0o077)
            try:
                copy_assets(source, dest)
            finally:
                os.umask(old)
            self.assertEqual((dest / 'chunks').stat().st_mode & 0o777, 0o755)
            self.assertEqual((dest / 'chunks/abc.js').stat().st_mode & 0o777, 0o644)
            copy_assets(source, dest)
            asset.write_text('changed')
            with self.assertRaises(ValueError):
                copy_assets(source, dest)

    def test_symlinks_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            source, dest = Path(directory) / 'source', Path(directory) / 'dest'
            source.mkdir()
            dest.mkdir()
            (source / 'link').symlink_to('/etc/passwd')
            with self.assertRaises(ValueError):
                copy_assets(source, dest)


if __name__ == '__main__':
    unittest.main()
