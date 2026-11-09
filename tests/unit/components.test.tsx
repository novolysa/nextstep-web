import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CaptureComposer } from "@/components/CaptureComposer";
import { SuggestionReview } from "@/components/SuggestionReview";
import { ErrorState } from "@/components/ui";
import type { Suggestion } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders, seriousViolations } from "./render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }) }));

const suggestion: Suggestion = {
  id: "s1",
  captureId: "c1",
  type: "task",
  title: "Buy oat milk",
  evidence: "task: Buy oat milk | date: Friday",
  confidence: 0.45,
  status: "needs-review",
  createdAt: "2026-11-09T10:00:00Z",
  date: { extractedText: "Friday", ambiguous: true, requiresConfirmation: true },
};

describe("SuggestionReview", () => {
  it("shows evidence, confidence and ambiguity, and saves nothing until accepted", async () => {
    const accept = vi.fn();
    const { container } = renderWithProviders(
      <SuggestionReview suggestion={suggestion} lists={[]} onListCreated={() => {}} onResolved={() => {}} />,
      { suggestions: { accept, dismiss: vi.fn() } as never, lists: { create: vi.fn() } as never },
    );
    expect(screen.getByText("Friday", { selector: "mark" })).toBeInTheDocument();
    expect(screen.getByText(/Low confidence/)).toBeInTheDocument();
    expect(screen.getByText(/This date is ambiguous/)).toBeInTheDocument();
    expect(screen.getByText("Confidence: 45%")).toBeInTheDocument();
    expect(accept).not.toHaveBeenCalled();
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("lets the user correct values and requires confirming the date before accepting", async () => {
    const user = userEvent.setup();
    const onResolved = vi.fn();
    const accept = vi.fn(async (_id: string, action: { title: string }) => ({
      id: "a1",
      ...action,
      completed: false,
      createdAt: "2026-11-09T10:00:00Z",
    }));
    renderWithProviders(
      <SuggestionReview suggestion={suggestion} lists={[]} onListCreated={() => {}} onResolved={onResolved} />,
      { suggestions: { accept, dismiss: vi.fn() } as never, lists: { create: vi.fn() } as never },
    );
    const title = screen.getByLabelText(/^Title/);
    await user.clear(title);
    await user.type(title, "Buy oat milk (2 l)");
    const due = within(screen.getByRole("group", { name: /Due date/ }));
    fireEvent.change(due.getByLabelText("Date"), { target: { value: "2026-11-13" } });
    fireEvent.change(due.getByLabelText("Time"), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "Europe/Berlin" } });
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(accept).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm the date and time before accepting.")).toBeInTheDocument();
    await user.click(screen.getByLabelText(/I've checked the date/));
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(accept.mock.calls[0]![1]).toEqual({
      type: "task",
      title: "Buy oat milk (2 l)",
      sourceCaptureId: "c1",
      dueAt: "2026-11-13T17:00:00.000Z",
      timezone: "Europe/Berlin",
    });
    expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ status: "accepted" }), expect.anything());
  });

  it("dismisses only when asked and surfaces server errors", async () => {
    const user = userEvent.setup();
    const dismiss = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("conflict", 409, "CONFLICT", "req-9"))
      .mockResolvedValue(undefined);
    const onResolved = vi.fn();
    renderWithProviders(
      <SuggestionReview
        suggestion={{ ...suggestion, date: undefined }}
        lists={[]}
        onListCreated={() => {}}
        onResolved={onResolved}
      />,
      { suggestions: { accept: vi.fn(), dismiss } as never, lists: { create: vi.fn() } as never },
    );
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(await screen.findByText(/already handled/)).toBeInTheDocument();
    expect(screen.getByText("Reference: req-9")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ status: "dismissed" })));
  });
});

describe("ErrorState", () => {
  it("offers retry for transient failures only", async () => {
    const retry = vi.fn();
    const first = renderWithProviders(<ErrorState error={new ApiError("network")} onRetry={retry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    expect(await seriousViolations(first.container)).toEqual([]);
    first.unmount();
    renderWithProviders(<ErrorState error={new ApiError("forbidden", 403)} onRetry={retry} />);
    expect(screen.getByText(/don't have permission/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("CaptureComposer", () => {
  it("rejects unsupported files before upload and validates text", async () => {
    const createForUpload = vi.fn();
    const createText = vi.fn();
    const { container } = renderWithProviders(<CaptureComposer />, {
      captures: { createForUpload, createText } as never,
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })] } });
    });
    expect(screen.getByText(/isn't supported/)).toBeInTheDocument();
    expect(createForUpload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Capture text" }));
    expect(screen.getByText("Enter some text to capture.")).toBeInTheDocument();
    expect(createText).not.toHaveBeenCalled();
    expect(await seriousViolations(container)).toEqual([]);
  });
});
