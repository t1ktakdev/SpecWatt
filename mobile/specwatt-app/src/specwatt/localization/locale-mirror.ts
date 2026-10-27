import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Locale } from "../model";

// Recovery mirror for the chosen locale. The main state lives in the store
// (specwatt-mobile-v1); when its storage is corrupted or unreadable the app
// falls back to defaults and would forget the language. This separate key is
// the recovery source: it is written on every explicit locale change and read
// only when the store itself reports a read failure, so it can never override
// healthy stored state. It is not a second store — it holds exactly one value.
const MIRROR_KEY = "specwatt-locale-mirror-v1";

function parseLocale(raw: string | null): Locale | null {
  return raw === "ru" || raw === "ky" ? raw : null;
}

/** Fire-and-forget: a failed mirror write must never surface as a user error. */
export function rememberLocale(locale: Locale): void {
  AsyncStorage.setItem(MIRROR_KEY, locale).catch(() => {});
}

/** Returns null for corrupted, legacy or unreadable values — never guesses. */
export async function recallLocale(): Promise<Locale | null> {
  try {
    return parseLocale(await AsyncStorage.getItem(MIRROR_KEY));
  } catch {
    return null;
  }
}

/** Single policy for switching language: update the store and the mirror. */
export function applyLocale(
  setLocale: (locale: Locale) => void,
  locale: Locale,
): void {
  setLocale(locale);
  rememberLocale(locale);
}
