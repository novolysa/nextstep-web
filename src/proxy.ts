import { NextResponse, type NextRequest } from "next/server";
import { config as clientConfig } from "@/lib/config";

/** Strict, per-request nonce Content Security Policy (see Next.js CSP guide). */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV === "development";
  const api = new URL(clientConfig.apiBaseUrl).origin;
  const identity = new URL(clientConfig.oidcIssuer).origin;
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-inline'" : ""}`,
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' ${api} ${identity}${dev ? " ws:" : ""}`,
    "frame-src 'none'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${identity}`,
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
