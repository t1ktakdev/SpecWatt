import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Renders the REAL CatalogScreen with the real illustration catalogue and
// search logic; only navigation, store, theme and primitive leaf components
// are mocked. Function components (FlatList) are invoked by a tiny renderer
// so the full prop tree stays inspectable.
function loadCatalog({ locale = "ru", params = {} } = {}) {
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

  const states = [];
  let cursor = 0;
  const react = {
    // React semantics: the initializer (lazy or plain) runs exactly once per
    // hook slot and its result is stored, so functional updaters always see
    // the current value — including falsy ones (the `in` check, not ??).
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states))
        states[index] = typeof initial === "function" ? initial() : initial;
      return [
        states[index],
        (next) => {
          states[index] = typeof next === "function" ? next(states[index]) : next;
        },
      ];
    },
    useMemo: (factory) => factory(),
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    Fragment: "Fragment",
    __esModule: true,
    default: null,
  };
  react.default = react;

  const nav = {
    backCalled: 0,
    replacedWith: null,
    dismissedWith: null,
  };
  const exports = {};
  vm.runInNewContext(transpile("../src/screens/catalog.tsx", true), {
    exports,
    require: (name) => {
      if (name === "react") return react;
      if (name === "react-native")
        return {
          View: "View",
          Pressable: "Pressable",
          ScrollView: "ScrollView",
          TextInput: "TextInput",
          StyleSheet: { create: (s) => s },
          useWindowDimensions: () => ({width:393,fontScale:1}),
          FlatList: (props) =>
            react.createElement("FlatList", props, [
              props.ListHeaderComponent
                ? typeof props.ListHeaderComponent === "function"
                  ? props.ListHeaderComponent()
                  : props.ListHeaderComponent
                : null,
              ...(props.data ?? []).map((item) => props.renderItem({ item })),
              (props.data ?? []).length === 0 && props.ListEmptyComponent
                ? typeof props.ListEmptyComponent === "function"
                  ? props.ListEmptyComponent()
                  : props.ListEmptyComponent
                : null,
            ]),
        };
      if (name === "react-native-safe-area-context")
        return { SafeAreaView: "SafeAreaView" };
      if (name === "expo-router")
        return {
          router: {
            canGoBack: () => true,
            back: () => { nav.backCalled += 1; },
            replace: (to) => { nav.replacedWith = to; },
            dismissTo: (to) => { nav.dismissedWith = to; },
          },
          useLocalSearchParams: () => params,
        };
      if (name === "expo-linear-gradient")
        return { LinearGradient: "Gradient" };
      if (name === "../specwatt/ui")
        return { Copy: "Copy", CTA: "CTA" };
      if (name === "../specwatt/theme")
        return {
          theme: { peach: "#FFA86B", line: "#3B4437", dim: "#8C9386" },
          sty: { field: {}, screen: {}, card: {}, row: {}, body: {} },
        };
      if (name === "../specwatt/store")
        return { useSpec: () => ({ data: { locale } }) };
      if (name === "../specwatt/illustrations")
        return { ...catalogExports, DeviceIllustration: "Vector" };
      throw new Error("unexpected CatalogScreen import: " + name);
    },
  });

  const render = () => {
    cursor = 0;
    const tree = exports.CatalogScreen();
    // Invoke function components (FlatList fake) depth-first, with a guard.
    const walk = (node, depth) => {
      if (!node || typeof node !== "object" || depth > 40) return node;
      if (Array.isArray(node)) return node.map((n) => walk(n, depth + 1));
      if (typeof node.type === "function")
        return walk(node.type(node.props), depth + 1);
      node.props.children = walk(node.props.children, depth + 1);
      return node;
    };
    return walk(tree, 0);
  };

  const buttons = (tree) => {
    const found = [];
    (function collect(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(collect);
      if (node.type === "Pressable" && node.props.accessibilityRole === "button")
        found.push(node.props);
      if (node.props) collect(node.props.children);
    })(tree);
    return found;
  };

  const textOf = (tree) => {
    let out = "";
    (function collect(node) {
      if (node == null || typeof node === "boolean") return;
      if (typeof node === "string" || typeof node === "number") {
        out += String(node);
        return;
      }
      if (Array.isArray(node)) return node.forEach(collect);
      if (node.props) collect(node.props.children);
    })(tree);
    return out;
  };

  const cta = (tree) => {
    let found = null;
    (function collect(node) {
      if (!node || typeof node !== "object" || found) return;
      if (Array.isArray(node)) return node.forEach(collect);
      if (node.type === "CTA") {
        found = node.props;
        return;
      }
      if (node.props) collect(node.props.children);
    })(tree);
    return found;
  };

  return {
    catalogExports,
    nav,
    render,
    buttons,
    cta,
    textOf,
    rewind: () => { cursor = 0; },
    resetState: () => { cursor = 0; states.length = 0; },
  };
}

