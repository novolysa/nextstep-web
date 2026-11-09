"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { EmptyState, ErrorState, FieldError, LoadingState, PageHeader } from "@/components/ui";
import { toApiError, type ApiError } from "@/lib/api/errors";
import { useAnnounce, useApi, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function ListsPage() {
  const { t } = useI18n();
  const api = useApi();
  const announce = useAnnounce();
  const id = useId();
  const lists = useResource((a) => a.lists.all(), []);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setNameError(t("form.titleRequired"));
      return;
    }
    setNameError(undefined);
    setBusy(true);
    setError(undefined);
    try {
      const list = await api.lists.create(name.trim());
      lists.setData((items) => [...(items ?? []), list]);
      setName("");
      announce(t("lists.created"));
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t("lists.title")} />
      <form className="card inline-form" onSubmit={create} noValidate>
        <div className="field">
          <label htmlFor={`${id}-name`}>{t("lists.name")}</label>
          <input
            id={`${id}-name`}
            value={name}
            dir="auto"
            maxLength={200}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${id}-error` : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldError id={`${id}-error`} message={nameError} />
        </div>
        <button type="submit" className="button" disabled={busy}>
          {t("lists.create")}
        </button>
      </form>
      {error && <ErrorState error={error} focus />}
      {lists.error && <ErrorState error={lists.error} onRetry={lists.reload} />}
      {lists.loading && !lists.data && <LoadingState />}
      {lists.data &&
        (lists.data.length === 0 ? (
          <EmptyState>
            <p>{t("lists.empty")}</p>
          </EmptyState>
        ) : (
          <ul className="item-list">
            {[...lists.data]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((list) => (
                <li key={list.id} className="item">
                  <Link href={`/lists/${list.id}`} className="item-link">
                    <span className="item-title" dir="auto">
                      {list.name}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        ))}
    </>
  );
}
