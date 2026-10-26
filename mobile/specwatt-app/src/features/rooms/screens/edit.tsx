/**
 * Rooms & Spaces — screen: create / edit room.
 *
 * Modes via route params:
 * - no params            → create a new room;
 * - { claim: "<name>" }  → create pre-filled from an implicit room name;
 * - { id: "<room-id>" }  → edit an existing catalog room (rename, type, art,
 *                          destructive delete with confirmation).
 *
 * The form mounts only after the catalog has loaded, so its draft state always
 * starts from the real persisted room. Unsaved changes are guarded on Android
 * hardware back with a discard confirmation. Deleting removes only the catalog
 * entry: device assignments keep their room strings and regroup as an implicit
 * room, so nothing is destroyed.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Copy, CTA } from "../../../specwatt/ui";
import { Header, useWords } from "../../../specwatt/mobile-ui";
import { sty, theme } from "../../../specwatt/theme";
import { ArtPicker, ConfirmDialog, RoomTypeChips } from "../components";
import { useRooms } from "../store";
import { ROOM_NAME_MAX } from "../model";
import type { Room, RoomArt, RoomType } from "../model";

type Mode =
  | { kind: "create"; claim?: string }
  | { kind: "edit"; id: string };

export function RoomEditScreen() {
  const params = useLocalSearchParams<{ id?: string; claim?: string }>();
  const { ready, data: roomsData } = useRooms();
  const w = useWords();

  const mode: Mode = useMemo(
    () =>
      typeof params.id === "string" && params.id
        ? { kind: "edit", id: params.id }
        : {
            kind: "create",
            claim: typeof params.claim === "string" ? params.claim : undefined,
          },
    [params.id, params.claim],
  );

  const original = useMemo(() => {
    if (mode.kind !== "edit") return null;
    return roomsData.rooms.find((r) => r.id === mode.id) ?? null;
  }, [mode, roomsData]);

  if (!ready)
    return (
      <Frame>
        <Header
          title={w("Помещения", "Бөлмөлөр")}
          subtitle={w("Загрузка…", "Жүктөлүүдө…")}
          icon="back"
          onPress={() => router.replace("/rooms")}
        />
      </Frame>
    );

  if (mode.kind === "edit" && !original)
    return (
      <Frame>
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
      </Frame>
    );

  return (
    <RoomEditForm
      key={mode.kind === "edit" ? mode.id : mode.claim ?? "create"}
      mode={mode}
      original={mode.kind === "edit" ? original : null}
    />
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={sty.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[sty.body, { paddingTop: 24 }]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function RoomEditForm({
  mode,
  original,
}: {
  mode: Mode;
  original: Room | null;
}) {
  const { data: roomsData, addRoom, renameRoom, setRoomType, setRoomArt, removeRoom } =
    useRooms();
  const w = useWords();

  const [name, setName] = useState(
    original?.name ?? (mode.kind === "create" ? (mode.claim ?? "") : ""),
  );
  const [roomType, setLocalType] = useState<RoomType>(
    original?.type ?? "other",
  );
  const [art, setLocalArt] = useState<RoomArt>(original?.art ?? "corner");
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = useMemo(() => {
    if (mode.kind === "create")
      return name.trim() !== "" || roomType !== "other" || art !== "corner";
    if (!original) return false;
    return (
      name !== original.name ||
      roomType !== original.type ||
      art !== original.art
    );
  }, [mode.kind, name, roomType, art, original]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/rooms");
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (dirty) {
        setConfirmDiscard(true);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [dirty]);

  function nameError(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return w("Введите название помещения.", "Бөлмөнүн атын киргизиңиз.");
    if (trimmed.length > ROOM_NAME_MAX)
      return w(
        `Название — до ${ROOM_NAME_MAX} символов.`,
        `Ат — ${ROOM_NAME_MAX} белгиге чейин.`,
      );
    const lower = trimmed.toLowerCase();
    const excludeId = mode.kind === "edit" ? mode.id : "";
    if (
      roomsData.rooms.some(
        (r) => r.id !== excludeId && r.name.toLowerCase() === lower,
      )
    )
      return w(
        "Помещение с таким названием уже есть.",
        "Мындай аталыштагы бөлмө бар.",
      );
    return "";
  }

  function save() {
    const problem = nameError(name);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    if (mode.kind === "create") {
      const room = addRoom({ name, roomType, art });
      if (!room) {
        setError(w("Не удалось сохранить помещение.", "Бөлмө сакталбады."));
        return;
      }
      router.replace({
        pathname: "/rooms/[id]",
        params: { id: `cat:${room.id}` },
      });
      return;
    }
    if (!original) return;
    if (name !== original.name) renameRoom(original.id, name);
    if (roomType !== original.type) setRoomType(original.id, roomType);
    if (art !== original.art) setRoomArt(original.id, art);
    goBack();
  }

  function requestClose() {
    if (dirty) setConfirmDiscard(true);
    else goBack();
  }

  const title =
    mode.kind === "edit"
      ? w("Настройка помещения", "Бөлмөнү жөндөө")
      : mode.claim
        ? w("Сохранить помещение", "Бөлмөнү сактоо")
        : w("Новое помещение", "Жаңы бөлмө");

  return (
    <SafeAreaView style={sty.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[sty.body, { paddingTop: 24 }]}
        >
          <Header
            title={title}
            subtitle={w("Название, тип, иллюстрация", "Ат, түр, иллюстрация")}
            icon="back"
            onPress={requestClose}
          />
          <Copy muted size={13}>
            {w("Название помещения", "Бөлмөнүн аты")}
          </Copy>
          <TextInput
            accessibilityLabel={w("Название помещения", "Бөлмөнүн аты")}
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (error) setError("");
            }}
            style={sty.field}
            placeholder={w("Например, Гостиная", "Мисалы, Конок бөлмөсү")}
            placeholderTextColor={theme.dim}
            maxLength={ROOM_NAME_MAX + 20}
            autoCorrect={false}
            returnKeyType="done"
          />
          {!!error && (
            <Copy accessibilityRole="alert" style={{ color: theme.error }}>
              {error}
            </Copy>
          )}
          <View style={{ gap: 10, marginTop: 6 }}>
            <Copy muted size={13}>
              {w("Тип комнаты", "Бөлмөнүн түрү")}
            </Copy>
            <RoomTypeChips value={roomType} onChange={setLocalType} />
            <Copy muted size={13} style={{ marginTop: 8 }}>
              {w("Иллюстрация", "Иллюстрация")}
            </Copy>
            <ArtPicker value={art} onChange={setLocalArt} />
          </View>
          <CTA
            label={
              mode.kind === "edit"
                ? w("Сохранить изменения", "Өзгөртүүлөрдү сактоо")
                : w("Создать помещение", "Бөлмө кошуу")
            }
            onPress={save}
          />
          <Copy muted size={12} style={{ textAlign: "center" }}>
            ⓘ{" "}
            {w(
              "Помещение — это организация. Измерения и команды оборудования не затрагиваются.",
              "Бөлмө — уюштуруу гана. Өлчөөлөр жана жабдуунун буйруктары таасир этпейт.",
            )}
          </Copy>
          {mode.kind === "edit" && original && (
            <>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: theme.error,
                  borderRadius: 19,
                  padding: 16,
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <Copy size={15} style={{ color: theme.error }}>
                  {w("Удаление помещения", "Бөлмөнү өчүрүү")}
                </Copy>
                <Copy muted size={12} style={{ lineHeight: 18 }}>
                  {w(
                    "Назначения устройств сохранятся: они останутся в приложении и соберутся во «Без помещения». Удаление нельзя отменить.",
                    "Түзмөктөрдүн дайындоолору сакталат: алар колдонмодо калып, «Бөлмөсүз» топтосунушат. Өчүрүүнү кайтаруу мүмкүн эмес.",
                  )}
                </Copy>
                <CTA
                  label={w("Удалить помещение", "Бөлмөнү өчүрүү")}
                  secondary
                  onPress={() => setConfirmDelete(true)}
                />
              </View>
              <ConfirmDialog
                visible={confirmDelete}
                title={w("Удалить помещение?", "Бөлмөнү өчүрүүбү?")}
                body={w(
                  `«${original.name}» будет удалено из каталога. Устройства сохранят текущие назначения и появятся во «Без помещения».`,
                  `«${original.name}» каталогдан өчүрүлөт. Түзмөктөр учурдагы дайындоолорун сактап, «Бөлмөсүз» топто пайда болот.`,
                )}
                confirmLabel={w("Удалить", "Өчүрүү")}
                cancelLabel={w("Отмена", "Жокко чыгаруу")}
                onConfirm={() => {
                  setConfirmDelete(false);
                  removeRoom(original.id);
                  router.replace("/rooms");
                }}
                onClose={() => setConfirmDelete(false)}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmDialog
        visible={confirmDiscard}
        title={w("Отменить изменения?", "Өзгөртүүлөрдү жокко чыгаруу?")}
        body={w(
          "Сохранённые данные не изменятся. Черновик этой формы будет потерян.",
          "Сакталган маалыматтар өзгөрбөйт. Бул форманын долбоору жоголот.",
        )}
        confirmLabel={w("Не сохранять", "Сактабоо")}
        cancelLabel={w("Продолжить редактирование", "Түзөтүүнү улантуу")}
        onConfirm={() => {
          setConfirmDiscard(false);
          goBack();
        }}
        onClose={() => setConfirmDiscard(false)}
      />
    </SafeAreaView>
  );
}