test("the selected category, colour, variant and details are announced by name", () => {
  const h = loadCatalog({ locale: "ru", params: { channel: "CH1" } });
  h.resetState();
  const buttons = h.buttons(h.render());
  const chosen = buttons.filter((p) => (p.accessibilityLabel || "").endsWith(", выбрано"));
  const labels = chosen.map((p) => p.accessibilityLabel);
  assert.ok(labels.includes("Грибовидный светильник, выбрано"), "tile");
  assert.ok(labels.includes("Кремовый, выбрано"), "colour swatch");
  assert.ok(labels.includes("Мягкий корпус, выбрано"), "variant");
  assert.ok(labels.includes("С деталями, выбрано"), "details");
  assert.ok(labels.includes("Все, выбрано"), "group chip");
  // Unselected entries must not carry the marker.
  assert.ok(!labels.includes("Настольный светильник, выбрано"));
  assert.equal(
    buttons.filter((p) => (p.accessibilityLabel || "").includes("светильник, выбрано")).length,
    1,
    "exactly one lamp tile is announced selected",
  );
  // Every control with a selected accessibilityState also announces it by name.
  for (const p of buttons)
    if (p.accessibilityState?.selected)
      assert.ok(
        (p.accessibilityLabel || "").endsWith(", выбрано"),
        `selected state must be in the name, got: ${p.accessibilityLabel}`,
      );
  // Footer CTA is present with the channel label.
  assert.ok((h.cta(h.render())?.label || "").includes("Использовать для CH1"), "footer CTA is reachable");
  h.resetState();
});

test("kyrgyz locale announces kyrgyz names with the kyrgyz selected marker", () => {
  const h = loadCatalog({ locale: "ky", params: { channel: "CH1" } });
  h.resetState();
  const buttons = h.buttons(h.render());
  assert.ok(
    buttons.some((p) => p.accessibilityLabel === "Козу карын сымал чырак, тандалды"),
    "kyrgyz tile with kyrgyz marker",
  );
  assert.ok(
    buttons.some((p) => p.accessibilityLabel === "Каймак түстүү, тандалды"),
    "kyrgyz colour swatch",
  );
  assert.ok((h.cta(h.render())?.label || "").includes("CH1 үчүн колдонуу"), "kyrgyz footer CTA");
  h.resetState();
});

test("the colour row wraps instead of clipping its last control on narrow screens", () => {
  const h = loadCatalog({ locale: "ru" });
  h.resetState();
  // Find the View that parents the five colour swatches and check its style.
  let rowStyle = null;
  (function walk(node) {
    if (!node || typeof node !== "object" || rowStyle) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.props) {
      const kids = Array.isArray(node.props.children) ? node.props.children.flat(4) : [];
      const labels = kids
        .filter((c) => c && c.props && c.props.accessibilityLabel)
        .map((c) => c.props.accessibilityLabel);
      if (labels.length === 5 && labels.includes("Графит") && labels.includes("Белый"))
        rowStyle = Array.isArray(node.props.style) ? node.props.style[0] : node.props.style;
      walk(node.props.children);
    }
  })(h.render());
  assert.ok(rowStyle, "colour swatch row found");
  assert.equal(rowStyle.flexWrap, "wrap", "the row must wrap, not clip");
  h.resetState();
});

