"use client";

import { useId, useMemo, useState } from "react";
import {
  DATE_FIELDS,
  REQUIRED_DATES,
  resolveDraftDate,
  type ActionDraft,
  type DateField,
  type DraftErrors,
} from "@/lib/action-draft";
import type { ActionType, List } from "@/lib/api/client";
import { toApiError, errorMessageKey } from "@/lib/api/errors";
import { useApi, useAnnounce } from "@/lib/hooks";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { supportedTimezones } from "@/lib/time";
import { FieldError } from "./ui";

const TYPES: ActionType[] = ["task", "reminder", "event", "list_item"];
const LABEL: Record<DateField, MessageKey> = {
  due: "form.dueDate",
  remind: "form.remindAt",
  start: "form.startAt",
  end: "form.endAt",
};

type Props = {
  draft: ActionDraft;
  onChange: (draft: ActionDraft) => void;
  errors: DraftErrors;
  lists: List[] | undefined;
  onListCreated: (list: List) => void;
  /** Lock the type when editing an existing action. */
  typeLocked?: boolean;
};

export function ActionFields({ draft, onChange, errors, lists, onListCreated, typeLocked }: Props) {
  const { t } = useI18n();
  const id = useId();
  const set = <K extends keyof ActionDraft>(key: K, value: ActionDraft[K]) => onChange({ ...draft, [key]: value });
  const message = (key?: MessageKey) => (key ? t(key, { timezone: draft.timezone }) : undefined);
  const fields = DATE_FIELDS[draft.type];

  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor={`${id}-type`}>{t("form.type")}</label>
        <select
          id={`${id}-type`}
          value={draft.type}
          disabled={typeLocked}
          onChange={(e) => set("type", e.target.value as ActionType)}
        >
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`actionTypes.${type}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-title`}>
          {t("form.title")} <span className="muted">{t("common.required")}</span>
        </label>
        <input
          id={`${id}-title`}
          value={draft.title}
          dir="auto"
          maxLength={500}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? `${id}-title-error` : undefined}
          onChange={(e) => set("title", e.target.value)}
        />
        <FieldError id={`${id}-title-error`} message={message(errors.title)} />
      </div>
      <div className="field field-wide">
        <label htmlFor={`${id}-details`}>
          {t("form.details")} <span className="muted">{t("common.optional")}</span>
        </label>
        <textarea
          id={`${id}-details`}
          value={draft.details}
          dir="auto"
          rows={3}
          maxLength={4000}
          onChange={(e) => set("details", e.target.value)}
        />
      </div>
      {draft.type === "list_item" && (
        <ListPicker
          value={draft.listId}
          lists={lists}
          error={message(errors.listId)}
          onChange={(listId) => set("listId", listId)}
          onCreated={(list) => {
            onListCreated(list);
            set("listId", list.id);
          }}
        />
      )}
      {fields.length > 0 && (
        <>
          {fields.map((field) => (
            <DateTimeField
              key={field}
              field={field}
              label={t(LABEL[field])}
              required={REQUIRED_DATES[draft.type].includes(field)}
              draft={draft}
              onChange={onChange}
              error={message(errors[field])}
            />
          ))}
          <TimezoneField
            value={draft.timezone}
            onChange={(timezone) => set("timezone", timezone)}
            error={message(errors.timezone)}
          />
        </>
      )}
    </div>
  );
}

