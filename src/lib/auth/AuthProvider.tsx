"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { InMemoryWebStorage, UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { config, SCOPES } from "@/lib/config";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "expired" | "unverified";

type Auth = {
  status: AuthStatus;
  displayName?: string;
  signIn: (returnTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** A currently valid access token, refreshed if needed; undefined when signed out. */
  getAccessToken: () => Promise<string | undefined>;
  /** Called by the API client when the gateway rejects the token. */
  reportUnauthorized: () => void;
  completeSignIn: () => Promise<string>;
};

const AuthContext = createContext<Auth | null>(null);
const SIGNED_OUT_FLAG = "nextstep.signedOut";

let sharedManager: UserManager | undefined;
export function userManager(): UserManager {
  if (!sharedManager) {
    const origin = window.location.origin;
    sharedManager = new UserManager({
      authority: config.oidcIssuer,
      client_id: config.oidcClientId,
      redirect_uri: `${origin}/auth/callback`,
      post_logout_redirect_uri: `${origin}/signin`,
      response_type: "code",
      scope: SCOPES,
      // Tokens live only in memory; a reload re-authenticates via the identity provider session.
      userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
      // Only the one-time state and PKCE verifier for an in-flight redirect, removed on callback.
      stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
      automaticSilentRenew: true,
      loadUserInfo: false,
      monitorSession: false,
      filterProtocolClaims: true,
    });
  }
  return sharedManager;
}

/** Allow only same-origin, path-relative return targets after sign-in. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  if (value.startsWith("/auth/") || value.startsWith("/signin")) return "/";
  return value;
}

function statusFor(user: User | null): AuthStatus {
  if (!user || user.expired) return "unauthenticated";
  if (user.profile.email_verified === false) return "unverified";
  return "authenticated";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const renewing = useRef<Promise<User | null> | null>(null);

  useEffect(() => {
    const manager = userManager();
    let active = true;
    void manager.getUser().then((current) => {
      if (!active) return;
      setUser(current);
      setStatus(statusFor(current));
    });
    const loaded = (u: User) => {
      setUser(u);
      setStatus(statusFor(u));
    };
    const renewFailed = () => setStatus((s) => (s === "authenticated" ? "expired" : s));
    manager.events.addUserLoaded(loaded);
    manager.events.addSilentRenewError(renewFailed);
    manager.events.addAccessTokenExpired(renewFailed);
    return () => {
      active = false;
      manager.events.removeUserLoaded(loaded);
      manager.events.removeSilentRenewError(renewFailed);
      manager.events.removeAccessTokenExpired(renewFailed);
    };
  }, []);

  const signIn = useCallback(async (returnTo?: string) => {
    window.sessionStorage.removeItem(SIGNED_OUT_FLAG);
    await userManager().signinRedirect({
      state: { returnTo: safeReturnTo(returnTo ?? window.location.pathname + window.location.search) },
    });
  }, []);

  const signOut = useCallback(async () => {
    const manager = userManager();
    const current = await manager.getUser();
    window.sessionStorage.setItem(SIGNED_OUT_FLAG, "1");
    await manager.removeUser();
    setUser(null);
    setStatus("unauthenticated");
    await manager.signoutRedirect(current?.id_token ? { id_token_hint: current.id_token } : undefined);
  }, []);

  const getAccessToken = useCallback(async () => {
    const manager = userManager();
    const current = await manager.getUser();
    if (!current) return undefined;
    if (current.expires_in !== undefined && current.expires_in > 30) return current.access_token;
    if (!current.refresh_token) return current.expired ? undefined : current.access_token;
    renewing.current ??= manager.signinSilent().finally(() => {
      renewing.current = null;
    });
    try {
      return (await renewing.current)?.access_token;
    } catch {
      setStatus("expired");
      return undefined;
    }
  }, []);

  const reportUnauthorized = useCallback(() => {
    setStatus((s) => (s === "authenticated" ? "expired" : s));
  }, []);

  const completeSignIn = useCallback(async () => {
    const signedIn = await userManager().signinRedirectCallback();
    setUser(signedIn);
    setStatus(statusFor(signedIn));
    return safeReturnTo((signedIn.state as { returnTo?: unknown } | undefined)?.returnTo);
  }, []);

  const value = useMemo<Auth>(
    () => ({
      status,
      displayName:
        (user?.profile.name as string | undefined) ??
        (user?.profile.preferred_username as string | undefined) ??
        (user?.profile.email as string | undefined),
      signIn,
      signOut,
      getAccessToken,
      reportUnauthorized,
      completeSignIn,
    }),
    [status, user, signIn, signOut, getAccessToken, reportUnauthorized, completeSignIn],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function wasSignedOut(): boolean {
  return typeof window !== "undefined" && window.sessionStorage.getItem(SIGNED_OUT_FLAG) === "1";
}
