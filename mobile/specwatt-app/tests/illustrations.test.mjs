import assert from "node:assert/strict";
import test from "node:test";
const api = await import("../src/specwatt/illustrations/catalog.ts").catch(
  () => null,
);

test("catalogue contains 100–150 distinct bilingual categories across diverse geometry families", () => {
  assert.ok(api, "the illustration catalogue must exist");
  assert.ok(api.deviceCatalog.length >= 100 && api.deviceCatalog.length <= 150);
  assert.equal(
    new Set(api.deviceCatalog.map((x) => x.id)).size,
    api.deviceCatalog.length,
  );
  assert.ok(new Set(api.deviceCatalog.map((x) => x.family)).size >= 35);
  for (const item of api.deviceCatalog) {
    assert.ok(item.ru.length > 1 && item.ky.length > 1);
    assert.ok(api.visualFamilies.includes(item.family));
  }
});
test("constructor validates only bounded template options and rejects executable/external data", () => {
  assert.ok(api, "the illustration validator must exist");
  const config = api.defaultIllustration("desk-lamp");
  assert.deepEqual(api.validateIllustrationConfig(config), config);
  for (const unsafe of [
    null,
    [],
    {},
    { ...config, color: "url(https://evil.test/a)" },
    { ...config, variant: "<script>" },
    { ...config, categoryId: "../../etc/passwd" },
    { ...config, href: "https://evil.test/a" },
    { ...config, onLoad: "alert(1)" },
    { ...config, details: { script: "x" } },
  ])
    assert.equal(api.validateIllustrationConfig(unsafe), null);
});
test("every catalogue entry has a safe default and search uses translated metadata", () => {
  assert.ok(api, "the illustration search must exist");
  for (const item of api.deviceCatalog)
    assert.ok(api.validateIllustrationConfig(api.defaultIllustration(item.id)));
  assert.ok(api.searchDevices("Холодильник").some((x) => x.id === "fridge"));
  assert.ok(api.searchDevices("Чырак").some((x) => x.family === "lamp"));
  assert.ok(api.searchDevices("router").some((x) => x.id === "wifi-router"));
  assert.equal(
    api.defaultIllustration("unknown-untrusted-type").categoryId,
    "unknown",
  );
});

test("future AI provider is explicitly unavailable and cannot fabricate generated output", async () => {
  assert.ok(api, "the future generation boundary must exist");
  assert.equal(api.offlineSuggestionProvider.available, false);
  await assert.rejects(
    api.offlineSuggestionProvider.suggest("lamp"),
    /not-connected/,
  );
});
