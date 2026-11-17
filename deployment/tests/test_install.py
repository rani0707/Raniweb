import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import install


class Install(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.home = Path(temporary.name)
        self.state = self.home / ".local/state/raniweb/state.json"

    def run_installer(self, run, *flags):
        with patch.object(install.sys, "argv", ["install.py", "--repository", "Example/RaniWeb", *flags]), \
             patch.object(install.sys, "platform", "linux"), \
             patch.object(install.os, "getuid", return_value=1001), \
             patch.object(install.os, "umask"), \
             patch.object(install.Path, "home", return_value=self.home), \
             patch.object(install, "install"), \
             patch.object(install.subprocess, "run", side_effect=run) as commands:
            install.main()
        return [call.args[0] for call in commands.call_args_list]

    def test_first_release_is_active_before_enabling_timer(self):
        def run(command, **kwargs):
            if command[-1] == "update":
                self.state.write_text(json.dumps({"current": {"slot": "blue"}}))

        commands = self.run_installer(run, "--start", "--registry-user", "Example")
        self.assertEqual(commands[1][-4:], ["login", "ghcr.io", "--username", "Example"])
        self.assertEqual(commands[1][4], "unix:///run/user/1001/docker.sock")
        self.assertEqual(commands[2][-1], "update")
        self.assertEqual(commands[3], ["systemctl", "--user", "enable", "--now", "raniweb-update.timer"])

    def test_failed_first_update_does_not_enable_timer(self):
        commands = []

        def run(command, **kwargs):
            commands.append(command)
            if command[-1] == "update":
                raise subprocess.CalledProcessError(1, command)

        with self.assertRaises(subprocess.CalledProcessError):
            self.run_installer(run, "--start")
        self.assertEqual(len(commands), 2)
        self.assertEqual(commands[-1][-1], "update")

    def test_success_without_active_release_does_not_enable_timer(self):
        commands = []
        with self.assertRaisesRegex(SystemExit, "No active release"):
            self.run_installer(lambda command, **kwargs: commands.append(command), "--start")
        self.assertEqual(len(commands), 2)

    def test_install_only_does_not_start_deployment(self):
        commands = self.run_installer(lambda command, **kwargs: None)
        self.assertEqual(commands, [["systemctl", "--user", "daemon-reload"]])
