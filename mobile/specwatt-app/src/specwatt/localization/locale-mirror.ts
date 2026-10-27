import type { Locale } from "../model";

// Pure policy. Only SpecProvider/store.tsx owns AsyncStorage access; this
// module receives a storage adapter for deterministic tests.
export const MIRROR_KEY = "specwatt-locale-mirror-v1";

export type LocaleStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function parseLocale(raw: unknown): Locale | null {
  return raw === "ru" || raw === "ky" ? raw : null;
}

export function localeFromStoredState(raw: unknown): Locale | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return null;
  return parseLocale((raw as { locale?: unknown }).locale);
}

export async function recallLocale(storage: LocaleStorage): Promise<Locale | null> {
  try {
    return parseLocale(await storage.getItem(MIRROR_KEY));
  } catch {
    return null;
  }
}

/** A recovery aid only: failing to persist it must never disrupt the app. */
export async function rememberLocale(storage: LocaleStorage, locale: Locale): Promise<void> {
  try {
    await storage.setItem(MIRROR_KEY, locale);
  } catch {
    // Main state persistence owns user-visible storage failures.
  }
}

/** UI delegates one change to SpecProvider; the store serializes persistence. */
export function applyLocale(setLocale: (locale: Locale) => void, locale: Locale): void {
  setLocale(locale);
}
