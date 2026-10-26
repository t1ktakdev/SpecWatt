import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { Copy, Photo } from "../specwatt/ui";
import { useSpec, totalPower, Channel } from "../specwatt/store";
import { imageMap } from "../specwatt/images";
// Rooms & Spaces module (feature/rooms-spaces): additive integration —
// entry point + provider-free room filter. Everything else lives in
// src/features/rooms and the /rooms routes.
import { RoomFilterChips, RoomsEntryCard } from "../features/rooms/components";
import { deviceRoom } from "../features/rooms/power";
import {
  Shell,
  Header,
  Brand,
  Gauge,
  HistoryChart,
  RowLink,
  Chips,
  Empty,
  Toggle,
  Icon,
  formatW,
  useWords,
  s,
} from "../specwatt/mobile-ui";

export function HomeScreen() {
  const { data, toggleChannel } = useSpec();
  const w = useWords();
  return (
    <Shell active="/home">
      <Header
        title={<Brand />}
        subtitle={
          w("Учебный стенд · ", "Окуу стенди · ") +
          (data.source === "demo"
            ? w("Демо", "Демо")
            : w("Нет контроллера", "Контроллер жок"))
        }
      />
      {data.channels.length ? (
        <>
          <Gauge
            label={w("Сейчас", "Азыр")}
            value={`${formatW(totalPower(data.channels))} Вт`}
            subtitle={`${data.channels.filter((c) => (c.watts ?? 0) > 0).length} ${w("из", "/")} ${data.channels.length} ${w("каналов", "канал")}`}
          />
          <HistoryChart />
          <View style={{ flexDirection: "row", gap: 10 }}>
            {data.channels.slice(0, 2).map((ch) => (
              <Pressable
                key={ch.id}
                accessibilityRole="button"
                accessibilityLabel={ch.assigned?.name || ch.id}
                onPress={() =>
                  router.push({ pathname: "/device", params: { id: ch.id } })
                }
                style={[s.card, { flex: 1, padding: 0, height: 230 }]}
              >
                <View style={{ padding: 13, gap: 4 }}>
                  <Copy size={18} numberOfLines={1}>
                    {ch.assigned?.name || ch.id}
                  </Copy>
                  <Copy muted size={12}>
                    {ch.id} ·{" "}
                    <Copy size={12} accent={(ch.watts ?? 0) > 0}>
                      {(ch.watts ?? 0) > 0
                        ? w("Включён", "Күйүк")
                        : w("Выключен", "Өчүк")}
                    </Copy>
                  </Copy>
                </View>
                <Photo
                  source={imageMap[ch.assigned?.image || "lamp"]}
                  style={{
                    position: "absolute",
                    top: 64,
                    height: 166,
                    width: "100%",
                  }}
                />
                <View style={{ position: "absolute", bottom: 5, left: 10 }}>
                  <Toggle
                    value={(ch.watts ?? 0) > 0}
                    label={`${w("Переключить", "Которуу")} ${ch.assigned?.name || ch.id}`}
                    onChange={() => toggleChannel(ch.id)}
                  />
                </View>
              </Pressable>
            ))}
          </View>
          {data.channels
            .filter((c) => c.id === "CH3")
            .map((ch) => (
              <Pressable
                key={ch.id}
                onPress={() =>
                  router.push({ pathname: "/device", params: { id: ch.id } })
                }
                style={[s.link, { minHeight: 103, padding: 8 }]}
              >
                <Photo
                  source={imageMap[ch.assigned?.image || "fan"]}
                  style={{ width: 113, height: 88, borderRadius: 12 }}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Copy size={19}>
                    {ch.assigned?.name || w("Вентилятор", "Желдеткич")}
                  </Copy>
                  <Copy size={12} accent>
                    {ch.id} · {w("Защищён", "Корголгон")}
                  </Copy>
                  <Copy size={25}>
                    {formatW(ch.watts)}
                    <Copy size={15}> Вт</Copy>
                  </Copy>
                </View>
                <Icon name="next" size={18} />
              </Pressable>
            ))}
          <RowLink
            icon="bolt"
            title={`${w("Автопилот", "Автопилот")} ${data.autopilot ? w("включён", "күйүк") : w("выключен", "өчүк")}`}
            subtitle={w(
              "Автоматическое управление нагрузкой",
              "Жүктөмдү автоматтык башкаруу",
            )}
            accent
            onPress={() => router.replace("/autopilot")}
          />
        </>
      ) : (
        <Empty />
      )}
    </Shell>
  );
}

