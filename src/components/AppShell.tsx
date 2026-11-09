"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth, wasSignedOut } from "@/lib/auth/AuthProvider";
import { useAnnounce, useOnline } from "@/lib/hooks";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { LoadingState } from "./ui";

const NAV: { href: string; label: MessageKey }[] = [
  { href: "/", label: "nav.inbox" },
  { href: "/capture", label: "nav.capture" },
  { href: "/actions", label: "nav.actions" },
  { href: "/lists", label: "nav.lists" },
  { href: "/settings", label: "nav.settings" },
];

const PUBLIC_PATHS = ["/signin", "/auth/callback"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { t } = useI18n();
  const auth = useAuth();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const showNav = !isPublic && ["authenticated", "expired"].includes(auth.status);

  return (
    <>
      <a className="skip-link" href="#main">
        {t("app.skipToContent")}
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              ↗
            </span>
            {t("app.name")}
          </Link>
          {showNav && (
            <nav aria-label={t("app.primaryNav")} className="primary-nav">
              <ul>
                {NAV.map((item) => {
                  const current =
                    item.href === "/"
                      ? pathname === "/" || pathname.startsWith("/captures")
                      : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link href={item.href} aria-current={current ? "page" : undefined}>
                        {t(item.label)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
        </div>
      </header>
      <OfflineBanner />
      <main id="main" tabIndex={-1} className="app-main">
        {isPublic ? children : <AuthGate>{children}</AuthGate>}
      </main>
    </>
  );
}

function OfflineBanner() {
  const online = useOnline();
  const { t } = useI18n();
  const announce = useAnnounce();
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      announce(t("offline.banner"), "assertive");
    } else if (wasOffline.current) {
      wasOffline.current = false;
      announce(t("offline.back"));
    }
  }, [online, announce, t]);
  if (online) return null;
  return (
    <div className="banner banner-warning" role="status">
      {t("offline.banner")}
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { t } = useI18n();
  const { status, signIn } = auth;
  const redirecting = status === "unauthenticated";

  useEffect(() => {
    if (status !== "unauthenticated") return;
    if (wasSignedOut()) {
      window.location.replace("/signin");
      return;
    }
    // No in-memory session (e.g. after reload): continue via the identity provider session.
    void signIn();
  }, [status, signIn]);

  if (status === "loading" || status === "unauthenticated")
    return <LoadingState label={redirecting ? t("auth.redirecting") : undefined} />;
  if (status === "unverified")
    return (
      <section className="card narrow" aria-labelledby="verify-title">
        <h1 id="verify-title">{t("auth.verifyTitle")}</h1>
        <p>{t("auth.verifyBody")}</p>
        <button type="button" className="button" onClick={() => void auth.signOut()}>
          {t("nav.signOut")}
        </button>
      </section>
    );
  return (
    <>
      {status === "expired" && <SessionExpired />}
      {children}
    </>
  );
}

function SessionExpired() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="banner banner-error" role="alert" tabIndex={-1} ref={ref} data-testid="session-expired">
      <p>{t("auth.sessionExpired")}</p>
      <button type="button" className="button" onClick={() => void signIn()}>
        {t("auth.signInAgain")}
      </button>
    </div>
  );
}
