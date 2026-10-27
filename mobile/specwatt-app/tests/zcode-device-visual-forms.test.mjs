import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Renders the REAL DeviceIllustration.tsx against the REAL catalog.ts with tiny
// platform mocks (same harness pattern as native-layout.test.mjs). The SVG tree
// is plain data here, so visual sameness can be asserted deterministically.
function loadIllustrationRenderer() {
  const catalogSource = fs.readFileSync(
    new URL("../src/specwatt/illustrations/catalog.ts", import.meta.url),
    "utf8",
  );
  const catalogCode = ts.transpileModule(catalogSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const catalogExports = {};
  vm.runInNewContext(catalogCode, {
    exports: catalogExports,
    require: () => {
      throw new Error("illustrations/catalog must stay dependency-free");
    },
  });

  const react = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    Fragment: "Fragment",
    useId: () => ":t1:",
    __esModule: true,
    default: null,
  };
  react.default = react;
  const artSource = fs.readFileSync(
    new URL("../src/specwatt/illustrations/DeviceIllustration.tsx", import.meta.url),
    "utf8",
  );
  const artCode = ts.transpileModule(artSource, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  const artExports = {};
  const svgNames = [
    "Svg", "Defs", "LinearGradient", "RadialGradient", "Stop", "G", "Path",
    "Rect", "Circle", "Ellipse", "Line", "Text",
  ];
  vm.runInNewContext(artCode, {
    exports: artExports,
    require: (name) => {
      if (name === "react") return react;
      if (name === "react-native")
        return { Platform: { OS: "web" }, StyleProp: null, ViewStyle: null };
      if (name === "react-native-svg") {
        // `Svg` is the default export of react-native-svg; the rest are named.
        const primitives = Object.fromEntries(
          svgNames.map((p) => [p, p === "Svg" ? "Svg" : p]),
        );
        return { ...primitives, default: "Svg", __esModule: true };
      }
      if (name === "./catalog") return catalogExports;
      throw new Error("unexpected DeviceIllustration import: " + name);
    },
  });
  return { catalog: catalogExports, render: (config) => artExports.DeviceIllustration({ config }) };
}

function collectGeometry(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectGeometry(child, out);
    return out;
  }
  if (node.type && node.props) {
    const keys = [
      "d", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r",
      "x1", "x2", "y1", "y2", "strokeWidth", "transform",
      "fill", "stroke", "opacity", "strokeOpacity", "strokeLinecap",
    ];
    const parts = keys
      .filter((k) => node.props[k] !== undefined)
      .map((k) => {
        const value = node.props[k];
        return `${k}=${typeof value === "number" ? Math.round(value * 10) / 10 : value}`;
      });
    out.push(`${node.type}{${parts.join(";")}}`);
    collectGeometry(node.props.children, out);
  }
  return out;
}

const { catalog, render } = loadIllustrationRenderer();

test("every catalogue entry renders inside the fixed 320x240 viewBox with a safe fallback", () => {
  for (const item of catalog.deviceCatalog) {
    const svg = render(catalog.defaultIllustration(item.id));
    assert.equal(svg.type, "Svg");
    assert.equal(svg.props.viewBox, "0 0 320 240");
  }
  const fallback = render(undefined);
  assert.equal(fallback.props.viewBox, "0 0 320 240");
});

test("hostile configuration values never reach the rendered SVG tree", () => {
  const svg = render(catalog.defaultIllustration("unknown"));
  const rendered = JSON.stringify(collectGeometry(svg));
  for (const marker of ["http", "file:", "script", "url(https"])
    assert.ok(!rendered.includes(marker), `rendered art leaked ${marker}`);
});

test("gradient stops keep Android-safe numeric offsets in non-decreasing order", () => {
  for (const item of catalog.deviceCatalog) {
    const svg = render(catalog.defaultIllustration(item.id));
    // Offsets are validated per gradient: each Defs child must ascend 0→1.
    (function walkGradient(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(walkGradient);
      const isGradient = node.type === "LinearGradient" || node.type === "RadialGradient";
      if (isGradient) {
        const stops = [];
        (function collect(stopNode) {
          if (!stopNode || typeof stopNode !== "object") return;
          if (Array.isArray(stopNode)) return stopNode.forEach(collect);
          if (stopNode.type === "Stop") stops.push(stopNode.props.offset ?? 0);
          if (stopNode.props) collect(stopNode.props.children);
        })(node.props.children);
        assert.ok(stops.length >= 2, "each gradient must define its stops");
        let previous = 0;
        for (const offset of stops) {
          const value =
            typeof offset === "number"
              ? offset
              : offset.endsWith("%")
                ? parseFloat(offset) / 100
                : parseFloat(offset);
          assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `bad offset ${offset}`);
          assert.ok(value >= previous, `stop offsets must not regress (${offset})`);
          previous = value;
        }
        return;
      }
      if (node.props) walkGradient(node.props.children);
    })(svg.props.children);
  }
});

test("distinct catalogue forms of one family render distinct artwork", () => {
  const byFamily = new Map();
  for (const item of catalog.deviceCatalog) {
    const signature = collectGeometry(render(catalog.defaultIllustration(item.id))).join("|");
    const list = byFamily.get(item.family) ?? [];
    list.push({ id: item.id, signature });
    byFamily.set(item.family, list);
  }
  const duplicates = [];
  for (const [family, list] of byFamily)
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (list[i].signature === list[j].signature)
          duplicates.push(`${family}: ${list[i].id} renders identical to ${list[j].id}`);
  assert.deepEqual(duplicates, []);
});

test("ultrawide monitor draws a genuinely wider screen than the standard monitor", () => {
  const artWidth = (categoryId) => {
    const svg = render(catalog.defaultIllustration(categoryId));
    let min = 320;
    let max = 0;
    (function walk(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (node.type === "Rect" && typeof node.props.width === "number") {
        min = Math.min(min, node.props.x);
        max = Math.max(max, node.props.x + node.props.width);
      }
      if (node.props) walk(node.props.children);
    })(svg.props.children);
    return max - min;
  };
  const standard = artWidth("monitor");
  const ultrawide = artWidth("ultrawide-monitor");
  assert.ok(
    ultrawide > standard + 24,
    `ultrawide monitor width ${ultrawide} must clearly exceed standard ${standard}`,
  );
});
