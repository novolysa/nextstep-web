"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ActionEditor } from "@/components/ActionEditor";
import { actionWhen } from "@/components/ActionList";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { draftFromAction } from "@/lib/action-draft";
import { toApiError, type ApiError } from "@/lib/api/errors";
import { useAnnounce, useApi, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function ActionDetailPage() {
  const { actionId } = useParams<{ actionId: string }>();
  const { t, timezone, formatDateTime } = useI18n();
  const api = useApi();
  const router = useRouter();
  const announce = useAnnounce();
  const action = useResource((a) => a.actions.get(actionId), [actionId]);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<ApiError>();

  if (action.error && !action.data)
    return (
      <>
        <PageHeader title={t("actions.detailTitle")} />
        <ErrorState error={action.error} onRetry={action.reload} focus />
      </>
    );
  if (!action.data) return <LoadingState />;
  const current = action.data;
  const fmt = (instant: string) => formatDateTime(instant, current.timezone, { timeZoneName: "short" });

  const complete = async () => {
    setError(undefined);
    try {
      const updated = await api.actions.complete(current.id);
      action.setData(() => updated);
      announce(t("actions.completedAnnouncement", { title: current.title }));
    } catch (e) {
      setError(toApiError(e));
    }
  };
  const remove = async () => {
    setError(undefined);
    try {
      await api.actions.remove(current.id);
      announce(t("actions.deleted"));
      router.push("/actions");
    } catch (e) {
      setError(toApiError(e));
    }
  };

  if (editing)
    return (
      <>
        <PageHeader title={t("actions.editTitle")} />
        <ActionEditor
          initial={draftFromAction(current, timezone)}
          typeLocked
          submitLabel={t("common.save")}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            const updated = await api.actions.update(current.id, input);
            action.setData(() => updated);
            setEditing(false);
            announce(t("actions.saved"));
            return updated;
          }}
        />
      </>
    );

  return (
    <>
      <PageHeader title={current.title}>{current.completed && <StatusBadge status="completed" />}</PageHeader>
      {error && <ErrorState error={error} focus />}
      <section className="card">
        <dl className="details">
          <dt>{t("form.type")}</dt>
          <dd>{t(`actionTypes.${current.type}`)}</dd>
          {current.details && (
            <>
              <dt>{t("form.details")}</dt>
              <dd dir="auto" className="prewrap">
                {current.details}
              </dd>
            </>
          )}
          {current.startAt && (
            <>
              <dt>{t("form.startAt")}</dt>
              <dd>{fmt(current.startAt)}</dd>
            </>
          )}
          {current.endAt && (
            <>
              <dt>{t("form.endAt")}</dt>
              <dd>{fmt(current.endAt)}</dd>
            </>
          )}
          {current.dueAt && (
            <>
              <dt>{t("form.dueDate")}</dt>
              <dd>{fmt(current.dueAt)}</dd>
            </>
          )}
          {current.remindAt && (
            <>
              <dt>{t("form.remindAt")}</dt>
              <dd>{fmt(current.remindAt)}</dd>
            </>
          )}
          {current.timezone && (
            <>
              <dt>{t("form.timezone")}</dt>
              <dd>{current.timezone.replaceAll("_", " ")}</dd>
            </>
          )}
          {current.listId && (
            <>
              <dt>{t("form.list")}</dt>
              <dd>
                <Link href={`/lists/${current.listId}`}>{t("lists.items")}</Link>
              </dd>
            </>
          )}
        </dl>
        {current.sourceCaptureDeleted ? (
          <p className="muted">{t("actions.sourceDeleted")}</p>
        ) : (
          current.sourceCaptureId && (
            <p>
              <Link href={`/captures/${current.sourceCaptureId}`}>{t("actions.viewSource")}</Link>
            </p>
          )
        )}
        <p className="visually-hidden">{actionWhen(current, fmt, t)}</p>
        <div className="button-row">
          {!current.completed && (
            <button type="button" className="button" onClick={() => void complete()}>
              {t("actions.complete", { title: current.title })}
            </button>
          )}
          <button type="button" className="button secondary" onClick={() => setEditing(true)}>
            {t("common.edit")}
          </button>
          <button type="button" className="button danger" onClick={() => setConfirmDelete(true)}>
            {t("common.delete")}
          </button>
        </div>
        {confirmDelete && (
          <div className="notice notice-error" role="alertdialog" aria-labelledby="delete-confirm">
            <p id="delete-confirm">{t("actions.deleteConfirm")}</p>
            <div className="button-row">
              <button type="button" className="button danger" onClick={() => void remove()}>
                {t("common.delete")}
              </button>
              <button type="button" className="button secondary" onClick={() => setConfirmDelete(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
