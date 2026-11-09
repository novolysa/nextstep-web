"use client";

import { useId, useState } from "react";
import { TimezoneField } from "./ActionFields";
import { FieldError } from "./ui";
import { useAnnounce } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

/** Explicit, user-driven helpers for reviewing many suggestions from one capture. */
export function BulkReviewTools({
  count,
  onApplyDate,
  onDismissAll,
}: {
  count: number;
  onApplyDate: (date: string, timezone: string) => number;
  onDismissAll: () => Promise<void>;
}) {
  const { t, plural, timezone: defaultTimezone } = useI18n();
  const announce = useAnnounce();
  const id = useId();
  const [date, setDate] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <section className="card bulk-tools" aria-labelledby={`${id}-title`} data-testid="bulk-tools">
      <h3 id={`${id}-title`}>{t("detail.bulkTitle")}</h3>
      <p className="muted small">{t("detail.bulkIntro")}</p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${id}-date`}>{t("detail.bulkDate")}</label>
          <input
            id={`${id}-date`}
            type="date"
            value={date}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => {
              setDate(e.target.value);
              setError(undefined);
            }}
          />
          <FieldError id={`${id}-error`} message={error} />
        </div>
        <TimezoneField value={timezone} onChange={setTimezone} />
      </div>
      <div className="button-row">
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            if (!date) {
              setError(t("detail.bulkDateRequired"));
              return;
            }
            const applied = onApplyDate(date, timezone);
            announce(plural("detail.bulkApplied", applied));
          }}
        >
          {t("detail.bulkApply")}
        </button>
        <button type="button" className="button link" onClick={() => setConfirming(true)}>
          {t("detail.dismissAll")}
        </button>
      </div>
      {confirming && (
        <div className="notice notice-warning" role="alertdialog" aria-labelledby={`${id}-confirm`}>
          <p id={`${id}-confirm`}>{t("detail.dismissAllConfirm", { count })}</p>
          <div className="button-row">
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDismissAll();
                  announce(t("detail.dismissAllDone"));
                } finally {
                  setBusy(false);
                  setConfirming(false);
                }
              }}
            >
              {t("detail.dismissAll")}
            </button>
            <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
