// Client-side mirror of the MVP upload policy (03-PRODUCT-REQUIREMENTS). The server is
// authoritative and validates actual content; these checks only give early, clear errors.

export type UploadType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif"
  | "audio/mpeg"
  | "audio/aac"
  | "audio/mp4"
  | "audio/wav"
  | "audio/webm"
  | "application/pdf"
  | "text/plain";

export const MiB = 1_048_576;
export const MAX_AUDIO_SECONDS = 300;

const POLICY: Record<UploadType, { max: number; extensions: string[]; kind: MediaKind }> = {
  "image/jpeg": { max: 20 * MiB, extensions: ["jpg", "jpeg"], kind: "image" },
  "image/png": { max: 20 * MiB, extensions: ["png"], kind: "image" },
  "image/webp": { max: 20 * MiB, extensions: ["webp"], kind: "image" },
  "image/heic": { max: 20 * MiB, extensions: ["heic"], kind: "image" },
  "image/heif": { max: 20 * MiB, extensions: ["heif"], kind: "image" },
  "audio/mpeg": { max: 25 * MiB, extensions: ["mp3"], kind: "audio" },
  "audio/aac": { max: 25 * MiB, extensions: ["aac"], kind: "audio" },
  "audio/mp4": { max: 25 * MiB, extensions: ["m4a"], kind: "audio" },
  "audio/wav": { max: 25 * MiB, extensions: ["wav"], kind: "audio" },
  "audio/webm": { max: 25 * MiB, extensions: ["webm", "weba"], kind: "audio" },
  "application/pdf": { max: 20 * MiB, extensions: ["pdf"], kind: "document" },
  "text/plain": { max: 2 * MiB, extensions: ["txt"], kind: "text" },
};

export type MediaKind = "image" | "audio" | "document" | "text";

export const ACCEPT_ATTRIBUTE = [
  ...Object.keys(POLICY),
  ...Object.values(POLICY).flatMap((p) => p.extensions.map((e) => `.${e}`)),
].join(",");

const ALIASES: Record<string, UploadType> = {
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/mp3": "audio/mpeg",
};

export type FileCheck =
  | { ok: true; contentType: UploadType; kind: MediaKind }
  | { ok: false; reason: "unsupported" | "too-large" | "empty"; maxBytes?: number };

/** Determine the declared upload type from extension and browser MIME; both must agree. */
export function checkFile(file: { name: string; type: string; size: number }): FileCheck {
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const byExtension = (Object.keys(POLICY) as UploadType[]).filter((t) => POLICY[t].extensions.includes(extension));
  const browserType = (ALIASES[file.type] ?? file.type.split(";")[0]?.trim()) as UploadType;
  let contentType: UploadType | undefined;
  if (browserType && POLICY[browserType]) {
    if (!byExtension.includes(browserType)) return { ok: false, reason: "unsupported" };
    contentType = browserType;
  } else if (!file.type && byExtension.length === 1) {
    contentType = byExtension[0];
  }
  if (!contentType) return { ok: false, reason: "unsupported" };
  if (file.size <= 0) return { ok: false, reason: "empty" };
  const policy = POLICY[contentType];
  if (file.size > policy.max) return { ok: false, reason: "too-large", maxBytes: policy.max };
  return { ok: true, contentType, kind: policy.kind };
}

/** Best supported recording format for the browser audio recorder, if any. */
export function recordingMimeType(
  isTypeSupported: (type: string) => boolean,
): { recorderType: string; uploadType: UploadType; extension: string } | undefined {
  if (isTypeSupported("audio/webm;codecs=opus"))
    return { recorderType: "audio/webm;codecs=opus", uploadType: "audio/webm", extension: "webm" };
  if (isTypeSupported("audio/mp4")) return { recorderType: "audio/mp4", uploadType: "audio/mp4", extension: "m4a" };
  return undefined;
}

/** Identify downloaded original content by signature to render a safe preview. */
export function sniff(bytes: Uint8Array): { kind: MediaKind | "unknown"; type?: string } {
  const at = (offset: number, ...values: number[]) => values.every((v, i) => bytes[offset + i] === v);
  const ascii = (offset: number, text: string) => at(offset, ...[...text].map((c) => c.charCodeAt(0)));
  if (at(0, 0xff, 0xd8, 0xff)) return { kind: "image", type: "image/jpeg" };
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { kind: "image", type: "image/png" };
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return { kind: "image", type: "image/webp" };
  if (ascii(4, "ftyp") && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(String.fromCharCode(...bytes.slice(8, 12))))
    return { kind: "image", type: "image/heic" };
  if (ascii(0, "%PDF-")) return { kind: "document", type: "application/pdf" };
  if (ascii(0, "RIFF") && ascii(8, "WAVE")) return { kind: "audio", type: "audio/wav" };
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return { kind: "audio", type: "audio/webm" };
  if (ascii(0, "ID3") || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) {
    // MPEG audio or ADTS AAC frame sync.
    return { kind: "audio", type: ((bytes[1] ?? 0) & 0x06) === 0 ? "audio/aac" : "audio/mpeg" };
  }
  if (ascii(4, "ftyp")) return { kind: "audio", type: "audio/mp4" };
  return { kind: "unknown" };
}
