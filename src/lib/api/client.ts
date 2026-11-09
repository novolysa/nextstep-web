import createClient, { type Middleware } from "openapi-fetch";
import { config } from "@/lib/config";
import { ApiError, errorFromResponse, toApiError } from "./errors";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type Capture = Schemas["Capture"];
export type Suggestion = Schemas["Suggestion"];
export type Action = Schemas["Action"];
export type ActionInput = Schemas["ActionInput"];
export type ActionType = ActionInput["type"];
export type List = Schemas["List"];
export type Preferences = Schemas["Preferences"];
export type RequestStatus = Schemas["RequestStatus"];
export type UploadRequest = Schemas["UploadRequest"];
export type ActionView = "today" | "upcoming" | "completed";

type Page<T> = { items: T[]; nextCursor: string | null };

export type ApiOptions = {
  getAccessToken: () => Promise<string | undefined>;
  onUnauthorized: () => void;
  baseUrl?: string;
  /** Transport override (tests); openapi-fetch always passes a Request. */
  fetch?: (request: Request) => Promise<Response>;
};

const TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 120_000;

/** Typed client for the public gateway API, validated against the generated contract types. */
export function createApi(options: ApiOptions) {
  const baseUrl = options.baseUrl ?? config.apiBaseUrl;
  const fetchImpl = options.fetch ?? ((input: Request) => globalThis.fetch(input));
  const auth: Middleware = {
    async onRequest({ request }) {
      const token = await options.getAccessToken();
      if (!token) throw new ApiError("unauthorized", 401);
      request.headers.set("Authorization", `Bearer ${token}`);
      request.headers.set("X-Request-Id", crypto.randomUUID());
      return request;
    },
  };
  const client = createClient<paths>({ baseUrl, fetch: fetchImpl });
  client.use(auth);

  async function call<T>(
    run: (signal: AbortSignal) => Promise<{ data?: T; error?: unknown; response: Response }>,
    timeout = TIMEOUT_MS,
  ): Promise<T> {
    let result: { data?: T; error?: unknown; response: Response };
    try {
      result = await run(AbortSignal.timeout(timeout));
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.kind === "unauthorized") options.onUnauthorized();
      throw apiError;
    }
    if (!result.response.ok) {
      const error = await errorFromResponse(result.response, result.error);
      if (error.kind === "unauthorized") options.onUnauthorized();
      throw error;
    }
    return result.data as T;
  }

  const key = () => crypto.randomUUID();

  /** Fetch every page of a cursor-paginated collection (bounded). */
  async function all<T>(page: (cursor?: string) => Promise<Page<T>>, maxPages = 20): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < maxPages; i++) {
      const result = await page(cursor);
      items.push(...result.items);
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return items;
  }

  const api = {
    captures: {
      page: (cursor?: string) =>
        call<Page<Capture>>((signal) => client.GET("/captures", { params: { query: { cursor, limit: 100 } }, signal })),
      all: () => all((cursor) => api.captures.page(cursor)),
      get: (captureId: string) =>
        call<Capture>((signal) => client.GET("/captures/{captureId}", { params: { path: { captureId } }, signal })),
      createText: (text: string, idempotencyKey = key()) =>
        call<Capture>((signal) =>
          client.POST("/captures", {
            params: { header: { "Idempotency-Key": idempotencyKey } },
            body: { text },
            signal,
          }),
        ),
      createForUpload: (idempotencyKey = key()) =>
        call<Capture>((signal) =>
          client.POST("/captures", { params: { header: { "Idempotency-Key": idempotencyKey } }, body: {}, signal }),
        ),
      uploadSession: (captureId: string, body: UploadRequest) =>
        call((signal) =>
          client.POST("/captures/{captureId}/upload-session", { params: { path: { captureId } }, body, signal }),
        ),
      finalize: (captureId: string, idempotencyKey = key()) =>
        call<Capture>(
          (signal) =>
            client.POST("/captures/{captureId}/finalize", {
              params: { path: { captureId }, header: { "Idempotency-Key": idempotencyKey } },
              signal,
            }),
          UPLOAD_TIMEOUT_MS,
        ),
      retry: (captureId: string, idempotencyKey = key()) =>
        call<Capture>((signal) =>
          client.POST("/captures/{captureId}/retry", {
            params: { path: { captureId }, header: { "Idempotency-Key": idempotencyKey } },
            signal,
          }),
        ),
      remove: (captureId: string, linkedActions: "keep" | "delete") =>
        call<void>((signal) =>
          client.DELETE("/captures/{captureId}", {
            params: { path: { captureId }, query: { linkedActions } },
            signal,
          }),
        ),
      /** Authorized, short-lived retrieval of the original; never a permanent storage URL. */
      content: (captureId: string) =>
        call<{ bytes: Uint8Array; contentType: string }>(async (signal) => {
          const result = await client.GET("/captures/{captureId}/content", {
            params: { path: { captureId } },
            parseAs: "arrayBuffer",
            signal,
          });
          return {
            ...result,
            data: result.data
              ? {
                  bytes: new Uint8Array(result.data as ArrayBuffer),
                  contentType: result.response.headers.get("content-type") ?? "",
                }
              : undefined,
          };
        }, UPLOAD_TIMEOUT_MS),
    },
    /** Upload bytes to the one-time gateway URL from an upload session. */
    async uploadContent(
      session: { uploadUrl: string; headers: { "Upload-Capability": string } },
      body: Blob,
    ): Promise<void> {
      const target = new URL(session.uploadUrl);
      if (target.origin !== new URL(baseUrl).origin) throw new ApiError("unknown");
      const token = await options.getAccessToken();
      if (!token) {
        options.onUnauthorized();
        throw new ApiError("unauthorized", 401);
      }
      let response: Response;
      try {
        response = await globalThis.fetch(target, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/octet-stream",
            "Upload-Capability": session.headers["Upload-Capability"],
            "X-Request-Id": crypto.randomUUID(),
          },
          body,
          redirect: "error",
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
        });
      } catch (error) {
        throw toApiError(error);
      }
      if (!response.ok) {
        const error = await errorFromResponse(response);
        if (error.kind === "unauthorized") options.onUnauthorized();
        throw error;
      }
    },
    suggestions: {
      page: (cursor?: string) =>
        call<Page<Suggestion>>((signal) =>
          client.GET("/suggestions", { params: { query: { cursor, limit: 100 } }, signal }),
        ),
      all: () => all((cursor) => api.suggestions.page(cursor)),
      get: (suggestionId: string) =>
        call<Suggestion>((signal) =>
          client.GET("/suggestions/{suggestionId}", { params: { path: { suggestionId } }, signal }),
        ),
      accept: (suggestionId: string, action: ActionInput, idempotencyKey: string) =>
        call<Action>((signal) =>
          client.POST("/suggestions/{suggestionId}/accept", {
            params: { path: { suggestionId }, header: { "Idempotency-Key": idempotencyKey } },
            body: { action, confirmed: true },
            signal,
          }),
        ),
      dismiss: (suggestionId: string) =>
        call<void>((signal) =>
          client.POST("/suggestions/{suggestionId}/dismiss", { params: { path: { suggestionId } }, signal }),
        ),
    },
    actions: {
      page: (filters: { view?: ActionView; listId?: string; timezone?: string }, cursor?: string) =>
        call<Page<Action>>((signal) =>
          client.GET("/actions", { params: { query: { ...filters, cursor, limit: 100 } }, signal }),
        ),
      all: (filters: { view?: ActionView; listId?: string; timezone?: string }) =>
        all((cursor) => api.actions.page(filters, cursor)),
      get: (actionId: string) =>
        call<Action>((signal) => client.GET("/actions/{actionId}", { params: { path: { actionId } }, signal })),
      create: (body: ActionInput) => call<Action>((signal) => client.POST("/actions", { body, signal })),
      update: (actionId: string, body: ActionInput) =>
        call<Action>((signal) => client.PUT("/actions/{actionId}", { params: { path: { actionId } }, body, signal })),
      complete: (actionId: string) =>
        call<Action>((signal) =>
          client.POST("/actions/{actionId}/complete", { params: { path: { actionId } }, signal }),
        ),
      remove: (actionId: string) =>
        call<void>((signal) => client.DELETE("/actions/{actionId}", { params: { path: { actionId } }, signal })),
    },
    lists: {
      all: () =>
        all((cursor) =>
          call<Page<List>>((signal) => client.GET("/lists", { params: { query: { cursor, limit: 100 } }, signal })),
        ),
      get: (listId: string) =>
        call<List>((signal) => client.GET("/lists/{listId}", { params: { path: { listId } }, signal })),
      create: (name: string) => call<List>((signal) => client.POST("/lists", { body: { name }, signal })),
      rename: (listId: string, name: string) =>
        call<List>((signal) => client.PUT("/lists/{listId}", { params: { path: { listId } }, body: { name }, signal })),
      remove: (listId: string) =>
        call<void>((signal) => client.DELETE("/lists/{listId}", { params: { path: { listId } }, signal })),
    },
    preferences: {
      get: () => call<Preferences>((signal) => client.GET("/preferences", { signal })),
    },
    exports: {
      request: () => call<RequestStatus>((signal) => client.POST("/exports", { signal })),
      status: (requestId: string) =>
        call<RequestStatus>((signal) =>
          client.GET("/exports/{requestId}", { params: { path: { requestId } }, signal }),
        ),
    },
    account: {
      requestDeletion: () => call<RequestStatus>((signal) => client.POST("/account/deletion", { signal })),
    },
  };
  return api;
}

export type Api = ReturnType<typeof createApi>;
