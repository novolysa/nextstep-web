"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { createApi, type Api } from "@/lib/api/client";
import { ApiError, isRetryable, toApiError } from "@/lib/api/errors";

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({ children, api: injected }: { children: React.ReactNode; api?: Api }) {
  const { getAccessToken, reportUnauthorized } = useAuth();
  const api = useMemo(
    () => injected ?? createApi({ getAccessToken, onUnauthorized: reportUnauthorized }),
    [injected, getAccessToken, reportUnauthorized],
  );
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside ApiProvider");
  return api;
}

export type Resource<T> = {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  reload: () => void;
  setData: (update: (current: T | undefined) => T | undefined) => void;
};

/**
 * Load data with loading/error state, retry on reconnect, and optional polling while
 * `pollWhile` holds (paused when the page is hidden).
 */
export function useResource<T>(
  load: (api: Api) => Promise<T>,
  deps: React.DependencyList,
  options: { pollMs?: number; pollWhile?: (data: T) => boolean; enabled?: boolean } = {},
): Resource<T> {
  const api = useApi();
  const [data, setDataState] = useState<T>();
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async (background: boolean) => {
      if (!background) setLoading(true);
      try {
        const result = await loadRef.current(api);
        if (cancelled) return;
        setDataState(result);
        setError(undefined);
        const { pollMs, pollWhile } = optionsRef.current;
        if (pollMs && pollWhile?.(result))
          timer = setTimeout(function tick() {
            if (document.visibilityState === "hidden") timer = setTimeout(tick, pollMs);
            else void run(true);
          }, pollMs);
      } catch (e) {
        if (cancelled) return;
        setError(toApiError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run(false);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, version, enabled, ...deps]);

  useEffect(() => {
    if (!error || !isRetryable(error)) return;
    const online = () => setVersion((v) => v + 1);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [error]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((update: (current: T | undefined) => T | undefined) => setDataState(update), []);
  return { data, error, loading, reload, setData };
}

export { useOnline } from "@/lib/browser";

type Announce = (message: string, priority?: "polite" | "assertive") => void;
const AnnouncerContext = createContext<Announce>(() => {});

/** Screen-reader status announcements through persistent live regions. */
export function AnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const announce = useCallback<Announce>((message, priority = "polite") => {
    const set = priority === "assertive" ? setAssertive : setPolite;
    set("");
    // A fresh text node makes repeated identical messages announce again.
    window.setTimeout(() => set(message), 50);
  }, []);
  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div className="visually-hidden" role="status" aria-live="polite" data-testid="announcer">
        {polite}
      </div>
      <div className="visually-hidden" role="alert" aria-live="assertive">
        {assertive}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnounce(): Announce {
  return useContext(AnnouncerContext);
}

/** Stable idempotency key per logical operation; regenerate after the request body changes. */
export function useIdempotencyKey(dependency: unknown): string {
  const [state, setState] = useState(() => ({ dependency, key: crypto.randomUUID() }));
  if (!Object.is(state.dependency, dependency)) {
    const next = { dependency, key: crypto.randomUUID() };
    setState(next);
    return next.key;
  }
  return state.key;
}
