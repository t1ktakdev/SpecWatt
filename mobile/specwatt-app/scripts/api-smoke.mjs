/** Explicit integration smoke; creates one disposable server account and simulator. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BrainClient } from "../src/specwatt/api.ts";

const baseUrl = process.env.SPECWATT_API_URL;
if (!baseUrl)
  throw new Error(
    "Set SPECWATT_API_URL explicitly, e.g. http://127.0.0.1:8000, for a disposable local backend.",
  );
const vault = {
  token: null,
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
const client = new BrainClient({ baseUrl, development: true, vault });
const accountId = randomUUID();
const email = `mobile-${accountId}@example.test`;
const password = randomUUID() + randomUUID();
let authenticated = false;
try {
  await client.authenticate("register", email, password);
  authenticated = true;
  assert.ok(await client.hasSession());
  const controller = await client.createSimulator(
    "Mobile integration simulator",
  );
  assert.ok(
    (await client.controllers()).some((row) => row.id === controller.id),
  );
  assert.equal((await client.snapshot(controller.id)).total_watts, 4.2);

  const requested = await client.command(
    controller.id,
    "CH1",
    false,
    "mobile-off-0001",
  );
  assert.equal(requested.status, "requested");
  assert.equal((await client.snapshot(controller.id)).total_watts, 4.2);
  assert.equal((await client.step(controller.id)).total_watts, 2.4);
  const off = (await client.commands(controller.id))[0];
  assert.equal(off.status, "acknowledged");
  assert.deepEqual(
    off.transitions.map((step) => step.status),
    ["requested", "sent", "acknowledged"],
  );

  await client.command(controller.id, "CH2", true, "mobile-on-0002");
  const running = await client.step(controller.id);
  assert.equal(running.total_watts, 6.6);
  assert.equal((await client.sample(controller.id, running)).total_watts, 6.6);
  await assert.rejects(
    () => client.command(controller.id, "CH3", false, "protected-0003"),
    (error) => error.code === "protected_channel",
  );

  await client.logout();
  authenticated = false;
  assert.equal(await client.hasSession(), false);
  await client.authenticate("login", email, password);
  authenticated = true;
  assert.equal((await client.snapshot(controller.id)).total_watts, 6.6);
  await client.logout();
  authenticated = false;
  assert.equal(await client.hasSession(), false);
  console.log(
    "PASS live API: register, create, 4.2W, requested without measurement change, acknowledgement 2.4W, LED 6.6W, simulator sample, CH3 guard, logout/login persistence.",
  );
} finally {
  if (authenticated) await client.logout().catch(() => {});
}
