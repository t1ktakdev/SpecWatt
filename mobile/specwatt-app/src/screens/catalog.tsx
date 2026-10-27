import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Copy, CTA } from "../specwatt/ui";
import { theme, sty } from "../specwatt/theme";
import { useSpec } from "../specwatt/store";
import {
  DeviceIllustration,
  deviceCatalog,
  searchDevices,
  illustrationColors,
  defaultIllustration,
  validateIllustrationConfig,
} from "../specwatt/illustrations";
import type {
  DeviceGroup,
  IllustrationConfig,
} from "../specwatt/illustrations";

const groups: { id: DeviceGroup | undefined; ru: string; ky: string }[] = [
  { id: undefined, ru: "Все", ky: "Баары" },
  { id: "lighting", ru: "Свет", ky: "Жарык" },
  { id: "climate", ru: "Климат", ky: "Климат" },
  { id: "kitchen", ru: "Кухня", ky: "Ашкана" },
  { id: "utility", ru: "Дом", ky: "Үй" },
  { id: "computing", ru: "Электроника", ky: "Электроника" },
  { id: "media", ru: "Медиа", ky: "Медиа" },
  { id: "care", ru: "Уход", ky: "Кам көрүү" },
  { id: "workshop", ru: "Мастерская", ky: "Устакана" },
];
const colorNames = {
  graphite: ["Графит", "Графит"],
  cream: ["Кремовый", "Каймак түстүү"],
  copper: ["Медь", "Жез"],
  sage: ["Шалфей", "Жашыл"],
  white: ["Белый", "Ак"],
} as const;
function parseInitial(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 512)
    return defaultIllustration("mushroom-lamp");
  try {
    return (
      validateIllustrationConfig(JSON.parse(raw)) ??
      defaultIllustration("mushroom-lamp")
    );
  } catch {
    return defaultIllustration("mushroom-lamp");
  }
}

