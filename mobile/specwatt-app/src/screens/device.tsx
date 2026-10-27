import {BottomSheet} from "@expo/ui";
import {DeviceVisual} from "../specwatt/device-visual";
import { MotionPressable as Pressable } from '../specwatt/motion';
import React, { useState } from "react";
import { View, TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Copy, CTA } from "../specwatt/ui";
import { useSpec } from "../specwatt/store";
import { sty, theme } from "../specwatt/theme";
import {
  Shell,
  Header,
  CircleButton,
  HistoryChart,
  RowLink,
  Icon,
  Card,
  formatW,
  useWords,
  s,
} from "../specwatt/mobile-ui";

export function DeviceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, toggleChannel, setSchedule } = useSpec();
  const w = useWords();
  const channel = data.channels.find((c) => c.id === id);
  const schedule = data.schedules.find((x) => x.channelId === id);
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(schedule?.start || "14:00");
  const [duration, setDuration] = useState(String(schedule?.duration || 30));
  const [error, setError] = useState("");
  if (!channel)
    return (
      <Shell active="/devices">
        <Header
          title={w("Канал недоступен", "Канал жеткиликсиз")}
          subtitle={w(
            "Проверьте выбранный стенд",
            "Тандалган стендди текшериңиз",
          )}
        />
        <CTA
          label={w("К устройствам", "Түзмөктөргө")}
          onPress={() => router.replace("/devices")}
        />
      </Shell>
    );
  function save() {
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
      !/^\d+$/.test(duration) ||
      Number(duration) < 5 ||
      Number(duration) > 240 ||
      Number(start.slice(0, 2)) * 60 +
        Number(start.slice(3)) +
        Number(duration) >
        1439
    ) {
      setError(
        w(
          "Время ЧЧ:ММ; длительность 5–240 минут, до конца дня.",
          "Убакыт СС:ММ; узактыгы 5–240 мүнөт, күндүн аягына чейин.",
        ),
      );
      return;
    }
    setSchedule(channel!.id, start, Number(duration));
    setEditing(false);
    setError("");
  }
  const name = channel.assigned?.name || channel.id;
  return (
    <Shell active="/devices">
      <View style={s.between}>
        <CircleButton
          icon="back"
          label={w("Назад", "Артка")}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/devices")
          }
        />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Copy size={23}>{name}</Copy>
          <Copy muted size={12}>
            {channel.id} · {w("Учебный стенд · Демо", "Окуу стенди · Демо")}
          </Copy>
        </View>
        <CircleButton
          icon="clock"
          label={w("История", "Тарых")}
          onPress={() => router.push("/journal")}
        />
      </View>
      <DeviceVisual
        scene assignment={channel.assigned} id={channel.id}
        style={{ width: "100%", height: 180, borderRadius: 3, marginTop: 10 }}
      />
      <View style={{ alignItems: "center", gap: 3 }}>
        <Copy size={57}>
          {formatW(channel.watts)}
          <Copy size={31}> Вт</Copy>
        </Copy>
        <Copy size={12} muted>
          {w("Пример данных", "Үлгү маалымат")}
        </Copy>
        <Copy size={15} accent>
          ●{" "}
          {channel.protected
            ? w("Защищён", "Корголгон")
            : (channel.watts ?? 0) > 0
              ? w("Включена", "Күйүк")
              : w("Выключена", "Өчүк")}
        </Copy>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={w("Переключить устройство", "Түзмөктү которуу")}
          accessibilityState={{ disabled: channel.protected }}
          disabled={channel.protected}
          onPress={() => toggleChannel(channel.id)}
          style={{
            height: 92,
            width: 92,
            borderRadius: 48,
            backgroundColor: channel.protected ? theme.surface : theme.peach,
            borderWidth: 3,
            borderColor: channel.protected ? theme.line : "#A47D50",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 10,
            marginBottom: 5,
          }}
        >
          <Icon
            name={channel.protected ? "shield" : "power"}
            size={36}
            color={channel.protected ? theme.peach : theme.ink}
          />
        </Pressable>
      </View>
      <HistoryChart channelId={channel.id} />
      <RowLink
        icon="bolt"
        title={w("Автопилот", "Автопилот")}
        subtitle={
          channel.assigned?.allowAuto
            ? w("Управление разрешено", "Башкарууга уруксат")
            : w("Управление не разрешено", "Башкарууга уруксат жок")
        }
        accent
        onPress={() => router.push("/setup")}
      />
      {!channel.protected && (
        <RowLink
          icon="calendar"
          title={w("Расписание", "Жадыбал")}
          subtitle={
            schedule
              ? w(
                  `Запуск в ${schedule.start} · ${schedule.duration} мин`,
                  `${schedule.start} башталат · ${schedule.duration} мүн`,
                )
              : w("Настроить", "Жөндөө")
          }
          accent
          onPress={() => setEditing(!editing)}
        />
      )}
      <BottomSheet isPresented={editing} onDismiss={()=>setEditing(false)} snapPoints={["half","full"]} containerColor={theme.surface} contentPadding={20}>
        <Card style={{ gap: 12 }}>
          <Copy>
            {w("Демонстрационное расписание", "Демонстрациялык жадыбал")}
          </Copy>
          <Copy muted size={12}>
            {w(
              "План сохраняется локально. Фонового исполнения нет.",
              "План жергиликтүү сакталат. Фондо аткарылбайт.",
            )}
          </Copy>
          <TextInput
            accessibilityLabel={w("Время начала", "Башталыш убактысы")}
            style={sty.field}
            value={start}
            onChangeText={setStart}
            placeholder="14:00"
            placeholderTextColor={theme.dim}
          />
          <TextInput
            accessibilityLabel={w(
              "Длительность в минутах",
              "Мүнөт менен узактыгы",
            )}
            style={sty.field}
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
          />
          {!!error && <Copy style={{ color: theme.error }}>{error}</Copy>}
          <CTA label={w("Сохранить", "Сактоо")} onPress={save} />
        </Card>
      </BottomSheet>
      <RowLink
        icon="settings"
        title={w("Название, помещение, изображение", "Аты, бөлмөсү, сүрөтү")}
        onPress={() => router.push("/setup")}
      />
      <Copy muted size={12} style={{ textAlign: "center" }}>
        ⓘ {w("Ручная команда имеет приоритет", "Кол буйругу артыкчылыкка ээ")}
      </Copy>
    </Shell>
  );
}
