import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Loads the REAL device-visual.tsx, appearance-policy.ts, photo-policy.ts and
// illustrations/catalog.ts with only the truly native boundaries mocked
// (expo filesystem + bundled asset registry), then drives the full appearance
// fallback chain end to end. The component owns a single useState slot; the
// rewind/reset helpers below depend on that call order.
function loadDeviceVisual() {
  const transpile = (path, jsx) =>
    ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        ...(jsx ? { jsx: ts.JsxEmit.React } : {}),
      },
    }).outputText;

  const catalogExports = {};
  vm.runInNewContext(transpile("../src/specwatt/illustrations/catalog.ts"), {
    exports: catalogExports,
    require: () => {
      throw new Error("illustrations/catalog must stay dependency-free");
    },
  });

  const photoPolicyExports = {};
  vm.runInNewContext(transpile("../src/specwatt/photo-policy.ts"), {
    exports: photoPolicyExports,
    require: () => {
      throw new Error("photo-policy must stay dependency-free");
    },
  });

  const appearanceExports = {};
  vm.runInNewContext(transpile("../src/specwatt/appearance-policy.ts"), {
    exports: appearanceExports,
    require: (name) => {
      if (name === "./illustrations/catalog.ts") return catalogExports;
      if (name === "./photo-policy.ts") return photoPolicyExports;
      throw new Error("unexpected appearance-policy import: " + name);
    },
  });

  const states = [];
  let cursor = 0;
  const react = {
    useState: (initial) => {
      const index = cursor++;
      return [states[index] ?? initial, (value) => { states[index] = value; }];
    },
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    Fragment: "Fragment",
  };
  const ownedPhotoUri =
    "file:///data/user/0/kg.specwatt.mobile/files/specwatt-photos/photo-t1ab12-a1b2c3d4e5f6.jpg";
  const imageMap = { lamp: 101, "led-strip": 102, fan: 103, charger: 104, socket: 105, appliance: 106 };
  const exports = {};
  vm.runInNewContext(transpile("../src/specwatt/device-visual.tsx", true), {
    exports,
    require: (name) => {
      if (name === "react") return react;
      if (name === "react-native")
        return { Image: "Image", View: "View", ViewStyle: null, StyleProp: null };
      if (name === "expo-linear-gradient") return { LinearGradient: "Gradient" };
      if (name === "./illustrations")
        return {
          ...catalogExports,
          DeviceIllustration: "Vector",
        };
      if (name === "./photos")
        return { devicePhotoExists: (uri) => uri === ownedPhotoUri };
      if (name === "./appearance-policy") return appearanceExports;
      if (name === "./images") return { imageMap };
      throw new Error("unexpected device-visual import: " + name);
    },
  });
  return {
    exports,
    catalogExports,
    appearanceExports,
    imageMap,
    ownedPhotoUri,
    rewind: () => { cursor = 0; },
    resetState: () => { cursor = 0; states.length = 0; },
  };
}

test("bundled image ids fall back to meaningful catalogue vectors", () => {
  const { exports, catalogExports } = loadDeviceVisual();
  const cases = [
    [undefined, "appliance", "kettle"],
    [undefined, "charger", "phone-charger"],
    [undefined, "socket", "smart-socket"],
    [undefined, "led-strip", "led-strip"],
    ["CH2", "lamp", "led-strip"],
    ["CH3", "lamp", "pc-fan"],
    [undefined, "fan", "pc-fan"],
    ["CH1", "lamp", "mushroom-lamp"],
    [undefined, undefined, "mushroom-lamp"],
    [undefined, "lamp-scene", "mushroom-lamp"],
  ];
  for (const [id, image, expected] of cases) {
    const config = exports.defaultDeviceConfig(id, image);
    assert.equal(config.categoryId, expected, `${id ?? "-"} / ${image ?? "-"}`);
    assert.ok(
      catalogExports.validateIllustrationConfig(config),
      "fallback config must stay valid for the vector constructor",
    );
  }
});

test("photo appearance renders only while the owned file still exists", () => {
  const { exports, ownedPhotoUri, resetState } = loadDeviceVisual();
  resetState();
  const photo = {
    name: "Лампа",
    category: "lamp",
    image: "lamp",
    room: "",
    allowAuto: false,
    appearance: { kind: "photo", uri: ownedPhotoUri },
  };
  const element = exports.DeviceVisual({ assignment: photo, id: "CH1" });
  const image = element.props.children.at(-1);
  assert.equal(image.type, "Image");
  assert.equal(image.props.source.uri, ownedPhotoUri);
  assert.equal(image.props.resizeMode, "cover");

  resetState();
  const missing = {
    ...photo,
    appearance: { kind: "photo", uri: "file:///data/user/0/kg.specwatt.mobile/files/specwatt-photos/photo-t2cd34-zz9y8x7w6v5u.jpg" },
  };
  const fallback = exports.DeviceVisual({ assignment: missing, id: "CH1" }).props.children.at(-1);
  assert.equal(fallback.type, "Vector");
  assert.equal(
    fallback.props.config.categoryId,
    "mushroom-lamp",
    "a vanished photo must fall back to the channel's default vector",
  );
});

