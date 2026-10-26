import React, { useState } from "react";
import { View, TextInput, Pressable, Share } from "react-native";
import { router } from "expo-router";
import { Copy, CTA } from "../specwatt/ui";
import { useSpec } from "../specwatt/store";
import { theme, sty } from "../specwatt/theme";
import {
  Shell,
  Header,
  Card,
  RowLink,
  useWords,
  s,
} from "../specwatt/mobile-ui";

export function SettingsScreen() {
  const { data, setLocale, setPeak, setManualMinutes, leaveDemo } = useSpec();
  const w = useWords();
  const [peak, setPeakInput] = useState(String(data.peak));
  const [hold, setHold] = useState(String(data.manualMinutes));
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [legal, setLegal] = useState(false);
  function save() {
    const p = Number(peak.replace(",", ".")),
      m = Number(hold);
    if (
      !Number.isFinite(p) ||
      p < 1 ||
      p > 100 ||
      !Number.isInteger(m) ||
      m < 1 ||
      m > 240
    ) {
      setMessage(
        w(
          "Пик: 1–100 Вт; приоритет: 1–240 минут.",
          "Чоку: 1–100 Вт; артыкчылык: 1–240 мүнөт.",
        ),
      );
      return;
    }
    setPeak(p);
    setManualMinutes(m);
    setMessage(w("Настройки сохранены.", "Жөндөөлөр сакталды."));
  }
  return (
    <Shell active="/home">
      <Header
        title={w("Настройки", "Жөндөөлөр")}
        subtitle={w(
          "Локальное пространство · Демо",
          "Жергиликтүү мейкиндик · Демо",
        )}
        icon="back"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/home")
        }
      />
      <Card style={{ gap: 14 }}>
        <Copy size={20}>{w("Язык интерфейса", "Интерфейстин тили")}</Copy>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {(["ru", "ky"] as const).map((l) => (
            <Pressable
              key={l}
              accessibilityRole="button"
              accessibilityState={{ selected: data.locale === l }}
              onPress={() => setLocale(l)}
              style={[
                s.chip,
                data.locale === l && { borderColor: theme.peach },
              ]}
            >
              <Copy accent={data.locale === l}>
                {l === "ru" ? "Русский" : "Кыргызча"}
              </Copy>
            </Pressable>
          ))}
        </View>
      </Card>
      <Card style={{ gap: 10 }}>
        <Copy size={20}>
          {w("Безопасная координация", "Коопсуз координация")}
        </Copy>
        <Copy muted size={13}>
          {w("Допустимый пик, Вт", "Уруксат берилген чоку, Вт")}
        </Copy>
        <TextInput
          accessibilityLabel={w("Допустимый пик", "Уруксат берилген чоку")}
          value={peak}
          onChangeText={setPeakInput}
          style={sty.field}
          keyboardType="decimal-pad"
        />
        <Copy muted size={13}>
          {w("Ручной приоритет, минут", "Кол башкаруу артыкчылыгы, мүнөт")}
        </Copy>
        <TextInput
          accessibilityLabel={w("Ручной приоритет", "Кол башкаруу артыкчылыгы")}
          value={hold}
          onChangeText={setHold}
          style={sty.field}
          keyboardType="number-pad"
        />
        <CTA
          label={w("Сохранить ограничения", "Чектөөлөрдү сактоо")}
          disabled={data.source !== "demo"}
          onPress={save}
        />
        {!!message && (
          <Copy accessibilityLiveRegion="polite" muted>
            {message}
          </Copy>
        )}
      </Card>
      <RowLink
        icon="plug"
        title={w("Контроллер и разрешения", "Контроллер жана уруксаттар")}
        onPress={() => router.push("/setup")}
      />
      <RowLink
        icon="pulse"
        title={w("Серверный симулятор", "Сервердик симулятор")}
        subtitle={w(
          "FastAPI · отдельная тестовая среда",
          "FastAPI · өзүнчө сыноо чөйрөсү",
        )}
        onPress={() => router.push("/server")}
      />
      <RowLink
        icon="journal"
        title={w("Экспорт демоданных", "Демо маалыматты экспорттоо")}
        subtitle={w(
          "Настройки и события, без секретов",
          "Жөндөөлөр жана окуялар, сырларсыз",
        )}
        onPress={() => {
          Share.share({
            message: JSON.stringify(
              { schema: 1, source: "demo", data },
              null,
              2,
            ),
          }).catch(() =>
            setMessage(
              w("Не удалось открыть экспорт.", "Экспорт ачылган жок."),
            ),
          );
        }}
      />
      <RowLink
        icon="info"
        title={w("Конфиденциальность и условия", "Купуялык жана шарттар")}
        subtitle={w(
          "Черновик для локальной демонстрации",
          "Жергиликтүү демонстрация үчүн долбоор",
        )}
        onPress={() => setLegal(!legal)}
      />
      {legal && (
        <Card style={{ gap: 12 }}>
          <Copy size={19}>
            {w(
              "Черновик · 26 октября 2026",
              "Долбоор · 2026-жылдын 26-октябры",
            )}
          </Copy>
          <Copy>
            {w(
              "Деморежим хранит названия, помещения, разрешения, расписания и последние 100 событий на этом устройстве. Физические команды и аналитика не отправляются. Экспорт происходит только по вашему действию.",
              "Демо режим аттарды, бөлмөлөрдү, уруксаттарды, жадыбалдарды жана акыркы 100 окуяны ушул түзмөктө сактайт. Жабдууга буйрук жана аналитика жөнөтүлбөйт. Экспорт сиздин аракетиңиз менен гана аткарылат.",
            )}
          </Copy>
          <Copy>
            {w(
              "Отдельный серверный симулятор передаёт учётные данные выбранному вами API. Токен на Android хранится в SecureStore. Серверный аккаунт не удаляется при очистке демо.",
              "Өзүнчө сервердик симулятор каттоо маалыматтарын сиз тандаган APIге жөнөтөт. Android токени SecureStore ичинде сакталат. Демону тазалоо сервердик аккаунтту өчүрбөйт.",
            )}
          </Copy>
          <Copy>
            {w(
              "Учебный прототип рассчитан на подтверждённый низковольтный стенд. Не используйте его для экспериментальных подключений 220 В. Перенос нагрузки не гарантирует экономию энергии.",
              "Окуу прототиби тастыкталган төмөн чыңалуудагы стенд үчүн. Аны 220 В тажрыйбалык туташууларда колдонбоңуз. Жүктөмдү жылдыруу энергия үнөмдөөгө кепилдик бербейт.",
            )}
          </Copy>
          <Copy muted size={12}>
            {w(
              "Юридическая проверка и проверка перевода не проводились. До публичного запуска нужны реквизиты оператора, контакты, политика серверного хранения и проверка применимых требований.",
              "Юридикалык жана котормо текшерүүсү жүргүзүлгөн эмес. Жалпыга чыгарууга чейин оператордун маалыматтары, байланыштары, сервердик сактоо саясаты жана колдонулуучу талаптарды текшерүү керек.",
            )}
          </Copy>
        </Card>
      )}
      <Card style={{ gap: 10 }}>
        <Copy size={17}>SpecWATT · 0.2.0</Copy>
        <Copy size={12} muted>
          {w(
            "Демо и серверный симулятор. ESP32, облако, уведомления и физическая автоматика не подключены.",
            "Демо жана сервердик симулятор. ESP32, булут, билдирмелер жана физикалык автоматика кошулган эмес.",
          )}
        </Copy>
        <CTA
          secondary
          label={w("Очистить демопространство", "Демо мейкиндикти тазалоо")}
          onPress={() => setConfirm(true)}
        />
        {confirm && (
          <>
            <Copy>
              {w(
                "Удалить локальные демоканалы, настройки и журнал?",
                "Жергиликтүү демо каналдарды, жөндөөлөрдү жана журналды өчүрөсүзбү?",
              )}
            </Copy>
            <CTA
              label={w("Удалить демоданные", "Демо маалыматты өчүрүү")}
              onPress={() => {
                leaveDemo();
                router.replace("/home");
              }}
            />
            <CTA
              secondary
              label={w("Отмена", "Жокко чыгаруу")}
              onPress={() => setConfirm(false)}
            />
          </>
        )}
      </Card>
    </Shell>
  );
}
