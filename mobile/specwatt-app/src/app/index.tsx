import { MotionPressable as Pressable } from '../specwatt/motion';
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Copy, CTA, Panel, Photo } from "../specwatt/ui";
import { theme, sty } from "../specwatt/theme";
import { imageMap } from "../specwatt/images";
import { t } from "../specwatt/i18n";
import { useSpec } from "../specwatt/store";
import { applyLocale } from "../specwatt/localization/locale-mirror";

type Page = "welcome" | "locale" | "mode" | "login" | "register" | "recovery";
export default function Onboarding() {
  const { height, width } = useWindowDimensions();
  const welcomeTitleSize = width < 360 ? 28 : 32;
  const insets = useSafeAreaInsets();
  const availableHeight = height - insets.top - insets.bottom;
  const welcomeImageHeight = Math.max(130, Math.min(184, availableHeight * 0.22));
  const { data, ready, setLocale, enterDemo, setOnboarded } = useSpec();
  const [page, setPage] = useState<Page>("welcome");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const locale = data.locale;
  const resumed = useRef(false);
  useEffect(() => {
    if (!ready || resumed.current) return;
    resumed.current = true;
    if (data.source === "demo" || data.onboarded) router.replace("/home");
  }, [ready, data.source, data.onboarded]);
  function chooseDemo() {
    enterDemo();
    router.replace("/home");
  }
  const go = (name: Page) => {
    setError("");
    setPage(name);
  };
  const submit = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError(t(locale, "errEmail"));
      return;
    }
    if (page !== "recovery" && password.length < 8) {
      setError(t(locale, "errPassword"));
      return;
    }
    if (page === "register" && password !== repeat) {
      setError(t(locale, "errPasswordMatch"));
      return;
    }
    setError(t(locale, "errServerOffline"));
  };
  const badges = [t(locale, "badgeLoad"), t(locale, "badgeProtect"), t(locale, "badgePlan")];
  if (!ready)
    return (
      <SafeAreaView style={sty.screen}>
        <Copy>{t(locale, "loading")}</Copy>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={sty.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[sty.body, { paddingTop: 24, maxWidth: 440, width: "100%", alignSelf: "center" }, page === "welcome" && { gap: 16 }]}
        >
          <View style={[sty.row, { justifyContent: "space-between", gap: 12, flexWrap: "wrap" }]}>
            <Copy size={26}>
              Spec
              <Copy size={26} accent>
                WATT
              </Copy>
            </Copy>
            <Copy size={12} muted>
              {t(locale, "standBadge")}
            </Copy>
          </View>
          {page === "welcome" && (
            <>
              <Panel style={{ padding: 0, overflow: "hidden", marginTop: 8 }}>
                <Photo
                  source={imageMap["lamp-scene"]}
                  style={{ width: "100%", height: welcomeImageHeight }}
                />
              </Panel>
              <Copy size={welcomeTitleSize}>
                {t(locale, "welcomeTitle1")}{"\n"}
                <Copy size={welcomeTitleSize} accent>{t(locale, "welcomeTitle2")}</Copy>
              </Copy>
              <Copy muted>
                {t(locale, "welcomeSubtitle")}
              </Copy>
              <View style={[sty.row, { gap: 10, marginVertical: 4 }]}>
                {["◷", "⌁", "♢"].map((a, i) => (
                  <View
                    key={i}
                    style={[sty.card, { flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 8 }]}
                  >
                    <Copy size={25} accent>
                      {a}
                    </Copy>
                    <Copy size={12}>{badges[i]}</Copy>
                  </View>
                ))}
              </View>
              <CTA label={t(locale, "next")} onPress={() => go("locale")} />
              <Pressable accessibilityRole="button" accessibilityLabel={t(locale,"loginUnavailable")} onPress={() => go("login")} style={{minHeight:48,justifyContent:'center',alignItems:'center',padding:8}}>
                <Copy muted size={13} style={{textAlign:'center'}}>{t(locale,"loginUnavailable")}</Copy>
              </Pressable>
            </>
          )}
          {page === "locale" && (
            <>
              <Copy size={32}>{t(locale, "language")}</Copy>
              <Copy muted>
                {t(locale, "languageNote")}
              </Copy>
              <View style={[sty.row, { gap: 12, marginVertical: 16, alignItems: "stretch" }]}>
                {(["ru", "ky"] as const).map((code) => (
                  <Pressable
                    key={code}
                    accessibilityRole="button"
                    accessibilityLabel={code === "ru" ? t(locale, "langRu") : t(locale, "langKy")}
                    accessibilityHint={t(locale, "langHint")}
                    accessibilityState={{ selected: code === locale }}
                    onPress={() => applyLocale(setLocale, code)}
                    style={[
                      sty.card,
                      {
                        flex: 1,
                        minWidth: 0,
                        gap: 16,
                        minHeight: 168,
                        borderColor: code === locale ? theme.peach : theme.line,
                        justifyContent: "space-between",
                        backgroundColor:
                          code === locale ? theme.raised : theme.surface,
                      },
                    ]}
                  >
                    <Copy size={42} accent={code === locale}>
                      {code.toUpperCase()}
                    </Copy>
                    <Copy size={17}>
                      {code === "ru" ? t(locale, "langRu") : t(locale, "langKy")}
                    </Copy>
                    <Copy
                      size={13}
                      accent={code === locale}
                      muted={code !== locale}
                    >
                      {code === locale
                        ? "✓ " + t(locale, "selected")
                        : t(locale, "pick")}
                    </Copy>
                  </Pressable>
                ))}
              </View>
              <CTA label={t(locale, "next")} onPress={() => go("mode")} />
              <CTA
                label={t(locale, "back")}
                secondary
                onPress={() => go("welcome")}
              />
            </>
          )}
          {page === "mode" && (
            <>
              <Copy size={33}>{t(locale, "mode")}</Copy>
              <Copy muted>{t(locale, "choose")}</Copy>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(locale, "real")}
                accessibilityHint={t(locale, "realSub")}
                onPress={() => {
                  setOnboarded();
                  router.push("/setup");
                }}
                style={[
                  sty.card,
                  {
                    minHeight: 160,
                    gap: 12,
                    marginTop: 8,
                    backgroundColor: theme.raised,
                    justifyContent: "space-between",
                  },
                ]}
              >
                <Copy size={12} accent>
                  01 / {t(locale, "myEquipment")}
                </Copy>
                <Copy size={24}>{t(locale, "real")}</Copy>
                <Copy muted>
                  {t(locale, "realSub")}
                </Copy>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(locale, "demo")}
                accessibilityHint={t(locale, "demoSub")}
                onPress={chooseDemo}
                style={[
                  sty.card,
                  { minHeight: 145, justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
                ]}
              >
                <Copy size={12} accent>
                  02 / DEMO
                </Copy>
                <Copy size={24}>{t(locale, "demo")}</Copy>
                <Copy muted>
                  {t(locale, "demoSub")}
                </Copy>
              </Pressable>
              <CTA
                secondary
                label={t(locale, "empty")}
                onPress={() => {
                  setOnboarded();
                  router.replace("/home");
                }}
              />
              <Copy muted size={12}>
                {t(locale, "modeHint")}
              </Copy>
              <CTA
                secondary
                label={t(locale, "authEntry")}
                onPress={() => go("login")}
              />
            </>
          )}
          {(["login", "register", "recovery"] as Page[]).includes(page) && (
            <>
              <Copy size={31}>
                {page === "login"
                  ? t(locale, "loginTitle")
                  : page === "register"
                    ? t(locale, "registerTitle")
                    : t(locale, "recoveryTitle")}
              </Copy>
              <Panel
                style={{
                  backgroundColor: theme.raised,
                  gap: 10,
                  marginTop: 13,
                }}
              >
                <Copy accent size={11}>
                  SERVER · OFFLINE
                </Copy>
                <Copy size={20}>
                  {t(locale, "serverOffline")}
                </Copy>
                <Copy muted>
                  {t(locale, "offlineNote")}
                </Copy>
              </Panel>
              <Copy size={13} muted>
                {t(locale, "email")}
              </Copy>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                accessibilityLabel={t(locale, "email")}
                style={sty.field}
                placeholderTextColor={theme.dim}
                placeholder="name@example.com"
              />
              {page !== "recovery" && (
                <>
                  <Copy size={13} muted>
                    {t(locale, "password")}
                  </Copy>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="off"
                    accessibilityLabel={t(locale, "password")}
                    style={sty.field}
                    placeholderTextColor={theme.dim}
                    placeholder="••••••••"
                  />
                </>
              )}
              {page === "register" && (
                <>
                  <Copy size={13} muted>
                    {t(locale, "passwordRepeat")}
                  </Copy>
                  <TextInput
                    value={repeat}
                    onChangeText={setRepeat}
                    secureTextEntry
                    accessibilityLabel={t(locale, "passwordRepeat")}
                    style={sty.field}
                  />
                </>
              )}
              {!!error && (
                <Copy size={14} accessibilityLiveRegion="polite" style={{ color: theme.error }}>
                  {error}
                </Copy>
              )}
              <CTA
                label={
                  page === "login"
                    ? t(locale, "loginTitle")
                    : page === "register"
                      ? t(locale, "createAccount")
                      : t(locale, "requestLetter")
                }
                onPress={submit}
              />
              <CTA
                secondary
                label={
                  page === "login"
                    ? t(locale, "createAccount")
                    : t(locale, "backToLogin")
                }
                onPress={() => go(page === "login" ? "register" : "login")}
              />
              {page === "login" && (
                <CTA
                  secondary
                  label={t(locale, "forgotPassword")}
                  onPress={() => go("recovery")}
                />
              )}
              <CTA
                secondary
                label={t(locale, "back")}
                onPress={() => go("mode")}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