test("render failure of a photo degrades to the vector fallback on the next render", () => {
  const { exports, ownedPhotoUri, resetState, rewind } = loadDeviceVisual();
  resetState();
  const assignment = {
    name: "Лампа",
    category: "lamp",
    image: "lamp",
    room: "",
    allowAuto: false,
    appearance: { kind: "photo", uri: ownedPhotoUri },
  };
  const first = exports.DeviceVisual({ assignment, id: "CH1" }).props.children.at(-1);
  assert.equal(first.type, "Image");
  first.props.onError();
  rewind();
  const second = exports.DeviceVisual({ assignment, id: "CH1" }).props.children.at(-1);
  assert.equal(second.type, "Vector");
  resetState();
});

test("stale persisted vector config or foreign photo uri falls back without breaking the card", () => {
  const { exports, imageMap, resetState } = loadDeviceVisual();
  const assignment = {
    name: "Светильник",
    category: "lamp",
    image: "lamp",
    room: "",
    allowAuto: false,
    appearance: {
      kind: "vector",
      config: { categoryId: "legacy-lamp-removed", color: "cream", variant: "rounded", details: "detailed" },
    },
  };
  resetState();
  const element = exports.DeviceVisual({ assignment, id: "CH1" }).props.children.at(-1);
  assert.equal(element.type, "Image", "appearance incompatible with the current catalogue is dropped");
  assert.equal(element.props.source, imageMap.lamp, "bundled photo remains the default");

  resetState();
  const remote = exports.DeviceVisual({
    assignment: {
      ...assignment,
      appearance: { kind: "photo", uri: "https://example.com/private.jpg" },
    },
    id: "CH1",
  }).props.children.at(-1);
  assert.equal(remote.type, "Image", "remote uri rejected by policy falls back to bundled photo");
  assert.equal(remote.props.source, imageMap.lamp);

  resetState();
  const traversal = exports.DeviceVisual({
    assignment: {
      ...assignment,
      appearance: { kind: "photo", uri: "file:///data/user/0/kg.specwatt.mobile/files/specwatt-photos/../secret.jpg" },
    },
    id: "CH1",
  }).props.children.at(-1);
  assert.equal(traversal.type, "Image");
  assert.equal(traversal.props.source, imageMap.lamp);
  resetState();
});

test("unmapped or hostile bundled image ids render the vector, never a broken image", () => {
  const { exports, resetState } = loadDeviceVisual();
  for (const image of ["../../unsafe", "not-in-map", ""]) {
    resetState();
    const element = exports.DeviceVisual({
      assignment: { name: "x", category: "lamp", image, room: "", allowAuto: false },
      id: "CH1",
    }).props.children.at(-1);
    assert.equal(element.type, "Vector", image);
  }
  resetState();
  const empty = exports.DeviceVisual({ id: "CH2" }).props.children.at(-1);
  assert.equal(empty.type, "Vector");
  assert.equal(empty.props.config.categoryId, "led-strip");
  resetState();
});

test("a valid persisted vector appearance renders exactly the chosen configuration", () => {
  const { exports, resetState } = loadDeviceVisual();
  const assignment = {
    name: "Аэрогриль",
    category: "lamp",
    image: "lamp",
    room: "",
    allowAuto: false,
    appearance: {
      kind: "vector",
      config: { categoryId: "air-fryer", color: "copper", variant: "angular", details: "minimal" },
    },
  };
  resetState();
  const element = exports.DeviceVisual({ assignment, id: "CH1" }).props.children.at(-1);
  assert.equal(element.type, "Vector");
  assert.deepEqual(
    JSON.parse(JSON.stringify(element.props.config)),
    assignment.appearance.config,
    "the persisted config must reach the illustrator untouched",
  );
  resetState();
});

test("every bundled image id renders through the bundled branch, never a broken image", () => {
  const { exports, imageMap, resetState } = loadDeviceVisual();
  for (const image of Object.keys(imageMap)) {
    resetState();
    const element = exports.DeviceVisual({
      assignment: { name: "x", category: image, image, room: "", allowAuto: false },
      id: "CH1",
    }).props.children.at(-1);
    assert.equal(element.type, "Image", image);
    assert.equal(element.props.source, imageMap[image], image);
  }
  resetState();
});

