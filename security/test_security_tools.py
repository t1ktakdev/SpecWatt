"""Behavioral checks for the CI gates, using synthetic inputs only."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import check_npm_audit as audit_gate
import scan_secrets as scanner


class AuditGateTests(unittest.TestCase):
    def run_gate(self, audit, baseline):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'audit.json'
            path.write_text(json.dumps(audit), encoding='utf-8')
            with patch('sys.argv', ['gate', str(path)]), patch.object(audit_gate, 'load_baseline', return_value={'known': baseline}), contextlib.redirect_stdout(io.StringIO()):
                return audit_gate.main()

    def entry(self, severity='moderate', advisory='GHSA-synthetic-1'):
        return {'severity': severity, 'range': '*', 'via': [{'source': 123, 'url': 'https://github.com/advisories/' + advisory, 'title': 'Synthetic advisory'}]}

    def baseline(self):
        return {'example': {'severity': 'moderate', 'advisories': ['https://github.com/advisories/GHSA-synthetic-1']}}

    def test_existing_advisory_is_accepted(self):
        self.assertEqual(self.run_gate({'auditReportVersion': 2, 'vulnerabilities': {'example': self.entry()}}, self.baseline()), 0)

    def test_new_advisory_same_package_and_any_severity_escalation_fail(self):
        for entry in (self.entry(advisory='GHSA-synthetic-2'), self.entry(severity='high')):
            self.assertEqual(self.run_gate({'auditReportVersion': 2, 'vulnerabilities': {'example': entry}}, self.baseline()), 1)

    def test_infrastructure_error_or_missing_report_fails_closed(self):
        for report in ({'error': {'code': 'network_failure'}}, {}, {'auditReportVersion': 2, 'vulnerabilities': []}):
            self.assertEqual(self.run_gate(report, self.baseline()), 2)


class SecretScannerTests(unittest.TestCase):
    def test_autofill_hints_and_first_run_fixture_are_exact_nonsecret_literals(self):
        sources = {
            'mobile/specwatt-app/src/screens/server.tsx': ('autoComplete={mode', 'textContentType={mode'),
            'mobile/specwatt-app/tests/first-run-auth.test.mjs': ('const response=',),
        }
        for source, prefixes in sources.items():
            lines = (scanner.REPO / source).read_text(encoding='utf-8').splitlines()
            for prefix in prefixes:
                line = next(line for line in lines if line.strip().startswith(prefix))
                self.assertEqual(scanner.scan_text(line, source), [])
                self.assertTrue(scanner.scan_text(line, 'other-file.tsx'))
                self.assertTrue(scanner.scan_text(line + ' // changed', source))
                self.assertFalse(scanner.audited_source_literal('github-token', source, line))
        for value in ('new-password-UNREVIEWED', 'newPassword-UNREVIEWED', 'fixture-session-UNREVIEWED'):
            synthetic = 'pass' + 'word=' + repr(value)
            self.assertTrue(scanner.scan_text(synthetic, 'unreviewed'))

    def test_first_run_literal_values_are_detected_in_real_assignments_everywhere(self):
        for source in ('other-file.ts', 'mobile/specwatt-app/src/screens/server.tsx',
                       'mobile/specwatt-app/tests/first-run-auth.test.mjs', 'security/test_security_tools.py'):
            for value in ('new-password', 'newPassword', 'fixture-session'):
                assignment = 'pass' + 'word=' + repr(value)
                self.assertTrue(scanner.scan_text(assignment, source), (source, value))

    def test_history_scanning_uses_the_same_path_and_full_line_constraints(self):
        source = 'mobile/specwatt-app/src/screens/server.tsx'
        line = next(line for line in (scanner.REPO / source).read_text(encoding='utf-8').splitlines()
                    if line.strip().startswith('autoComplete={mode'))
        cases = ((source, line, False), ('other.ts', line, True), (source, line + ' // changed', True))
        for path, content, should_detect in cases:
            def fake_run(args, **kwargs):
                if args[1] == 'rev-list':
                    return subprocess.CompletedProcess(args, 0, stdout=b'commit\n')
                output = f'commit:{path}:421:{content}\n'.encode('utf-8')
                hit = args[args.index('-e') + 1] == scanner.to_posix(scanner.PATTERNS[-1][1].pattern)
                return subprocess.CompletedProcess(args, 0 if hit else 1, stdout=output if hit else b'')
            with patch.object(scanner.subprocess, 'run', side_effect=fake_run):
                self.assertEqual(bool(scanner.scan_history()), should_detect)

    def test_allowlist_does_not_exempt_a_real_value_with_fixture_prefix(self):
        synthetic = ''.join(('pass', 'word=')) + chr(34) + 'correct-horse-battery-UNREVIEWED' + chr(34)
        self.assertTrue(scanner.scan_text(synthetic, 'synthetic'))

    def test_historical_e2e_exception_is_exact_and_never_weakens_current_scan(self):
        # CI's checkout need not contain unrelated intermediate commit blobs.
        # Test scope with generated synthetic input and temporary hash pin.
        import hashlib
        from unittest.mock import patch
        line = "const " + "PASSWORD" + " = " + "'portable-e2e-example';"
        digest = hashlib.sha256(line.encode("utf-8")).hexdigest()
        commit = next(iter(scanner.HISTORICAL_FIXTURE_COMMITS))
        path = scanner.HISTORICAL_FIXTURE_PATH
        with patch.object(scanner, "HISTORICAL_FIXTURE_SHA256", digest):
            self.assertTrue(scanner.audited_historical_fixture(
                "generic-assignment", commit, path, "19", line
            ))
            for test_pattern, test_commit, test_path, test_line, content in (
                ("jwt", commit, path, "19", line),
                ("generic-assignment", "other-commit", path, "19", line),
                ("generic-assignment", commit, "other-path", "19", line),
                ("generic-assignment", commit, path, "20", line),
                ("generic-assignment", commit, path, "19", line + " "),
            ):
                self.assertFalse(scanner.audited_historical_fixture(
                    test_pattern, test_commit, test_path, test_line, content
                ))
        self.assertTrue(scanner.scan_text(line, "current tree"))
        self.assertEqual(len(scanner.HISTORICAL_FIXTURE_COMMITS), 2)
        self.assertEqual(len(scanner.HISTORICAL_FIXTURE_SHA256), 64)

    def test_output_does_not_reveal_any_matched_characters(self):
        self.assertEqual(scanner.mask('synthetic-sensitive-value'), '[REDACTED]')

    def test_history_passes_private_key_pattern_as_operand(self):
        calls = []
        def fake_run(args, **kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args, 0 if args[1] == 'rev-list' else 1, stdout=b'commit\n' if args[1] == 'rev-list' else b'', stderr=b'')
        with patch.object(scanner.subprocess, 'run', side_effect=fake_run):
            scanner.scan_history()
        private = next(call for call in calls if any('PRIVATE KEY' in value for value in call))
        self.assertIn('-e', private)

    def test_history_git_failure_is_not_reported_as_clean(self):
        def fake_run(args, **kwargs):
            return subprocess.CompletedProcess(args, 0 if args[1] == 'rev-list' else 129, stdout=b'commit\n' if args[1] == 'rev-list' else b'', stderr=b'')
        with patch.object(scanner.subprocess, 'run', side_effect=fake_run):
            with self.assertRaises(RuntimeError):
                scanner.scan_history()
