"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CapturePreview } from "@/components/CapturePreview";
import { SuggestionReview } from "@/components/SuggestionReview";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import type { Action, Suggestion } from "@/lib/api/client";
import { ApiError, toApiError } from "@/lib/api/errors";
import { useAnnounce, useApi, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function CaptureDetailPage() {
  const { captureId } = useParams<{ captureId: string }>();
  const { t, formatDateTime } = useI18n();
  const api = useApi();
  const announce = useAnnounce();
  const router = useRouter();
  const id = useId();
  const capture = useResource((a) => a.captures.get(captureId), [captureId], {
    pollMs: 2500,
    pollWhile: (c) => c.status === "processing",
  });
  const status = capture.data?.status;
  const suggestions = useResource(
    async (a) => (await a.suggestions.all()).filter((s) => s.captureId === captureId),
    [captureId, status],
    { enabled: !!capture.data },
  );
  const lists = useResource((a) => a.lists.all(), []);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<ApiError>();
  const [linkedActions, setLinkedActions] = useState<"keep" | "delete">("keep");
  const [deleting, setDeleting] = useState(false);
  const [acceptedActions, setAcceptedActions] = useState<Record<string, Action>>({});

  if (capture.error && !capture.data)
    return (
      <>
        <PageHeader title={t("detail.title")} />
        <ErrorState error={capture.error} onRetry={capture.reload} focus />
      </>
    );
  if (!capture.data) return <LoadingState />;
  const current = capture.data;

  const retry = async () => {
    setRetrying(true);
    setActionError(undefined);
    try {
      const updated = await api.captures.retry(current.id);
      capture.setData(() => updated);
      announce(t("detail.retried"));
      capture.reload();
    } catch (e) {
      setActionError(toApiError(e));
    } finally {
      setRetrying(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setActionError(undefined);
    try {
      await api.captures.remove(current.id, linkedActions);
      announce(t("detail.deleted"));
      router.push("/");
    } catch (e) {
      setActionError(toApiError(e));
      setDeleting(false);
    }
  };

  const onResolved = (resolved: Suggestion, action?: Action) => {
    if (action) setAcceptedActions((current) => ({ ...current, [resolved.id]: action }));
    suggestions.setData((items) => items?.map((s) => (s.id === resolved.id ? resolved : s)));
  };
  const pending = suggestions.data?.filter((s) => s.status === "needs-review") ?? [];
  const reviewed = suggestions.data?.filter((s) => s.status !== "needs-review") ?? [];

  return (
    <>
      <PageHeader title={t("detail.title")}>
        <StatusBadge status={current.status} />
      </PageHeader>
      <p className="muted">{t("detail.capturedAt", { date: formatDateTime(current.createdAt) })}</p>
      {actionError && <ErrorState error={actionError} focus />}

      <div className="detail-layout">
        <section className="card" aria-labelledby={`${id}-original`}>
          <h2 id={`${id}-original`}>{t("detail.original")}</h2>
          <CapturePreview captureId={current.id} />
        </section>

        <section aria-labelledby={`${id}-suggestions`} className="suggestions">
          <h2 id={`${id}-suggestions`}>{t("detail.suggestionsTitle")}</h2>
          {current.status === "processing" && (
            <div className="notice" role="status" data-testid="processing">
              <span className="pulse" aria-hidden="true" /> {t("detail.processingNote")}
            </div>
          )}
          {current.status === "failed" && (
            <div className="notice notice-error" role="alert" data-testid="failed">
              <p>{t("detail.failedNote")}</p>
              {current.failure && (
                <ErrorState
                  error={new ApiError("unknown", undefined, current.failure.code, current.failure.requestId)}
                />
              )}
              <button type="button" className="button" disabled={retrying} onClick={() => void retry()}>
                {t("detail.retry")}
              </button>
            </div>
          )}
          {suggestions.error && <ErrorState error={suggestions.error} onRetry={suggestions.reload} />}
          {current.status !== "processing" && suggestions.loading && !suggestions.data && <LoadingState />}
          {suggestions.data &&
            current.status !== "processing" &&
            current.status !== "failed" &&
            pending.length === 0 &&
            reviewed.length === 0 && (
              <EmptyState>
                <p>{t("detail.noSuggestions")}</p>
              </EmptyState>
            )}
          {pending.map((suggestion) => (
            <SuggestionReview
              key={suggestion.id}
              suggestion={suggestion}
              lists={lists.data}
              onListCreated={(list) => lists.setData((items) => [...(items ?? []), list])}
              onResolved={onResolved}
            />
          ))}
          {reviewed.length > 0 && (
            <>
              <h3>{t("detail.reviewedTitle")}</h3>
              <ul className="item-list">
                {reviewed.map((s) => {
                  const action = acceptedActions[s.id];
                  return (
                    <li key={s.id} className="item">
                      <div className="item-body">
                        <span className="item-title" dir="auto">
                          {action?.title ?? s.title}
                        </span>
                        {action && (
                          <Link
                            href={`/actions/${action.id}`}
                            aria-label={`${t("review.viewAction")}: ${action.title}`}
                          >
                            {t("review.viewAction")}
                          </Link>
                        )}
                      </div>
                      <StatusBadge status={s.status === "accepted" ? "accepted" : "dismissed"} />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>

      <section className="card danger-zone" aria-labelledby={`${id}-delete`}>
        <h2 id={`${id}-delete`}>{t("detail.deleteTitle")}</h2>
        <fieldset>
          <legend>{t("detail.deleteBody")}</legend>
          {(["keep", "delete"] as const).map((choice) => (
            <label key={choice} className="choice">
              <input
                type="radio"
                name={`${id}-linked`}
                value={choice}
                checked={linkedActions === choice}
                onChange={() => setLinkedActions(choice)}
              />
              {t(choice === "keep" ? "detail.keepActions" : "detail.deleteActions")}
            </label>
          ))}
        </fieldset>
        <button type="button" className="button danger" disabled={deleting} onClick={() => void remove()}>
          {t("detail.confirmDelete")}
        </button>
      </section>
    </>
  );
}
