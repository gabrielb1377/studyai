"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/account/AuthProvider";
import { StorageManager } from "@/lib/storage/StorageManager";

type Check = { label: string; ok: boolean; detail: string };
type Health = { database?: string; objectStorage?: { available?: boolean; mode?: string } };
type AIHealth = { activeProvider?: string; providers?: Array<{ available?: boolean }> };

export function BetaReadinessPanel() {
  const auth = useAuth();
  const [checks, setChecks] = useState<Check[]>([]);
  const [working, setWorking] = useState(false);
  const run = useCallback(async () => {
    setWorking(true);
    const [health, ai, storage] = await Promise.all([
      fetch("/api/health", { cache: "no-store" }).then((response) => response.json() as Promise<Health>).catch(() => ({} as Health)),
      fetch("/api/ai/manager", { cache: "no-store" }).then((response) => response.json() as Promise<AIHealth>).catch(() => ({} as AIHealth)),
      StorageManager.diagnostics().catch(() => null),
    ]);
    const offline = localStorage.getItem("studyai:offline-session") === "active";
    setChecks([
      { label: "Acesso", ok: Boolean(auth.session || offline), detail: auth.session ? "Conta autenticada" : offline ? "Sessão offline ativa" : "Sem sessão" },
      { label: "Persistência local", ok: Boolean(storage), detail: storage ? `${storage.database} · ${storage.counts.documents} materiais` : "IndexedDB indisponível" },
      { label: "PostgreSQL", ok: health.database === "postgres", detail: health.database === "postgres" ? "Conectado" : "Fallback em memória" },
      { label: "Object Storage", ok: Boolean(health.objectStorage?.available), detail: health.objectStorage?.available ? `Disponível (${health.objectStorage.mode ?? "configurado"})` : "Não configurado" },
      { label: "Provider de IA", ok: Boolean(ai.providers?.some((provider) => provider.available)), detail: ai.activeProvider ? `Ativo: ${ai.activeProvider}` : "Nenhum provider online" },
      { label: "HTTPS", ok: window.isSecureContext || location.hostname === "localhost", detail: window.isSecureContext ? "Contexto seguro" : location.hostname === "localhost" ? "Desenvolvimento local" : "HTTPS necessário" },
      { label: "PWA", ok: "serviceWorker" in navigator, detail: "serviceWorker" in navigator ? "Suportado pelo navegador" : "Não suportado" },
      { label: "Workspace", ok: Boolean(localStorage.getItem("studyai:workspace-current") || storage?.counts.studies), detail: localStorage.getItem("studyai:workspace-current") ? "Sessão restaurável" : "Aguardando primeiro estudo" },
    ]);
    setWorking(false);
  }, [auth.session]);
  useEffect(() => { void run(); }, [run]);
  const ready = checks.filter((check) => check.ok).length;
  return <Card><CardHeader><div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Rocket className="size-5" /></span><div className="flex-1"><CardTitle>Beta Readiness</CardTitle><CardDescription>Verificação do ambiente atual. Itens externos podem permanecer pendentes no desenvolvimento local.</CardDescription></div><Badge variant={ready === checks.length ? "secondary" : "outline"}>{ready}/{checks.length}</Badge></div></CardHeader><CardContent className="space-y-3"><div className="grid gap-2 sm:grid-cols-2">{checks.map((check) => <div key={check.label} className="flex items-start gap-3 rounded-lg border p-3">{check.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />}<div><p className="text-sm font-medium">{check.label}</p><p className="text-xs text-muted-foreground">{check.detail}</p></div></div>)}</div><Button variant="outline" onClick={() => void run()} disabled={working}>{working ? "Verificando…" : "Executar diagnóstico"}</Button></CardContent></Card>;
}
