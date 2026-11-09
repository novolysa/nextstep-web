"use client";

import Link from "next/link";
import { useState } from "react";
import type { Action } from "@/lib/api/client";
import { toApiError, type ApiError } from "@/lib/api/errors";
import { useAnnounce, useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { ErrorState } from "./ui";

export function actionWhen(
  action: Action,
  format: (instant: string, tz?: string) => string,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (action.startAt) return t("actions.starts", { date: format(action.startAt, action.timezone) });
  if (action.dueAt) return t("actions.due", { date: format(action.dueAt, action.timezone) });
  if (action.remindAt) return t("actions.remind", { date: format(action.remindAt, action.timezone) });
  return undefined;
}

export function ActionList({ actions, onChanged }: { actions: Action[]; onChanged: (action: Action) => void }) {
  return (
    <ul className="item-list" data-testid="action-list">
      {actions.map((action) => (
        <ActionRow key={action.id} action={action} onChanged={onChanged} />
      ))}
    </ul>
  );
}

function ActionRow({ action, onChanged }: { action: Action; onChanged: (action: Action) => void }) {
  const { t, formatDateTime } = useI18n();
  const api = useApi();
  const announce = useAnnounce();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const when = actionWhen(action, (i, tz) => formatDateTime(i, tz, { timeZoneName: "short" }), t);
  const complete = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const updated = await api.actions.complete(action.id);
      announce(t("actions.completedAnnouncement", { title: action.title }));
      onChanged(updated);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="item action-item">
      {action.completed ? (
        <span className="check done" aria-label={t("actions.completedLabel")} role="img">
          ✓
        </span>
      ) : (
        <button
          type="button"
          className="check"
          disabled={busy}
          onClick={() => void complete()}
          aria-label={t("actions.complete", { title: action.title })}
        />
      )}
      <div className="item-body">
        <Link href={`/actions/${action.id}`} className="item-link">
          <span className="item-title" dir="auto">
            {action.title}
          </span>
        </Link>
        <span className="muted small">
          {t(`actionTypes.${action.type}`)}
          {when ? ` · ${when}` : ""}
          {action.sourceCaptureDeleted
            ? ` · ${t("actions.sourceDeleted")}`
            : action.sourceCaptureId
              ? ` · ${t("actions.fromCapture")}`
              : ""}
        </span>
        {error && <ErrorState error={error} onRetry={() => void complete()} />}
      </div>
    </li>
  );
}
