"use client";

import { useEffect, useState } from "react";
import { toApiError, type ApiError } from "@/lib/api/errors";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { sniff } from "@/lib/media";
import { ErrorState, LoadingState } from "./ui";

type Preview =
  | { kind: "text"; text: string }
  | { kind: "image" | "audio"; url: string }
  | { kind: "download"; url: string; note?: "pdf" };

/**
 * Shows the original capture using an authorized, short-lived retrieval. Object URLs are
 * local to this page and revoked on unmount; no permanent storage URL is ever used.
 */
export function CapturePreview({ captureId, reloadKey }: { captureId: string; reloadKey?: string }) {
  const { t } = useI18n();
  const api = useApi();
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${captureId}:${attempt}:${reloadKey ?? ""}`;
  const [result, setResult] = useState<{ key: string; preview?: Preview; error?: ApiError }>();
  // Results from an earlier capture or attempt are ignored while the new one loads.
  const current = result?.key === requestKey ? result : undefined;
  const preview = current?.preview;
  const error = current?.error;
  const setPreview = (p: Preview) => setResult({ key: requestKey, preview: p });

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    api.captures
      .content(captureId)
      .then(({ bytes, contentType }) => {
        if (cancelled) return;
        if (contentType.toLowerCase().startsWith("text/plain")) {
          setPreview({ kind: "text", text: new TextDecoder("utf-8", { fatal: false }).decode(bytes) });
          return;
        }
        const detected = sniff(bytes);
        const renderable = (detected.kind === "image" && detected.type !== "image/heic") || detected.kind === "audio";
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const blob = new Blob([buffer], { type: renderable ? detected.type : "application/octet-stream" });
        url = URL.createObjectURL(blob);
        if (renderable) setPreview({ kind: detected.kind as "image" | "audio", url });
        else setPreview({ kind: "download", url, note: detected.kind === "document" ? "pdf" : undefined });
      })
      .catch((e) => {
        if (!cancelled) setResult({ key: requestKey, error: toApiError(e) });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey captures every input
  }, [api, requestKey]);

  if (error)
    return (
      <div>
        <p className="muted">{t("detail.originalUnavailable")}</p>
        <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
      </div>
    );
  if (!preview) return <LoadingState label={t("detail.previewLoading")} />;
  switch (preview.kind) {
    case "text":
      return (
        <pre className="original-text" dir="auto" aria-label={t("detail.originalText")}>
          {preview.text}
        </pre>
      );
    case "image":
      // eslint-disable-next-line @next/next/no-img-element -- local object URL, not optimizable
      return <img className="original-image" src={preview.url} alt={t("detail.original")} />;
    case "audio":
      return <audio className="original-audio" controls src={preview.url} aria-label={t("detail.original")} />;
    case "download":
      return (
        <div>
          {preview.note === "pdf" && <p className="muted small">{t("detail.pdfNote")}</p>}
          <a className="button secondary" href={preview.url} download={`capture-${captureId}`}>
            {t("detail.downloadOriginal")}
          </a>
        </div>
      );
  }
}
