/**
 * Rooms & Spaces — screen: room list.
 *
 * Composition deliberately avoids a flat list of identical cards: the room
 * with the most devices is featured full-width with artwork, the rest are a
 * two-column grid, unplaced devices get a subdued row, and creation is a
 * dashed call to action. Demo measurements stay labelled as demo.
 */

import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Copy } from "../../../specwatt/ui";
import { useSpec } from "../../../specwatt/store";
import { Header, Shell, useWords } from "../../../specwatt/mobile-ui";
import { RoomsHero } from "../art";
import {
  CreateRoomCard,
  RoomCardCompact,
  RoomCardFeatured,
  RoomUnassignedCard,
  deviceCountText,
} from "../components";
import { FadeUp } from "../fx";
import { useRooms } from "../store";
import {
  channelsOfEntry,
  deviceRoom,
  mergeRoomEntries,
  roomKeyOfEntry,
  roomPower,
} from "../power";
import type { Locale } from "../../../specwatt/model";
import type { RoomEntry } from "../power";

const styles = StyleSheet.create({
  warning: { padding: 12, backgroundColor: "#63382C", borderRadius: 12 },
});

function roomsWord(n: number, locale: Locale): string {
  if (locale === "ky") return "бөлмө";
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "помещение";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "помещения";
  return "помещений";
}

export function RoomsScreen() {
  const { data: app } = useSpec();
  const { data: roomsData, ready, storageError } = useRooms();
  const w = useWords();
  const locale = app.locale;

  const entries = useMemo(
    () => mergeRoomEntries(roomsData, app.channels),
    [roomsData, app.channels],
  );

  const unassignedCount = useMemo(
    () => app.channels.filter((c) => deviceRoom(c.assigned) === "").length,
    [app.channels],
  );

  const stats = useMemo(() => {
    const withCount = entries.map((entry) => ({
      entry,
      count: channelsOfEntry(entry, app.channels).length,
      key: roomKeyOfEntry(entry),
    }));
    const devicesPlaced = withCount.reduce((sum, x) => sum + x.count, 0);
    let featured = withCount[0] ?? null;
    for (const x of withCount)
      if (x.count > (featured?.count ?? 0)) featured = x;
    const rest = withCount.filter((x) => x !== featured);
    return { featured, rest, devicesPlaced };
  }, [entries, app.channels]);

  const openRoom = (entry: RoomEntry) => {
    const id =
      entry.kind === "catalog"
        ? `cat:${entry.room.id}`
        : entry.kind === "implicit"
          ? `imp:${entry.name}`
          : "none";
    router.push({ pathname: "/rooms/[id]", params: { id } });
  };

  if (!ready)
    return (
      <Shell active="/devices">
        <Header
          title={w("Помещения", "Бөлмөлөр")}
          subtitle={w("Загрузка…", "Жүктөлүүдө…")}
          icon="back"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/devices")
          }
        />
      </Shell>
    );

  const demoSuffix =
    app.source === "demo"
      ? w(" · Демо", " · Демо")
      : w(" · Нет устройств", " · Түзмөк жок");
  const subtitle = `${entries.length} ${roomsWord(entries.length, locale)} · ${deviceCountText(stats.devicesPlaced, locale)}${demoSuffix}`;

  const isEmpty = !entries.length && unassignedCount === 0;

  return (
    <Shell active="/devices">
      <Header
        title={w("Помещения", "Бөлмөлөр")}
        subtitle={subtitle}
        icon="back"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/devices")
        }
      />
      {!!storageError && (
        <View accessibilityRole="alert" style={styles.warning}>
          <Copy size={12}>
            {w(
              "Не удалось сохранить помещения. Не закрывайте приложение.",
              "Бөлмөлөр сакталган жок. Колдонмону жаппаңыз.",
            )}
          </Copy>
        </View>
      )}
      {isEmpty ? (
        <FadeUp>
          <View style={{ alignItems: "center", gap: 12, marginTop: 28 }}>
            <RoomsHero size={230} />
            <Copy size={23} style={{ textAlign: "center" }}>
              {w("Пока нет помещений", "Азырынча бөлмөлөр жок")}
            </Copy>
            <Copy muted size={13} style={{ textAlign: "center", lineHeight: 19 }}>
              {w(
                "Создайте комнаты и распределите устройства — измерения и автопилот останутся без изменений.",
                "Бөлмөлөрдү түзүп, түзмөктөрдү бөлүштүрүңүз — өлчөөлөр жана автопилот өзгөрбөйт.",
              )}
            </Copy>
          </View>
        </FadeUp>
      ) : (
        <>
          {(() => {
            const featured = stats.featured;
            if (!featured) return null;
            return (
              <RoomCardFeatured
                entry={featured.entry}
                deviceCount={featured.count}
                power={roomPower(app.channels, featured.key)}
                locale={locale}
                onPress={() => openRoom(featured.entry)}
              />
            );
          })()}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {stats.rest.map((x, i) => (
              <RoomCardCompact
                key={x.key || "__none__"}
                entry={x.entry}
                deviceCount={x.count}
                locale={locale}
                delay={80 + Math.min(i * 60, 240)}
                onPress={() => openRoom(x.entry)}
              />
            ))}
          </View>
          {unassignedCount > 0 && (
            <RoomUnassignedCard
              deviceCount={unassignedCount}
              locale={locale}
              onPress={() =>
                router.push({ pathname: "/rooms/[id]", params: { id: "none" } })
              }
            />
          )}
        </>
      )}
      <CreateRoomCard onPress={() => router.push("/rooms/edit")} />
      <Copy muted size={12} style={{ textAlign: "center", marginTop: 6 }}>
        ⓘ{" "}
        {w(
          "Помещения — организация устройств. Команды оборудованию не отправляются.",
          "Бөлмөлөр — түзмөктөрдү уюштуруу. Жабдууга буйруктар жөнөтүлбөйт.",
        )}
      </Copy>
    </Shell>
  );
}
