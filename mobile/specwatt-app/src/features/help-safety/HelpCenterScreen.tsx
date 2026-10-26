import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Copy } from "../../specwatt/ui";
import { theme } from "../../specwatt/theme";
import { useSpec } from "../../specwatt/store";
import { Chips, Header, RowLink, Shell, s } from "../../specwatt/mobile-ui";
import { ModuleIcon } from "./icons";
import { Expandable, PressableCard, SearchField } from "./ui";
import {
  articlesInCategory,
  helpCategories,
  moduleString,
  resultCount,
  searchHelp,
  type HelpCategoryId,
} from "./content";

/**
 * Help Center: category chips, filtered list and search with expanding
 * answers. Exported for src/app/help.tsx and for manual mounting in
 * any host screen; no shared navigation files are modified.
 */
export function HelpCenterScreen() {
  const { data } = useSpec();
  const locale = data.locale;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategoryId | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  const effectiveOpen = openId ?? (typeof topic === "string" ? topic : null);

  const searching = query.trim().length > 0;
  const results = useMemo(() => searchHelp(query, locale), [query, locale]);
  const visible = searching ? results : articlesInCategory(category);
  const categoryFilter = helpCategories.find((c) => c.id === category);

  return (
    <Shell>
      <Header
        title={moduleString(locale, "helpTitle")}
        subtitle={moduleString(locale, "helpSubtitle")}
        icon="back"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/home")
        }
      />
      <Copy muted size={13} style={{ lineHeight: 19 }}>
        {moduleString(locale, "helpIntro")}
      </Copy>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={moduleString(locale, "searchPlaceholder")}
        clearLabel={moduleString(locale, "clearSearch")}
      />
      {!searching && (
        <Chips
          items={helpCategories.map((c) => c.title[locale])}
          selected={helpCategories.findIndex((c) => c.id === category)}
          onSelect={(i) =>
            setCategory(i < 0 ? null : helpCategories[i].id)
          }
        />
      )}
      {searching && (
        <Copy muted size={12} accessibilityLiveRegion="polite">
          {resultCount(locale, results.length)}
        </Copy>
      )}
      {searching && results.length === 0 && (
        <View
          accessibilityRole="alert"
          style={[s.card, { gap: 12, alignItems: "center", padding: 24 }]}
        >
          <ModuleIcon name="search" size={34} color={theme.dim} />
          <Copy size={19}>{moduleString(locale, "notFoundTitle")}</Copy>
          <Copy muted size={13} style={{ textAlign: "center" }}>
            {moduleString(locale, "notFoundHint")}
          </Copy>
        </View>
      )}
      {!searching && categoryFilter && (
        <View style={{ gap: 2 }}>
          <Copy size={16}>{categoryFilter.title[locale]}</Copy>
          <Copy muted size={12}>
            {categoryFilter.subtitle[locale]}
          </Copy>
        </View>
      )}
      <View style={{ gap: 10 }}>
        {visible.map((article) => {
          const open = effectiveOpen === article.id;
          return (
            <PressableCard
              key={article.id}
              accessibilityLabel={article.title[locale]}
              accessibilityState={{ expanded: open }}
              expanded={open}
              onPress={() => setOpenId(open ? null : article.id)}
              style={open ? { borderColor: theme.peach } : undefined}
            >
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
                  <Copy size={16} style={{ fontWeight: "700" }}>
                    {article.title[locale]}
                  </Copy>
                </View>
                <View
                  style={{
                    transform: [{ rotate: open ? "180deg" : "0deg" }],
                    justifyContent: "center",
                  }}
                >
                  <ModuleIcon name="chevron" size={20} color={open ? theme.peach : theme.dim} />
                </View>
              </View>
              <Expandable expanded={open}>
                <View style={{ paddingTop: 12, gap: 9 }}>
                  {article.body[locale].map((paragraph, i) => (
                    <Copy key={i} muted size={14} style={{ lineHeight: 21 }}>
                      {paragraph}
                    </Copy>
                  ))}
                </View>
              </Expandable>
            </PressableCard>
          );
        })}
      </View>
      <Copy muted size={12}>
        {moduleString(locale, "alsoSee")}
      </Copy>
      <RowLink
        icon="shield"
        title={moduleString(locale, "openSafety")}
        onPress={() => router.push("/safety")}
      />
      <RowLink
        icon="info"
        title={moduleString(locale, "openPrivacy")}
        onPress={() => router.push("/privacy")}
      />
    </Shell>
  );
}
