import { describe, expect, it } from "vitest";
import { MiB, checkFile, recordingMimeType, sniff } from "@/lib/media";

describe("upload policy", () => {
  it("accepts supported types within their limits", () => {
    expect(checkFile({ name: "receipt.JPG", type: "image/jpeg", size: 1000 })).toMatchObject({
      ok: true,
      contentType: "image/jpeg",
    });
    expect(checkFile({ name: "memo.m4a", type: "audio/x-m4a", size: 1000 })).toMatchObject({
      ok: true,
      contentType: "audio/mp4",
    });
    expect(checkFile({ name: "photo.heic", type: "", size: 1000 })).toMatchObject({
      ok: true,
      contentType: "image/heic",
    });
  });
  it("rejects unsupported, mismatched, empty and oversized files", () => {
    expect(checkFile({ name: "clip.mp4", type: "video/mp4", size: 10 })).toEqual({ ok: false, reason: "unsupported" });
    expect(checkFile({ name: "logo.svg", type: "image/svg+xml", size: 10 })).toEqual({
      ok: false,
      reason: "unsupported",
    });
    expect(checkFile({ name: "anim.gif", type: "image/gif", size: 10 })).toEqual({ ok: false, reason: "unsupported" });
    expect(checkFile({ name: "image.png", type: "application/pdf", size: 10 })).toEqual({
      ok: false,
      reason: "unsupported",
    });
    expect(checkFile({ name: "notes.txt", type: "text/plain", size: 0 })).toEqual({ ok: false, reason: "empty" });
    expect(checkFile({ name: "notes.txt", type: "text/plain", size: 2 * MiB + 1 })).toEqual({
      ok: false,
      reason: "too-large",
      maxBytes: 2 * MiB,
    });
    expect(checkFile({ name: "scan.pdf", type: "application/pdf", size: 20 * MiB + 1 })).toMatchObject({
      reason: "too-large",
    });
    expect(checkFile({ name: "talk.mp3", type: "audio/mpeg", size: 25 * MiB })).toMatchObject({ ok: true });
  });
  it("chooses a supported recording format", () => {
    expect(recordingMimeType((t) => t === "audio/webm;codecs=opus")?.uploadType).toBe("audio/webm");
    expect(recordingMimeType((t) => t === "audio/mp4")?.uploadType).toBe("audio/mp4");
    expect(recordingMimeType(() => false)).toBeUndefined();
  });
  it("identifies previewable originals by signature", () => {
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
      kind: "image",
      type: "image/png",
    });
    expect(sniff(new TextEncoder().encode("%PDF-1.7"))).toEqual({ kind: "document", type: "application/pdf" });
    expect(sniff(new TextEncoder().encode("<svg onload=alert(1)>")).kind).toBe("unknown");
  });
});
