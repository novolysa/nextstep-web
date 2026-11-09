import { describe, expect, it } from "vitest";
import { buildActionInput, draftFromAction, draftFromSuggestion, emptyDraft } from "@/lib/action-draft";
import type { Suggestion } from "@/lib/api/client";

const suggestion = (overrides: Partial<Suggestion> = {}): Suggestion => ({
  id: "s1",
  captureId: "c1",
  type: "task",
  title: "Pay rent",
  confidence: 0.9,
  status: "needs-review",
  createdAt: "2026-11-09T10:00:00Z",
  ...overrides,
});

describe("action drafts", () => {
  it("never prefills an ambiguous extracted date", () => {
    const draft = draftFromSuggestion(
      suggestion({ date: { extractedText: "03/04", ambiguous: true, requiresConfirmation: true } }),
      "Europe/Berlin",
    );
    expect(draft.due).toEqual({ date: "", time: "" });
    expect(draft.sourceCaptureId).toBe("c1");
  });

  it("prefills an unambiguous candidate in its own timezone", () => {
    const draft = draftFromSuggestion(
      suggestion({
        type: "event",
        date: {
          extractedText: "2026-12-01T18:00:00Z America/New_York",
          ambiguous: false,
          requiresConfirmation: true,
          candidateInstant: "2026-12-01T18:00:00Z",
          timezone: "America/New_York",
        },
      }),
      "Europe/Berlin",
    );
    expect(draft.timezone).toBe("America/New_York");
    expect(draft.start).toEqual({ date: "2026-12-01", time: "13:00" });
  });

  it("builds a contract-valid task with UTC instants and the IANA timezone", () => {
    const draft = { ...draftFromSuggestion(suggestion(), "Europe/Berlin"), due: { date: "2026-11-13", time: "18:00" } };
    expect(buildActionInput(draft)).toEqual({
      ok: true,
      input: {
        type: "task",
        title: "Pay rent",
        sourceCaptureId: "c1",
        dueAt: "2026-11-13T17:00:00.000Z",
        timezone: "Europe/Berlin",
      },
    });
  });

  it("enforces type-specific required fields", () => {
    expect(buildActionInput({ ...emptyDraft("UTC", "event"), title: "Dinner" })).toEqual({
      ok: false,
      errors: { start: "form.partialDate" },
    });
    expect(buildActionInput({ ...emptyDraft("UTC", "reminder"), title: "Call" })).toEqual({
      ok: false,
      errors: { remind: "form.partialDate" },
    });
    expect(buildActionInput({ ...emptyDraft("UTC", "list_item"), title: "Eggs" })).toEqual({
      ok: false,
      errors: { listId: "form.chooseList" },
    });
    expect(buildActionInput(emptyDraft("UTC"))).toEqual({ ok: false, errors: { title: "form.titleRequired" } });
  });

  it("keeps list items undated even if hidden date fields hold values", () => {
    const draft = {
      ...emptyDraft("UTC", "list_item"),
      title: "Eggs",
      listId: "l1",
      due: { date: "2026-01-01", time: "10:00" },
    };
    expect(buildActionInput(draft)).toEqual({ ok: true, input: { type: "list_item", title: "Eggs", listId: "l1" } });
  });

  it("requires an explicit choice for a repeated DST time and rejects skipped ones", () => {
    const base = { ...emptyDraft("America/New_York", "event"), title: "Late show" };
    const ambiguous = { ...base, start: { date: "2026-11-01", time: "01:30" } };
    expect(buildActionInput(ambiguous)).toEqual({ ok: false, errors: { start: "form.ambiguousTime" } });
    const chosen = { ...base, start: { date: "2026-11-01", time: "01:30", occurrence: "later" as const } };
    const result = buildActionInput(chosen);
    expect(result.ok && result.input.startAt).toBe("2026-11-01T06:30:00.000Z");
    const skipped = { ...base, start: { date: "2026-03-08", time: "02:30" } };
    expect(buildActionInput(skipped)).toEqual({ ok: false, errors: { start: "form.nonexistent" } });
  });

  it("rejects partial dates and an end before the start", () => {
    const base = { ...emptyDraft("UTC", "event"), title: "Meeting", start: { date: "2026-05-01", time: "10:00" } };
    expect(buildActionInput({ ...base, end: { date: "2026-05-01", time: "" } })).toEqual({
      ok: false,
      errors: { end: "form.partialDate" },
    });
    expect(buildActionInput({ ...base, end: { date: "2026-05-01", time: "09:00" } })).toEqual({
      ok: false,
      errors: { end: "form.endBeforeStart" },
    });
  });

  it("restores an existing action's local values in its saved timezone", () => {
    const draft = draftFromAction(
      {
        id: "a1",
        type: "reminder",
        title: "Call mum",
        remindAt: "2026-06-01T08:00:00.000Z",
        timezone: "Asia/Tokyo",
        completed: false,
        createdAt: "2026-05-01T00:00:00Z",
      },
      "UTC",
    );
    expect(draft.timezone).toBe("Asia/Tokyo");
    expect(draft.remind).toEqual({ date: "2026-06-01", time: "17:00" });
  });
});
