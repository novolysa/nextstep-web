"use client";

import { useState } from "react";
import { ActionFields } from "./ActionFields";
import { ErrorState } from "./ui";
import { buildActionInput, draftFieldFor, type ActionDraft, type DraftErrors } from "@/lib/action-draft";
import type { Action, ActionInput } from "@/lib/api/client";
import { toApiError, type ApiError } from "@/lib/api/errors";
import { useAnnounce, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export function ActionEditor({
  initial,
  submitLabel,
  typeLocked,
  onSubmit,
  onCancel,
}: {
  initial: ActionDraft;
  submitLabel: string;
  typeLocked?: boolean;
  onSubmit: (input: ActionInput) => Promise<Action>;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const announce = useAnnounce();
  const lists = useResource((api) => api.lists.all(), []);
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = buildActionInput(draft);
    if (!result.ok) {
      setErrors(result.errors);
      announce(t("errors.validation"), "assertive");
      return;
    }
    setErrors({});
    setError(undefined);
    setBusy(true);
    try {
      await onSubmit(result.input);
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
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} noValidate>
      <ActionFields
        draft={draft}
        onChange={setDraft}
        errors={errors}
        lists={lists.data}
        onListCreated={(list) => lists.setData((items) => [...(items ?? []), list])}
        typeLocked={typeLocked}
      />
      {error && <ErrorState error={error} focus />}
      <div className="button-row">
        <button type="submit" className="button" disabled={busy}>
          {busy ? t("common.saving") : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="button secondary" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
