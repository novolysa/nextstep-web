# nextstep-web

Responsive NextStep web client (Story 08): Next.js App Router, React and TypeScript. It implements the capture → review → action workflow against the public API gateway only; it never talks to service databases or internal endpoints.

## Status

Story 08 is implemented and verified against the local stack: sign-in and email-verification screens, inbox with status filters, capture composer (text, paste, file picker, camera picker, drag and drop, consented audio recording), suggestion review and correction, actions (Today, Upcoming, Completed), lists, and settings. This is a local prototype, not a production deployment. See [Limitations](#limitations).

## Setup and commands

Node.js 22+ and pnpm. Run `pnpm install --frozen-lockfile`.

| Command                                      | Purpose                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                   | Development server on http://localhost:3000                                                         |
| `pnpm build` / `pnpm start`                  | Production build and server (port 3000)                                                             |
| `pnpm lint`, `pnpm typecheck`, `pnpm format` | ESLint (Next.js rules), TypeScript strict mode, Prettier check                                      |
| `pnpm test`                                  | Vitest unit, component (Testing Library + axe) and contract tests                                   |
| `pnpm test:e2e`                              | Playwright end-to-end tests against the local stack (desktop and mobile viewports)                  |
| `pnpm generate:api` / `pnpm check:api`       | Regenerate or verify `src/lib/api/schema.d.ts` from `../nextstep-contracts/openapi/v1/openapi.json` |
| `pnpm check:bundle`                          | After a build, fail if the browser bundle contains a secret-like value                              |

The web app must be served at `http://localhost:3000` locally: that is the only redirect URI registered for the `nextstep-web` Keycloak client.

### Running the whole app locally

1. Start the dependencies: `cd ../nextstep-infrastructure && ./scripts/bootstrap.sh`.
2. Start the services and the web app: `node scripts/local-stack.mjs start --with-web` (from `nextstep-infrastructure`). It prints the synthetic local user; its password is in `nextstep-infrastructure/.local-stack/local-user.json`.
3. Open http://localhost:3000 and sign in. Notes, checklists and plans (or fixtures such as `task: Buy milk | date: Friday`) produce suggestions with the local rules processing provider.

`pnpm test:e2e` needs steps 1–2 (without `--with-web` it starts `pnpm start` itself; build first). It creates two temporary Keycloak users and deletes them afterwards.

## Configuration

Public build-time values only (see `.env.example`). They are embedded in the browser bundle, so they must never contain secrets.

| Variable                     | Default (local)                          | Meaning                                                        |
| ---------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`   | `http://127.0.0.1:3001/api/v1`           | Public gateway API base                                        |
| `NEXT_PUBLIC_OIDC_ISSUER`    | `http://127.0.0.1:18080/realms/nextstep` | OIDC issuer; must match the token issuer the gateway validates |
| `NEXT_PUBLIC_OIDC_CLIENT_ID` | `nextstep-web`                           | Public OIDC client                                             |

HTTPS is required for both URLs except on loopback.

## Architecture decisions

- **Authentication:** OIDC Authorization Code with PKCE (S256) through `oidc-client-ts`, public client, no secret. Access and refresh tokens live in memory only. Only the one-time state and PKCE verifier sit in `sessionStorage` during the redirect, and they are removed on callback. Nothing is in `localStorage` except non-sensitive display settings. A full page reload re-authenticates through the Keycloak session, usually without a prompt; within a session, tokens refresh silently. A gateway 401 shows a session-expired banner that keeps the page state. _(Decision: browser-held tokens, not a BFF, approved for Story 08.)_
- **API client:** `openapi-fetch` typed by `openapi-typescript` output generated from the canonical contract; `pnpm check:api` and a unit test fail on drift. Errors are normalized to kinds (offline, network, unauthorized, forbidden, not-found, validation, conflict, rate-limited, unavailable, upload errors) with the request ID shown for support.
- **Review:** suggestions are never saved automatically. The review card shows the original capture, the evidence with the extracted date highlighted, confidence (low-confidence warning below 60%), and an ambiguity notice. Every field is editable. Accepting sends `confirmed: true` with a stable idempotency key per reviewed body. When a date is involved, the user must also tick "I've checked the date, time and time zone". Extracted dates stay ambiguous by contract, so only a time found in the text is prefilled; with several suggestions, "Review faster" applies one chosen date to all of them (each still needs confirming) or dismisses all remaining.
- **Dates:** the user enters local date, time and an IANA time zone; the client converts to UTC and sends the zone with it. Times skipped by a DST change are rejected, and repeated times require choosing the first or second occurrence. Nothing guesses a missing year or zone.
- **Originals:** fetched through the authorized `GET /captures/{id}/content` and shown with a local object URL that is revoked on unmount. Text renders as plain text, images and audio are identified by signature, and PDF, HEIC and unknown types are download-only. No storage URL is ever used.
- **Security headers:** a per-request nonce CSP from `src/proxy.ts` (`script-src 'nonce-…' 'strict-dynamic'`; connections only to the gateway and identity origins; `frame-ancestors 'none'`), plus `nosniff`, `no-referrer`, `X-Frame-Options: DENY`, COOP and a restrictive `Permissions-Policy`. No analytics, ads, or third-party scripts.
- **Localization and accessibility:** all strings are in `src/lib/i18n/en.ts` (English ships), using `Intl` for dates, numbers, plurals and language names. The display locale sets `lang`/`dir` (RTL for Arabic, Hebrew and others), and CSS uses logical properties. Semantic landmarks, a skip link, visible focus, focus moved to the heading on navigation, live-region announcements, 44px targets, dark mode, forced colors and reduced motion are all supported. Axe checks run in unit and E2E tests.

## Tests

- Unit and component (`tests/unit`): DST and timezone conversion, action draft and contract rules, upload policy, i18n and RTL, API client (auth header, request ID, cursors, idempotency, error mapping, upload origin check), contract drift, and review, error and composer components with axe.
- End to end (`tests/e2e`, real stack): capture → correct → accept with source link, dismiss, DST gap and overlap entry, owner isolation (a second user gets "not found"), axe on every screen including review and RTL, keyboard skip link, offline, unavailable services, and mobile layout. Failed processing → retry and session expiry are simulated by intercepting API responses inside those tests only, because the local stack can't produce them on demand.

## Container

`docker build -t nextstep-web:local --build-arg NEXT_PUBLIC_API_BASE_URL=… --build-arg NEXT_PUBLIC_OIDC_ISSUER=… .` builds a multi-stage, non-root standalone image. The build runs the bundle secret check, and the image serves port 3000.

## Limitations

- Devices, preferences, exports and account deletion have no backing service yet, and the gateway returns 503. Settings says so, nothing is requested, and display settings are saved on the device only. Web notifications are not delivered (Story 07 not implemented), so the app never asks for notification permission.
- A capture's status stays `needs-review` after its suggestions are reviewed, because the capture service is not told about review decisions. The capture page shows per-suggestion state.
- Locally, file and audio uploads need `ffmpeg`, `ffprobe`, `qpdf` and `vips` on the capture host; without them the composer reports that uploads are unavailable. The local rules processing provider extracts nothing from media (that needs the `python` provider).
- `GET /captures` is ordered oldest-first by contract. The inbox loads up to 20 pages of 100 and sorts newest-first on the client.
