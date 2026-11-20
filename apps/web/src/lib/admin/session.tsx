"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { AdminEnvironment } from "@/lib/site";

// Team sign-in and calls to the admin API (WEB.md §3). The API checks role = admin and 2FA (aal2)
// on every request; the gate below only keeps the console from showing to anyone else.
//
// Each environment (staging, production) is its own Supabase project and API, so each has its own
// client and saved session: switching never signs you out of the other one.

export type AdminConfig = AdminEnvironment;

type Ctx = {
  config: AdminConfig;
  client: SupabaseClient | null;
  environments: AdminEnvironment[];
  /** The environment switched away from, so sign-in can offer the way back. */
  previous: AdminEnvironment | null;
  switchTo: (id: string) => void;
};
const AdminContext = createContext<Ctx | null>(null);

const clients = new Map<string, SupabaseClient>();

function clientFor(config: AdminConfig): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  let client = clients.get(config.id);
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, storageKey: `quizzly-admin-${config.id}`, detectSessionInUrl: false },
    });
    clients.set(config.id, client);
  }
  return client;
}

// The chosen environment, remembered in this browser. Read with useSyncExternalStore so the server
// render (no storage) and the browser agree, and every tab follows a switch.
const ENV_KEY = "quizzly-admin-env";
const PREV_KEY = "quizzly-admin-env-prev";
const listeners = new Set<() => void>();
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
const readEnv = () => read(ENV_KEY);
const readPrev = () => read(PREV_KEY);
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function AdminProvider({ environments, children }: { environments: AdminEnvironment[]; children: React.ReactNode }) {
  const chosen = useSyncExternalStore(subscribe, readEnv, () => null);
  const prevId = useSyncExternalStore(subscribe, readPrev, () => null);
  const config = environments.find((e) => e.id === chosen) ?? environments[0];
  const previous = environments.find((e) => e.id === prevId && e.id !== config.id) ?? null;
  const switchTo = useCallback((id: string) => {
    try {
      if (config.id !== id) window.localStorage.setItem(PREV_KEY, config.id);
      window.localStorage.setItem(ENV_KEY, id);
    } catch {
      // Storage blocked: the switch still applies to this page.
    }
    listeners.forEach((l) => l());
  }, [config.id]);
  return (
    <AdminContext.Provider value={{ config, client: clientFor(config), environments, previous, switchTo }}>{children}</AdminContext.Provider>
  );
}

/** Production gets a warning colour everywhere, so nobody acts on it thinking it's staging. */
export const isProduction = (env: AdminEnvironment) => /prod/i.test(env.id);

export function useAdmin(): Ctx {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin outside AdminProvider");
  return ctx;
}

export const NOT_CONFIGURED =
  "Team sign-in isn't set up for this environment: set ADMIN_ENVIRONMENTS (or SUPABASE_URL and SUPABASE_ANON_KEY).";

/** True when the session is an admin who has passed their second factor. */
export function isAdmin(session: Session | null): boolean {
  if (!session || session.user.app_metadata?.role !== "admin") return false;
  try {
    const claims = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return claims.aal === "aal2";
  } catch {
    return false;
  }
}

/** The console's gate: renders children only for a signed-in admin with 2FA. */
export function AdminGate({ children }: { children: (session: Session) => React.ReactNode }) {
  const { client } = useAdmin();
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!client) return;
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [client]);

  const allowed = isAdmin(session ?? null);
  useEffect(() => {
    if (client && session !== undefined && !allowed) router.replace("/admin/sign-in");
  }, [allowed, client, router, session]);

  if (!client) return <p className="a-error a-gate">{NOT_CONFIGURED}</p>;
  if (!allowed || !session) return <p className="a-muted a-gate">Checking your sign-in…</p>;
  return <>{children(session)}</>;
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the admin API with the current session's token. */
export function useAdminFetch() {
  const { client, config } = useAdmin();
  return useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const { data } = (await client?.auth.getSession()) ?? { data: { session: null } };
      const headers = new Headers(init.headers);
      if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
      if (init.body) headers.set("Content-Type", "application/json");
      let r: Response;
      try {
        r = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
      } catch {
        throw new AdminApiError(0, "Can't reach the Quizzly API. Check your connection and try again.");
      }
      if (r.status === 204) return undefined as T;
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const d = body?.detail;
        const msg = typeof d === "string" ? d : Array.isArray(d) ? d[0]?.msg : null;
        throw new AdminApiError(r.status, msg || `The API answered ${r.status}. Try again.`);
      }
      return body as T;
    },
    [client, config.apiUrl],
  );
}

/** Loads one admin API path; `reload()` fetches it again (after an action, or on Refresh). */
export function useAdminData<T>(path: string | null) {
  const adminFetch = useAdminFetch();
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let live = true;
    adminFetch<T>(path)
      .then((data) => live && setState({ data, loading: false }))
      .catch((e: Error) => live && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => {
      live = false;
    };
  }, [adminFetch, path, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
