"use client";

import { useEffect, useRef } from "react";
import { ApiError, errorMessageKey, isRetryable } from "@/lib/api/errors";
import { useI18n, type MessageKey } from "@/lib/i18n";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label ?? t("common.loading")}</span>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  focus = false,
}: {
  error: ApiError;
  onRetry?: () => void;
  focus?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus, error]);
  return (
    <div className="state state-error" role="alert" tabIndex={-1} ref={ref} data-error-kind={error.kind}>
      <p>{t(errorMessageKey[error.kind])}</p>
      {error.fieldErrors.length > 0 && (
        <ul>
          {error.fieldErrors.map((f) => (
            <li key={`${f.field}:${f.message}`}>
              <code>{f.field}</code>: {f.message}
            </li>
          ))}
        </ul>
      )}
      {error.requestId && <p className="muted small">{t("common.requestId", { id: error.requestId })}</p>}
      {onRetry && (isRetryable(error) || error.kind === "unknown") && (
        <button type="button" className="button secondary" onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

export function UnavailableState({ message }: { message: MessageKey }) {
  const { t } = useI18n();
  return (
    <div className="state state-unavailable" role="note">
      <p className="state-title">{t("common.notAvailableTitle")}</p>
      <p>{t(message)}</p>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="state state-empty">{children}</div>;
}

export type Status = "processing" | "needs-review" | "completed" | "failed" | "dismissed" | "accepted";

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useI18n();
  return (
    <span className={`badge badge-${status}`}>
      {status === "processing" && <span className="pulse" aria-hidden="true" />}
      {t(`status.${status}`)}
    </span>
  );
}

// Focus moves to the heading only after client-side navigation, never on first load,
// so the skip link stays the first tab stop.
let initialPage = true;

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} · NextStep`;
  }, [title]);
  useEffect(() => {
    // Move focus to the page heading after client navigation for screen-reader users.
    if (initialPage) {
      initialPage = false;
      return;
    }
    if (document.activeElement === document.body || document.activeElement?.closest("nav")) ref.current?.focus();
  }, [title]);
  return (
    <div className="page-header">
      <h1 tabIndex={-1} ref={ref}>
        {title}
      </h1>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field-error" id={id}>
      {message}
    </p>
  );
}

export function formatBytes(bytes: number, locale: string): string {
  const units = ["byte", "kilobyte", "megabyte"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: units[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}
