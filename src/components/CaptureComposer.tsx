"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useBrowserValue } from "@/lib/browser";
import { ApiError, errorMessageKey, toApiError } from "@/lib/api/errors";
import { useAnnounce, useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { ACCEPT_ATTRIBUTE, MAX_AUDIO_SECONDS, MiB, checkFile, recordingMimeType, type UploadType } from "@/lib/media";
import { ErrorState, FieldError, formatBytes } from "./ui";

const MAX_TEXT_BYTES = 2 * MiB;

function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "capture";
  return base.replace(/[\x00-\x1f\x7f]/g, "").slice(-200) || "capture";
}

export function CaptureComposer() {
  const { t, locale } = useI18n();
  const api = useApi();
  const router = useRouter();
  const announce = useAnnounce();
  const id = useId();
  const [text, setText] = useState("");
  const [textError, setTextError] = useState<string>();
  const [file, setFile] = useState<{ blob: Blob; name: string; contentType: UploadType }>();
  const [fileError, setFileError] = useState<string>();
  const [busy, setBusy] = useState<"text" | "file">();
  const [error, setError] = useState<ApiError>();
  const [uploadsDisabled, setUploadsDisabled] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textKey = useRef<{ text: string; key: string }>(undefined);

  const choose = (selected: File | undefined) => {
    setError(undefined);
    if (!selected) return;
    const check = checkFile(selected);
    if (!check.ok) {
      setFile(undefined);
      const message =
        check.reason === "too-large"
          ? t("capture.tooLarge", { max: formatBytes(check.maxBytes ?? 0, locale) })
          : check.reason === "empty"
            ? t("capture.empty")
            : t("capture.unsupported");
      setFileError(message);
      announce(message, "assertive");
      return;
    }
    setFileError(undefined);
    setFile({ blob: selected, name: cleanFilename(selected.name), contentType: check.contentType });
    announce(t("capture.selected", { name: selected.name, size: formatBytes(selected.size, locale) }));
  };

  // Paste an image or file anywhere on the page (explicit user action only).
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pasted = [...(event.clipboardData?.files ?? [])][0];
      if (pasted) {
        event.preventDefault();
        choose(pasted);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const submitText = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) {
      setTextError(t("capture.textRequired"));
      return;
    }
    if (new TextEncoder().encode(value).byteLength > MAX_TEXT_BYTES) {
      setTextError(t("capture.textTooLarge"));
      return;
    }
    setTextError(undefined);
    setError(undefined);
    setBusy("text");
    // Reuse the idempotency key when retrying the same text so duplicates aren't created.
    if (textKey.current?.text !== value) textKey.current = { text: value, key: crypto.randomUUID() };
    try {
      const capture = await api.captures.createText(value, textKey.current.key);
      announce(t("capture.created"));
      router.push(`/captures/${capture.id}`);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setBusy(undefined);
    }
  };

  const upload = async (selected: { blob: Blob; name: string; contentType: UploadType }) => {
    setError(undefined);
    setBusy("file");
    let captureId: string | undefined;
    try {
      const capture = await api.captures.createForUpload();
      captureId = capture.id;
      let session;
      try {
        session = await api.captures.uploadSession(capture.id, {
          filename: selected.name,
          contentType: selected.contentType,
          byteLength: selected.blob.size,
        });
      } catch (e) {
        const apiError = toApiError(e);
        if (apiError.kind === "unavailable" || apiError.kind === "not-found") setUploadsDisabled(true);
        throw apiError;
      }
      await api.uploadContent(session, selected.blob);
      await api.captures.finalize(capture.id);
      announce(t("capture.created"));
      router.push(`/captures/${capture.id}`);
    } catch (e) {
      const apiError = toApiError(e);
      setError(apiError);
      announce(t(errorMessageKey[apiError.kind]), "assertive");
      // Remove an empty capture left behind by a failed upload (best effort).
      if (captureId) void api.captures.remove(captureId, "keep").catch(() => {});
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="composer">
      {error && <ErrorState error={error} focus />}
      {uploadsDisabled && <p className="notice notice-warning">{t("capture.uploadsDisabled")}</p>}

      <form className="card" onSubmit={submitText} noValidate aria-labelledby={`${id}-text-label`}>
        <h2 id={`${id}-text-label`}>
          <label htmlFor={`${id}-text`}>{t("capture.textLabel")}</label>
        </h2>
        <p className="muted small" id={`${id}-text-hint`}>
          {t("capture.textHint")}
        </p>
        <textarea
          id={`${id}-text`}
          value={text}
          dir="auto"
          rows={5}
          aria-describedby={`${id}-text-hint${textError ? ` ${id}-text-error` : ""}`}
          aria-invalid={textError ? true : undefined}
          onChange={(e) => setText(e.target.value)}
        />
        <FieldError id={`${id}-text-error`} message={textError} />
        <div className="button-row">
          <button type="submit" className="button" disabled={!!busy}>
            {busy === "text" ? t("common.saving") : t("capture.submitText")}
          </button>
        </div>
      </form>

      <section className="card" aria-labelledby={`${id}-file-legend`}>
        <h2 id={`${id}-file-legend`}>{t("capture.fileLegend")}</h2>
        <p className="muted small" id={`${id}-file-hint`}>
          {t("capture.fileHint")}
        </p>
        <div
          className={dragging ? "drop-zone active" : "drop-zone"}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files[0]);
          }}
          data-testid="drop-zone"
        >
          <div className="button-row">
            <label className="button secondary file-button">
              {t("capture.chooseFile")}
              <input
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                className="visually-hidden-input"
                aria-describedby={`${id}-file-hint`}
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="button secondary file-button">
              {t("capture.takePhoto")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                capture="environment"
                className="visually-hidden-input"
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="muted small" aria-hidden="true">
            {dragging ? t("capture.dropActive") : t("capture.dropZone")}
          </p>
        </div>
        <FieldError id={`${id}-file-error`} message={fileError} />
        {file && (
          <div className="selected-file">
            <p>{t("capture.selected", { name: file.name, size: formatBytes(file.blob.size, locale) })}</p>
            <button type="button" className="button" disabled={!!busy} onClick={() => void upload(file)}>
              {busy === "file" ? t("capture.uploading") : t("capture.upload")}
            </button>
          </div>
        )}
      </section>

      <AudioRecorder busy={!!busy} onCapture={(recording) => void upload(recording)} />
    </div>
  );
}

