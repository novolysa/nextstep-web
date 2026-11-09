"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionList } from "@/components/ActionList";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import type { ActionView } from "@/lib/api/client";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

const VIEWS: ActionView[] = ["today", "upcoming", "completed"];

export default function ActionsPage() {
  const { t, timezone } = useI18n();
  const [view, setView] = useState<ActionView>("today");
  const actions = useResource(
    (api) => api.actions.all(view === "completed" ? { view } : { view, timezone }),
    [view, timezone],
  );
  return (
    <>
      <PageHeader title={t("actions.title")}>
        <Link href="/actions/new" className="button">
          {t("actions.newAction")}
        </Link>
      </PageHeader>
      <div className="filter-bar" role="group" aria-label={t("actions.tabs")}>
        {VIEWS.map((v) => (
          <button key={v} type="button" className="chip" aria-pressed={view === v} onClick={() => setView(v)}>
            {t(`actions.${v}`)}
          </button>
        ))}
        <Link href="/lists" className="chip">
          {t("actions.lists")}
        </Link>
      </div>
      {actions.error && <ErrorState error={actions.error} onRetry={actions.reload} />}
      {actions.loading && !actions.data && <LoadingState />}
      {actions.data &&
        (actions.data.length === 0 ? (
          <EmptyState>
            <p>{t(`actions.empty.${view}`)}</p>
          </EmptyState>
        ) : (
          <ActionList
            actions={actions.data}
            onChanged={(updated) =>
              actions.setData((items) =>
                items
                  ?.map((a) => (a.id === updated.id ? updated : a))
                  .filter((a) => (view === "completed" ? a.completed : !a.completed)),
              )
            }
          />
        ))}
    </>
  );
}
