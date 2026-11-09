// Public, build-time client configuration. Only non-secret values belong here: the web
// app is a public OIDC client (Authorization Code + PKCE) and holds no client secret.

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function secureUrl(value: string, name: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname)))
    throw new Error(`${name} must use HTTPS outside local development`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`Invalid ${name}`);
  return value.replace(/\/$/, "");
}

export const config = {
  apiBaseUrl: secureUrl(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001/api/v1",
    "NEXT_PUBLIC_API_BASE_URL",
  ),
  oidcIssuer: secureUrl(
    process.env.NEXT_PUBLIC_OIDC_ISSUER ?? "http://127.0.0.1:18080/realms/nextstep",
    "NEXT_PUBLIC_OIDC_ISSUER",
  ),
  oidcClientId: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? "nextstep-web",
};

/** Scopes requested at sign-in; the gateway and services enforce them again. */
export const SCOPES = [
  "openid",
  "captures:read",
  "captures:write",
  "suggestions:read",
  "suggestions:write",
  "actions:read",
  "actions:write",
  "lists:read",
  "lists:write",
  "preferences:read",
  "preferences:write",
  "exports:read",
  "exports:write",
  "account:read",
  "account:delete",
].join(" ");
