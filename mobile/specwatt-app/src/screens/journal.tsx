import React, { useState } from "react";
import { View } from "react-native";
import { Copy } from "../specwatt/ui";
import { useSpec, JournalEvent } from "../specwatt/store";
import { theme } from "../specwatt/theme";
import {
  Shell,
  Header,
  Chips,
  Icon,
  IconName,
  useWords,
  Card,
} from "../specwatt/mobile-ui";

function eventText(e: JournalEvent, w: (ru: string, ky: string) => string) {
  const text: Record<string, [string, string]> = {
    "peak-exceeded": [
      "Команда превысит допустимый пик",
      "Буйрук уруксат берилген чокудан ашат",
    ],
    "demo-start": ["Демостенд открыт", "Демо стенд ачылды"],
    "manual-on": ["Устройство включено", "Түзмөк күйгүзүлдү"],
    "manual-off": ["Устройство выключено", "Түзмөк өчүрүлдү"],
    protected: [
      "Защищённый канал не изменён",
      "Корголгон канал өзгөртүлгөн жок",
    ],
    assignment: [
      "Настройки устройства сохранены",
      "Түзмөктүн жөндөөлөрү сакталды",
    ],
    "autopilot-on": ["Автопилот включён", "Автопилот күйгүзүлдү"],
    "autopilot-off": ["Автопилот выключен", "Автопилот өчүрүлдү"],
    peak: ["Лимит пика изменён", "Чоку чеги өзгөрдү"],
    "manual-priority": [
      "Ручной приоритет настроен",
      "Кол башкаруунун артыкчылыгы жөндөлдү",
    ],
    schedule: ["Расписание сохранено", "Жадыбал сакталды"],
    "plan-applied": [
      "Запуск LED-ленты перенесён",
      "LED тасманын башталышы жылдырылды",
    ],
    "plan-rejected": ["Предложение отклонено", "Сунуш четке кагылды"],
    "plan-blocked": [
      "Применение плана запрещено",
      "Планды колдонууга тыюу салынды",
    ],
    stale: ["Нет свежих измерений", "Жаңы өлчөөлөр жок"],
    "invalid-input": [
      "Некорректные параметры отклонены",
      "Туура эмес параметрлер четке кагылды",
    ],
  };
  return text[e.code] ? w(...text[e.code]) : e.code;
}
export function JournalScreen() {
  const { data } = useSpec();
  const [filter, setFilter] = useState(0);
  const w = useWords();
  const events = data.events.filter((e) =>
    filter === 1
      ? e.kind === "auto"
      : filter === 2
        ? e.kind === "manual"
        : filter === 3
          ? e.kind === "error"
          : true,
  );
  return (
    <Shell active="/journal">
      <Header
        title={
          <>
            {w("Жур", "Жур")}
            <Copy size={28} accent>
              {w("нал", "нал")}
            </Copy>
          </>
        }
        subtitle={w("История вашего стенда", "Стендиңиздин тарыхы")}
        icon="filter"
        onPress={() => setFilter((filter + 1) % 4)}
      />
      <Chips
        items={[
          w("Все", "Баары"),
          w("Автопилот", "Автопилот"),
          w("Вручную", "Кол менен"),
          w("Ошибки", "Каталар"),
        ]}
        selected={filter}
        onSelect={setFilter}
      />
      <Copy size={23} style={{ marginTop: 19, marginBottom: 4 }}>
        {w("События", "Окуялар")}
      </Copy>
      {!events.length && (
        <Card style={{gap:12}}>
          <Icon name={filter?"filter":"journal"} color={theme.peach} size={28}/>
          <Copy size={20}>{filter?w("В этом фильтре нет событий","Бул чыпкада окуялар жок"):w("История начинается здесь","Тарых ушул жерден башталат")}</Copy>
          <Copy muted>{filter?w("Выберите «Все», чтобы увидеть остальные события.","Калган окуялар үчүн «Баары» чыпкасын тандаңыз."):w("Ваши действия и решения автопилота появятся здесь. Физические команды в демо не отправляются.","Аракеттериңиз жана автопилоттун чечимдери бул жерде көрсөтүлөт. Демодо жабдууга буйрук жөнөтүлбөйт.")}</Copy>
        </Card>
      )}
      {events.map((e) => {
        const error = e.kind === "error",
          auto = e.kind === "auto";
        const color = error ? theme.error : auto ? theme.peach : "#D8C9A9";
        const icon: IconName = error
          ? "shield"
          : auto
            ? "bolt"
            : e.code === "schedule"
              ? "calendar"
              : "plug";
        const when = new Date(e.at).toLocaleString(
          data.locale === "ky" ? "ky-KG" : "ru-RU",
          {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          },
        );
        return (
          <View
            key={e.id}
            style={{ flexDirection: "row", gap: 19, minHeight: 128 }}
          >
            <View style={{ width: 49, alignItems: "center" }}>
              <View
                style={{
                  position: "absolute",
                  width: 1,
                  top: 0,
                  bottom: -12,
                  backgroundColor: theme.line,
                }}
              />
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 25,
                  borderWidth: 1,
                  borderColor: color,
                  backgroundColor: "#25251F",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 15,
                }}
              >
                <Icon name={icon} color={color} size={26} />
              </View>
            </View>
            <View style={{ flex: 1, gap: 5, paddingBottom: 16 }}>
              <Copy size={12} muted>
                {when}
                {e.channelId ? ` · ${e.channelId}` : ""}
              </Copy>
              <Copy size={20}>{eventText(e, w)}</Copy>
              <Copy muted size={14}>
                {e.code === "plan-applied"
                  ? `${e.details?.from} → ${e.details?.to}`
                  : error
                    ? w(
                        "Ограничения безопасности соблюдены",
                        "Коопсуздук чектөөлөрү сакталды",
                      )
                    : w(
                        "Изменение локальной демонстрации",
                        "Жергиликтүү демонстрация өзгөрдү",
                      )}
              </Copy>
              <View
                style={{
                  alignSelf: "flex-start",
                  backgroundColor: error
                    ? "#40291F"
                    : auto
                      ? "#3B2D1C"
                      : "#302F24",
                  paddingVertical: 4,
                  paddingHorizontal: 13,
                  borderRadius: 20,
                }}
              >
                <Copy size={12} style={{ color }}>
                  {auto
                    ? w("Автопилот", "Автопилот")
                    : error
                      ? w("Отклонено", "Четке кагылды")
                      : e.kind === "system"
                        ? w("Система", "Система")
                        : w("Вручную", "Кол менен")}{" "}
                  · {w("Демо", "Демо")}
                </Copy>
              </View>
            </View>
          </View>
        );
      })}
      <View
        style={{ borderTopWidth: 1, borderColor: theme.line, paddingTop: 14 }}
      >
        <Copy muted size={12} style={{ textAlign: "center" }}>
          {w(
            "Показаны события приложения в деморежиме",
            "Демо режимдеги колдонмонун окуялары көрсөтүлдү",
          )}
        </Copy>
      </View>
    </Shell>
  );
}
