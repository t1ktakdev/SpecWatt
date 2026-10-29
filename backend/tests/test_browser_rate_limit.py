"""CORS must expose real limit errors to the authenticated browser client."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from specwatt_api.app import create_app


class BrowserRateLimitTests(unittest.TestCase):
    def test_preflight_does_not_spend_api_budget_and_429_keeps_exact_origin(self):
        origin = 'http://localhost:8120'
        with tempfile.TemporaryDirectory() as directory, patch.dict('os.environ', {'SPECWATT_CORS_ORIGINS': origin}):
            with TestClient(create_app(Path(directory) / 'cors.sqlite3')) as client:
                for _ in range(125):
                    response = client.options('/v1/controllers', headers={
                        'Origin': origin, 'Access-Control-Request-Method': 'GET',
                        'Access-Control-Request-Headers': 'Authorization'})
                    self.assertEqual(response.status_code, 200)
                for _ in range(120):
                    response = client.get('/health', headers={'Origin': origin})
                    self.assertEqual(response.status_code, 200)
                response = client.get('/health', headers={'Origin': origin})
                self.assertEqual(response.status_code, 429)
                self.assertEqual(response.json()['detail']['code'], 'rate_limited')
                self.assertEqual(response.headers['access-control-allow-origin'], origin)
                self.assertNotIn('access-control-allow-credentials', response.headers)
                denied = client.get('/health', headers={'Origin': 'http://evil.example'})
                self.assertNotIn('access-control-allow-origin', denied.headers)
