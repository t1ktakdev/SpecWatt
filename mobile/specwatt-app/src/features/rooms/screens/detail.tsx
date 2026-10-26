/**
 * Rooms & Spaces — screen: room detail.
 *
 * Shows artwork, the honest power block, the room's devices with channel
 * states, and the move flow. Device moves go through the existing `assign`
 * action only; nothing here toggles relays, edits autopilot permissions or
 * touches measurements. Tapping a device opens the existing device page.
 */

import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Copy, CTA } from "../../../specwatt/ui";
import { useSpec } from "../../../specwatt/store";
import { Header, Shell, useWords } from "../../../specwatt/mobile-ui";
import { theme } from "../../../specwatt/theme";
import {
  MoveSheet,
  RoomDeviceRow,
  RoomPowerBlock,
  deviceCountText,
  entryArt,
  entryName,
  entryTypeText,
} from "../components";
import { RoomArtwork } from "../art";
import { useRooms } from "../store";
import {
  channelsOfEntry,
  deviceRoom,
  mergeRoomEntries,
  roomKeyOfEntry,
  roomPower,
} from "../power";
import type { ChannelId } from "../../../specwatt/model";
import type { RoomEntry } from "../power";

/** Resolves a route room id ("cat:<id>", "imp:<name>", "none") to an entry. */
export function useRoomEntry(
  id: string | undefined,
  ready: boolean,
): RoomEntry | null {
  const { data: roomsData } = useRooms();
  const { data: app } = useSpec();
  return useMemo(() => {
    if (!id || !ready) return null;
    if (id === "none") return { kind: "none" } as RoomEntry;
    const entries = mergeRoomEntries(roomsData, app.channels);
    return (
      entries.find(
        (e) =>
          (e.kind === "catalog"
            ? `cat:${e.room.id}`
            : e.kind === "implicit"
              ? `imp:${e.name}`
              : "none") === id,
      ) ?? null
    );
  }, [id, ready, roomsData, app.channels]);
}

