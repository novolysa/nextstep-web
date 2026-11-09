"use client";

import { useParams, useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ActionList } from "@/components/ActionList";
import { EmptyState, ErrorState, FieldError, LoadingState, PageHeader } from "@/components/ui";
import { toApiError, type ApiError } from "@/lib/api/errors";
import { useAnnounce, useApi, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function ListDetailPage() {
  const { listId } = useParams<{ listId: string }>();
  const { t } = useI18n();
  const api = useApi();
  const router = useRouter();
  const announce = useAnnounce();
  const id = useId();
  const list = useResource((a) => a.lists.get(listId), [listId]);
  const items = useResource((a) => a.actions.all({ listId }), [listId]);
  const [item, setItem] = useState("");
  const [itemError, setItemError] = useState<string>();
  const [renaming, setRenaming] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<ApiError>();

  if (list.error && !list.data)
    return (
      <>
        <PageHeader title={t("lists.title")} />
        <ErrorState error={list.error} onRetry={list.reload} focus />
      </>
    );
  if (!list.data) return <LoadingState />;
  const current = list.data;

  const run = async (operation: () => Promise<void>) => {
    setError(undefined);
    try {
      await operation();
    } catch (e) {
      setError(toApiError(e));
    }
  };
  const add = (event: React.FormEvent) => {
    event.preventDefault();
    if (!item.trim()) {
      setItemError(t("form.titleRequired"));
      return;
    }
    setItemError(undefined);
    void run(async () => {
      const created = await api.actions.create({ type: "list_item", title: item.trim(), listId });
      items.setData((current) => [...(current ?? []), created]);
      setItem("");
      announce(t("lists.itemAdded"));
    });
  };

  return (
    <>
      <PageHeader title={current.name}>
        <button type="button" className="button secondary" onClick={() => setRenaming(current.name)}>
          {t("lists.rename")}
        </button>
        <button type="button" className="button danger" onClick={() => setConfirmDelete(true)}>
          {t("common.delete")}
        </button>
      </PageHeader>
      {error && <ErrorState error={error} focus />}
      {renaming !== undefined && (
        <form
          className="card inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!renaming.trim()) return;
            void run(async () => {
              const updated = await api.lists.rename(listId, renaming.trim());
              list.setData(() => updated);
              setRenaming(undefined);
              announce(t("lists.renamed"));
            });
          }}
        >
          <div className="field">
            <label htmlFor={`${id}-rename`}>{t("lists.name")}</label>
            <input
              id={`${id}-rename`}
              value={renaming}
              dir="auto"
              maxLength={200}
              onChange={(e) => setRenaming(e.target.value)}
            />
          </div>
          <button type="submit" className="button">
            {t("common.save")}
          </button>
          <button type="button" className="button secondary" onClick={() => setRenaming(undefined)}>
            {t("common.cancel")}
          </button>
        </form>
      )}
      {confirmDelete && (
        <div className="notice notice-error" role="alertdialog" aria-labelledby={`${id}-delete`}>
          <p id={`${id}-delete`}>{t("lists.deleteConfirm")}</p>
          <div className="button-row">
            <button
              type="button"
              className="button danger"
              onClick={() =>
                void run(async () => {
                  await api.lists.remove(listId);
                  announce(t("lists.deleted"));
                  router.push("/lists");
                })
              }
            >
              {t("common.delete")}
            </button>
            <button type="button" className="button secondary" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      <form className="card inline-form" onSubmit={add} noValidate>
        <div className="field">
          <label htmlFor={`${id}-item`}>{t("lists.itemTitle")}</label>
          <input
            id={`${id}-item`}
            value={item}
            dir="auto"
            maxLength={500}
            aria-invalid={itemError ? true : undefined}
            aria-describedby={itemError ? `${id}-item-error` : undefined}
            onChange={(e) => setItem(e.target.value)}
          />
          <FieldError id={`${id}-item-error`} message={itemError} />
        </div>
        <button type="submit" className="button">
          {t("lists.addItem")}
        </button>
      </form>
      <h2>{t("lists.items")}</h2>
      {items.error && <ErrorState error={items.error} onRetry={items.reload} />}
      {items.loading && !items.data && <LoadingState />}
      {items.data &&
        (items.data.length === 0 ? (
          <EmptyState>
            <p>{t("lists.noItems")}</p>
          </EmptyState>
        ) : (
          <ActionList
            actions={items.data}
            onChanged={(updated) => items.setData((all) => all?.map((a) => (a.id === updated.id ? updated : a)))}
          />
        ))}
    </>
  );
}
