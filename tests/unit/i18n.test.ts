import { describe, expect, it } from "vitest";
import { textDirection, translate } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";

describe("i18n", () => {
  it("interpolates with locale-aware numbers and falls back to English text", () => {
    expect(translate("en-US", "inbox.countLabel.other", { count: 1234 })).toBe("1,234 captures");
    expect(translate("de-DE", "inbox.countLabel.other", { count: 1234 })).toBe("1.234 captures");
    expect(translate("ar-EG", "nav.inbox")).toBe("Inbox");
  });
  it("derives text direction from the locale", () => {
    expect(textDirection("ar-EG")).toBe("rtl");
    expect(textDirection("he")).toBe("rtl");
    expect(textDirection("en-GB")).toBe("ltr");
    expect(textDirection("not a locale")).toBe("ltr");
  });
  it("keeps every catalog value a non-empty string", () => {
    const walk = (node: unknown): string[] =>
      typeof node === "string" ? [node] : Object.values(node as object).flatMap(walk);
    expect(walk(en).every((s) => s.trim().length > 0)).toBe(true);
  });
});

describe("date formatting", () => {
  it("formats with an explicit timezone name without throwing", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { I18nProvider, useI18n } = await import("@/lib/i18n");
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    const text = result.current.formatDateTime("2026-11-13T17:00:00.000Z", "Europe/Berlin", { timeZoneName: "short" });
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/18:00|6:00/);
  });
});
