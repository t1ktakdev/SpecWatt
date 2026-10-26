/**
 * Rooms & Spaces — presentation components.
 *
 * Building blocks reuse the shared Warm Graphite vocabulary (Copy, Card,
 * theme tokens) so rooms screens read like the rest of SpecWATT. Power is
 * never faked: `RoomPowerBadge`/`RoomPowerBlock` render the lower bound with
 * an explicit explanation when measurements are incomplete.
 */

import React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Copy, Photo } from "../../specwatt/ui";
import { theme, sty } from "../../specwatt/theme";
import { imageMap } from "../../specwatt/images";
import { Icon, RowLink, useWords, s as shared } from "../../specwatt/mobile-ui";
import { useSpec } from "../../specwatt/store";
import type { Channel, Locale } from "../../specwatt/model";
import { RoomArtwork } from "./art";
import { roomArtLabel, roomTypeLabel } from "./i18n";
import type { RoomArt, RoomType } from "./model";
import { roomArts, roomTypes } from "./model";
import type { RoomEntry, RoomPower } from "./power";
import { FadeUp } from "./fx";

// ---- pure label helpers (locale passed explicitly, no globals) -----------

function deviceWord(n: number, locale: Locale): string {
  if (locale === "ky") return "түзмөк";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "устройство";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "устройства";
  return "устройств";
}

export function deviceCountText(n: number, locale: Locale): string {
  return `${n} ${deviceWord(n, locale)}`;
}

export function entryName(entry: RoomEntry): string {
  return entry.kind === "catalog"
    ? entry.room.name
    : entry.kind === "implicit"
      ? entry.name
      : "";
}

export function entryArt(entry: RoomEntry): RoomArt {
  return entry.kind === "catalog" ? entry.room.art : "corner";
}

export function entryTypeText(entry: RoomEntry, locale: Locale): string {
  return entry.kind === "catalog" ? roomTypeLabel(entry.room.type, locale) : "";
}

// ---- power ---------------------------------------------------------------

/** Compact inline power readout: exact sum, lower bound "≥", or "—". */
export function RoomPowerBadge({ power }: { power: RoomPower }) {
  const w = useWords();
  const label =
    power.kind === "none"
      ? "—"
      : `${power.kind === "partial" ? "≥ " : ""}${power.watts.toFixed(1).replace(".", ",")} Вт`;
  return (
    <Copy
      size={13}
      muted={power.kind !== "exact"}
      accent={power.kind === "exact" && power.watts > 0}
      accessibilityLabel={`${w("Мощность", "Кубат")}: ${label}`}
    >
      {label}
    </Copy>
  );
}

/** Detailed room power block with the honesty caption for incomplete data. */
export function RoomPowerBlock({ power }: { power: RoomPower }) {
  const w = useWords();
  const caption =
    power.kind === "exact"
      ? w(
          "Все измерения свежие — сумма точная.",
          "Бардык өлчөөлөр жаңы — сумма так.",
        )
      : power.kind === "partial"
        ? w(
            `Часть измерений недоступна (${power.unavailable}). Показана нижняя оценка, а не точное потребление.`,
            `Кээ бир өлчөөлөр жеткиликсиз (${power.unavailable}). Төмөнкү баа көрсөтүлдү, так керектөө эмес.`,
          )
        : w(
            "Свежих измерений нет. Мощность неизвестна и не считается нулём.",
            "Жаңы өлчөөлөр жок. Кубат белгисиз жана нөл деп эсептелбейт.",
          );
  return (
    <View
      style={[
        shared.card,
        { gap: 6 },
      ]}
    >
      <Copy muted size={12}>
        {w("МОЩНОСТЬ КОМНАТЫ", "БӨЛМӨНҮН КУБАТЫ")}
      </Copy>
      <View style={shared.between}>
        <Copy
          size={34}
          accessibilityLabel={w("Мощность комнаты", "Бөлмөнүн кубаты")}
        >
          {power.kind === "none"
            ? "—"
            : `${power.kind === "partial" ? "≥ " : ""}${power.watts.toFixed(1).replace(".", ",")}`}
          <Copy size={19}> Вт</Copy>
        </Copy>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon
            name={power.kind === "exact" ? "bolt" : "info"}
            size={17}
            color={power.kind === "exact" ? theme.peach : theme.dim}
          />
          <Copy size={12} muted>
            {power.kind === "exact"
              ? w("точные данные", "так маалымат")
              : power.kind === "partial"
                ? w("оценка снизу", "төмөнкү баа")
                : w("нет измерений", "өлчөө жок")}
          </Copy>
        </View>
      </View>
      {power.kind !== "exact" && (
        <Copy size={12} muted style={{ lineHeight: 17 }}>
          ⓘ {caption}
        </Copy>
      )}
    </View>
  );
}