export function RoomDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : undefined;
  const { data: app } = useSpec();
  const { ready, moveDevice, data: roomsData } = useRooms();
  const entry = useRoomEntry(id, ready);
  const w = useWords();
  const locale = app.locale;
  const [moveChannel, setMoveChannel] = useState<ChannelId | null>(null);

  const destinations = useMemo(() => {
    if (!entry) return [];
    const current = roomKeyOfEntry(entry);
    const rooms = mergeRoomEntries(roomsData, app.channels).map((e) => ({
      key: roomKeyOfEntry(e),
      label: entryName(e),
    }));
    return [{ key: "", label: w("Без помещения", "Бөлмөсүз") }, ...rooms].filter(
      (d) => d.key !== current,
    );
  }, [entry, roomsData, app.channels, w]);

  if (!ready)
    return (
      <Shell active="/devices">
        <Header
          title={w("Помещения", "Бөлмөлөр")}
          subtitle={w("Загрузка…", "Жүктөлүүдө…")}
          icon="back"
          onPress={() => router.replace("/rooms")}
        />
      </Shell>
    );

  if (!entry)
    return (
      <Shell active="/devices">
        <Header
          title={w("Помещение недоступно", "Бөлмө жеткиликсиз")}
          subtitle={w("Возможно, оно было удалено", "Мүмкүн, ал өчүрүлгөн")}
          icon="back"
          onPress={() => router.replace("/rooms")}
        />
        <CTA
          label={w("К списку помещений", "Бөлмөлөрдүн тизмесине")}
          onPress={() => router.replace("/rooms")}
        />
      </Shell>
    );

  const name = entryName(entry) || w("Без помещения", "Бөлмөсүз");
  const devices = channelsOfEntry(entry, app.channels);
  const power = roomPower(app.channels, roomKeyOfEntry(entry));
  const editable = entry.kind === "catalog";
  const movingChannel = moveChannel
    ? (app.channels.find((c) => c.id === moveChannel) ?? null)
    : null;
  const typeText =
    entry.kind === "catalog"
      ? entryTypeText(entry, locale)
      : entry.kind === "implicit"
        ? w("Не сохранено в каталоге", "Каталого сакталган эмес")
        : "";

  return (
    <Shell active="/devices">
      <Header
        title={name}
        subtitle={`${typeText}${typeText ? " · " : ""}${deviceCountText(devices.length, locale)}`}
        icon="back"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/rooms")
        }
      />
      <View style={{ borderRadius: 19, overflow: "hidden", height: 168 }}>
        <RoomArtwork art={entryArt(entry)} radius={19} />
      </View>
      <RoomPowerBlock power={power} />
      {entry.kind === "implicit" && (
        <Copy muted size={12} style={{ lineHeight: 17 }}>
          ⓘ{" "}
          {w(
            "Это помещение собрано из назначений устройств. Сохраните его, чтобы задать тип и иллюстрацию.",
            "Бул бөлмө түзмөктөрдүн дайындоолорунан чогулган. Түрүн жана иллюстрациясын коюу үчүн сактаңыз.",
          )}
        </Copy>
      )}
      <Copy muted size={12} style={{ marginTop: 2 }}>
        {w("УСТРОЙСТВА КОМНАТЫ", "БӨЛМӨНҮН ТҮЗМӨКТӨРҮ")}
      </Copy>
      {devices.map((ch, i) => (
        <RoomDeviceRow
          key={ch.id}
          channel={ch}
          index={i}
          onPress={() =>
            router.push({ pathname: "/device", params: { id: ch.id } })
          }
          onMove={() => setMoveChannel(ch.id)}
        />
      ))}
      {!devices.length && (
        <View
          style={{
            alignItems: "center",
            gap: 10,
            padding: 18,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: theme.line,
            backgroundColor: theme.surface,
          }}
        >
          <Copy size={17} style={{ textAlign: "center" }}>
            {w(
              "В этом помещении пока нет устройств",
              "Бул бөлмөдө азырынча түзмөк жок",
            )}
          </Copy>
          <Copy muted size={13} style={{ textAlign: "center", lineHeight: 19 }}>
            {w(
              "Откройте другое помещение и перенесите устройство кнопкой →. Состояния каналов и разрешения автопилота не изменятся.",
              "Башка бөлмөнү ачып, → баскычы менен түзмөктү жылдырыңыз. Каналдардын абалы жана автопилотко уруксаттар өзгөрбөйт.",
            )}
          </Copy>
        </View>
      )}
      {!!devices.length && (
        <Copy muted size={12}>
          ⓘ{" "}
          {w(
            "Перенос меняет только помещение устройства. Команды оборудованию не отправляются.",
            "Жылдыруу түзмөктүн бөлмөсүн гана өзгөртөт. Жабдууга буйруктар жөнөтүлбөйт.",
          )}
        </Copy>
      )}
      {editable && entry.kind === "catalog" && (
        <CTA
          label={w("Настроить помещение", "Бөлмөнү жөндөө")}
          secondary
          onPress={() =>
            router.push({
              pathname: "/rooms/edit",
              params: { id: entry.room.id },
            })
          }
        />
      )}
      {entry.kind === "implicit" && (
        <CTA
          label={w("Сохранить как помещение", "Бөлмө катары сактоо")}
          onPress={() =>
            router.push({
              pathname: "/rooms/edit",
              params: { claim: entry.name },
            })
          }
        />
      )}

      <MoveSheet
        visible={moveChannel !== null}
        deviceName={movingChannel?.assigned?.name || ""}
        currentRoom={movingChannel ? deviceRoom(movingChannel.assigned) : ""}
        destinations={destinations}
        onPick={(roomKey) => {
          if (moveChannel) moveDevice(moveChannel, roomKey);
          setMoveChannel(null);
        }}
        onClose={() => setMoveChannel(null)}
      />
    </Shell>
  );
}