function AudioRecorder({
  busy,
  onCapture,
}: {
  busy: boolean;
  onCapture: (recording: { blob: Blob; name: string; contentType: UploadType }) => void;
}) {
  const { t, locale } = useI18n();
  const announce = useAnnounce();
  const id = useId();
  const supported = useBrowserValue<boolean | undefined>(
    () =>
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      !!recordingMimeType((type) => MediaRecorder.isTypeSupported(type)),
    undefined,
  );
  const [state, setState] = useState<"idle" | "recording" | "recorded">("idle");
  const [denied, setDenied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<{ blob: Blob; url: string; type: UploadType; extension: string }>();
  const recorder = useRef<MediaRecorder>(undefined);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(
    () => () => {
      if (recording) URL.revokeObjectURL(recording.url);
    },
    [recording],
  );

  const duration = (seconds: number) =>
    new Intl.DateTimeFormat(locale, { minute: "2-digit", second: "2-digit", timeZone: "UTC" }).format(
      new Date(seconds * 1000),
    );

  const start = async () => {
    const format = recordingMimeType((type) => MediaRecorder.isTypeSupported(type));
    if (!format) return;
    setDenied(false);
    let stream: MediaStream;
    try {
      // The browser asks for microphone permission here, only after the user chose to record.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setDenied(true);
      announce(t("capture.micDenied"), "assertive");
      return;
    }
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream, { mimeType: format.recorderType });
    media.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    media.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (timer.current) clearInterval(timer.current);
      const blob = new Blob(chunks, { type: format.uploadType });
      setRecording({ blob, url: URL.createObjectURL(blob), type: format.uploadType, extension: format.extension });
      setState("recorded");
    };
    recorder.current = media;
    media.start(1000);
    setElapsed(0);
    setState("recording");
    const started = Date.now();
    timer.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_AUDIO_SECONDS - 1 && media.state === "recording") media.stop();
    }, 250);
  };

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };
  const discard = () => {
    setRecording(undefined);
    setState("idle");
    setElapsed(0);
  };

  return (
    <section className="card" aria-labelledby={`${id}-audio`}>
      <h2 id={`${id}-audio`}>{t("capture.audioLegend")}</h2>
      {supported === false ? (
        <p className="muted">{t("capture.micUnavailable")}</p>
      ) : (
        <>
          <p className="muted small">{t("capture.audioConsent")}</p>
          <p className="muted small">{t("capture.recordingLimit")}</p>
          {denied && <p className="notice notice-warning">{t("capture.micDenied")}</p>}
          <div className="button-row">
            {state === "idle" && (
              <button
                type="button"
                className="button secondary"
                disabled={busy || !supported}
                onClick={() => void start()}
              >
                {t("capture.startRecording")}
              </button>
            )}
            {state === "recording" && (
              <>
                <span className="recording-indicator" role="status">
                  <span className="pulse" aria-hidden="true" />
                  {t("capture.recording", { elapsed: duration(elapsed) })}
                </span>
                <button type="button" className="button" onClick={stop}>
                  {t("capture.stopRecording")}
                </button>
              </>
            )}
          </div>
          {state === "recorded" && recording && (
            <div className="selected-file">
              <p>{t("capture.recorded", { elapsed: duration(elapsed) })}</p>
              <audio controls src={recording.url} aria-label={t("capture.audioLegend")} />
              <div className="button-row">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    onCapture({
                      blob: recording.blob,
                      name: `voice-note.${recording.extension}`,
                      contentType: recording.type,
                    })
                  }
                >
                  {t("capture.captureRecording")}
                </button>
                <button type="button" className="button secondary" disabled={busy} onClick={discard}>
                  {t("capture.discardRecording")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
