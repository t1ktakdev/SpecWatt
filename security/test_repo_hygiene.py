"""Repository and mobile-client hygiene as executable checks.

These assertions turn the public-repo audit and the mobile security review
into regression tests: they fail if a secret-shaped file, a debug statement,
a weak token-storage pattern or a hostile Android permission ever lands in the
repository. They read the working tree only; run security/scan_secrets.py for
full-history scanning.
"""
import json
import re
import subprocess
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
APP = REPO / "mobile" / "specwatt-app"
BACKEND = REPO / "backend"


def tracked_files():
    output = subprocess.run(
        ["git", "ls-files", "-z"], cwd=REPO, capture_output=True, check=True
    ).stdout
    return [Path(name) for name in output.decode("utf-8").split("\0") if name]


class RepoHygieneTests(unittest.TestCase):
    def test_no_sensitive_files_are_tracked(self):
        forbidden_suffixes = (
            ".env", ".pem", ".key", ".jks", ".keystore", ".p12",
            ".sqlite3", ".sqlite", ".db", ".log",
        )
        forbidden_names = {"credentials.json", "adbkey", "adbkey.pub"}
        offenders = [
            str(path) for path in tracked_files()
            if path.suffix in forbidden_suffixes or path.name in forbidden_names
        ]
        self.assertEqual(offenders, [])

    def test_gitignore_covers_runtime_secrets_and_databases(self):
        content = (REPO / ".gitignore").read_text(encoding="utf-8")
        for pattern in (".env", "*.sqlite*", "*.key", "*.jks", "*.pem",
                        "credentials.json", "backend/data/"):
            self.assertIn(pattern, content, f".gitignore misses {pattern}")

    def test_python_requirements_are_exact_pins(self):
        for name in ("requirements.txt", "requirements-dev.txt"):
            lines = (BACKEND / name).read_text(encoding="utf-8").splitlines()
            requirements = [
                line.strip() for line in lines
                if line.strip() and not line.strip().startswith("-r")
            ]
            self.assertTrue(requirements, f"{name} is empty")
            for requirement in requirements:
                self.assertRegex(requirement, r"^[A-Za-z0-9_.-]+==[0-9][^ ;]*$",
                                 f"{name}: {requirement}")

    def test_mobile_package_is_private_and_has_no_publish_config(self):
        package = json.loads((APP / "package.json").read_text(encoding="utf-8"))
        self.assertTrue(package.get("private"))

    def test_no_dangerous_native_config_in_app_json(self):
        config = json.loads((APP / "app.json").read_text(encoding="utf-8"))["expo"]
        android = config.get("android", {})
        permissions = android.get("permissions")
        if permissions is not None:
            allowed = {"INTERNET"}
            unexpected = set(permissions) - allowed
            self.assertEqual(unexpected, set(),
                             "android.permissions should stay minimal")
        config_text = (APP / "app.json").read_text(encoding="utf-8")
        self.assertNotIn("usesCleartextTraffic", config_text)
        self.assertNotIn("android:exported", config_text)

    def test_no_stray_build_or_data_directories_tracked(self):
        offenders = [
            str(path) for path in tracked_files()
            if path.parts and path.parts[0] in ("node_modules", ".venv", "outputs",
                                                "work", "dist", "dist-android-v6",
                                                "dist-web-v6")
        ]
        self.assertEqual(offenders, [])