// ---- room cards ----------------------------------------------------------

/** Full-width featured room: artwork with overlaid name and counters. */
export function RoomCardFeatured({
  entry,
  deviceCount,
  power,
  locale,
  delay = 0,
  onPress,
}: {
  entry: RoomEntry;
  deviceCount: number;
  power: RoomPower;
  locale: Locale;
  delay?: number;
  onPress: () => void;
}) {
  return (
    <FadeUp delay={delay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={entryName(entry)}
        onPress={onPress}
        style={({ pressed }) => [
          shared.card,
          { padding: 0, overflow: "hidden" },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={{ height: 148 }}>
          <RoomArtwork art={entryArt(entry)} radius={0} />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: 14,
              gap: 2,
              backgroundColor: "rgba(20,22,18,0.62)",
            }}
          >
            <Copy size={21} numberOfLines={2}>
              {entryName(entry)}
            </Copy>
            <View style={[shared.between, { marginTop: 2 }]}>
              <Copy size={12} muted>
                {entryTypeText(entry, locale)} · {deviceCountText(deviceCount, locale)}
              </Copy>
              <RoomPowerBadge power={power} />
            </View>
          </View>
        </View>
      </Pressable>
    </FadeUp>
  );
}

/** Two-column compact room tile for the grid below the featured card. */
export function RoomCardCompact({
  entry,
  deviceCount,
  locale,
  delay = 0,
  onPress,
}: {
  entry: RoomEntry;
  deviceCount: number;
  locale: Locale;
  delay?: number;
  onPress: () => void;
}) {
  return (
    <FadeUp delay={delay} style={{ flex: 1, minWidth: "47%" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={entryName(entry)}
        onPress={onPress}
        style={({ pressed }) => [
          shared.card,
          { padding: 0, overflow: "hidden", flex: 1 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={{ height: 92 }}>
          <RoomArtwork art={entryArt(entry)} radius={0} />
        </View>
        <View style={{ padding: 11, gap: 3 }}>
          <Copy size={15} numberOfLines={2}>
            {entryName(entry)}
          </Copy>
          <Copy size={11} muted>
            {deviceCountText(deviceCount, locale)}
          </Copy>
        </View>
      </Pressable>
    </FadeUp>
  );
}

/** Subdued row for devices that are not placed in any room yet. */
export function RoomUnassignedCard({
  deviceCount,
  locale,
  onPress,
}: {
  deviceCount: number;
  locale: Locale;
  onPress: () => void;
}) {
  const w = useWords();
  return (
    <FadeUp>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={w("Без помещения", "Бөлмөсүз")}
        onPress={onPress}
        style={({ pressed }) => [
          shared.link,
          { minHeight: 64 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={shared.roundIcon}>
          <Icon name="filter" size={22} color={theme.dim} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Copy size={15}>{w("Без помещения", "Бөлмөсүз")}</Copy>
          <Copy size={12} muted>
            {deviceCountText(deviceCount, locale)}
          </Copy>
        </View>
        <Icon name="next" size={17} />
      </Pressable>
    </FadeUp>
  );
}

/** Dashed create-room call to action. */
export function CreateRoomCard({ onPress }: { onPress: () => void }) {
  const w = useWords();
  return (
    <FadeUp>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={w("Создать помещение", "Бөлмө кошуу")}
        onPress={onPress}
        style={({ pressed }) => [
          {
            minHeight: 64,
            borderRadius: 19,
            borderWidth: 1.4,
            borderStyle: "dashed",
            borderColor: theme.line,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 10,
            padding: 12,
          },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Icon name="plus" size={20} color={theme.peach} />
        <Copy size={15} accent>
          {w("Создать помещение", "Бөлмө кошуу")}
        </Copy>
      </Pressable>
    </FadeUp>
  );
}

// ---- room detail rows ------------------------------------------------------

/** Device row inside a room: state, watts, move action, link to device page. */
export function RoomDeviceRow({
  channel: ch,
  index = 0,
  onPress,
  onMove,
}: {
  channel: Channel;
  index?: number;
  onPress: () => void;
  onMove: () => void;
}) {
  const w = useWords();
  const state = ch.protected
    ? w("Защищён", "Корголгон")
    : (ch.watts ?? 0) > 0
      ? w("Включён", "Күйүк")
      : w("Выключен", "Өчүк");
  const watts =
    ch.watts === null ? "—" : `${ch.watts.toFixed(1).replace(".", ",")}`;
  return (
    <FadeUp delay={Math.min(index * 60, 240)}>
      <View
        style={[
          shared.card,
          { padding: 10, flexDirection: "row", gap: 10, alignItems: "center" },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ch.assigned?.name || ch.id}
          onPress={onPress}
          style={({ pressed }) => [
            {
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              flex: 1,
              minHeight: 44,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Photo
            source={imageMap[ch.assigned?.image || "lamp"]}
            style={{ width: 56, height: 56, borderRadius: 12 }}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Copy size={16} numberOfLines={1}>
              {ch.assigned?.name || ch.id}
            </Copy>
            <Copy size={12} muted>
              {ch.id} ·{" "}
              <Copy size={12} accent={ch.protected || (ch.watts ?? 0) > 0}>
                {state}
              </Copy>
            </Copy>
          </View>
          <Copy size={17}>
            {watts}
            <Copy size={11} muted>
              {" Вт"}
            </Copy>
          </Copy>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${w("Перенести", "Жылдыруу")}: ${ch.assigned?.name || ch.id}`}
          onPress={onMove}
          style={({ pressed }) => [
            {
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.line,
              alignItems: "center",
              justifyContent: "center",
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Icon name="next" size={18} color={theme.peach} />
        </Pressable>
      </View>
    </FadeUp>
  );
}

// ---- integration pieces ----------------------------------------------------

/**
 * Provider-free room filter chips for the existing Устройства screen.
 * Options derive from device room strings only, so no RoomsProvider is
 * required on screens outside the module subtree.
 */
export function RoomFilterChips({
  items,
  selected,
  onSelect,
}: {
  items: string[];
  selected: string | null;
  onSelect: (room: string | null) => void;
}) {
  const w = useWords();
  if (!items.length) return null;
  return (
    // Wrap-flow like the shared Chips row: no horizontal ScrollView quirks.
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selected === null }}
        onPress={() => onSelect(null)}
        style={[
          shared.chip,
          { flexGrow: 0, flexShrink: 0, flexBasis: "auto", paddingHorizontal: 14 },
          selected === null && {
            backgroundColor: theme.peach,
            borderColor: theme.peach,
          },
        ]}
      >
        <Copy
          size={13}
          style={{ color: selected === null ? theme.ink : theme.muted }}
        >
          {w("Все комнаты", "Бардык бөлмөлөр")}
        </Copy>
      </Pressable>
      {items.map((name) => (
        <Pressable
          key={name}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === name }}
          onPress={() => onSelect(selected === name ? null : name)}
          style={[
            shared.chip,
            { flexGrow: 0, flexShrink: 0, flexBasis: "auto", paddingHorizontal: 14 },
            selected === name && {
              backgroundColor: theme.peach,
              borderColor: theme.peach,
            },
          ]}
        >
          <Copy
            size={13}
            style={{ color: selected === name ? theme.ink : theme.muted }}
          >
            {name}
          </Copy>
        </Pressable>
      ))}
    </View>
  );
}

/** Entry point to the module on the devices screen. */
export function RoomsEntryCard({ subtitle }: { subtitle?: string }) {
  const w = useWords();
  return (
    <RowLink
      icon="home"
      accent
      title={w("Помещения", "Бөлмөлөр")}
      subtitle={
        subtitle ??
        w(
          "Комнаты, перенос устройств, мощность",
          "Бөлмөлөр, түзмөктөрдү жылдыруу, кубат",
        )
      }
      onPress={() => router.push("/rooms")}
    />
  );
}

// ---- dialogs ----------------------------------------------------------------

export type MoveDestination = { key: string; label: string };

/** Bottom sheet listing destination rooms for a device move. */
export function MoveSheet({
  visible,
  deviceName,
  currentRoom,
  destinations,
  onPick,
  onClose,
}: {
  visible: boolean;
  deviceName: string;
  currentRoom: string;
  destinations: MoveDestination[];
  onPick: (roomKey: string) => void;
  onClose: () => void;
}) {
  const w = useWords();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={w("Закрыть", "Жабуу")}
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(12,13,11,0.72)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            borderColor: theme.line,
            padding: 18,
            paddingBottom: 30,
            gap: 10,
            maxHeight: "72%",
          }}
        >
          <Copy size={19}>{w("Перенести устройство", "Түзмөктү жылдыруу")}</Copy>
          <Copy muted size={13} numberOfLines={2}>
            {deviceName}
          </Copy>
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ flexGrow: 0 }}
          >
            <View style={{ gap: 8 }}>
              {destinations.map((d) => {
                const selected = d.key === currentRoom;
                return (
                  <Pressable
                    key={d.key || "__none__"}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={selected}
                    onPress={() => onPick(d.key)}
                    style={({ pressed }) => [
                      shared.link,
                      { minHeight: 58 },
                      selected && { borderColor: theme.peach },
                      pressed && !selected && { opacity: 0.85 },
                    ]}
                  >
                    <View
                      style={[
                        shared.roundIcon,
                        selected && { borderColor: theme.peach },
                      ]}
                    >
                      <Icon
                        name="home"
                        size={22}
                        color={selected ? theme.peach : theme.dim}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Copy size={15}>{d.label}</Copy>
                      {selected && (
                        <Copy size={12} muted>
                          {w("Текущее помещение", "Азыркы бөлмө")}
                        </Copy>
                      )}
                    </View>
                    {selected && (
                      <Icon name="shield" size={18} color={theme.peach} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <SecondaryButton
                label={w("Отмена", "Жокко чыгаруу")}
                onPress={onClose}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Centered destructive-action confirmation. */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(12,13,11,0.72)",
          alignItems: "center",
          justifyContent: "center",
          padding: 28,
        }}
      >
        <View
          accessibilityRole="alert"
          style={{
            backgroundColor: theme.raised,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.line,
            padding: 20,
            gap: 10,
            width: "100%",
            maxWidth: 430,
          }}
        >
          <Copy size={19}>{title}</Copy>
          <Copy muted size={13} style={{ lineHeight: 19 }}>
            {body}
          </Copy>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <SecondaryButton label={cancelLabel} onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Pressable
                accessibilityRole="button"
                onPress={onConfirm}
                style={({ pressed }) => [
                  sty.button,
                  { backgroundColor: theme.error },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Copy size={16} style={{ color: theme.ink, fontWeight: "700" }}>
                  {confirmLabel}
                </Copy>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        sty.button,
        {
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.line,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Copy size={15}>{label}</Copy>
    </Pressable>
  );
}

// ---- pickers -----------------------------------------------------------------

/** Horizontal picker of room illustrations. */
export function ArtPicker({
  value,
  onChange,
}: {
  value: RoomArt;
  onChange: (art: RoomArt) => void;
}) {
  const { data } = useSpec();
  const locale = data.locale;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 2 }}>
        {roomArts.map((art) => {
          const selected = art === value;
          return (
            <Pressable
              key={art}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={roomArtLabel(art, locale)}
              onPress={() => onChange(art)}
              style={({ pressed }) => [
                {
                  width: 132,
                  borderRadius: 16,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? theme.peach : theme.line,
                  overflow: "hidden",
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={{ height: 84 }}>
                <RoomArtwork art={art} radius={0} />
              </View>
              <View style={{ padding: 8, backgroundColor: theme.surface }}>
                <Copy size={11} accent={selected} numberOfLines={1}>
                  {roomArtLabel(art, locale)}
                </Copy>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/** Room type selector rendered as wrap-flow chips. */
export function RoomTypeChips({
  value,
  onChange,
}: {
  value: RoomType;
  onChange: (roomType: RoomType) => void;
}) {
  const { data } = useSpec();
  const locale = data.locale;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {roomTypes.map((roomType) => {
        const selected = roomType === value;
        return (
          <Pressable
            key={roomType}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(roomType)}
            style={[
              shared.chip,
              { flexGrow: 0, flexShrink: 0, flexBasis: "auto", paddingHorizontal: 14 },
              selected && {
                backgroundColor: theme.peach,
                borderColor: theme.peach,
              },
            ]}
          >
            <Copy size={13} style={{ color: selected ? theme.ink : theme.muted }}>
              {roomTypeLabel(roomType, locale)}
            </Copy>
          </Pressable>
        );
      })}
    </View>
  );
}
