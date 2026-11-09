"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { useBrowserValue } from "@/lib/browser";
import { browserTimezone, isValidTimezone } from "@/lib/time";
import { en, type Messages } from "./en";

// Catalogs by language; formatting locale and language are separate so an unsupported
// language falls back to English text while keeping the user's regional formats and direction.
const catalogs: Record<string, Messages> = { en };

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<typeof en>;
type PluralKey = {
  [K in MessageKey]: K extends `${infer B}.other` ? B : never;
}[MessageKey];

const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur", "ps", "sd", "ug", "yi", "dv", "ckb"]);

export function textDirection(locale: string): "ltr" | "rtl" {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & {
      getTextInfo?: () => { direction: string };
      textInfo?: { direction: string };
    };
    const info = l.getTextInfo?.() ?? l.textInfo;
    if (info?.direction) return info.direction === "rtl" ? "rtl" : "ltr";
    return RTL_LANGUAGES.has(l.language) ? "rtl" : "ltr";
  } catch {
    return "ltr";
  }
}

function lookup(catalog: Messages, key: string): string | undefined {
  let node: unknown = catalog;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function translate(locale: string, key: string, params: Record<string, string | number> = {}): string {
  const language = locale.split("-")[0] ?? "en";
  const template = lookup(catalogs[language] ?? en, key) ?? lookup(en, key) ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === "number" ? new Intl.NumberFormat(locale).format(value) : value;
  });
}

export type DisplaySettings = { locale?: string; timezone?: string };
const STORAGE_KEY = "nextstep.display.v1";

/** Display-only preferences (not credentials) stored on this device. */
export function parseDisplaySettings(text: string | null): DisplaySettings {
  try {
    const raw = JSON.parse(text ?? "{}") as DisplaySettings;
    const result: DisplaySettings = {};
    if (typeof raw.locale === "string" && isSupportedLocale(raw.locale)) result.locale = raw.locale;
    if (typeof raw.timezone === "string" && isValidTimezone(raw.timezone)) result.timezone = raw.timezone;
    return result;
  } catch {
    return {};
  }
}

export function isSupportedLocale(locale: string): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
}

const NO_SETTINGS: DisplaySettings = {};
let cached: { raw: string | null; value: DisplaySettings } = { raw: null, value: NO_SETTINGS };
const listeners = new Set<() => void>();
function settingsSnapshot(): DisplaySettings {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cached.raw) cached = { raw, value: parseDisplaySettings(raw) };
  return cached.value;
}
function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
function saveSettings(next: DisplaySettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

type I18n = {
  locale: string;
  dir: "ltr" | "rtl";
  timezone: string;
  settings: DisplaySettings;
  setSettings: (settings: DisplaySettings) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  plural: (key: PluralKey, count: number) => string;
  formatDateTime: (instant: string, timezone?: string, options?: Intl.DateTimeFormatOptions) => string;
  formatDate: (instant: string, timezone?: string) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const settings = useSyncExternalStore(subscribeSettings, settingsSnapshot, () => NO_SETTINGS);
  const browserLocale = useBrowserValue(() => navigator.language || "en", "en");
  const browserZone = useBrowserValue(browserTimezone, "UTC");

  const locale = settings.locale ?? browserLocale;
  const timezone = settings.timezone ?? browserZone;
  const dir = textDirection(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setSettings = saveSettings;

  const value = useMemo<I18n>(() => {
    const t = (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params);
    return {
      locale,
      dir,
      timezone,
      settings,
      setSettings,
      t,
      plural: (key, count) => {
        const category = new Intl.PluralRules(locale).select(count);
        const specific = `${key}.${category}`;
        return translate(locale, lookup(en, specific) ? specific : `${key}.other`, { count });
      },
      formatDateTime: (instant, tz, options) => {
        // dateStyle/timeStyle can't be combined with component options such as timeZoneName.
        const base: Intl.DateTimeFormatOptions = options?.timeZoneName
          ? { year: "numeric", month: "short", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" }
          : { dateStyle: "medium", timeStyle: "short" };
        return new Intl.DateTimeFormat(locale, { ...base, timeZone: tz ?? timezone, ...options }).format(
          new Date(instant),
        );
      },
      formatDate: (instant, tz) =>
        new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: tz ?? timezone }).format(new Date(instant)),
    };
  }, [locale, dir, timezone, settings, setSettings]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
