"""Fuzzing: damaged, hostile and borderline inputs must never yield 5xx.

Corpus is sent against every interesting endpoint with a valid session. After
each request the service must still answer /health. Strict Pydantic schemas,
the 16 KiB body cap and the sanitized validation handler are the controls
under test; this suite proves they hold across the whole surface, not just
hand-picked cases.
"""
import unittest

from support import Lab, bearer

MALFORMED_BODIES = [
    b"",
    b"{",
    b"}",
    b"null",
    b"[]",
    b'"just a string"',
    b"123",
    b"{}",
    b'{"email": "a@b.co", "password": "short"}',
    b'{"email": "a@b.co", "password": 123456789012}',
    b'{"email": null, "password": null}',
    b'{"email": "a@b.co", "password": "correct-horse", "is_admin": true}',
    b'{"channel_id": "CH1", "on": 1, "idempotency_key": "numeric-on-01"}',
    b'{"channel_id": "CH1", "on": true, "idempotency_key": 42}',
    b'{"channel_id": "CH1", "on": true, "idempotency_key": null, "origin": "root"}',
    b'{"channels": {"CH1": 0, "CH2": 0, "CH3": 2.4}, "channels": {"CH1": 9}}',
    b'{"channels": {"CH1": 1e309, "CH2": 0, "CH3": 2.4}}',
    b'{"channels": {"CH1": -Infinity, "CH2": 0, "CH3": 2.4}}',
    b'{"peak_watts": NaN, "manual_priority_minutes": 30}',
    b'{"peak_watts": 7, "manual_priority_minutes": 30, "role": "owner"}',
    b'{"outcome": "Acknowledged"}',
    b'{"outcome": {"$gt": ""}}',
    b'{"name": "\x00\x01\x02"}',
    b'{"name": "' + "\ud800".encode("utf-8", "surrogatepass") + b'"}',
    b'{"email": "a@b.co", "password": "' + b"x" * 16000 + b'"}',
    b'{"a": ' + b"[" * 300 + b"]" * 300 + b"}",
    b"\xff\xfe\x00bad",
    b'{"CH1": "0", "CH2": 0, "CH3": 2.4}',
]

ENDPOINTS = [
    ("POST", "/v1/auth/register"),
    ("POST", "/v1/auth/login"),
    ("POST", "/v1/controllers/simulator"),
    ("POST", "/{cid}/commands"),
    ("POST", "/{cid}/simulator/step"),
    ("POST", "/{cid}/simulator/telemetry"),
    ("PATCH", "/{cid}/settings"),
    ("PATCH", "/{cid}/channels/CH1/assignment"),
]


class FuzzInputTests(unittest.TestCase):
    def setUp(self):
        self.lab = Lab()
        self.token = self.lab.register("fuzz@example.test")
        self.cid = self.lab.controller(self.token)
        self.headers = bearer(self.token)

    def tearDown(self):
        self.lab.close()

    def assert_no_5xx(self, response, context):
        self.assertLess(response.status_code, 500, f"{context}: {response.text[:200]}")
        health = self.lab.client.get("/health")
        self.assertEqual(health.status_code, 200, f"service died after {context}")

    def test_malformed_bodies_never_crash_the_service(self):
        sent = 0
        for index, body in enumerate(MALFORMED_BODIES):
            for method, path in ENDPOINTS:
                if sent >= 100:
                    # Stay inside the per-instance rate-limit budget: each
                    # round costs one fuzz request plus one /health check.
                    self.lab.reopen()
                    sent = 0
                response = self.lab.client.request(
                    method,
                    path.format(cid=self.cid),
                    content=body,
                    headers={**self.headers, "Content-Type": "application/json"},
                )
                self.assert_no_5xx(response, f"body#{index} {method} {path}")
                sent += 2

    def test_valid_json_without_content_type_is_rejected_cleanly(self):
        response = self.lab.client.post(
            f"/v1/controllers/{self.cid}/commands",
            content=b'{"channel_id": "CH1", "on": false, "idempotency_key": "no-ctype-1"}',
            headers=self.headers,
        )
        self.assert_no_5xx(response, "missing content type")
        self.assertIn(response.status_code, (200, 422))

    def test_pagination_parameters_are_bounded(self):
        # `limit` is validated on all history endpoints; `after` only exists
        # on events and measurements (the commands list ignores other names).
        for name, values in (
            ("limit", ["-1", "0", "201", "999999999999999999999", "1.5", "abc", ""]),
            ("after", ["-1", "abc", "1e9", "0.5"]),
        ):
            for value in values:
                suffixes = ("commands", "events", "measurements") \
                    if name == "limit" else ("events", "measurements")
                for suffix in suffixes:
                    response = self.lab.client.get(
                        f"/v1/controllers/{self.cid}/{suffix}?{name}={value}",
                        headers=self.headers,
                    )
                    self.assert_no_5xx(response, f"{suffix}?{name}={value}")
                    self.assertEqual(response.status_code, 422,
                                     f"{suffix}?{name}={value}")

    def test_hostile_path_segments_stay_within_the_object_model(self):
        segments = [
            "..",
            "%2E%2E%2Fetc",
            "..%2F..%2Fbackend",
            "NULL",
            "00000000-0000-0000-0000-000000000000",
            "x" * 300,
            "%00",
        ]
        for segment in segments:
            response = self.lab.client.get(
                f"/v1/controllers/{segment}/snapshot", headers=self.headers
            )
            self.assertIn(response.status_code, (404, 422), segment)
            self.assertNotIn(response.status_code, (500, 501), segment)

    def test_oversized_but_in_limit_inputs_are_rejected_by_schema(self):
        response = self.lab.client.post(
            f"/v1/controllers/{self.cid}/commands",
            headers=self.headers,
            json={"channel_id": "CH1", "on": False,
                  "idempotency_key": "k" * 127 + "!",
                  "origin": "manual"},
        )
        self.assertEqual(response.status_code, 422)
        response = self.lab.client.patch(
            f"/v1/controllers/{self.cid}/channels/CH1/assignment",
            headers=self.headers,
            json={"name": "n" * 81, "room": "r", "image": "lamp",
                  "allow_auto": False},
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
