import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Copy } from "../../specwatt/ui";
import { theme } from "../../specwatt/theme";
import { useSpec } from "../../specwatt/store";
import { Header, RowLink, Shell, s } from "../../specwatt/mobile-ui";
import { ModuleIcon } from "./icons";
import { safetyRules, moduleString } from "./content";

/**
 * Safety Center: the five operating rules that match the actual SpecWATT
 * data model (protected CH3, controller confirmation, connection loss,
 * demo data provenance, low-voltage scope).
 */
export function SafetyCenterScreen() {
  const { data } = useSpec();
  const locale = data.locale;
  return (
    <Shell>
      <Header
        title={moduleString(locale, "safetyTitle")}
        subtitle={moduleString(locale, "safetySubtitle")}
        icon="back"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/home")
        }
      />
      <View style={[s.card, { gap: 10, borderColor: theme.peach }]}>
        <ModuleIcon name="check" size={26} color={theme.peach} />
        <Copy muted size={13} style={{ lineHeight: 19 }}>
          {moduleString(locale, "safetyIntro")}
        </Copy>
      </View>
      {safetyRules.map((rule, index) => (
        <View key={rule.id} style={[s.card, { gap: 10 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={indexBadge}>
              <Copy size={14} accent style={{ fontWeight: "700" }}>
                {String(index + 1)}
              </Copy>
            </View>
            <ModuleIcon name={rule.icon} size={22} color={theme.dim} />
            <View style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
              <Copy size={16} style={{ fontWeight: "700" }}>
                {rule.title[locale]}
              </Copy>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            {rule.body[locale].map((paragraph, i) => (
              <Copy key={i} muted size={14} style={{ lineHeight: 21 }}>
                {paragraph}
              </Copy>
            ))}
          </View>
        </View>
      ))}
      <Copy muted size={12} style={{ lineHeight: 18 }}>
        {moduleString(locale, "safetyFooter")}
      </Copy>
      <RowLink
        icon="info"
        title={moduleString(locale, "openPrivacy")}
        onPress={() => router.push("/privacy")}
      />
      <RowLink
        icon="journal"
        title={moduleString(locale, "openHelp")}
        onPress={() => router.push("/help")}
      />
    </Shell>
  );
}

const indexBadge = {
  width: 32,
  height: 32,
  borderRadius: 17,
  borderWidth: 1,
  borderColor: theme.peach,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