/** Virtualized catalogue and offline constructor. Selection has no device capability effects. */
export function CatalogScreen() {
  const params = useLocalSearchParams<{
    channel?: string;
    illustration?: string;
  }>();
  const { data } = useSpec();
  const w = (ru: string, ky: string) => (data.locale === "ky" ? ky : ru);
  const [config, setConfig] = useState<IllustrationConfig>(() =>
    parseInitial(params.illustration),
  );
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<DeviceGroup | undefined>();
  const results = useMemo(() => searchDevices(query, group), [query, group]);
  const selected = deviceCatalog.find((x) => x.id === config.categoryId)!;
  const channel = ["CH1", "CH2", "CH3"].includes(params.channel || "")
    ? params.channel
    : undefined;
  function close() {
    if (router.canGoBack()) router.back();
    else router.replace("/devices");
  }
  function use() {
    if (!channel) return;
    router.dismissTo({
      pathname: "/setup",
      params: { channel, illustration: JSON.stringify(config) },
    });
  }
  return (
    <LinearGradient
      colors={["#28261F", "#151914", "#181B16"]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={w("Назад", "Артка")}
            style={styles.back}
          >
            <Copy size={29} muted>
              ‹
            </Copy>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Copy size={24}>{w("Иллюстрации", "Иллюстрациялар")}</Copy>
            <Copy muted size={12}>
              SpecWATT · {deviceCatalog.length} {w("категорий", "категория")}
            </Copy>
          </View>
        </View>
        <FlatList
          data={results}
          keyExtractor={(x) => x.id}
          numColumns={2}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          keyboardShouldPersistTaps="handled"
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 20,
            gap: 10,
          }}
          ListHeaderComponent={
            <View style={{ gap: 14, paddingBottom: 14 }}>
              <LinearGradient
                colors={["#36372C", "#24291F"]}
                style={styles.preview}
              >
                <DeviceIllustration
                  config={config}
                  width="100%"
                  height={218}
                  accessibilityLabel={w(selected.ru, selected.ky)}
                />
                <View style={{ paddingHorizontal: 17, paddingBottom: 14 }}>
                  <Copy size={21}>{w(selected.ru, selected.ky)}</Copy>
                  <Copy muted size={12}>
                    {w(
                      "Персональная векторная иллюстрация · офлайн",
                      "Жеке вектордук иллюстрация · офлайн",
                    )}
                  </Copy>
                </View>
              </LinearGradient>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                {(
                  Object.keys(
                    illustrationColors,
                  ) as (keyof typeof illustrationColors)[]
                ).map((color) => (
                  <Pressable
                    key={color}
                    accessibilityRole="button"
                    accessibilityLabel={w(
                      colorNames[color][0],
                      colorNames[color][1],
                    )}
                    accessibilityState={{ selected: config.color === color }}
                    onPress={() => setConfig((c) => ({ ...c, color }))}
                    style={{
                      minWidth: 45,
                      minHeight: 52,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 18,
                        borderWidth: 2,
                        borderColor:
                          config.color === color ? theme.peach : "#555B4E",
                        padding: 3,
                      }}
                    >
                      <View
                        style={{
                          flex: 1,
                          borderRadius: 15,
                          backgroundColor: illustrationColors[color],
                        }}
                      />
                    </View>
                    <Copy size={12} style={{ fontSize: 10 }}>
                      {w(colorNames[color][0], colorNames[color][1])}
                    </Copy>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["rounded", "angular"] as const).map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => setConfig((c) => ({ ...c, variant: v }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: config.variant === v }}
                    style={[
                      styles.choice,
                      config.variant === v && styles.selected,
                    ]}
                  >
                    <Copy size={13} accent={config.variant === v}>
                      {v === "rounded"
                        ? w("Мягкий корпус", "Жумшак корпус")
                        : w("Строгий корпус", "Так корпус")}
                    </Copy>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["detailed", "minimal"] as const).map((details) => (
                  <Pressable
                    key={details}
                    onPress={() => setConfig((c) => ({ ...c, details }))}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: config.details === details,
                    }}
                    style={[
                      styles.choice,
                      config.details === details && styles.selected,
                    ]}
                  >
                    <Copy size={13} accent={config.details === details}>
                      {details === "detailed"
                        ? w("С деталями", "Деталдары менен")
                        : w("Спокойный вариант", "Жөнөкөй вариант")}
                    </Copy>
                  </Pressable>
                ))}
              </View>
              <Copy muted size={12}>
                {w(
                  "Изображение не меняет возможности канала. Это конструктор готовых шаблонов; текстовая AI-генерация не подключена.",
                  "Сүрөт каналдын мүмкүнчүлүгүн өзгөртпөйт. Бул даяр калыптардын конструктору; тексттик AI генерация кошулган эмес.",
                )}
              </Copy>
              <TextInput
                accessibilityLabel={w("Поиск устройств", "Түзмөк издөө")}
                value={query}
                maxLength={80}
                onChangeText={setQuery}
                placeholder={w("Найти устройство…", "Түзмөк табуу…")}
                placeholderTextColor={theme.dim}
                style={sty.field}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 8 }}
              >
                {groups.map((g) => (
                  <Pressable
                    key={g.id || "all"}
                    onPress={() => setGroup(g.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: group === g.id }}
                    style={[styles.group, group === g.id && styles.selected]}
                  >
                    <Copy size={13} accent={group === g.id}>
                      {w(g.ru, g.ky)}
                    </Copy>
                  </Pressable>
                ))}
              </ScrollView>
              <Copy muted size={12}>
                {w(`Найдено: ${results.length}`, `Табылды: ${results.length}`)}
              </Copy>
            </View>
          }
          ListEmptyComponent={
            <Copy muted style={{ paddingVertical: 20 }}>
              {w(
                "Ничего не найдено. Попробуйте название типа устройства.",
                "Эч нерсе табылган жок. Түзмөктүн түрүн жазыңыз.",
              )}
            </Copy>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setConfig((c) => ({ ...c, categoryId: item.id }))}
              accessibilityRole="button"
              accessibilityState={{ selected: config.categoryId === item.id }}
              accessibilityLabel={w(item.ru, item.ky)}
              style={[
                styles.tile,
                config.categoryId === item.id && styles.selected,
              ]}
            >
              <DeviceIllustration
                config={{ ...config, categoryId: item.id }}
                width="100%"
                height={116}
              />
              <Copy
                size={13}
                numberOfLines={2}
                style={{ minHeight: 35, textAlign: "center" }}
              >
                {w(item.ru, item.ky)}
              </Copy>
            </Pressable>
          )}
        />
        {channel && (
          <View style={styles.footer}>
            <CTA
              label={w(
                `Использовать для ${channel}`,
                `${channel} үчүн колдонуу`,
              )}
              onPress={use}
            />
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}
const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  back: {
    width: 45,
    height: 45,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#4B5141",
    overflow: "hidden",
  },
  choice: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  selected: { borderColor: theme.peach, backgroundColor: "#342F24" },
  group: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.line,
    paddingHorizontal: 15,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  tile: {
    flex: 1,
    maxWidth: "49%",
    minHeight: 164,
    borderWidth: 1,
    borderColor: "#3B4437",
    borderRadius: 20,
    backgroundColor: "#242A21",
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderColor: theme.line,
    backgroundColor: "#22261F",
  },
});
