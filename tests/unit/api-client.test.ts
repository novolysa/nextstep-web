import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { createApi } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";

function setup(respond: (request: Request) => Response | Promise<Response>, token: string | null = "user-token") {
  const requests: Request[] = [];
  const onUnauthorized = vi.fn();
  const api = createApi({
    baseUrl: "http://127.0.0.1:3001/api/v1",
    getAccessToken: async () => token ?? undefined,
    onUnauthorized,
    fetch: async (request: Request) => {
      requests.push(request.clone());
      return respond(request);
    },
  });
  return { api, requests, onUnauthorized };
}

describe("API client", () => {
  it("sends the bearer token, a request ID and contract query parameters", async () => {
    const { api, requests } = setup(() => Response.json({ items: [], nextCursor: null }));
    await api.actions.all({ view: "today", timezone: "Europe/Berlin" });
    const request = requests[0]!;
    const url = new URL(request.url);
    expect(url.pathname).toBe("/api/v1/actions");
    expect(Object.fromEntries(url.searchParams)).toEqual({ view: "today", timezone: "Europe/Berlin", limit: "100" });
    expect(request.headers.get("authorization")).toBe("Bearer user-token");
    expect(request.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("follows cursors until the last page", async () => {
    const pages = [
      { items: [{ id: "1" }], nextCursor: "c2" },
      { items: [{ id: "2" }], nextCursor: null },
    ];
    const { api, requests } = setup(() => Response.json(pages.shift()));
    expect((await api.captures.all()).map((c) => c.id)).toEqual(["1", "2"]);
    expect(new URL(requests[1]!.url).searchParams.get("cursor")).toBe("c2");
  });

  it("sends explicit confirmation and an idempotency key when accepting", async () => {
    const { api, requests } = setup(() => Response.json({ id: "a1" }));
    await api.suggestions.accept("s1", { type: "task", title: "Edited" }, "key-1");
    expect(requests[0]!.headers.get("idempotency-key")).toBe("key-1");
    expect(await requests[0]!.json()).toEqual({ action: { type: "task", title: "Edited" }, confirmed: true });
  });

  it("normalizes contract errors including field errors", async () => {
    const { api } = setup(() =>
      Response.json(
        {
          code: "VALIDATION_FAILED",
          message: "x",
          requestId: "r1",
          fieldErrors: [{ field: "startAt", message: "Required" }],
        },
        { status: 422 },
      ),
    );
    const error = (await api.actions.create({ type: "event", title: "x" }).catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "validation", status: 422, requestId: "r1" });
    expect(error.fieldErrors).toEqual([{ field: "startAt", message: "Required" }]);
  });

  it("reports owner isolation as not found and expiry as unauthorized", async () => {
    const notFound = setup(() => Response.json({ code: "NOT_FOUND", message: "", requestId: "r" }, { status: 404 }));
    await expect(notFound.api.captures.get("other-owner")).rejects.toMatchObject({ kind: "not-found" });
    const expired = setup(() => Response.json({ code: "UNAUTHORIZED", message: "", requestId: "r" }, { status: 401 }));
    await expect(expired.api.captures.get("c")).rejects.toMatchObject({ kind: "unauthorized" });
    expect(expired.onUnauthorized).toHaveBeenCalled();
    const unavailable = setup(() =>
      Response.json({ code: "SERVICE_UNAVAILABLE", message: "", requestId: "r" }, { status: 503 }),
    );
    await expect(unavailable.api.preferences.get()).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("does not call the API without a token and maps network failures", async () => {
    const signedOut = setup(() => Response.json({}), null);
    await expect(signedOut.api.captures.all()).rejects.toMatchObject({ kind: "unauthorized" });
    expect(signedOut.requests).toHaveLength(0);
    const network = setup(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(network.api.captures.all()).rejects.toMatchObject({ kind: "network" });
  });

  it("only uploads to the configured gateway origin", async () => {
    const { api } = setup(() => new Response(null, { status: 204 }));
    await expect(
      api.uploadContent(
        { uploadUrl: "https://evil.example/upload", headers: { "Upload-Capability": "x".repeat(43) } },
        new Blob(["hi"]),
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("contract", () => {
  it("generated API types match the canonical OpenAPI contract", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/generate-api.mjs", "--check"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
