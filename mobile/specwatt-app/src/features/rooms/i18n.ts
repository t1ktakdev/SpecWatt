/**
 * Rooms & Spaces — module strings (RU/KY).
 *
 * The host app keeps one-off copy inline via `useWords()`; repeatable,
 * testable vocabularies (room types, arts, shared labels) live here. Every
 * key must exist in both locales — enforced by the module tests.
 */

import type { Locale } from "../../specwatt/model";
import type { RoomArt, RoomType } from "./model";

export const roomTypeNames: Record<RoomType, { ru: string; ky: string }> = {
  living: { ru: "Гостиная", ky: "Конок бөлмөсү" },
  bedroom: { ru: "Спальня", ky: "Жатын бөлмө" },
  kitchen: { ru: "Кухня", ky: "Ашкана" },
  office: { ru: "Рабочий кабинет", ky: "Иш бөлмө" },
  bathroom: { ru: "Ванная", ky: "Жуунуу бөлмө" },
  hallway: { ru: "Прихожая", ky: "Далбаз" },
  other: { ru: "Другое помещение", ky: "Башка бөлмө" },
};

export const roomArtNames: Record<RoomArt, { ru: string; ky: string }> = {
  living: { ru: "Диван и торшер", ky: "Диван жана торшер" },
  bedroom: { ru: "Кровать у окна", ky: "Терезе алдындагы керебет" },
  kitchen: { ru: "Кухонный свет", ky: "Ашкананын жарыгы" },
  office: { ru: "Стол с монитором", ky: "Монитору бар стол" },
  bathroom: { ru: "Ванная комната", ky: "Жуунуу бөлмө" },
  hallway: { ru: "Вешалка у входа", ky: "Кирүүдөгү вешалка" },
  loft: { ru: "Открытый угол", ky: "Ачык бурч" },
  corner: { ru: "Тихий уголок", ky: "Жымжырт бурч" },
};

export function roomTypeLabel(type: RoomType, locale: Locale): string {
  return roomTypeNames[type][locale];
}

export function roomArtLabel(art: RoomArt, locale: Locale): string {
  return roomArtNames[art][locale];
}