export function DevicesScreen() {
  const { data } = useSpec();
  const [filter, setFilter] = useState(0);
  const [room, setRoom] = useState<string | null>(null);
  const w = useWords();
  const roomNames = [
    ...new Set(data.channels.map((c) => deviceRoom(c.assigned)).filter(Boolean)),
  ];
  const channels = data.channels.filter((c) =>
    (!room || deviceRoom(c.assigned) === room) &&
    (filter === 1 ? (c.watts ?? 0) > 0 : filter === 2 ? c.protected : true),
  );
  return (
    <Shell active="/devices">
      <Header
        title={w("Устройства", "Түзмөктөр")}
        subtitle={w(
          `Учебный стенд · ${data.channels.length} канала · Демо`,
          `Окуу стенди · ${data.channels.length} канал · Демо`,
        )}
        icon="plus"
        onPress={() => router.push("/setup")}
      />
      <RoomsEntryCard />
      <Chips
        items={[
          w("Все", "Баары"),
          w("Активные", "Активдүү"),
          w("Защищённые", "Корголгон"),
        ]}
        selected={filter}
        onSelect={setFilter}
      />
      <RoomFilterChips items={roomNames} selected={room} onSelect={setRoom} />
      {channels.map((ch) => (
        <DeviceCard key={ch.id} channel={ch} />
      ))}
      {!channels.length &&
        (data.channels.length ? (
          <Copy muted>
            {w("В этом фильтре нет устройств.", "Бул чыпкада түзмөктөр жок.")}
          </Copy>
        ) : (
          <Empty />
        ))}
      <Copy muted size={12}>
        ⓘ{" "}
        {w(
          "Пример данных · виртуальные каналы",
          "Үлгү маалымат · виртуалдык каналдар",
        )}
      </Copy>
    </Shell>
  );
}
function DeviceCard({ channel: ch }: { channel: Channel }) {
  const { toggleChannel } = useSpec();
  const w = useWords();
  return (
    <View style={[s.card, { minHeight: ch.protected ? 166 : 220, padding: 0 }]}>
      <Pressable
        onPress={() =>
          router.push({ pathname: "/device", params: { id: ch.id } })
        }
        accessibilityRole="button"
        accessibilityLabel={ch.assigned?.name || ch.id}
        style={{
          position: "absolute",
          right: 0,
          top: 28,
          bottom: 0,
          width: "54%",
        }}
      >
        <Photo
          source={imageMap[ch.assigned?.image || "lamp"]}
          style={{ width: "100%", height: "100%" }}
        />
      </Pressable>
      <View
        pointerEvents="box-none"
        style={{ padding: 17, width: "64%", gap: 5 }}
      >
        <Copy size={24}>
          {ch.assigned?.name || w("Не назначен", "Дайындалган эмес")}
        </Copy>
        <Copy size={13} muted>
          {ch.id} ·{" "}
          <Copy size={13} accent={ch.protected || (ch.watts ?? 0) > 0}>
            {ch.protected
              ? w("Защищён", "Корголгон")
              : (ch.watts ?? 0) > 0
                ? w("Включён", "Күйүк")
                : w("Выключен", "Өчүк")}
          </Copy>
        </Copy>
        <Copy size={37} style={{ marginTop: 8 }}>
          {formatW(ch.watts)}
          <Copy size={23}> Вт</Copy>
        </Copy>
        <Copy size={12} muted>
          {ch.protected
            ? w("Не участвует в переносе", "Жылдырууга катышпайт")
            : w("Вручную и автопилот", "Кол менен жана автопилот")}
        </Copy>
        {!ch.protected && (
          <View style={{ alignSelf: "flex-start", marginTop: 8 }}>
            <Toggle
              label={`${w("Переключить", "Которуу")} ${ch.assigned?.name || ch.id}`}
              value={(ch.watts ?? 0) > 0}
              onChange={() => toggleChannel(ch.id)}
            />
          </View>
        )}
      </View>
      <Pressable
        onPress={() =>
          router.push({ pathname: "/device", params: { id: ch.id } })
        }
        accessibilityLabel={w("Подробнее", "Кененирээк")}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 40,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="next" size={19} />
      </Pressable>
    </View>
  );
}
