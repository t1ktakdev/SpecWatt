"""Registration, session handling and cross-user (BOLA) regression checks.

Focus: OWASP API Security Top 10 — API1 (BOLA), API2 (broken authentication),
API4 (resource consumption), API8 (security misconfiguration). Verifies that a
second account cannot reach or even distinguish another user's controller, and
that session lifetime, revocation and rate limits behave as documented in
backend/SECURITY.md.
"""
import time
import unittest

from support import Lab, bearer


class AuthSessionTests(unittest.TestCase):
    def setUp(self):
        self.lab = Lab()

    def tearDown(self):
        self.lab.close()

    def test_register_login_logout_lifecycle(self):
        token = self.lab.register("life@example.test")
        headers = bearer(token)
        self.assertEqual(
            self.lab.client.get("/v1/controllers", headers=headers).status_code,
            200,
        )
        self.assertEqual(
            self.lab.client.post("/v1/auth/logout", headers=headers).status_code,
            204,
        )
        self.assertEqual(
            self.lab.client.get("/v1/controllers", headers=headers).status_code,
            401,
        )
        self.assertEqual(
            self.lab.client.post("/v1/auth/logout", headers=headers).status_code,
            401,
        )

    def test_password_policy_boundaries(self):
        short = self.lab.client.post(
            "/v1/auth/register",
            json={"email": "short@example.test", "password": "x" * 11},
        )
        self.assertEqual(short.status_code, 422)
        exact = self.lab.client.post(
            "/v1/auth/register",
            json={"email": "exact@example.test", "password": "x" * 12},
        )
        self.assertEqual(exact.status_code, 201)
        long_ok = self.lab.client.post(
            "/v1/auth/register",
            json={"email": "long@example.test", "password": "y" * 128},
        )
        self.assertEqual(long_ok.status_code, 201)
        too_long = self.lab.client.post(
            "/v1/auth/register",
            json={"email": "huge@example.test", "password": "y" * 129},
        )
        self.assertEqual(too_long.status_code, 422)

    def test_passwords_never_echoed_in_errors(self):
        response = self.lab.client.post(
            "/v1/auth/register",
            json={"email": "not-an-email", "password": "leaked-secret-999"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("leaked-secret-999", response.text)
        self.assertNotIn("not-an-email", response.text)

    def test_login_failure_is_generic_for_missing_user_and_bad_password(self):
        self.lab.register("known@example.test")
        missing = self.lab.client.post(
            "/v1/auth/login",
            json={"email": "ghost@example.test", "password": "whatever-pass-123"},
        )
        wrong = self.lab.client.post(
            "/v1/auth/login",
            json={"email": "known@example.test", "password": "whatever-pass-123"},
        )
        self.assertEqual(missing.status_code, 401)
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(
            missing.json()["detail"]["code"], wrong.json()["detail"]["code"]
        )

    def test_register_conflict_does_not_confirm_the_email(self):
        email = "dupe@example.test"
        self.lab.register(email)
        again = self.lab.client.post(
            "/v1/auth/register",
            json={"email": email, "password": "another-pass-12345"},
        )
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.json()["detail"]["code"], "registration_unavailable")
        self.assertNotIn(email, again.text)

    def test_email_lookup_is_case_insensitive(self):
        self.lab.register("Case@example.test")
        response = self.lab.client.post(
            "/v1/auth/login",
            json={"email": "CASE@EXAMPLE.TEST", "password": "correct-horse-battery"},
        )
        self.assertEqual(response.status_code, 200)

    def test_second_session_survives_logout_of_the_first(self):
        first = self.lab.register("two@example.test")
        second = bearer(
            self.lab.client.post(
                "/v1/auth/login",
                json={"email": "two@example.test", "password": "correct-horse-battery"},
            ).json()["access_token"]
        )
        self.assertEqual(
            self.lab.client.post("/v1/auth/logout", headers=bearer(first)).status_code,
            204,
        )
        self.assertEqual(
            self.lab.client.get("/v1/controllers", headers=bearer(first)).status_code,
            401,
        )
        self.assertEqual(
            self.lab.client.get("/v1/controllers", headers=second).status_code, 200
        )

    def test_expired_session_rejected(self):
        token = self.lab.register("exp@example.test")
        with self.lab.db() as conn:
            conn.execute("UPDATE sessions SET expires_at=0")
        self.assertEqual(
            self.lab.client.get("/v1/controllers", headers=bearer(token)).status_code,
            401,
        )

    def test_malformed_authorization_headers(self):
        token = self.lab.register("hdr@example.test")
        cases = [
            {},
            {"Authorization": "Bearer"},
            {"Authorization": "Bearer "},
            {"Authorization": "Basic " + token},
            {"Authorization": "Bearer bogus-token-value-000"},
        ]
        for headers in cases:
            response = self.lab.client.get("/v1/controllers", headers=headers)
            self.assertEqual(response.status_code, 401, headers)
            self.assertEqual(
                response.headers.get("WWW-Authenticate"), "Bearer"
            )

    def test_session_stored_as_digest_not_plaintext(self):
        token = self.lab.register("digest@example.test")
        rows = self.lab.query("SELECT token_hash FROM sessions")
        self.assertEqual(len(rows), 1)
        self.assertNotEqual(rows[0][0], token)
        self.assertNotIn(token, rows[0][0])

    def test_expired_sessions_purged_on_next_issue(self):
        token = self.lab.register("purge@example.test")
        with self.lab.db() as conn:
            conn.execute("UPDATE sessions SET expires_at=1")
        self.lab.client.post(
            "/v1/auth/login",
            json={"email": "purge@example.test", "password": "correct-horse-battery"},
        )
        stale = self.lab.query("SELECT COUNT(*) FROM sessions WHERE expires_at<=?",
                               (time.time() - 1,))
        self.assertEqual(stale[0][0], 0)
        self.assertEqual(
            self.lab.client.get("/v1/controllers", headers=bearer(token)).status_code,
            401,
        )

    def test_corrupted_password_verifier_answers_401_not_500(self):
        """Regression for SEC-001: damaged local state must not crash login."""
        self.lab.register("corrupt@example.test")
        for damaged in ("corrupted", "scrypt$32768$8$3$zz$cc", "", "scrypt$1$2"):
            with self.lab.db() as conn:
                conn.execute(
                    "UPDATE users SET password_hash=? WHERE email=?",
                    (damaged, "corrupt@example.test"),
                )
            response = self.lab.client.post(
                "/v1/auth/login",
                json={
                    "email": "corrupt@example.test",
                    "password": "correct-horse-battery",
                },
            )
            self.assertEqual(response.status_code, 401, damaged)
            self.assertEqual(
                response.json()["detail"]["code"], "invalid_credentials"
            )

    def test_docs_and_schema_endpoints_disabled(self):
        for path in ("/docs", "/redoc", "/openapi.json"):
            self.assertEqual(self.lab.client.get(path).status_code, 404)

    def test_auth_rate_limit_returns_429_with_retry_after(self):
        payload = {"email": "rl@example.test", "password": "whatever-pass-123"}
        # The limiter admits the first 10 auth requests, blocks the 11th.
        for _ in range(10):
            self.lab.client.post("/v1/auth/login", json=payload)
        eleventh = self.lab.client.post("/v1/auth/login", json=payload)
        self.assertEqual(eleventh.status_code, 429)
        self.assertEqual(eleventh.headers.get("Retry-After"), "60")
        self.assertEqual(eleventh.json()["detail"]["code"], "rate_limited")

    def test_general_api_rate_limit(self):
        for index in range(120):
            response = self.lab.client.get("/health")
            self.assertEqual(response.status_code, 200, index)
        flooded = self.lab.client.get("/health")
        self.assertEqual(flooded.status_code, 429)

    def test_request_body_cap(self):
        response = self.lab.client.post(
            "/v1/auth/login",
            content=b"x" * 17000,
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(response.status_code, 413)


class BolaTests(unittest.TestCase):
    """A second account must receive a uniform 404 for every foreign endpoint."""

    def setUp(self):
        self.lab = Lab()
        self.owner = self.lab.register("owner@example.test")
        self.cid = self.lab.controller(self.owner, "Owner stand")
        self.base = f"/v1/controllers/{self.cid}"
        self.lab.command(self.owner, self.cid, key="seed-command-01")
        self.lab.step(self.owner, self.cid)
        self.command_id = self.lab.client.get(
            self.base + "/commands", headers=bearer(self.owner)
        ).json()[0]["id"]
        self.attacker = self.lab.register("attacker@example.test")

    def tearDown(self):
        self.lab.close()

    def foreign_requests(self):
        foreign = bearer(self.attacker)
        return [
            ("GET", self.base + "/snapshot", None),
            ("PATCH", self.base + "/settings",
             {"peak_watts": 8.4, "manual_priority_minutes": 30}),
            ("PATCH", self.base + "/channels/CH1/assignment",
             {"name": "Hijacked", "room": "X", "image": "lamp", "allow_auto": True}),
            ("POST", self.base + "/commands",
             {"channel_id": "CH1", "on": True, "origin": "manual",
              "idempotency_key": "hijack-key-01"}),
            ("POST", self.base + "/simulator/step", {"outcome": "acknowledged"}),
            ("POST", self.base + "/simulator/telemetry",
             {"channels": {"CH1": 1.8, "CH2": 0, "CH3": 2.4}}),
            ("GET", self.base + "/commands", None),
            ("GET", f"{self.base}/commands/{self.command_id}", None),
            ("GET", self.base + "/measurements", None),
            ("GET", self.base + "/events", None),
        ]

    def test_every_endpoint_answers_uniform_404_for_foreign_user(self):
        for method, path, body in self.foreign_requests():
            response = self.lab.client.request(
                method, path, headers=bearer(self.attacker), json=body
            )
            self.assertEqual(response.status_code, 404, f"{method} {path}")
            self.assertEqual(
                response.json(), {"detail": {"code": "controller_not_found"}},
                f"{method} {path}",
            )
        snapshot = self.lab.snapshot(self.owner, self.cid)
        self.assertEqual(snapshot["name"], "Owner stand")
        self.assertEqual(snapshot["channels"][0]["assigned"]["name"], "Светильник")
        self.assertEqual(snapshot["total_watts"], 2.4)  # seed CH1-off was acknowledged

    def test_attacker_controller_list_is_empty(self):
        response = self.lab.client.get(
            "/v1/controllers", headers=bearer(self.attacker)
        )
        self.assertEqual(response.json(), [])

    def test_foreign_command_id_unusable_in_own_controller(self):
        cid = self.lab.controller(self.attacker, "Attacker stand")
        response = self.lab.client.get(
            f"/v1/controllers/{cid}/commands/{self.command_id}",
            headers=bearer(self.attacker),
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"]["code"], "command_not_found")

    def test_unauthenticated_request_is_401_not_404(self):
        response = self.lab.client.get(self.base + "/snapshot")
        self.assertEqual(response.status_code, 401)
        self.assertNotIn(self.cid, response.text)

    def test_idempotency_keys_are_scoped_per_controller(self):
        cid = self.lab.controller(self.attacker, "Attacker stand")
        payload = {"channel_id": "CH1", "on": False, "origin": "manual",
                   "idempotency_key": "shared-key-001"}
        first = self.lab.client.post(
            f"/v1/controllers/{self.cid}/commands",
            headers=bearer(self.owner), json=payload,
        )
        second = self.lab.client.post(
            f"/v1/controllers/{cid}/commands",
            headers=bearer(self.attacker), json=payload,
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertNotEqual(first.json()["id"], second.json()["id"])

    def test_owner_reaches_all_own_controllers(self):
        other = self.lab.controller(self.owner, "Second stand")
        for cid in (self.cid, other):
            response = self.lab.client.get(
                f"/v1/controllers/{cid}/snapshot", headers=bearer(self.owner)
            )
            self.assertEqual(response.status_code, 200)

    def test_events_of_foreign_controller_not_readable_via_query_params(self):
        response = self.lab.client.get(
            self.base + f"/events?after=0&limit=200",
            headers=bearer(self.attacker),
        )
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
