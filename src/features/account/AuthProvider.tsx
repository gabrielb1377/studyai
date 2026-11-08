"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AuthClient } from "./AuthClient";
import type { AccountSession } from "./types";
import { StorageManager } from "@/lib/storage/StorageManager";
import { SessionOperationManager } from "./SessionOperationManager";
import { SessionLocalData } from "./SessionLocalData";

const SESSION_CHANGE_KEY = "studyai:session-change";

type AuthContextValue = { session: AccountSession | null; isLoading: boolean; refresh: () => Promise<void>; login: (email: string, password: string, rememberDevice?: boolean) => Promise<void>; register: (name: string, email: string, password: string) => Promise<{ verificationToken?: string }>; logout: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionRef = useRef<AccountSession | null>(null);
  const transition = useRef<Promise<unknown>>(Promise.resolve());
  const runTransition = useCallback(<T,>(operation: () => Promise<{ session: AccountSession | null; value: T }>, announce = true, persistCurrent = true) => {
    const next = transition.current.catch(() => undefined).then(async () => {
      setIsLoading(true);
      SessionOperationManager.beginTransition();
      try {
        if (persistCurrent) await SessionLocalData.suspend(sessionRef.current?.user.id ?? SessionLocalData.offlineOwnerHint());
        else SessionLocalData.clearOwner();
        const result = await operation();
        const nextOwner = result.session?.user.id ?? SessionLocalData.offlineOwnerHint();
        await StorageManager.setUserScope(result.session?.user.id);
        if (result.session) await SessionLocalData.resume(result.session.user.id);
        else if (SessionLocalData.offlineOwnerHint()) await SessionLocalData.resumeOffline();
        else SessionLocalData.clearRuntime();
        sessionRef.current = result.session;
        setSession(result.session);
        SessionOperationManager.activate(nextOwner);
        if (announce) localStorage.setItem(SESSION_CHANGE_KEY, crypto.randomUUID());
        return result.value;
      } catch (error) {
        await StorageManager.setUserScope();
        SessionLocalData.clearRuntime();
        sessionRef.current = null;
        setSession(null);
        SessionOperationManager.activate();
        throw error;
      } finally {
        setIsLoading(false);
      }
    });
    transition.current = next;
    return next;
  }, []);
  const refresh = useCallback(() => runTransition(async () => ({ session: await AuthClient.restoreSession(), value: undefined })), [runTransition]);
  useEffect(() => {
    void refresh().catch(() => undefined);
    const interval = window.setInterval(() => {
      void AuthClient.request("/auth/refresh", { method: "POST" }).then(() => refresh()).catch(() => undefined);
    }, 12 * 60_000);
    const otherTabChanged = (event: StorageEvent) => {
      if (event.key === SESSION_CHANGE_KEY) void runTransition(async () => ({ session: await AuthClient.restoreSession(), value: undefined }), false, false).catch(() => undefined);
    };
    window.addEventListener("storage", otherTabChanged);
    return () => { window.clearInterval(interval); window.removeEventListener("storage", otherTabChanged); };
  }, [refresh, runTransition]);
  const value = useMemo<AuthContextValue>(() => ({
    session,
    isLoading,
    refresh,
    login: (email, password, rememberDevice) => runTransition(async () => {
      await AuthClient.login(email, password, rememberDevice);
      return { session: await AuthClient.restoreSession(), value: undefined };
    }),
    register: (name, email, password) => runTransition(async () => {
      const result = await AuthClient.register(name, email, password);
      return { session: await AuthClient.restoreSession(), value: result };
    }),
    logout: () => runTransition(async () => {
      await AuthClient.logout();
      SessionLocalData.clearOwner();
      return { session: null, value: undefined };
    }),
  }), [isLoading, refresh, runTransition, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth deve ser usado dentro de AuthProvider."); return value; }
