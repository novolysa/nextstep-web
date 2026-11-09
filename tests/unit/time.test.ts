import { describe, expect, it } from "vitest";
import { isValidTimezone, resolveLocal, toLocal } from "@/lib/time";

describe("resolveLocal", () => {
  it("converts a local time in a named timezone to UTC", () => {
    expect(resolveLocal({ date: "2026-07-01", time: "09:30" }, "Europe/Berlin")).toEqual({
      kind: "ok",
      instant: "2026-07-01T07:30:00.000Z",
    });
    expect(resolveLocal({ date: "2026-01-15", time: "09:30" }, "Asia/Kolkata")).toEqual({
      kind: "ok",
      instant: "2026-01-15T04:00:00.000Z",
    });
  });

  it("reports times skipped by a spring-forward DST gap", () => {
    expect(resolveLocal({ date: "2026-03-08", time: "02:30" }, "America/New_York")).toEqual({ kind: "nonexistent" });
    expect(resolveLocal({ date: "2026-03-29", time: "02:15" }, "Europe/Berlin")).toEqual({ kind: "nonexistent" });
  });

  it("reports both instants for a repeated fall-back hour", () => {
    expect(resolveLocal({ date: "2026-11-01", time: "01:30" }, "America/New_York")).toEqual({
      kind: "ambiguous",
      earlier: "2026-11-01T05:30:00.000Z",
      later: "2026-11-01T06:30:00.000Z",
    });
  });

  it("handles southern-hemisphere and half-hour DST zones", () => {
    expect(resolveLocal({ date: "2026-10-04", time: "02:30" }, "Australia/Sydney").kind).toBe("nonexistent");
    expect(resolveLocal({ date: "2026-04-05", time: "01:45" }, "Australia/Lord_Howe").kind).toBe("ambiguous");
  });

  it("rejects invalid dates and timezones instead of guessing", () => {
    expect(resolveLocal({ date: "2026-02-30", time: "10:00" }, "UTC").kind).toBe("invalid");
    expect(resolveLocal({ date: "2026-02-10", time: "24:00" }, "UTC").kind).toBe("invalid");
    expect(resolveLocal({ date: "2026-02-10", time: "10:00" }, "Mars/Olympus").kind).toBe("invalid");
    expect(resolveLocal({ date: "2026-02-10", time: "10:00" }, "+02:00").kind).toBe("invalid");
  });
});

describe("toLocal", () => {
  it("round-trips through a timezone", () => {
    const local = toLocal("2026-07-01T07:30:00.000Z", "Europe/Berlin");
    expect(local).toEqual({ date: "2026-07-01", time: "09:30" });
    expect(resolveLocal(local, "Europe/Berlin")).toEqual({ kind: "ok", instant: "2026-07-01T07:30:00.000Z" });
  });
  it("validates IANA identifiers", () => {
    expect(isValidTimezone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimezone("")).toBe(false);
  });
});
