import type { MessageKey } from "@/lib/i18n";

export type ErrorKind =
  | "offline"
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "validation"
  | "conflict"
  | "rate-limited"
  | "unavailable"
  | "payload-too-large"
  | "unsupported-media"
  | "invalid-media"
  | "upload-expired"
  | "unknown";

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly status?: number,
    readonly code?: string,
    readonly requestId?: string,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(code ?? kind);
    this.name = "ApiError";
  }
}

export function kindForStatus(status: number, code?: string): ErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 410) return "upload-expired";
  if (status === 413) return "payload-too-large";
  if (status === 415) return "unsupported-media";
  if (status === 422) return code === "INVALID_MEDIA" ? "invalid-media" : "validation";
  if (status === 400) return "validation";
  if (status === 429) return "rate-limited";
  if (status === 503 || status === 502 || status === 504) return "unavailable";
  return "unknown";
}

/**
 * Build an ApiError from an HTTP response with a contract Error body. Pass `parsed` when
 * the body was already consumed (openapi-fetch parses error bodies itself).
 */
export async function errorFromResponse(response: Response, parsed?: unknown): Promise<ApiError> {
  let body: { code?: unknown; requestId?: unknown; fieldErrors?: unknown } = {};
  if (parsed && typeof parsed === "object") body = parsed as typeof body;
  else if (!response.bodyUsed)
    try {
      body = (await response.clone().json()) as typeof body;
    } catch {
      /* non-JSON error body */
    }
  const code = typeof body.code === "string" ? body.code : undefined;
  const requestId =
    typeof body.requestId === "string" ? body.requestId : (response.headers.get("x-request-id") ?? undefined);
  const fieldErrors = Array.isArray(body.fieldErrors)
    ? (body.fieldErrors as unknown[]).filter(
        (f): f is FieldError =>
          !!f && typeof (f as FieldError).field === "string" && typeof (f as FieldError).message === "string",
      )
    : [];
  return new ApiError(kindForStatus(response.status, code), response.status, code, requestId, fieldErrors);
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return new ApiError("offline");
  if (error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError"))
    return new ApiError("network");
  return new ApiError("unknown");
}

export const errorMessageKey: Record<ErrorKind, MessageKey> = {
  offline: "errors.offline",
  network: "errors.network",
  unauthorized: "errors.unauthorized",
  forbidden: "errors.forbidden",
  "not-found": "errors.notFound",
  validation: "errors.validation",
  conflict: "errors.conflict",
  "rate-limited": "errors.rateLimited",
  unavailable: "errors.unavailable",
  "payload-too-large": "errors.payloadTooLarge",
  "unsupported-media": "errors.unsupportedMedia",
  "invalid-media": "errors.invalidMedia",
  "upload-expired": "errors.uploadExpired",
  unknown: "errors.unknown",
};

/** Errors worth an automatic or user retry. */
export function isRetryable(error: ApiError): boolean {
  return ["offline", "network", "unavailable", "rate-limited"].includes(error.kind);
}
