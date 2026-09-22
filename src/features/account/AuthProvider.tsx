"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AuthClient } from "./AuthClient";
import type { AccountSession } from "./types";

type AuthContextValue = { session: AccountSession | null; isLoading: boolean; refresh: () => Promise<void>; login: (email: string, password: string) => Promise<void>; register: (name: string, email: string, password: string) => Promise<{ verificationToken?: string }>; logout: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refresh = useCallback(async () => { setSession(await AuthClient.restoreSession()); setIsLoading(false); }, []);
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void AuthClient.request("/auth/refresh", { method: "POST" }).then(() => refresh()).catch(() => undefined);
    }, 12 * 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);
  const value = useMemo<AuthContextValue>(() => ({ session, isLoading, refresh, login: async (email, password) => { await AuthClient.login(email, password); await refresh(); }, register: async (name, email, password) => { const result = await AuthClient.register(name, email, password); await refresh(); return result; }, logout: async () => { await AuthClient.logout(); setSession(null); } }), [isLoading, refresh, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth deve ser usado dentro de AuthProvider."); return value; }
