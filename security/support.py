"""Shared testbed for the SpecWATT security and reliability suite.

Every test class builds its own ``Lab``: a throwaway SQLite database plus a
fresh in-process FastAPI application. Because the rate limiter lives inside
``create_app``, each Lab starts with a clean request budget (10 auth and 120
other requests per minute) — keep request counts per Lab below that or open a
new Lab.

Run from the repository root:

    python -m unittest discover -s security -v

Only simulated components are exercised. No real hardware, no real accounts,
no network beyond the in-process ASGI transport.
"""
import sqlite3
import sys
import tempfile
from contextlib import closing, contextmanager
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BACKEND = REPO / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402
from specwatt_api.app import create_app  # noqa: E402

PASSWORD = "correct-horse-battery"
NOMINAL = {"CH1": 1.8, "CH2": 4.2, "CH3": 2.4}


def bearer(token):
    return {"Authorization": "Bearer " + token}


class Lab:
    """One isolated server instance backed by a temporary database."""

    def __init__(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "lab.sqlite3"
        self.app = create_app(self.db_path)
        self.client = TestClient(self.app, raise_server_exceptions=False)

    def close(self):
        self.client.close()
        self.temp.cleanup()

    def register(self, email, password=PASSWORD):
        response = self.client.post(
            "/v1/auth/register", json={"email": email, "password": password}
        )
        assert response.status_code == 201, response.text
        return response.json()["access_token"]

    def controller(self, token, name="Lab stand"):
        response = self.client.post(
            "/v1/controllers/simulator", headers=bearer(token), json={"name": name}
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    def reopen(self):
        """Simulate a server restart against the same database file."""
        self.client.close()
        self.app = create_app(self.db_path)
        self.client = TestClient(self.app, raise_server_exceptions=False)

    @contextmanager
    def db(self):
        with closing(sqlite3.connect(self.db_path)) as conn:
            with conn:
                yield conn

    def query(self, sql, params=()):
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(sql, params).fetchall()

    def command(self, token, cid, channel="CH1", on=False, key="cmd-0001",
                origin="manual"):
        return self.client.post(
            f"/v1/controllers/{cid}/commands",
            headers=bearer(token),
            json={"channel_id": channel, "on": on, "idempotency_key": key,
                  "origin": origin},
        )

    def step(self, token, cid, outcome="acknowledged"):
        return self.client.post(
            f"/v1/controllers/{cid}/simulator/step",
            headers=bearer(token),
            json={"outcome": outcome},
        )

    def snapshot(self, token, cid):
        response = self.client.get(
            f"/v1/controllers/{cid}/snapshot", headers=bearer(token)
        )
        assert response.status_code == 200, response.text
        return response.json()

    def channels(self, token, cid):
        return {row["id"]: row for row in self.snapshot(token, cid)["channels"]}
