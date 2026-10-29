import json
import os
import secrets
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from specwatt_api.app import create_app


class UsbBridgeApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.file = Path(self.tmp.name) / "status.json"
        self.env = patch.dict(os.environ, {"SPECWATT_USB_BRIDGE_STATUS": str(self.file)})
        self.env.start()
        self.client = TestClient(create_app(Path(self.tmp.name)/"test.sqlite3"), client=("127.0.0.1", 50000))
        self.headers = self.register("owner@example.test")
        self.other = self.register("other@example.test")
        reply = self.client.post("/v1/controllers/simulator", headers=self.headers, json={"name":"Stage1 test"})
        self.assertEqual(reply.status_code, 201)
        self.cid = reply.json()["id"]
        self.url = f"/v1/controllers/{self.cid}/diagnostics/usb-bridge"

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.tmp.cleanup()

    def register(self, email):
        result = self.client.post("/v1/auth/register",
                                  json={"email":email, "password":secrets.token_urlsafe(24)})
        self.assertEqual(result.status_code, 201, result.text)
        return {"Authorization": "Bearer "+result.json()["access_token"]}

    def status(self, state="connected", delta=0):
        self.file.write_text(json.dumps({
            "schema":1,"state":state,"updated_at_epoch":time.time()+delta,
            "source":"diagnostic","measured":False,"hardware_actuation":False,
            "sensor_connected":False,"paired":False,
            "protected_channel":"CH3","port":"COM8","firmware":"specwatt-stage0",
            "chip":"ESP32-D0WDQ5"}),encoding="utf-8")

    def test_auth_and_other_owner(self):
        self.status()
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.client.get(self.url, headers=self.other).status_code, 404)
        self.assertEqual(self.client.get(self.url, headers=self.headers).status_code, 200)

    def test_non_loopback_diagnostic_access_denied(self):
        self.status()
        with TestClient(create_app(Path(self.tmp.name)/"test.sqlite3"),
                        client=("192.0.2.10", 50200)) as remote:
            self.assertEqual(remote.get(self.url, headers=self.headers).status_code, 404)

    def test_connected_is_unpaired_and_not_measured(self):
        self.status()
        data = self.client.get(self.url, headers=self.headers).json()
        self.assertEqual(data["controller_id"], self.cid)
        self.assertEqual(data["host_bridge"]["state"], "connected")
        self.assertFalse(data["paired"])
        self.assertFalse(data["hardware_transport"])
        self.assertFalse(data["measured"])
        self.assertEqual(data["source"], "diagnostic")
        self.assertEqual(self.client.get("/health").json()["hardware_transport"], False)

    def test_stale_offline_and_malicious_metadata_fail_closed(self):
        self.status(delta=-90)
        self.assertEqual(self.client.get(self.url, headers=self.headers).json()["host_bridge"]["state"], "disconnected")
        self.status()
        data=json.loads(self.file.read_text()); data["measured"]=True
        self.file.write_text(json.dumps(data),encoding="utf-8")
        self.assertEqual(self.client.get(self.url, headers=self.headers).json()["host_bridge"]["state"], "disconnected")
        self.file.write_text("{malformed", encoding="utf-8")
        self.assertEqual(self.client.get(self.url, headers=self.headers).json()["host_bridge"]["state"], "disconnected")


if __name__ == "__main__":
    unittest.main()
