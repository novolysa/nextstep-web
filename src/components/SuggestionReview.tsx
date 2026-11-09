"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ActionFields } from "./ActionFields";
import { ErrorState, FieldError, StatusBadge } from "./ui";
import {
  proposeDate,
  applyDate,
  buildActionInput,
  DATE_FIELDS,
  draftFieldFor,
  draftFromSuggestion,
  type ActionDraft,
  type DraftErrors,
} from "@/lib/action-draft";
import type { Action, List, Suggestion } from "@/lib/api/client";
import { ApiError, toApiError } from "@/lib/api/errors";
import { useAnnounce, useApi, useIdempotencyKey } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

const LOW_CONFIDENCE = 0.6;

/** Highlight the extracted date text inside the evidence without interpreting markup. */
function Evidence({ text, highlight }: { text: string; highlight?: string }) {
  const index = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{highlight}</mark>
      {text.slice(index + highlight.length)}
    </>
  );
}

export function SuggestionReview({
  suggestion,
  lists,
  onListCreated,
  onResolved,
  registerDateApplier,
}: {
  /** Lets the page apply one date to every open review (an explicit user action). */
  registerDateApplier?: (id: string, apply: (date: string, timezone: string) => void) => () => void;
  suggestion: Suggestion;
  lists: List[] | undefined;
  onListCreated: (list: List) => void;
  onResolved: (suggestion: Suggestion, action?: Action) => void;
}) {
  const { t, timezone, locale, formatDateTime, formatDate } = useI18n();
  const proposal = suggestion.date?.candidateInstant ? undefined : proposeDate(suggestion, timezone);
  const api = useApi();
  const announce = useAnnounce();
  const id = useId();
  const [draft, setDraft] = useState<ActionDraft>(() => draftFromSuggestion(suggestion, timezone));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [dateConfirmed, setDateConfirmed] = useState(false);
  const [confirmMissing, setConfirmMissing] = useState(false);
  const [busy, setBusy] = useState<"accept" | "dismiss">();
  const [error, setError] = useState<ApiError>();
  const [accepted, setAccepted] = useState<Action>();
  const built = buildActionInput(draft);
  // Same key for retries of an identical request; a new key once the reviewed values change.
  const idempotencyKey = useIdempotencyKey(built.ok ? JSON.stringify(built.input) : "invalid");
  const hasDate =
    DATE_FIELDS[draft.type].length > 0 && (Boolean(suggestion.date) || (built.ok && Boolean(built.input.timezone)));

  useEffect(
    () =>
      registerDateApplier?.(suggestion.id, (date, timezone) => {
        setDraft((current) => applyDate(current, date, timezone));
        setDateConfirmed(false);
      }),
    [registerDateApplier, suggestion.id],
  );

  const accept = async () => {
    const result = buildActionInput(draft);
    if (!result.ok) {
      setErrors(result.errors);
      announce(t("errors.validation"), "assertive");
      return;
    }
    if (hasDate && !dateConfirmed) {
      announce(t("review.confirmDateRequired"), "assertive");
      setErrors({});
      setError(undefined);
      setConfirmMissing(true);
      document.getElementById(`${id}-confirm`)?.focus();
      return;
    }
    setErrors({});
    setBusy("accept");
    setError(undefined);
    try {
      const action = await api.suggestions.accept(suggestion.id, result.input, idempotencyKey);
      setAccepted(action);
      announce(t("review.accepted", { title: action.title }));
      onResolved({ ...suggestion, status: "accepted" }, action);
    } catch (e) {
      const apiError = toApiError(e);
      const fieldErrors: DraftErrors = {};
      for (const f of apiError.fieldErrors) {
        const field = draftFieldFor(f.field);
        if (field) fieldErrors[field] = "errors.validation";
      }
      setErrors(fieldErrors);
      setError(apiError);
    } finally {
      setBusy(undefined);
    }
  };

  const dismiss = async () => {
    setBusy("dismiss");
    setError(undefined);
    try {
      await api.suggestions.dismiss(suggestion.id);
      announce(t("review.dismissed"));
      onResolved({ ...suggestion, status: "dismissed" });
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setBusy(undefined);
    }
  };

  const confidence = new Intl.NumberFormat(locale, { style: "percent" }).format(suggestion.confidence);
  if (accepted)
    return (
      <article className="card suggestion" aria-labelledby={`${id}-heading`}>
        <h3 id={`${id}-heading`}>{accepted.title}</h3>
        <p>
          <StatusBadge status="accepted" /> {t("review.accepted", { title: accepted.title })}
        </p>
        <Link className="button secondary" href={`/actions/${accepted.id}`}>
          {t("review.viewAction")}
        </Link>
      </article>
    );

  return (
    <article className="card suggestion" aria-labelledby={`${id}-heading`} data-testid="suggestion">
      <header className="suggestion-header">
        <h3 id={`${id}-heading`}>{t("review.heading", { type: t(`actionTypes.${suggestion.type}`).toLowerCase() })}</h3>
        <span className={suggestion.confidence < LOW_CONFIDENCE ? "badge badge-warning" : "badge"}>
          {t("review.confidence", { value: confidence })}
        </span>
      </header>
      {suggestion.confidence < LOW_CONFIDENCE && <p className="notice notice-warning">{t("review.lowConfidence")}</p>}
      {suggestion.evidence && (
        <figure className="evidence">
          <figcaption>{t("review.evidence")}</figcaption>
          <blockquote dir="auto">
            <Evidence text={suggestion.evidence} highlight={suggestion.date?.extractedText} />
          </blockquote>
        </figure>
      )}
      {(suggestion.date || proposal) && (
        <div className={!suggestion.date || suggestion.date.ambiguous ? "notice notice-warning" : "notice"}>
          {suggestion.date && <p>{t("review.extractedDate", { text: suggestion.date.extractedText })}</p>}
          <p>
            {proposal
              ? t("review.dateProposed", { date: formatDate(`${proposal.date}T12:00:00Z`, "UTC"), text: proposal.from })
              : !suggestion.date || suggestion.date.ambiguous || !suggestion.date.candidateInstant
                ? t("review.dateAmbiguous")
                : t("review.dateSuggested", {
                    value: formatDateTime(suggestion.date.candidateInstant, suggestion.date.timezone, {
                      timeZoneName: "short",
                    }),
                  })}
          </p>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void accept();
        }}
        noValidate
      >
        <ActionFields
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            setDateConfirmed(false);
          }}
          errors={errors}
          lists={lists}
          onListCreated={onListCreated}
        />
        {hasDate && (
          <label className="choice confirm">
            <input
              id={`${id}-confirm`}
              type="checkbox"
              checked={dateConfirmed}
              aria-invalid={confirmMissing && !dateConfirmed ? true : undefined}
              aria-describedby={confirmMissing && !dateConfirmed ? `${id}-confirm-error` : undefined}
              onChange={(e) => {
                setDateConfirmed(e.target.checked);
                if (e.target.checked) setConfirmMissing(false);
              }}
            />
            {t("review.confirmDate")}
          </label>
        )}
        {hasDate && confirmMissing && !dateConfirmed && (
          <FieldError id={`${id}-confirm-error`} message={t("review.confirmDateRequired")} />
        )}
        {error && <ErrorState error={error} focus onRetry={() => void accept()} />}
        <p className="muted small">{t("review.nothingSaved")}</p>
        <div className="button-row">
          <button type="submit" className="button" disabled={!!busy}>
            {busy === "accept" ? t("review.accepting") : t("review.accept")}
          </button>
          <button type="button" className="button secondary" disabled={!!busy} onClick={() => void dismiss()}>
            {busy === "dismiss" ? t("review.dismissing") : t("review.dismiss")}
          </button>
        </div>
      </form>
    </article>
  );
}
