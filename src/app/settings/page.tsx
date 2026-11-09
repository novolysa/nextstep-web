"use client";

import { useEffect, useId, useState } from "react";
import { useBrowserValue } from "@/lib/browser";
import { TimezoneField } from "@/components/ActionFields";
import { ErrorState, PageHeader, UnavailableState } from "@/components/ui";
import type { RequestStatus } from "@/lib/api/client";
import { toApiError, type ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAnnounce, useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { browserTimezone } from "@/lib/time";

// Formatting locales offered for display; text stays English until catalogs are added.
const LOCALES = [
  "en-US",
  "en-GB",
  "en-IN",
  "de-DE",
  "fr-FR",
  "es-ES",
  "pt-BR",
  "ja-JP",
  "zh-CN",
  "hi-IN",
  "ar-EG",
  "he-IL",
];

function DisplayForm() {
  const { t, settings, setSettings, locale } = useI18n();
  const announce = useAnnounce();
  const id = useId();
  const [draftLocale, setDraftLocale] = useState(settings.locale ?? "");
  const [draftTimezone, setDraftTimezone] = useState(settings.timezone ?? "");
  const browserLocale = useBrowserValue(() => navigator.language, "en");
  const browserZone = useBrowserValue(browserTimezone, "UTC");
  const api = useApi();
  const [serverPrefs, setServerPrefs] = useState<"loading" | "available" | "unavailable">("loading");
  useEffect(() => {
    api.preferences
      .get()
      .then(() => setServerPrefs("available"))
      .catch(() => setServerPrefs("unavailable"));
  }, [api]);
  return (
    <form
      className="card"
      aria-labelledby={`${id}-display`}
      onSubmit={(e) => {
        e.preventDefault();
        setSettings({ locale: draftLocale || undefined, timezone: draftTimezone || undefined });
        announce(t("settings.displaySaved"));
      }}
    >
      <h2 id={`${id}-display`}>{t("settings.displayTitle")}</h2>
      {serverPrefs === "unavailable" && <p className="notice">{t("settings.deviceOnly")}</p>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${id}-locale`}>{t("settings.locale")}</label>
          <select
            id={`${id}-locale`}
            value={draftLocale}
            aria-describedby={`${id}-locale-hint`}
            onChange={(e) => setDraftLocale(e.target.value)}
          >
            <option value="">{t("settings.systemDefault", { value: browserLocale })}</option>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {new Intl.DisplayNames([locale], { type: "language" }).of(l) ?? l} ({l})
              </option>
            ))}
          </select>
          <p className="muted small" id={`${id}-locale-hint`}>
            {t("settings.localeHint")}
          </p>
        </div>
        <TimezoneField
          label={t("settings.timezone")}
          value={draftTimezone || browserZone}
          hint={t("settings.timezoneHint")}
          onChange={setDraftTimezone}
        />
      </div>
      <div className="button-row">
        <button type="submit" className="button">
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { t, settings } = useI18n();
  const { displayName, signOut } = useAuth();
  const api = useApi();
  const announce = useAnnounce();
  const id = useId();
  const permission = useBrowserValue(
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    "unsupported",
  );
  const [exportState, setExportState] = useState<RequestStatus | "unavailable">();
  const [deletionState, setDeletionState] = useState<RequestStatus | "unavailable">();
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<ApiError>();

  const request = async (
    operation: () => Promise<RequestStatus>,
    set: (value: RequestStatus | "unavailable") => void,
  ) => {
    setError(undefined);
    try {
      set(await operation());
    } catch (e) {
      const apiError = toApiError(e);
      if (apiError.kind === "unavailable") {
        set("unavailable");
        announce(t("settings.serviceUnavailable"));
      } else setError(apiError);
    }
  };

  return (
    <>
      <PageHeader title={t("settings.title")} />
      {error && <ErrorState error={error} focus />}

      <DisplayForm key={JSON.stringify(settings)} />

      <section className="card" aria-labelledby={`${id}-notifications`}>
        <h2 id={`${id}-notifications`}>{t("settings.notificationsTitle")}</h2>
        <p>
          {t("settings.notificationsStatus", {
            status: t(
              `settings.permission.${(["granted", "denied", "default"].includes(permission) ? permission : "unsupported") as "granted"}`,
            ),
          })}
        </p>
        <p className="muted">{t("settings.notificationsUnavailable")}</p>
      </section>

      <section className="card" aria-labelledby={`${id}-export`}>
        <h2 id={`${id}-export`}>{t("settings.exportTitle")}</h2>
        <p>{t("settings.exportBody")}</p>
        {exportState === "unavailable" ? (
          <UnavailableState message="settings.serviceUnavailable" />
        ) : exportState ? (
          <p role="status">
            {t("settings.exportStatus", { status: t(`settings.requestStatus.${exportState.status}`) })}
          </p>
        ) : null}
        <button
          type="button"
          className="button secondary"
          onClick={() => void request(() => api.exports.request(), setExportState)}
        >
          {t("settings.requestExport")}
        </button>
      </section>

      <section className="card danger-zone" aria-labelledby={`${id}-delete`}>
        <h2 id={`${id}-delete`}>{t("settings.deleteTitle")}</h2>
        <p>{t("settings.deleteBody")}</p>
        {deletionState === "unavailable" ? (
          <UnavailableState message="settings.serviceUnavailable" />
        ) : deletionState ? (
          <p role="status">
            {t("settings.deletionStatus", { status: t(`settings.requestStatus.${deletionState.status}`) })}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor={`${id}-confirm`}>{t("settings.deleteConfirmLabel")}</label>
          <input
            id={`${id}-confirm`}
            value={confirmText}
            autoComplete="off"
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="button danger"
          disabled={confirmText !== t("settings.deleteConfirmWord")}
          onClick={() => void request(() => api.account.requestDeletion(), setDeletionState)}
        >
          {t("settings.requestDeletion")}
        </button>
      </section>

      <section className="card" aria-labelledby={`${id}-account`}>
        <h2 id={`${id}-account`}>{t("settings.accountTitle")}</h2>
        {displayName && <p>{t("settings.signedInAs", { name: displayName })}</p>}
        <button type="button" className="button secondary" onClick={() => void signOut()}>
          {t("nav.signOut")}
        </button>
      </section>
    </>
  );
}
