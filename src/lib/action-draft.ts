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
  if (date && !date.ambiguous && date.candidateInstant && date.timezone && isValidTimezone(date.timezone)) {
    draft.timezone = date.timezone;
    const field: DateField | undefined =
      suggestion.type === "event"
        ? "start"
        : suggestion.type === "reminder"
          ? "remind"
          : suggestion.type === "task"
            ? "due"
            : undefined;
    if (field) draft[field] = toLocal(date.candidateInstant, date.timezone);
  }
  return draft;
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
