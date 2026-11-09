import type { Action, ActionInput, ActionType, Suggestion } from "@/lib/api/client";
import type { MessageKey } from "@/lib/i18n";
import { isValidTimezone, resolveLocal, toLocal, type ResolvedInstant } from "@/lib/time";

export type DateDraft = { date: string; time: string; occurrence?: "earlier" | "later" };
export type DateField = "due" | "remind" | "start" | "end";

export type ActionDraft = {
  type: ActionType;
  title: string;
  details: string;
  timezone: string;
  listId: string;
  due: DateDraft;
  remind: DateDraft;
  start: DateDraft;
  end: DateDraft;
  sourceCaptureId?: string;
};

const EMPTY: DateDraft = { date: "", time: "" };

/** Date fields shown for each action type, matching the contract's type rules. */
export const DATE_FIELDS: Record<ActionType, DateField[]> = {
  task: ["due", "remind"],
  reminder: ["remind"],
  event: ["start", "end"],
  list_item: [],
};
export const REQUIRED_DATES: Record<ActionType, DateField[]> = {
  task: [],
  reminder: ["remind"],
  event: ["start"],
  list_item: [],
};
const API_FIELD: Record<DateField, "dueAt" | "remindAt" | "startAt" | "endAt"> = {
  due: "dueAt",
  remind: "remindAt",
  start: "startAt",
  end: "endAt",
};

export function emptyDraft(timezone: string, type: ActionType = "task"): ActionDraft {
  return {
    type,
    title: "",
    details: "",
    timezone,
    listId: "",
    due: { ...EMPTY },
    remind: { ...EMPTY },
    start: { ...EMPTY },
    end: { ...EMPTY },
  };
}

/**
 * Prefill from a suggestion. A candidate instant is prefilled only when the provider
 * marked it unambiguous; ambiguous dates stay empty so the user must enter them.
 */
export function draftFromSuggestion(suggestion: Suggestion, defaultTimezone: string): ActionDraft {
  const draft = emptyDraft(defaultTimezone, suggestion.type);
  draft.title = suggestion.title;
  draft.details = suggestion.details ?? "";
  draft.sourceCaptureId = suggestion.captureId;
  const date = suggestion.date;
  const field = PRIMARY_DATE[suggestion.type];
  if (date && !date.ambiguous && date.candidateInstant && date.timezone && isValidTimezone(date.timezone)) {
    draft.timezone = date.timezone;
    if (field) draft[field] = toLocal(date.candidateInstant, date.timezone);
  } else if (date && field) {
    // Ambiguous text: prefill only parts stated exactly (a clock time, an ISO date). The user
    // still supplies anything missing and confirms before accepting.
    const hint = dateHint(date.extractedText);
    draft[field] = { date: hint.date ?? "", time: hint.time ?? "" };
  }
  return draft;
}

/** The date field a suggestion's extracted date belongs to, per action type. */
export const PRIMARY_DATE: Record<ActionType, DateField | undefined> = {
  task: "due",
  reminder: "remind",
  event: "start",
  list_item: undefined,
};

/**
 * Exact parts of an extracted date phrase: a clock time ("9:00", "17:30", "9am", "6:30 pm",
 * or the start of a range "7–8pm") and an ISO calendar date. Weekdays, relative words and
 * dates without a year are left for the user.
 */
export function dateHint(text: string): { date?: string; time?: string } {
  const result: { date?: string; time?: string } = {};
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d) result.date = iso[0];
  }
  const time =
    /(?<![\d/.-])(\d{1,2})(?:[:.](\d{2}))?\s*(?:([ap])\.?m\.?)?(?:\s*(?:[–—-]|to)\s*\d{1,2}(?:[:.]\d{2})?\s*([ap])\.?m\.?)?(?![\d/])/i.exec(
      text.replace(/\b\d{4}-\d{2}-\d{2}\b/, " "),
    );
  if (time && (time[2] !== undefined || time[3] || time[4])) {
    let hour = Number(time[1]);
    const minute = Number(time[2] ?? 0);
    const meridiem = (time[3] ?? time[4])?.toLowerCase();
    if (meridiem && (hour < 1 || hour > 12)) return result;
    if (meridiem === "p" && hour < 12) hour += 12;
    if (meridiem === "a" && hour === 12) hour = 0;
    if (hour <= 23 && minute <= 59) result.time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return result;
}

