import React, { useEffect, useRef } from "react";
import { View, ScrollView, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { MotionPressable as Pressable, Reveal } from "../specwatt/motion";
import { Copy, CTA, Panel } from "../specwatt/ui";
import { theme, sty } from "../specwatt/theme";
import { t } from "../specwatt/i18n";
import { useSpec } from "../specwatt/store";

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const { data, ready, storageError, setLocale, setFirstRunStep, enterDemo, setOnboarded } = useSpec();
  const resumed = useRef(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const locale = data.locale;
  const page = data.firstRunStep ?? "welcome";
  const intro = ["welcome", "insight", "safety"].indexOf(page);
  const titleSize = width < 360 ? 28 : 32;
  useEffect(() => {
    if (!ready || resumed.current) return;
    resumed.current = true;
    if (data.source === "demo" || data.onboarded) router.replace("/home");
  }, [ready, data.source, data.onboarded]);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [page]);
  if (!ready) return <SafeAreaView style={sty.screen}><Copy>{t(locale, "loading")}</Copy></SafeAreaView>;
  return (
    <SafeAreaView style={sty.screen}>
      <ScrollView ref={scroll} contentContainerStyle={[sty.body, { paddingTop: 20, flexGrow: 1 }]}>
        <View style={[sty.row, { justifyContent: "space-between", gap: 12, flexWrap: "wrap" }]}>
          <Copy size={25}>Spec<Copy size={25} accent>WATT</Copy></Copy>
          {page !== "locale" && <View style={[sty.row, { gap: 4 }]}>
            {(["ru", "ky"] as const).map(code => (
              <Pressable key={code} accessibilityRole="button"
                accessibilityLabel={code === "ru" ? t(locale, "langRu") : t(locale, "langKy")}
                accessibilityHint={t(locale, "langHint")} accessibilityState={{ selected: code === locale }}
                onPress={() => setLocale(code)}
                style={{ minWidth: 48, minHeight: 48, padding: 8, justifyContent: "center", alignItems: "center", borderRadius: 16, backgroundColor: code === locale ? theme.raised : theme.bg }}>
                <Copy size={13} accent={code === locale}>{code.toUpperCase()}</Copy>
              </Pressable>
            ))}
          </View>}
        </View>
        {storageError && <Copy accessibilityRole="alert" size={13} style={{ color: theme.error }}>{t(locale, "storageFirstRun")}</Copy>}
        {intro >= 0 && <>
          <View accessibilityRole="progressbar" accessibilityLabel={`${t(locale, "introStep")} ${intro + 1} ${t(locale, "introOf")} 3`}
            accessibilityValue={{ min: 1, max: 3, now: intro + 1 }} style={{ gap: 10, marginTop: 8 }}>
            <View style={[sty.row, { gap: 6 }]} accessible={false}>
              {[0, 1, 2].map(i => <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= intro ? theme.peach : theme.line }} />)}
            </View>
            <Copy size={12} muted>{`0${intro + 1} / 03`}</Copy>
          </View>
          <Reveal key={page} style={{ gap: 20 }}>
            <Panel style={{ backgroundColor: theme.raised, gap: 16, padding: 24 }}>
              <Copy size={12} accent>{t(locale, intro === 2 ? "introPermission" : "introModel")}</Copy>
              {intro === 2 ? <>
                <Copy size={27} accent>{t(locale, "introProtected")}</Copy>
                <Copy muted>{t(locale, "tagline")}</Copy>
              </> : <>
                <View style={[sty.row, { alignItems: "flex-end", gap: 10 }]} accessible={false}>
                  {[0.38, 0.6, 0.44, 0.9, 0.65, 0.48, 0.7, 0.52].map((v, i) => (
                    <View key={i} style={{ flex: 1, height: 88 * v, borderRadius: 5, backgroundColor: i === 3 ? theme.peach : theme.line }} />
                  ))}
                </View>
                <Copy size={13} muted>{t(locale, intro === 0 ? "badgeLoad" : "badgePlan")}</Copy>
              </>}
            </Panel>
            <Copy accessibilityRole="header" accessibilityLiveRegion="polite" size={titleSize} style={{ fontWeight: "700" }}>
              {t(locale, intro === 0 ? "introSee" : intro === 1 ? "introPeak" : "introSafe")}
            </Copy>
            <Copy muted size={16}>{t(locale, intro === 0 ? "introSeeBody" : intro === 1 ? "introPeakBody" : "introSafeBody")}</Copy>
          </Reveal>
          <View style={{ flex: 1, minHeight: 8 }} />
          <CTA label={t(locale, "next")} onPress={() => setFirstRunStep(intro === 0 ? "insight" : intro === 1 ? "safety" : "locale")} />
          {intro > 0 && <CTA label={t(locale, "back")} secondary onPress={() => setFirstRunStep(intro === 2 ? "insight" : "welcome")} />}
          <CTA label={t(locale, "introSkip")} secondary onPress={() => setFirstRunStep("locale")} />
        </>}
        {page === "locale" && <>
          <Copy accessibilityRole="header" size={titleSize}>{t(locale, "language")}</Copy>
          <Copy muted>{t(locale, "languageNote")}</Copy>
          <View style={{ gap: 12 }}>
            {(["ru", "ky"] as const).map(code => (
              <Pressable key={code} accessibilityRole="button"
                accessibilityLabel={code === "ru" ? t(locale, "langRu") : t(locale, "langKy")}
                accessibilityHint={t(locale, "langHint")} accessibilityState={{ selected: code === locale }}
                onPress={() => setLocale(code)} style={[sty.card, { minHeight: 88, gap: 8, backgroundColor: code === locale ? theme.raised : theme.surface }]}>
                <Copy size={23} accent={code === locale}>{code === "ru" ? t(locale, "langRu") : t(locale, "langKy")}</Copy>
                <Copy size={13} muted>{t(locale, code === locale ? "selected" : "pick")}</Copy>
              </Pressable>
            ))}
          </View>
          <CTA label={t(locale, "next")} onPress={() => setFirstRunStep("mode")} />
          <CTA label={t(locale, "back")} secondary onPress={() => setFirstRunStep("safety")} />
        </>}
        {page === "mode" && <>
          <Copy accessibilityRole="header" size={titleSize}>{t(locale, "mode")}</Copy>
          <Copy muted>{t(locale, "modeNote")}</Copy>
          <Panel style={{ gap: 12, backgroundColor: theme.raised }}>
            <Copy size={12} accent>{t(locale, "simulation")}</Copy>
            <Copy>{t(locale, "firstDemoNote")}</Copy>
            <CTA label={t(locale, "demo")} onPress={() => { enterDemo(); router.replace("/home"); }} />
          </Panel>
          <CTA secondary label={t(locale, "real")} onPress={() => setFirstRunStep("controller")} />
          <CTA secondary label={t(locale, "authEntry")} onPress={() => router.push("/server")} />
          <Copy size={13} muted>{t(locale, "serverEntryNote")}</Copy>
          <CTA secondary label={t(locale, "empty")} onPress={() => { setOnboarded(); router.replace("/home"); }} />
          <CTA secondary label={t(locale, "back")} onPress={() => setFirstRunStep("locale")} />
        </>}
        {page === "controller" && <>
          <Copy accessibilityRole="header" accessibilityLiveRegion="polite" size={titleSize}>{t(locale, "controllerUnavailable")}</Copy>
          <Panel style={{ gap: 12 }}><Copy accent>{t(locale, "noData")}</Copy><Copy muted>{t(locale, "controllerNote")}</Copy></Panel>
          <CTA label={t(locale, "virtualSetup")} onPress={() => router.push("/setup")} />
          <CTA secondary label={t(locale, "serverOpen")} onPress={() => router.push("/server")} />
          <CTA secondary label={t(locale, "back")} onPress={() => setFirstRunStep("mode")} />
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}