test("a failing bundled asset degrades to its vector and is never re-requested", () => {
  const { exports, catalogExports, imageMap, resetState, rewind } = loadDeviceVisual();
  // Every bundled id must fall back to the vector its image maps to.
  const expectedCategory = {
    lamp: "mushroom-lamp",
    "led-strip": "led-strip",
    fan: "pc-fan",
    charger: "phone-charger",
    socket: "smart-socket",
    appliance: "kettle",
    "lamp-scene": "mushroom-lamp",
  };
  for (const image of Object.keys(imageMap)) {
    resetState();
    const assignment = { name: "x", category: image, image, room: "", allowAuto: false };
    const initial = exports.DeviceVisual({ assignment, id: "CH1" }).props.children.at(-1);
    assert.equal(initial.type, "Image", image);
    assert.equal(initial.props.source, imageMap[image], image);
    initial.props.onError();
    rewind();
    const degraded = exports.DeviceVisual({ assignment, id: "CH1" }).props.children.at(-1);
    assert.equal(degraded.type, "Vector", `${image}: decode failure must reach the vector`);
    assert.equal(
      degraded.props.config.categoryId,
      expectedCategory[image],
      `${image}: fallback vector must match the bundled subject`,
    );
    // Further renders keep the vector: the broken source is not retried.
    for (let i = 0; i < 3; i++) {
      rewind();
      const again = exports.DeviceVisual({ assignment, id: "CH1" }).props.children.at(-1);
      assert.equal(again.type, "Vector", `${image}: render ${i + 2} must not re-mount the broken image`);
    }
  }
  resetState();
});

test("switching to another bundled asset after a failure is not poisoned by stale state", () => {
  const { exports, imageMap, resetState, rewind } = loadDeviceVisual();
  resetState();
  const broken = { name: "x", category: "appliance", image: "appliance", room: "", allowAuto: false };
  const first = exports.DeviceVisual({ assignment: broken, id: "CH1" }).props.children.at(-1);
  assert.equal(first.type, "Image");
  first.props.onError();
  rewind();
  assert.equal(
    exports.DeviceVisual({ assignment: broken, id: "CH1" }).props.children.at(-1).type,
    "Vector",
  );
  // A different, healthy bundled asset must still render as a photo: the same
  // card instance (preserved failure state) re-renders with the new assignment.
  rewind();
  const healthy = { ...broken, category: "fan", image: "fan" };
  const switched = exports.DeviceVisual({ assignment: healthy, id: "CH1" }).props.children.at(-1);
  assert.equal(switched.type, "Image", "stale failure state must not poison another asset");
  assert.equal(switched.props.source, imageMap.fan);
  // If the healthy one fails too, it degrades the same way...
  switched.props.onError();
  rewind();
  assert.equal(
    exports.DeviceVisual({ assignment: healthy, id: "CH1" }).props.children.at(-1).type,
    "Vector",
  );
  // ...and re-selecting the first broken asset retries it exactly once (the
  // failure cache holds the last failed source, matching the custom-photo
  // semantics), then degrades again — never a retry on every render.
  rewind();
  const retry = exports.DeviceVisual({ assignment: broken, id: "CH1" }).props.children.at(-1);
  assert.equal(retry.type, "Image", "re-selection retries a source once, not on every render");
  retry.props.onError();
  rewind();
  assert.equal(
    exports.DeviceVisual({ assignment: broken, id: "CH1" }).props.children.at(-1).type,
    "Vector",
  );
  // A third, still-healthy asset renders.
  const third = { ...broken, category: "socket", image: "socket" };
  const fresh = exports.DeviceVisual({ assignment: third, id: "CH1" }).props.children.at(-1);
  assert.equal(fresh.type, "Image");
  assert.equal(fresh.props.source, imageMap.socket);
  resetState();
});

test("scene mode keeps the warm graphite backdrop when a bundled asset fails", () => {
  const { exports, resetState, rewind } = loadDeviceVisual();
  resetState();
  const assignment = { name: "Чайник", category: "appliance", image: "appliance", room: "", allowAuto: false };
  const sceneView = exports.DeviceVisual({ assignment, id: "CH1", scene: true });
  const initial = sceneView.props.children.at(-1);
  assert.equal(initial.type, "Image");
  assert.equal(initial.props.accessibilityLabel, "Чайник");
  initial.props.onError();
  rewind();
  const degraded = exports.DeviceVisual({ assignment, id: "CH1", scene: true });
  assert.equal(degraded.props.children[0].type, "Gradient", "scene backdrop must stay painted");
  const vector = degraded.props.children.at(-1);
  assert.equal(vector.type, "Vector");
  assert.equal(vector.props.config.categoryId, "kettle");
  assert.equal(vector.props.accessibilityLabel, "Чайник");
  resetState();
});

test("scene mode paints the warm graphite backdrop behind the visual", () => {
  const { exports, imageMap, resetState } = loadDeviceVisual();
  resetState();
  const element = exports.DeviceVisual({
    assignment: { name: "x", category: "lamp", image: "lamp", room: "", allowAuto: false },
    id: "CH1",
    scene: true,
  });
  const backdrop = element.props.children[0];
  assert.equal(backdrop.type, "Gradient");
  assert.equal(JSON.stringify(backdrop.props.colors), JSON.stringify(["#30271E", "#211E18", "#191D18"]));
  assert.equal(element.props.children.at(-1).props.source, imageMap.lamp);
  resetState();
});
