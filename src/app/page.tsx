"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import type { Capture } from "@/lib/api/client";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

const FILTERS = ["all", "needs-review", "processing", "failed", "completed", "dismissed"] as const;
type Filter = (typeof FILTERS)[number];

export default function InboxPage() {
  const { t, plural, formatDateTime } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const captures = useResource((api) => api.captures.all(), [], {
    pollMs: 3000,
    pollWhile: (items) => items.some((c) => c.status === "processing"),
  });
  const visible = useMemo(() => {
    const sorted = [...(captures.data ?? [])].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id),
    );
    return filter === "all" ? sorted : sorted.filter((c) => c.status === filter);
  }, [captures.data, filter]);
  const processing = captures.data?.some((c) => c.status === "processing");

  return (
    <>
      <PageHeader title={t("inbox.title")}>
        <Link href="/capture" className="button">
          {t("inbox.newCapture")}
        </Link>
      </PageHeader>
      <p className="muted">{t("inbox.intro")}</p>
      <div className="filter-bar" role="group" aria-label={t("inbox.filterLabel")}>
        {FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`inbox.filters.${f}`)}
          </button>
        ))}
      </div>
      {captures.error && !captures.data && <ErrorState error={captures.error} onRetry={captures.reload} />}
      {captures.loading && !captures.data && <LoadingState />}
      {captures.data && (
        <>
          <p className="muted small" role="status">
            {plural("inbox.countLabel", visible.length)}
            {processing ? ` · ${t("inbox.processingUpdates")}` : ""}
          </p>
          {captures.error && <ErrorState error={captures.error} onRetry={captures.reload} />}
          {visible.length === 0 ? (
            <EmptyState>
              <p>{filter === "all" ? t("inbox.empty") : t("inbox.emptyFiltered")}</p>
              {filter === "all" && (
                <Link href="/capture" className="button">
                  {t("inbox.newCapture")}
                </Link>
              )}
            </EmptyState>
          ) : (
            <ul className="item-list" data-testid="capture-list">
              {visible.map((capture: Capture) => {
                const date = formatDateTime(capture.createdAt);
                return (
                  <li key={capture.id} className="item">
                    <Link href={`/captures/${capture.id}`} className="item-link">
                      <span className="item-title">{t("inbox.capturedAt", { date })}</span>
                      <span className="visually-hidden">{t("inbox.open", { date })}</span>
                    </Link>
                    <StatusBadge status={capture.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