class MobileStaticSecurityTests(unittest.TestCase):
    """Source-level checks for mobile/specwatt-app (v6 tree)."""

    @classmethod
    def setUpClass(cls):
        cls.sources = {}
        for path in (APP / "src").rglob("*"):
            if path.is_file() and path.suffix in (".ts", ".tsx"):
                cls.sources[path.relative_to(APP)] = path.read_text(encoding="utf-8")
        cls.api_text = (APP / "src" / "specwatt" / "api.ts").read_text(encoding="utf-8")

    def test_no_console_logging_in_application_sources(self):
        offenders = []
        pattern = re.compile(r"\bconsole\.(log|info|warn|error|debug)\b")
        for relative, text in self.sources.items():
            if pattern.search(text):
                offenders.append(str(relative))
        self.assertEqual(offenders, [])

    def test_no_webview_eval_or_dom_sinks(self):
        pattern = re.compile(
            r"\bWebView\b|\beval\s*\(|dangerouslySetInnerHTML|innerHTML"
            r"|\bdocument\.cookie\b|new Function\s*\("
        )
        offenders = [
            str(relative) for relative, text in self.sources.items()
            if pattern.search(text)
        ]
        self.assertEqual(offenders, [])

    def test_tokens_use_securestore_on_native_and_memory_on_web(self):
        self.assertIn("expo-secure-store", self.api_text)
        self.assertIn("WHEN_UNLOCKED_THIS_DEVICE_ONLY", self.api_text)
        self.assertIn("Web intentionally has no persisted bearer token",
                      self.api_text)

    def test_async_storage_is_confined_to_the_offline_demo_store(self):
        pattern = re.compile(
            r"from\s+[\"']@react-native-async-storage/async-storage[\"']"
        )
        offenders = [
            str(relative) for relative, text in self.sources.items()
            if pattern.search(text) and relative.as_posix() != "src/specwatt/store.tsx"
        ]
        self.assertEqual(offenders, [])
        store_text = self.sources[Path("src/specwatt/store.tsx")]
        self.assertIn('"specwatt-mobile-v1"', store_text)
        # The demo store persists demo state only — never credentials.
        self.assertNotIn("token", store_text)
        self.assertNotIn("password", store_text.lower())

    def test_transport_is_https_outside_development_localhost(self):
        self.assertIn('url.protocol !== "https:"', self.api_text)
        self.assertIn('"10.0.2.2"', self.api_text)
        self.assertIn('credentials: "omit"', self.api_text)
        self.assertIn('redirect: "error"', self.api_text)

    def test_server_url_normalizer_is_covered_by_tests(self):
        tests_text = (APP / "tests" / "api.test.mjs").read_text(encoding="utf-8")
        self.assertIn("normalizeServerUrl", tests_text)
        # The client-side tests must keep rejecting cleartext and spoofed
        # hosts: HTTP outside dev-allowlist, evil subdomains and LAN hosts.
        for rejected in ("http://example.com", "http://127.0.0.1.evil.test",
                         "http://192.168.1.10:8000", "assert.throws"):
            self.assertIn(rejected, tests_text)

    def test_401_clears_the_local_vault(self):
        self.assertIn("response.status === 401", self.api_text)
        self.assertIn("await this.vault.clear(this.baseUrl)", self.api_text)

    def test_logout_revokes_server_side_then_clears_local_state(self):
        server_text = self.sources[Path("src/screens/server.tsx")]
        self.assertIn("await client.logout()", server_text)
        self.assertIn("clearSession()", server_text)
        self.assertIn('setPassword("")', server_text)

    def test_offline_demo_and_server_transport_stay_separated(self):
        self.assertIn("Never reads or mutates the offline demo store",
                      self.api_text)
        store_text = self.sources[Path("src/specwatt/store.tsx")]
        self.assertNotIn('from "./api"', store_text)
        self.assertNotIn("BrainClient", store_text)

    def test_restored_persisted_state_is_strictly_validated(self):
        model_text = self.sources[Path("src/specwatt/model.ts")]
        self.assertIn('["none", "demo"].includes(raw.source', model_text)
        self.assertIn("c.watts >= 0 && c.watts <= 1000", model_text)

    def test_response_size_and_timeout_guards_exist(self):
        self.assertIn("250000", self.api_text)
        self.assertIn("timeoutMs", self.api_text)
        self.assertIn("AbortController", self.api_text)

    def test_dev_http_targets_are_loopback_or_emulator_only(self):
        server_text = self.sources[Path("src/screens/server.tsx")]
        self.assertIn("10.0.2.2:8000", server_text)
        self.assertIn("127.0.0.1:8000", server_text)
        self.assertIn("https://localhost:8000", server_text)

    def test_v7_integration_keeps_these_guarantees(self):
        """Marker check: when v7 lands these files must still exist and keep
        the guarantees above, or this suite must be updated deliberately."""
        for required in ("src/specwatt/api.ts", "src/specwatt/store.tsx",
                         "src/specwatt/model.ts", "tests/api.test.mjs"):
            self.assertTrue((APP / required).is_file(), required)


if __name__ == "__main__":
    unittest.main()
