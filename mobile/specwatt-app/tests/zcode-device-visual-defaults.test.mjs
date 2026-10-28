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
    [undefined, undefined, "unknown"],
    [undefined, "lamp-scene", "unknown"],
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
  assert.equal(element.type, "Vector", "invalid appearance falls back to SVG");

  resetState();
  const remote = exports.DeviceVisual({
    assignment: {
      ...assignment,
      appearance: { kind: "photo", uri: "https://example.com/private.jpg" },
    },
    id: "CH1",
  }).props.children.at(-1);
  assert.equal(remote.type, "Vector", "rejected remote photo falls back to SVG");

  resetState();
  const traversal = exports.DeviceVisual({
    assignment: {
      ...assignment,
      appearance: { kind: "photo", uri: "file:///data/user/0/kg.specwatt.mobile/files/specwatt-photos/../secret.jpg" },
    },
    id: "CH1",
  }).props.children.at(-1);
  assert.equal(traversal.type, "Vector");
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


// Policy deliberately changed: legacy images are category hints, not photo consent.
// Keep repeat-render/source-change coverage without mounting an implicit photo.
test("every legacy image uses SVG on the first render", () => {
  const { exports, imageMap, resetState } = loadDeviceVisual();
  for (const image of Object.keys(imageMap)) {
    resetState();
    const element=exports.DeviceVisual({assignment:{name:"x",image},id:"CH1"}).props.children.at(-1);
    assert.equal(element.type,"Vector",image);
  }
});
test("legacy SVG stays stable across repeated renders", () => {
  const { exports, resetState, rewind } = loadDeviceVisual();
  resetState();
  for(let i=0;i<4;i++) {
    rewind();
    const element=exports.DeviceVisual({assignment:{name:"x",image:"led-strip"},id:"CH2"}).props.children.at(-1);
    assert.equal(element.type,"Vector");
    assert.equal(element.props.config.categoryId,"led-strip");
  }
});
test("switching legacy subjects updates the vector without mounting photos", () => {
  const { exports, resetState, rewind } = loadDeviceVisual();
  resetState();
  for(const [image,category] of [["appliance","kettle"],["fan","pc-fan"],["socket","smart-socket"]]) {
    rewind();
    const element=exports.DeviceVisual({assignment:{name:"x",image},id:"CH1"}).props.children.at(-1);
    assert.equal(element.type,"Vector");
    assert.equal(element.props.config.categoryId,category);
  }
});
test("photo decode failure retains the scene and semantic name", () => {
  const { exports, ownedPhotoUri, resetState, rewind } = loadDeviceVisual();
  resetState();
  const assignment={name:"Чайник",image:"appliance",appearance:{kind:"photo",uri:ownedPhotoUri}};
  const initial=exports.DeviceVisual({assignment,id:"CH1",scene:true}).props.children.at(-1);
  assert.equal(initial.type,"Image");
  initial.props.onError();
  rewind();
  const degraded=exports.DeviceVisual({assignment,id:"CH1",scene:true});
  assert.equal(degraded.props.children[0].type,"Gradient");
  assert.equal(degraded.props.children.at(-1).type,"Vector");
  assert.equal(degraded.props.children.at(-1).props.accessibilityLabel,"Чайник");
});
test("scene retains a backdrop behind the default vector", () => {
  const { exports, resetState }=loadDeviceVisual();
  resetState();
  const node=exports.DeviceVisual({assignment:{name:"x",image:"lamp"},id:"CH1",scene:true});
  assert.equal(node.props.children[0].type,"Gradient");
  assert.equal(node.props.children.at(-1).type,"Vector");
});
