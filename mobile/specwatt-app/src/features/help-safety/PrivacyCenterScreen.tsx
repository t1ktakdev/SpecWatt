import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Copy } from "../../specwatt/ui";
import { theme } from "../../specwatt/theme";
import { useSpec } from "../../specwatt/store";
import { Header, RowLink, Shell, s } from "../../specwatt/mobile-ui";
import { ModuleIcon } from "./icons";
import { RuleBadge } from "./ui";
import { moduleString, policyDraft, privacySections } from "./content";

/**
 * Privacy & Data Center. Explains what is stored locally, how demo differs
 * from a server account and how export/clearing work. It deliberately does
 * not duplicate export or delete actions: those live in the real Settings
 * screen and are linked from here, so no fake buttons are introduced.
 */
export function PrivacyCenterScreen() {
  const { data } = useSpec();
  const locale = data.locale;
  return (
    <Shell>
      <Header
        title={moduleString(locale, "privacyTitle")}
        subtitle={moduleString(locale, "privacySubtitle")}
        icon="back"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/home")
        }
      />
      <Copy muted size={13} style={{ lineHeight: 19 }}>
        {moduleString(locale, "privacyIntro")}
      </Copy>
      {privacySections.map((section) => (
        <View key={section.id} style={[s.card, { gap: 10 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={iconBadge}>
              <ModuleIcon name={section.icon} size={22} color={theme.peach} />
            </View>
            <View style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
              <Copy size={16} style={{ fontWeight: "700" }}>
                {section.title[locale]}
              </Copy>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            {section.body[locale].map((paragraph, i) => (
              <Copy key={i} muted size={14} style={{ lineHeight: 21 }}>
                {paragraph}
              </Copy>
            ))}
          </View>
        </View>
      ))}
      <View style={[s.card, { gap: 10 }]}>
        <Copy size={17} style={{ fontWeight: "700" }}>
          {moduleString(locale, "openPrivacy")}
        </Copy>
        {policyDraft.map((paragraph, i) =>
          paragraph.needsConfirmation ? (
            <View
              key={i}
              accessibilityRole="text"
              style={{
                gap: 6,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: theme.peach,
                borderRadius: 12,
                padding: 11,
              }}
            >
              <RuleBadge label={moduleString(locale, "needsConfirmation")} />
              <Copy size={14} style={{ lineHeight: 21 }}>
                {paragraph.text[locale]}
              </Copy>
            </View>
          ) : (
            <Copy key={i} muted size={14} style={{ lineHeight: 21 }}>
              {paragraph.text[locale]}
            </Copy>
          ),
        )}
      </View>
      <RowLink
        icon="settings"
        title={moduleString(locale, "openSettings")}
        subtitle={moduleString(locale, "settingsHint")}
        onPress={() => router.push("/settings")}
      />
      <RowLink
        icon="shield"
        title={moduleString(locale, "openSafety")}
        onPress={() => router.push("/safety")}
      />
    </Shell>
  );
}

const iconBadge = {
  width: 42,
  height: 42,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: theme.line,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
