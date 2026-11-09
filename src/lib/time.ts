// Local date/time ↔ UTC conversion for a named IANA timezone, without guessing.
// A wall-clock time can be invalid (skipped by a DST gap) or ambiguous (repeated in a
// DST overlap); both are reported so the user can decide instead of the app.

export type LocalDateTime = { date: string; time: string }; // "YYYY-MM-DD", "HH:MM"

export type ResolvedInstant =
  | { kind: "ok"; instant: string }
  | { kind: "ambiguous"; earlier: string; later: string }
  | { kind: "nonexistent" }
  | { kind: "invalid" };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

export function isValidTimezone(timezone: string): boolean {
  if (!timezone || /^[+-]/.test(timezone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function supportedTimezones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timezone, f);
  }
  return f;
}

/** Wall-clock fields of an instant in a timezone. */
export function wallClock(epochMs: number, timezone: string) {
  const parts = Object.fromEntries(
    partsFormatter(timezone)
      .formatToParts(new Date(epochMs))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
  return parts;
}

/** Offset of the timezone from UTC at an instant, in milliseconds. */
export function offsetAt(epochMs: number, timezone: string): number {
  const w = wallClock(epochMs, timezone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Resolve a user-entered local date and time in an IANA timezone to UTC instants. */
export function resolveLocal(value: LocalDateTime, timezone: string): ResolvedInstant {
  const d = DATE.exec(value.date);
  const t = TIME.exec(value.time);
  if (!d || !t || !isValidTimezone(timezone)) return { kind: "invalid" };
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  )
    return { kind: "invalid" };
  // Offsets in effect around this wall time cover any single DST transition.
  const offsets = new Set([
    offsetAt(wall - 36 * 3600_000, timezone),
    offsetAt(wall, timezone),
    offsetAt(wall + 36 * 3600_000, timezone),
  ]);
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((candidate) => {
      const w = wallClock(candidate, timezone);
      return w.year === year && w.month === month && w.day === day && w.hour === hour && w.minute === minute;
    })
    .sort((a, b) => a - b);
  const unique = [...new Set(matches)];
  if (unique.length === 0) return { kind: "nonexistent" };
  if (unique.length > 1)
    return {
      kind: "ambiguous",
      earlier: new Date(unique[0]!).toISOString(),
      later: new Date(unique[unique.length - 1]!).toISOString(),
    };
  return { kind: "ok", instant: new Date(unique[0]!).toISOString() };
}

/** Local date and time fields of a UTC instant in a timezone, for editing. */
export function toLocal(instant: string, timezone: string): LocalDateTime {
  const w = wallClock(Date.parse(instant), timezone);
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return {
    date: `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}