function DateTimeField({
  field,
  label,
  required,
  draft,
  onChange,
  error,
}: {
  field: DateField;
  label: string;
  required: boolean;
  draft: ActionDraft;
  onChange: (draft: ActionDraft) => void;
  error?: string;
}) {
  const { t, formatDateTime } = useI18n();
  const id = useId();
  const value = draft[field];
  const resolution = resolveDraftDate(value, draft.timezone);
  const update = (next: Partial<typeof value>) =>
    onChange({ ...draft, [field]: { ...value, ...next, occurrence: next.occurrence } });
  const describedBy = [error ? `${id}-error` : "", resolution.kind === "ok" ? `${id}-resolved` : ""]
    .filter(Boolean)
    .join(" ");
  const fmt = (instant: string) => formatDateTime(instant, draft.timezone, { timeZoneName: "short" });

  return (
    <fieldset className="field field-wide date-field" aria-describedby={describedBy || undefined}>
      <legend>
        {label} <span className="muted">{required ? t("common.required") : t("common.optional")}</span>
      </legend>
      <div className="date-inputs">
        <div>
          <label htmlFor={`${id}-date`}>{t("form.date")}</label>
          <input
            id={`${id}-date`}
            type="date"
            value={value.date}
            aria-invalid={error ? true : undefined}
            onChange={(e) => update({ date: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`${id}-time`}>{t("form.time")}</label>
          <input
            id={`${id}-time`}
            type="time"
            value={value.time}
            aria-invalid={error ? true : undefined}
            onChange={(e) => update({ time: e.target.value })}
          />
        </div>
        {!required && (value.date || value.time) && (
          <button type="button" className="button link" onClick={() => update({ date: "", time: "" })}>
            {t("form.clearDate")}
            <span className="visually-hidden"> {label}</span>
          </button>
        )}
      </div>
      {resolution.kind === "ambiguous" && (
        <div
          className="choice-group"
          role="radiogroup"
          aria-label={t("form.ambiguousTime", { timezone: draft.timezone })}
        >
          <p>{t("form.ambiguousTime", { timezone: draft.timezone })}</p>
          {(["earlier", "later"] as const).map((occurrence) => (
            <label key={occurrence} className="choice">
              <input
                type="radio"
                name={`${id}-occurrence`}
                checked={value.occurrence === occurrence}
                onChange={() => update({ occurrence })}
              />
              {t(occurrence === "earlier" ? "form.earlierOccurrence" : "form.laterOccurrence", {
                value: fmt(occurrence === "earlier" ? resolution.earlier : resolution.later),
              })}
            </label>
          ))}
        </div>
      )}
      {resolution.kind === "ok" && (
        <p className="muted small" id={`${id}-resolved`}>
          {t("form.resolvedAs", { value: fmt(resolution.instant) })}
        </p>
      )}
      {error && resolution.kind !== "ambiguous" && <FieldError id={`${id}-error`} message={error} />}
    </fieldset>
  );
}

export function TimezoneField({
  value,
  onChange,
  error,
  hint,
  label,
}: {
  value: string;
  onChange: (timezone: string) => void;
  error?: string;
  hint?: string;
  label?: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const zones = useMemo(() => {
    const all = supportedTimezones();
    return all.includes(value) ? all : [value, ...all];
  }, [value]);
  return (
    <div className="field">
      <label htmlFor={`${id}-tz`}>{label ?? t("form.timezone")}</label>
      <select
        id={`${id}-tz`}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      {hint && (
        <p className="muted small" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function ListPicker({
  value,
  lists,
  error,
  onChange,
  onCreated,
}: {
  value: string;
  lists: List[] | undefined;
  error?: string;
  onChange: (listId: string) => void;
  onCreated: (list: List) => void;
}) {
  const { t } = useI18n();
  const api = useApi();
  const announce = useAnnounce();
  const id = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string>();

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setCreateError(undefined);
    try {
      const list = await api.lists.create(name.trim());
      onCreated(list);
      setName("");
      announce(t("lists.created"));
    } catch (e) {
      setCreateError(t(errorMessageKey[toApiError(e).kind]));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field field-wide">
      <label htmlFor={`${id}-list`}>
        {t("form.list")} <span className="muted">{t("common.required")}</span>
      </label>
      {lists && lists.length === 0 && <p className="muted small">{t("form.noLists")}</p>}
      <select
        id={`${id}-list`}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t("form.chooseList")}</option>
        {lists?.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} message={error} />
      <div className="inline-form">
        <label htmlFor={`${id}-new`} className="visually-hidden">
          {t("form.newList")}
        </label>
        <input
          id={`${id}-new`}
          placeholder={t("form.newList")}
          value={name}
          dir="auto"
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="button"
          className="button secondary"
          disabled={busy || !name.trim()}
          onClick={() => void create()}
        >
          {t("form.createList")}
        </button>
      </div>
      {createError && <FieldError id={`${id}-create-error`} message={createError} />}
    </div>
  );
}
