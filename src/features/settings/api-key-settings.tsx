"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AIProviderId } from "@/features/ai/AIProvider";
import { aiProviderOptions } from "@/features/ai/AISettings";

type StoredKey = { provider: AIProviderId; keyHint: string; updatedAt: string };

function csrf() {
  return document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("studyai_csrf="))?.split("=").slice(1).join("=") ?? "";
}

export function ApiKeySettings() {
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<AIProviderId, string>>>({});
  const [testing, setTesting] = useState<AIProviderId | null>(null);
  const [saving, setSaving] = useState<AIProviderId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/account/api-keys", { cache: "no-store" });
      if (response.status === 401) { setKeys([]); return; }
      const data = await response.json().catch(() => null) as { keys?: StoredKey[] } | null;
      if (!response.ok || !data) throw new Error("Não foi possível carregar as chaves de API.");
      setKeys(data.keys ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as chaves de API.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const storedFor = (provider: AIProviderId) => keys.find((item) => item.provider === provider);

  async function save(provider: AIProviderId) {
    const key = drafts[provider]?.trim();
    if (!key) { setError("Informe a chave de API."); return; }
    setSaving(provider);
    setError(null); setMessage(null);
    try {
      const response = await fetch("/api/account/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ provider, key }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Não foi possível salvar a chave.");
      setDrafts((current) => ({ ...current, [provider]: "" }));
      setMessage("Chave salva com segurança.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a chave.");
    } finally {
      setSaving(null);
    }
  }

  async function test(provider: AIProviderId) {
    setTesting(provider);
    setError(null); setMessage(null);
    try {
      const key = drafts[provider]?.trim();
      const response = await fetch("/api/account/api-keys/test", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify(key ? { provider, key } : { provider }),
      });
      const data = await response.json().catch(() => null) as { available?: boolean; error?: string; models?: unknown[] } | null;
      if (!response.ok) throw new Error(data?.error || "Não foi possível testar a chave.");
      setMessage(data?.available ? "Chave válida e provider online." : "Provider não respondeu. Verifique a chave.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível testar a chave.");
    } finally {
      setTesting(null);
    }
  }

  async function remove(provider: AIProviderId) {
    setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/account/api-keys?provider=${encodeURIComponent(provider)}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrf() },
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Não foi possível remover a chave.");
      setMessage("Chave removida.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover a chave.");
    }
  }

  return (
    <Card className="max-w-4xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          Chaves de API individuais
        </CardTitle>
        <CardDescription>
          Cadastre sua própria chave para cada provider. As chaves são criptografadas no servidor e nunca exibidas integralmente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-emerald-600">{message}</p>}
        <div className="space-y-3">
          {aiProviderOptions.filter((option) => option.id !== "ollama").map((option) => {
            const stored = storedFor(option.id);
            return (
              <div key={option.id} className="rounded-lg border bg-muted/15 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{option.label}</p>
                  {stored && <span className="text-xs text-muted-foreground">Chave salva: {stored.keyHint}</span>}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder={stored ? "Substituir chave..." : "Cole sua chave de API"}
                    value={drafts[option.id] ?? ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [option.id]: event.target.value }))}
                    className="min-w-[240px] flex-1"
                  />
                  <Button type="button" size="sm" disabled={saving === option.id} onClick={() => void save(option.id)}>
                    {saving === option.id ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={testing === option.id} onClick={() => void test(option.id)}>
                    <RefreshCw className={testing === option.id ? "animate-spin" : undefined} aria-hidden="true" />
                    Testar
                  </Button>
                  {stored && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => void remove(option.id)}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      Remover
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          O Ollama utiliza um endereço local configurado no servidor e não requer chave de API.
        </p>
      </CardContent>
    </Card>
  );
}