/** Set the calendar date (and time zone) of a draft's primary date, keeping its time. */
export function applyDate(draft: ActionDraft, date: string, timezone: string): ActionDraft {
  const field = PRIMARY_DATE[draft.type];
  if (!field) return draft;
  return { ...draft, timezone, [field]: { date, time: draft[field].time } };
}

export function draftFromAction(action: Action, defaultTimezone: string): ActionDraft {
  const timezone = action.timezone && isValidTimezone(action.timezone) ? action.timezone : defaultTimezone;
  const draft = emptyDraft(timezone, action.type);
  draft.title = action.title;
  draft.details = action.details ?? "";
  draft.listId = action.listId ?? "";
  draft.sourceCaptureId = action.sourceCaptureId;
  for (const field of Object.keys(API_FIELD) as DateField[]) {
    const instant = action[API_FIELD[field]];
    if (instant) draft[field] = toLocal(instant, timezone);
  }
  return draft;
}

export type DateResolution = ResolvedInstant | { kind: "empty" } | { kind: "partial" };

export function resolveDraftDate(value: DateDraft, timezone: string): DateResolution {
  if (!value.date && !value.time) return { kind: "empty" };
  if (!value.date || !value.time) return { kind: "partial" };
  return resolveLocal(value, timezone);
}

export type DraftErrors = Partial<Record<"title" | "timezone" | "listId" | DateField, MessageKey>>;

export type BuildResult = { ok: true; input: ActionInput } | { ok: false; errors: DraftErrors };

/** Validate a draft and convert it to the contract's ActionInput (UTC + IANA timezone). */
export function buildActionInput(draft: ActionDraft): BuildResult {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = "form.titleRequired";
  const input: ActionInput = { type: draft.type, title };
  const details = draft.details.trim();
  if (details) input.details = details;
  if (draft.sourceCaptureId) input.sourceCaptureId = draft.sourceCaptureId;

  if (draft.type === "list_item") {
    if (!draft.listId) errors.listId = "form.chooseList";
    else input.listId = draft.listId;
  }

  const fields = DATE_FIELDS[draft.type];
  const usesDates = fields.some((f) => draft[f].date || draft[f].time) || REQUIRED_DATES[draft.type].length > 0;
  if (usesDates && !isValidTimezone(draft.timezone)) errors.timezone = "form.invalidDate";

  const instants: Partial<Record<DateField, string>> = {};
  for (const field of fields) {
    const resolution = resolveDraftDate(draft[field], draft.timezone);
    switch (resolution.kind) {
      case "empty":
        if (REQUIRED_DATES[draft.type].includes(field)) errors[field] = "form.partialDate";
        break;
      case "partial":
        errors[field] = "form.partialDate";
        break;
      case "invalid":
        errors[field] = "form.invalidDate";
        break;
      case "nonexistent":
        errors[field] = "form.nonexistent";
        break;
      case "ambiguous":
        if (!draft[field].occurrence) errors[field] = "form.ambiguousTime";
        else instants[field] = draft[field].occurrence === "earlier" ? resolution.earlier : resolution.later;
        break;
      case "ok":
        instants[field] = resolution.instant;
    }
  }
  if (instants.start && instants.end && Date.parse(instants.end) <= Date.parse(instants.start))
    errors.end = "form.endBeforeStart";
  for (const [field, instant] of Object.entries(instants) as [DateField, string][]) input[API_FIELD[field]] = instant;
  if (Object.keys(instants).length) input.timezone = draft.timezone;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, input };
}

/** Map server-side field errors (contract field names) onto draft fields. */
export function draftFieldFor(apiField: string): keyof DraftErrors | undefined {
  const map: Record<string, keyof DraftErrors> = {
    title: "title",
    timezone: "timezone",
    listId: "listId",
    dueAt: "due",
    remindAt: "remind",
    startAt: "start",
    endAt: "end",
  };
  return map[apiField.replace(/^action\./, "")];
}
