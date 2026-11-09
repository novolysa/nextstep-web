"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ActionEditor } from "@/components/ActionEditor";
import { LoadingState, PageHeader } from "@/components/ui";
import { emptyDraft } from "@/lib/action-draft";
import { useAnnounce, useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

function NewAction() {
  const { t, timezone } = useI18n();
  const api = useApi();
  const router = useRouter();
  const announce = useAnnounce();
  const params = useSearchParams();
  const listId = params.get("listId") ?? "";
  const initial = { ...emptyDraft(timezone, listId ? "list_item" : "task"), listId };
  return (
    <>
      <PageHeader title={t("actions.createTitle")} />
      <ActionEditor
        key={timezone}
        initial={initial}
        submitLabel={t("common.save")}
        onCancel={() => router.back()}
        onSubmit={async (input) => {
          const action = await api.actions.create(input);
          announce(t("actions.created"));
          router.push(listId ? `/lists/${listId}` : `/actions/${action.id}`);
          return action;
        }}
      />
    </>
  );
}

export default function NewActionPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <NewAction />
    </Suspense>
  );
}
