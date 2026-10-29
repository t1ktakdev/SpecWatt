import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiError,
  BrainClient,
  createTokenVault,
  normalizeServerUrl,
  parseSnapshot,
} from "../src/specwatt/api.ts";

const baseUrl = "http://localhost:8000";
function vaultWith(token = null) {
  return {
    token,
    async get() {
      return this.token;
    },
    async set(_base, value) {
      this.token = value;
    },
    async clear() {
      this.token = null;
    },
  };
}
function clientWith(fetcher, vault = vaultWith(), options = {}) {
  return new BrainClient({
    baseUrl,
    development: true,
    fetcher,
    vault,
    ...options,
  });
}
function snapshot() {
  return {
    controller_id: "stand1",
    name: "Stand",
    source: "simulator",
    measured_at: 1000,
    freshness: "fresh",
    peak_watts: 7,
    total_watts: 4.2,
    channels: [
      ["CH1", "Lamp", 1.8],
      ["CH2", "LED", 0],
      ["CH3", "Fan", 2.4],
    ].map(([id, name, watts]) => ({
      id,
      protected: id === "CH3",
      watts,
      last_known_watts: watts,
      freshness: "fresh",
      assigned: { name, room: "Stand", image: "lamp", allow_auto: false },
    })),
  };
}

test("server URL allows exact development loopback only and requires HTTPS in release", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"]) {
    assert.equal(
      normalizeServerUrl(` http://${host}:8000/ `, true),
      `http://${host}:8000`,
    );
    assert.throws(
      () => normalizeServerUrl(`http://${host}:8000`, false),
      ApiError,
    );
  }
  for (const url of [
    "http://example.com",
    "http://127.0.0.1.evil.test",
    "http://192.168.1.10:8000",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com?token=abc",
    "https://example.com#token",
    "ftp://localhost",
    "bad-url",
  ]) {
    assert.throws(() => normalizeServerUrl(url, true), ApiError);
  }
  assert.equal(
    normalizeServerUrl("https://specwatt.example/"),
    "https://specwatt.example",
  );
});

test("snapshot rejects incorrect totals, duplicate channels and weakened CH3 protection", () => {
  const value = snapshot();
  assert.equal(parseSnapshot(value).total_watts, 4.2);
  assert.throws(() => parseSnapshot({ ...value, total_watts: 8.4 }));
  assert.throws(() =>
    parseSnapshot({
      ...value,
      channels: [value.channels[0], value.channels[0], value.channels[2]],
    }),
  );
  for (const change of [
    { protected: false },
    { watts: 0, last_known_watts: 0 },
    { assigned: { ...value.channels[2].assigned, allow_auto: true } },
  ]) {
    assert.throws(() =>
      parseSnapshot({
        ...value,
        channels: value.channels.map((ch) =>
          ch.id === "CH3" ? { ...ch, ...change } : ch,
        ),
      }),
    );
  }
  assert.throws(() => parseSnapshot({ ...value, source: "physical" }));
});

test("telemetry sequence is bounded and never inferred from the receipt time", () => {
  assert.equal(parseSnapshot(snapshot()).telemetry_sequence, 0);
  assert.equal(parseSnapshot({ ...snapshot(), telemetry_sequence: 7 }).telemetry_sequence, 7);
  for (const sequence of [-1, 0.5, Infinity, "7"]) {
    assert.throws(() => parseSnapshot({ ...snapshot(), telemetry_sequence: sequence }));
  }
});

test("ordinary simulator samples do not pretend to correlate an old command", async () => {
  let sent;
  const client = clientWith(async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify(snapshot()), { status: 200 });
  }, vaultWith("token"));
  await client.sample("stand1", parseSnapshot(snapshot()));
  assert.deepEqual(Object.keys(sent), ["channels"]);
});

test("automation consent is explicit, preserves assignment and refuses CH3 before transport", async () => {
  const requests = [];
  const client = clientWith(async (url, options) => {
    requests.push({ url, method: options.method, body: JSON.parse(options.body) });
    return new Response(JSON.stringify(snapshot()), { status: 200 });
  }, vaultWith("token"));
  const parsed = parseSnapshot(snapshot());
  await assert.rejects(() => client.automationConsent("stand1", parsed.channels[2], true));
  assert.equal(requests.length, 0);
  await client.automationConsent("stand1", parsed.channels[0], true);
  assert.equal(requests[0].method, "PATCH");
  assert.deepEqual(requests[0].body, { ...parsed.channels[0].assigned, allow_auto: true });
});