test("search drives the real catalogue: empty state, counter and recovery", () => {
  const h = loadCatalog({ locale: "ru" });
  h.resetState();
  let tree = h.render();
  const findInput = (node) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = findInput(child);
        if (hit) return hit;
      }
      return null;
    }
    if (node.props?.accessibilityLabel === "Поиск устройств") return node.props;
    const hit = findInput(node.props?.children);
    return hit;
  };
  const input = findInput(tree);
  assert.ok(input, "search input found");
  input.onChangeText("zzzzнеттакого");
  h.rewind();
  tree = h.render();
  let text = h.textOf(tree);
  assert.ok(text.includes("Ничего не найдено"), "empty state is rendered");
  assert.ok(text.includes("Найдено: 0"), "counter shows zero");
  input.onChangeText("холодильник");
  h.rewind();
  tree = h.render();
  text = h.textOf(tree);
  assert.ok(text.includes("Найдено: 3"), "counter counts all three fridge matches");
  for (const name of ["Холодильник", "Двухдверный холодильник", "Мини-холодильник"])
    assert.ok(h.buttons(tree).some((p) => p.accessibilityLabel === name), `${name} rendered`);
  h.resetState();
});

test("selection has no capability effects: using a channel only dismisses with the config", () => {
  const h = loadCatalog({ locale: "ru", params: { channel: "CH1" } });
  h.resetState();
  h.render();
  const tile = h.buttons(h.render()).find((p) => p.accessibilityLabel === "Холодильник");
  assert.ok(tile, "tile exists");
  tile.onPress(); // selecting another category must not touch channels
  h.rewind();
  const cta = h.cta(h.render());
  assert.ok((cta?.label || "").includes("Использовать для CH1"), "CTA still reachable after selection");
  cta.onPress();
  assert.deepEqual(
    h.nav.dismissedWith?.params?.channel,
    "CH1",
    "use() only navigates back with the illustration config",
  );
  assert.ok(
    JSON.parse(h.nav.dismissedWith.params.illustration).categoryId === "fridge",
    "the chosen config is handed back verbatim",
  );
  h.resetState();
});

test("a functional selection keeps colour, variant and details through the use round-trip", () => {
  const initial = { categoryId: "air-fryer", color: "sage", variant: "angular", details: "minimal" };
  const h = loadCatalog({
    locale: "ru",
    params: { channel: "CH1", illustration: JSON.stringify(initial) },
  });
  h.resetState();
  // The stored custom config is the selected tile on first render.
  const tile = h.buttons(h.render()).find(
    (p) => p.accessibilityLabel === "Аэрогриль, выбрано",
  );
  assert.ok(tile, "custom config must load as the selected tile");
  // One functional update right after load: the stored slot (not a blank
  // object) must be the updater's input, as React guarantees.
  const fridge = h.buttons(h.render()).find((p) => p.accessibilityLabel === "Холодильник");
  assert.ok(fridge, "target tile exists");
  fridge.onPress();
  // Re-renders alone must not mutate the stored config.
  h.rewind();
  h.render();
  h.rewind();
  // Then two more sequential edits on top.
  const variant = h.buttons(h.render()).find((p) => p.accessibilityLabel === "Мягкий корпус");
  assert.ok(variant, "variant control exists");
  variant.onPress();
  h.rewind();
  const swatch = h.buttons(h.render()).find((p) => p.accessibilityLabel === "Медь");
  assert.ok(swatch, "colour control exists");
  swatch.onPress();
  h.rewind();
  h.cta(h.render()).onPress();
  assert.equal(h.nav.dismissedWith?.params?.channel, "CH1");
  assert.deepEqual(
    JSON.parse(h.nav.dismissedWith.params.illustration),
    { categoryId: "fridge", color: "copper", variant: "rounded", details: "minimal" },
    "every config field must survive the whole round-trip",
  );
  h.resetState();
});
