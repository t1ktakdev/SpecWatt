import type { Assign, Locale } from "../store";
import { t } from "../i18n.ts";

/** Blank assignment draft with a locale-appropriate starting room name. */
export function defaultDraft(locale: Locale): Assign {
  return {
    name: "",
    category: "lamp",
    image: "lamp",
    room: t(locale, "defaultRoom"),
    allowAuto: false,
  };
}