test("cancelled queued scheduler commands remain readable in server history", async () => {
  const client = clientWith(async () => new Response(JSON.stringify([{
    id: "c1", controller_id: "stand1", channel_id: "CH1", on: true,
    status: "cancelled", reason: "schedule_cancelled", source: "simulator",
    transitions: [{ status: "requested", at: 1000 }, { status: "cancelled", at: 1001 }],
  }]), { status: 200 }), vaultWith("token"));
  assert.equal((await client.commands("stand1"))[0].status, "cancelled");
});

test("stale snapshot hides current watts and preserves historical readings", () => {
  const value = snapshot();
  const stale = {
    ...value,
    freshness: "stale",
    total_watts: null,
    channels: value.channels.map((ch) => ({
      ...ch,
      freshness: "stale",
      watts: null,
    })),
  };
  assert.equal(parseSnapshot(stale).total_watts, null);
  assert.equal(parseSnapshot(stale).channels[2].last_known_watts, 2.4);
  assert.throws(() => parseSnapshot({ ...stale, total_watts: 4.2 }));
});

test("authentication validates response before saving token and never stores password", async () => {
  const vault = vaultWith();
  let seen;
  const client = clientWith(async (url, opts) => {
    seen = { url, opts };
    return new Response(
      JSON.stringify({
        access_token: "valid-token-string-12345",
        token_type: "bearer",
        expires_at: Date.now() / 1000 + 100,
        user_id: "user1",
      }),
      { status: 200 },
    );
  }, vault);
  await client.authenticate("login", " owner@example.test ", "password-1234");
  assert.equal(vault.token, "valid-token-string-12345");
  assert.equal(seen.url, baseUrl + "/v1/auth/login");
  assert.equal(seen.opts.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(seen.opts.body), {
    email: "owner@example.test",
    password: "password-1234",
  });
  assert.equal(JSON.stringify(vault).includes("password-1234"), false);
  const malformed = clientWith(
    async () => new Response("{}", { status: 200 }),
    vaultWith(),
  );
  await assert.rejects(
    () =>
      malformed.authenticate("login", "owner@example.test", "password-1234"),
    (error) => error.code === "invalid_response",
  );
});

test("401 clears token even with malformed response body", async () => {
  const vault = vaultWith("expired-token");
  const unauthorized = clientWith(
    async () =>
      new Response(JSON.stringify({ detail: { code: "invalid_session" } }), {
        status: 401,
      }),
    vault,
  );
  await assert.rejects(
    () => unauthorized.controllers(),
    (error) => error.code === "invalid_session",
  );
  assert.equal(vault.token, null);
  vault.token = "expired-token";
  const malformed = clientWith(
    async () => new Response("not JSON", { status: 401 }),
    vault,
  );
  await assert.rejects(() => malformed.controllers());
  assert.equal(vault.token, null);
});

test("transport failure never retries and logout clears the local session despite failure", async () => {
  const vault = vaultWith("token");
  let requests = 0;
  const client = clientWith(async () => {
    requests += 1;
    throw new TypeError("offline");
  }, vault);
  await assert.rejects(
    () => client.command("stand1", "CH1", false, "client-command-1"),
    (error) => error.code === "network_error",
  );
  assert.equal(requests, 1);
  await assert.rejects(
    () => client.logout(),
    (error) => error.code === "network_error",
  );
  assert.equal(vault.token, null);
});

test("request timeout on a safe GET is retried exactly once, then reported", async () => {
  let requests = 0;
  const client = clientWith(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        requests += 1;
        options.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      }),
    vaultWith("token"),
    { timeoutMs: 10, retryDelayMs: 1 },
  );
  await assert.rejects(
    () => client.controllers(),
    (error) => error.code === "request_timeout",
  );
  assert.equal(requests, 2);
});

test("CH3 is rejected locally before a network request", async () => {
  let requests = 0;
  const client = clientWith(async () => {
    requests += 1;
    throw new Error("unexpected fetch");
  }, vaultWith("token"));
  await assert.rejects(
    () => client.command("stand1", "CH3", false, "protected-0001"),
    (error) => error.code === "protected_channel",
  );
  assert.equal(requests, 0);
});

test("web session is memory-only and scoped to the exact server origin", async () => {
  const vault = createTokenVault(false);
  await vault.set("https://server-a.example", "test-token");
  assert.equal(await vault.get("https://server-a.example"), "test-token");
  assert.equal(await vault.get("https://server-b.example"), null);
  await vault.clear("https://server-b.example");
  assert.equal(await vault.get("https://server-a.example"), "test-token");
  await vault.clear("https://server-a.example");
  assert.equal(await vault.get("https://server-a.example"), null);
});
