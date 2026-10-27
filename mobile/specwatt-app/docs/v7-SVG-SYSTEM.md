# SpecWATT offline vector device system — v7

## Delivered

`src/specwatt/illustrations/catalog.ts` contains **119 searchable bilingual device categories across 46 base geometry families**. This is not a claim of 119 independently drawn objects. Related categories intentionally share a material language and a family template; several have subtype changes (fridge doors, lamps, countertop appliances, router antennas, etc.). There are five curated material colors, two body choices and two detail modes. Some controls affect only relevant shell/detail portions; for example a bare LED strip has no rectangular appliance cabinet.

`DeviceIllustration.tsx` is original code-drawn artwork using native `react-native-svg` primitives. The main three showcase illustrations are a warm mushroom table lamp with shaded dome/cream stem, coiled LED circuit strips with individually placed luminous chips and traces, and a PC fan with frame, curved blades, motor, screws and leads. Other families have distinct silhouettes, glazing, controls, metal highlights and casing surfaces rather than recolored library glyphs.

All artwork uses a fixed320×240 viewBox. The caller can set rendered width/height, allowing the same vector geometry on cards and detail pages. Gradient identifiers are unique per mounted instance. Existing photographs remain available in the app; this system does not remove them or claim device capabilities from a category image.

## Constructor and integration

`/catalog` provides a virtualized two-column `FlatList` with translated search and group filtering. It mounts an initial six catalogue items with bounded rendering windows, rather than instantiating all119 detailed vector trees. The preview can change color, body choice and detail mode offline.

Input route parameters:

```ts
router.push({
  pathname: '/catalog',
  params: { channel: 'CH1', illustration: JSON.stringify(config) },
});
```

Use returns to the existing setup route with the same `channel` and serialized validated `illustration` parameters. Setup owns assignment persistence. Without a valid channel parameter the screen is an explore-only catalogue, not a fake save flow. Parent integration must validate any incoming configuration before persisting it; `validateIllustrationConfig` is shared and pure.

Suggested default identities: `mushroom-lamp`, `led-strip`, `pc-fan`. The neutral unknown device is `unknown`.

## Safety boundary

`IllustrationConfig` is exactly `{categoryId,color,variant,details}`. Unknown categories, colors, variants, detail values and extra keys are rejected, including `href`, `onLoad`, scripts and external image URLs. The validator returns a new canonical object. The renderer validates again and safely falls back to the unknown template.

There is no SVG/XML parser, `SvgXml`, arbitrary path import, script evaluation, remote image, external `href`, user-supplied gradient or network dependency. The only `url(...)` references are fixed local gradient IDs generated in code. Templates—not user text—own all numeric geometry and supported attributes. This prevents executable/raw SVG content from entering the rendering tree.

The future `IllustrationSuggestionProvider` interface is separate. Its offline implementation has `available:false` and rejects requests with `ai-illustration-provider-not-connected`; it does not pretend text generation works.

## Verification and limits

Four Node tests verify category count/uniqueness, bilingual metadata, diverse family coverage, safe defaults, search, rejection of executable/external configuration and unavailable AI behavior. Tests were observed failing before the catalogue existed, then passing. TypeScript and targeted ESLint pass.

Native screenshot and physical-device performance checks remain the integration owner's responsibility; a passing schema test does not prove visual quality or frame rate.119 category labels share46 family templates; further individually refined subtype geometry may be worthwhile after device QA. Kyrgyz labels need native-speaker review. User-provided photo handling is a separate app integration feature and is not implemented by this vector renderer.
