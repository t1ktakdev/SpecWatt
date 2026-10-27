import { MotionPressable as Pressable } from '../specwatt/motion';
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Copy, CTA, Panel, Photo } from "../specwatt/ui";
import { theme, sty } from "../specwatt/theme";
import { imageMap } from "../specwatt/images";
import { t } from "../specwatt/i18n";
import { useSpec } from "../specwatt/store";

type Page = "welcome" | "locale" | "mode" | "login" | "register" | "recovery";
export default function Onboarding() {
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
      setError(
        locale === "ky"
          ? "Туура электрондук почта киргизиңиз"
          : "Введите корректный email",
      );
      return;
    }
    if (page !== "recovery" && password.length < 8) {
      setError(
        locale === "ky"
          ? "Сырсөз кеминде 8 белгиден турушу керек"
          : "Не менее 8 символов в пароле",
      );
      return;
    }
    if (page === "register" && password !== repeat) {
      setError(
        locale === "ky" ? "Сырсөздөр дал келбейт" : "Пароли не совпадают",
      );
      return;
    }
    setError(
      locale === "ky"
        ? "Сервер туташкан эмес. Эч нерсе жөнөтүлгөн жок."
        : "Сервер не подключён. Данные не отправлялись.",
    );
  };
  const hint = (ru: string, ky: string) => (locale === "ky" ? ky : ru);
  if (!ready)
    return (
      <SafeAreaView style={sty.screen}>
        <Copy>{hint("Загрузка…", "Жүктөлүүдө…")}</Copy>
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
          contentContainerStyle={[sty.body, { paddingTop: 30, minHeight: 800 }]}
        >
          <View style={[sty.row, { justifyContent: "space-between" }]}>
            <Copy size={26}>
              Spec
              <Copy size={26} accent>
                WATT
              </Copy>
            </Copy>
            <Copy size={12} muted>
              {locale === "ky" ? "ОКУУ СТЕНДИ" : "УЧЕБНЫЙ СТЕНД"}
            </Copy>
          </View>
          {page === "welcome" && (
            <>
              <Panel style={{ padding: 0, overflow: "hidden", marginTop: 20 }}>
                <Photo
                  source={imageMap["lamp-scene"]}
                  style={{ width: "100%", height: 292 }}
                />
              </Panel>
              <Copy size={37}>{hint("Всё работает", "Баары иштейт")}</Copy>
              <Copy size={37} accent>
                {hint("в своё время.", "өз убагында.")}
              </Copy>
              <Copy muted>
                {hint(
                  "Нагрузка, разрешения и безопасные решения для учебного стенда.",
                  "Окуу стендиндеги жүктөм, уруксаттар жана коопсуз чечимдер.",
                )}
              </Copy>
              <View style={[sty.row, { gap: 10, marginVertical: 15 }]}>
                {["◷", "⌁", "♢"].map((a, i) => (
                  <View
                    key={i}
                    style={[sty.card, { flex: 1, alignItems: "center" }]}
                  >
                    <Copy size={25} accent>
                      {a}
                    </Copy>
                    <Copy size={12}>{["Нагрузка", "Защита", "План"][i]}</Copy>
                  </View>
                ))}
              </View>
              <CTA label={t(locale, "next")} onPress={() => go("locale")} />
              <CTA
                label={hint("Войти (сервер недоступен)", "Кирүү (сервер жок)")}
                secondary
                onPress={() => go("login")}
              />
            </>
          )}
          {page === "locale" && (
            <>
              <Copy size={32}>{t(locale, "language")}</Copy>
              <Copy muted>
                {hint(
                  "Выбор языка сохранится на устройстве.",
                  "Тил тандоо түзмөктө сакталат.",
                )}
              </Copy>
              <View style={[sty.row, { gap: 13, marginVertical: 28 }]}>
                {(["ru", "ky"] as const).map((code) => (
                  <Pressable
                    key={code}
                    onPress={() => setLocale(code)}
                    style={[
                      sty.card,
                      {
                        width: "48%",
                        height: 185,
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
                      {code === "ru" ? "Русский" : "Кыргызча"}
                    </Copy>
                    <Copy
                      size={13}
                      accent={code === locale}
                      muted={code !== locale}
                    >
                      {code === locale
                        ? "✓ " + hint("Выбрано", "Тандалды")
                        : hint("Выбрать", "Тандоо")}
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
                onPress={() => {
                  setOnboarded();
                  router.push("/setup");
                }}
                style={[
                  sty.card,
                  {
                    height: 205,
                    marginTop: 20,
                    backgroundColor: theme.raised,
                    justifyContent: "space-between",
                  },
                ]}
              >
                <Copy size={12} accent>
                  01 / {hint("МОЁ ОБОРУДОВАНИЕ", "МЕНИН ЖАБДУУМ")}
                </Copy>
                <Copy size={28}>{t(locale, "real")}</Copy>
                <Copy muted>
                  {hint(
                    "Настройка каналов после подтверждения контроллера.",
                    "Контроллер текшерилгенден кийин каналдарды жөндөө.",
                  )}
                </Copy>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={chooseDemo}
                style={[
                  sty.card,
                  { height: 145, justifyContent: "space-between" },
                ]}
              >
                <Copy size={12} accent>
                  02 / DEMO
                </Copy>
                <Copy size={24}>{t(locale, "demo")}</Copy>
                <Copy muted>
                  {hint(
                    "3 виртуальных канала · не физические измерения",
                    "3 виртуалдык канал · чыныгы өлчөө эмес",
                  )}
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
                {hint(
                  "Нажмите одну из карточек. Общая кнопка не подменяет ваш выбор.",
                  "Карточкалардын бирин тандаңыз. Режим автоматтык алмашпайт.",
                )}
              </Copy>
              <CTA
                secondary
                label={hint("Вход / регистрация", "Кирүү / катталуу")}
                onPress={() => go("login")}
              />
            </>
          )}
          {(["login", "register", "recovery"] as Page[]).includes(page) && (
            <>
              <Copy size={31}>
                {page === "login"
                  ? hint("Вход", "Кирүү")
                  : page === "register"
                    ? hint("Регистрация", "Катталуу")
                    : hint("Восстановление", "Калыбына келтирүү")}
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
                  {hint(
                    "Сервер пока не подключён",
                    "Сервер азырынча туташкан эмес",
                  )}
                </Copy>
                <Copy muted>
                  {hint(
                    "Форма проверяет ввод, но не отправляет данные.",
                    "Форма киргизүүнү текшерет, маалымат жөнөтпөйт.",
                  )}
                </Copy>
              </Panel>
              <Copy size={13} muted>
                {hint("Электронная почта", "Электрондук почта")}
              </Copy>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                style={sty.field}
                placeholderTextColor={theme.dim}
                placeholder="name@example.com"
              />
              {page !== "recovery" && (
                <>
                  <Copy size={13} muted>
                    {hint("Пароль", "Сырсөз")}
                  </Copy>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="off"
                    style={sty.field}
                    placeholderTextColor={theme.dim}
                    placeholder="••••••••"
                  />
                </>
              )}
              {page === "register" && (
                <>
                  <Copy size={13} muted>
                    {hint("Повторите пароль", "Сырсөздү кайталаңыз")}
                  </Copy>
                  <TextInput
                    value={repeat}
                    onChangeText={setRepeat}
                    secureTextEntry
                    style={sty.field}
                  />
                </>
              )}
              {!!error && (
                <Copy size={14} style={{ color: theme.error }}>
                  {error}
                </Copy>
              )}
              <CTA
                label={
                  page === "login"
                    ? hint("Войти", "Кирүү")
                    : page === "register"
                      ? hint("Создать аккаунт", "Аккаунт түзүү")
                      : hint("Запросить письмо", "Кат суроо")
                }
                onPress={submit}
              />
              <CTA
                secondary
                label={
                  page === "login"
                    ? hint("Создать аккаунт", "Аккаунт түзүү")
                    : hint("Назад ко входу", "Кирүүгө кайтуу")
                }
                onPress={() => go(page === "login" ? "register" : "login")}
              />
              {page === "login" && (
                <CTA
                  secondary
                  label={hint("Забыли пароль?", "Сырсөздү унуттуңузбу?")}
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
