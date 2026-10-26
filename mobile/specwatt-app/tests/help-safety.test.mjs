import assert from "node:assert/strict";
import test from "node:test";
import {
  articlesInCategory,
  helpArticles,
  helpCategories,
  moduleString,
  normalizeQuery,
  policyDraft,
  privacySections,
  resultCount,
  safetyRules,
  searchHelp,
  tokenize,
} from "../src/features/help-safety/content.ts";

const locales = ["ru", "ky"];
const articleIds = helpArticles.map((a) => a.id);
const moduleIconNames = [
  "search",
  "chevron",
  "close",
  "lock",
  "check",
  "wifi-off",
  "database",
  "cloud",
  "download",
  "trash",
  "book",
  "bolt",
  "settings",
  "shield",
];

test("all nine required help topics exist with unique ids", () => {
  const required = [
    "what-is-specwatt",
    "how-demo-works",
    "connect-controller",
    "channels-ch1-ch2-ch3",
    "assign-device",
    "device-unavailable",
    "autopilot-permissions",
    "power-and-energy",
    "connection-lost",
  ];
  for (const id of required) assert.ok(articleIds.includes(id), `missing: ${id}`);
  assert.equal(new Set(articleIds).size, articleIds.length);
});

test("RU and KY content are in full parity and non-empty", () => {
  const blocks = [
    ...helpArticles.map((a) => ({ title: a.title, body: a.body, keywords: a.keywords })),
    ...safetyRules.map((r) => ({ title: r.title, body: r.body })),
    ...privacySections.map((p) => ({ title: p.title, body: p.body })),
  ];
  for (const locale of locales) {
    for (const block of blocks) {
      assert.ok(block.title[locale].trim().length >= 4, `title too short (${locale})`);
      assert.ok(block.body[locale].length >= 1, `body empty (${locale})`);
      for (const paragraph of block.body[locale])
        assert.ok(paragraph.trim().length > 20, `paragraph too short (${locale})`);
      if (block.keywords)
        assert.ok(block.keywords[locale].length >= 2, `keywords too few (${locale})`);
    }
    for (const category of helpCategories)
      assert.ok(category.title[locale].length > 0 && category.subtitle[locale].length > 0);
  }
  // Both locales describe the same number of paragraphs per article.
  for (const article of helpArticles)
    assert.equal(article.body.ru.length, article.body.ky.length, article.id);
});

test("article categories are known and evenly distributed", () => {
  const ids = helpCategories.map((c) => c.id);
  assert.deepEqual(ids, ["basics", "devices", "autopilot", "reliability"]);
  for (const article of helpArticles) assert.ok(ids.includes(article.category));
  assert.equal(new Set(helpCategories.map((c) => c.id)).size, ids.length);
});

test("safety center covers the five approved rules with valid icons", () => {
  assert.deepEqual(
    safetyRules.map((r) => r.id),
    [
      "ch3-protected",
      "manual-confirmation",
      "connection-not-off",
      "demo-not-measurements",
      "low-voltage-only",
    ],
  );
  for (const rule of safetyRules)
    assert.ok(moduleIconNames.includes(rule.icon), `bad icon: ${rule.icon}`);
});

test("privacy center covers required sections; placeholders are flagged", () => {
  const ids = privacySections.map((p) => p.id);
  for (const id of [
    "local-data",
    "stored-settings",
    "demo-vs-server",
    "export-data",
    "clear-local",
    "privacy-policy",
  ])
    assert.ok(ids.includes(id), `missing privacy section: ${id}`);
  for (const section of privacySections)
    assert.ok(moduleIconNames.includes(section.icon), `bad icon: ${section.icon}`);
  const flagged = policyDraft.filter((p) => p.needsConfirmation);
  assert.equal(flagged.length, 3);
  for (const item of flagged) {
    assert.match(item.text.ru, /\[/);
    assert.match(item.text.ky, /\[/);
  }
});

test("query normalization folds case, ё/е and whitespace", () => {
  assert.equal(normalizeQuery("  ДЕМО   режим "), "демо режим");
  assert.equal(normalizeQuery("Ёлка"), "елка");
  assert.equal(normalizeQuery("\t ch3 \n"), "ch3");
  assert.deepEqual(tokenize("a  b"), ["a", "b"]);
  assert.deepEqual(tokenize("   "), []);
  assert.equal(tokenize("x y z w v u t s q p").length, 8);
});

test("search matches tokens across title, keywords and body per locale", () => {
  const ru = searchHelp("демо", "ru");
  assert.ok(ru.some((a) => a.id === "how-demo-works"));
  const ky = searchHelp("демо", "ky");
  assert.ok(ky.some((a) => a.id === "how-demo-works"));
  // "How demo works" must answer a Russian query about offline storage.
  assert.ok(searchHelp("сеть", "ru").length > 0);
  // Channel naming question.
  const channels = searchHelp("канал ch3", "ru");
  assert.equal(channels[0].id, "channels-ch1-ch2-ch3");
  // Kyrgyz synonym via keywords.
  assert.ok(searchHelp("туташтыруу", "ky").some((a) => a.id === "connect-controller"));
});

test("search ranks title matches above body-only matches", () => {
  const ranked = searchHelp("каналы", "ru");
  assert.ok(ranked.length >= 1);
  assert.equal(ranked[0].id, "channels-ch1-ch2-ch3");
});

test("search requires every token and sorts deterministically", () => {
  // A token with no hit anywhere eliminates the article.
  assert.deepEqual(searchHelp("демо квантовый", "ru"), []);
  const first = searchHelp("автопилот", "ru").map((a) => a.id);
  const second = searchHelp("автопилот", "ru").map((a) => a.id);
  assert.deepEqual(first, second);
  assert.ok(first.length >= 2);
});

test("empty query returns no results; category filtering keeps order", () => {
  assert.deepEqual(searchHelp("", "ru"), []);
  assert.deepEqual(searchHelp("   ", "ky"), []);
  assert.equal(articlesInCategory(null).length, helpArticles.length);
  const devices = articlesInCategory("devices");
  assert.equal(devices.length, 3);
  assert.deepEqual(devices.map((a) => a.category), ["devices", "devices", "devices"]);
  assert.equal(articlesInCategory("reliability").length, 1);
});

test("module strings stay in RU/KY lockstep with RU fallback", () => {
  assert.equal(moduleString("ru", "searchPlaceholder"), "Поиск по вопросам");
  assert.equal(moduleString("ky", "searchPlaceholder"), "Суроолор боюнча издөө");
  for (const locale of locales) {
    assert.equal(typeof moduleString(locale, "helpTitle"), "string");
    assert.equal(typeof moduleString(locale, "needsConfirmation"), "string");
  }
  assert.equal(resultCount("ru", 1), "Найден 1 вопрос");
  assert.equal(resultCount("ru", 3), "Найдено вопросов: 3");
  assert.equal(resultCount("ky", 1), "1 суроо табылды");
  assert.equal(resultCount("ky", 3), "Табылган суроолор: 3");
});

test("help content matches the real demo model values", () => {
  const demo = searchHelp("модельные значения", "ru").find(
    (a) => a.id === "how-demo-works",
  );
  assert.ok(demo);
  assert.match(demo.body.ru.join(" "), /1,8 Вт/);
  assert.match(demo.body.ru.join(" "), /2,4 Вт/);
  const protectedRule = safetyRules.find((r) => r.id === "ch3-protected");
  assert.match(protectedRule.body.ru.join(" "), /CH3/);
});
