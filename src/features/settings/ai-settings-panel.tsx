"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AIModel, AIProviderId, AIProviderStatus } from "@/features/ai/AIProvider";
import { AISettings, aiProviderOptions } from "@/features/ai/AISettings";

export function AISettingsPanel() {
  const [provider, setProvider] = useState<AIProviderId>("gemini");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<AIModel[]>([]);
  const [status, setStatus] = useState<AIProviderStatus | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const settings = AISettings.load();
    setProvider(settings.provider);
    setModel(settings.models[settings.provider] ?? "");
  }, []);

  const testOllama = useCallback(async () => {
    setIsTesting(true);
    setStatus(null);
    try {
      const response = await fetch("/api/ai/providers/ollama", { cache: "no-store" });
      const data = await response.json().catch(() => null) as AIProviderStatus | null;
      if (!response.ok || !data) throw new Error("Não foi possível verificar o Ollama.");
      setStatus(data);
      setModels(data.models);

      if (data.available && data.models.length > 0) {
        const savedModel = AISettings.load().models.ollama;
        const nextModel = data.models.some((item) => item.name === savedModel)
          ? savedModel as string
          : data.models[0].name;
        setModel(nextModel);
        AISettings.saveModel("ollama", nextModel);
      }
    } catch {
      setModels([]);
      setStatus({
        provider: "ollama",
        available: false,
        latencyMs: 0,
        models: [],
        error: "Ollama indisponível",
      });
    } finally {
      setIsTesting(false);
    }
  }, []);

  useEffect(() => {
    if (provider === "ollama") void testOllama();
  }, [provider, testOllama]);

  return (
    <Card className="max-w-2xl shadow-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Provedor de IA</CardTitle>
            <CardDescription>Escolha qual integração será usada pelas ferramentas de estudo.</CardDescription>
          </div>
          <Bot className="size-5 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="grid gap-2 text-sm font-medium">
          Provider
          <select
            aria-label="Provider de IA"
            value={provider}
            onChange={(event) => {
              const nextProvider = event.target.value as AIProviderId;
              setProvider(nextProvider);
              setModel(AISettings.load().models[nextProvider] ?? "");
              setStatus(null);
              setModels([]);
              AISettings.save(nextProvider);
            }}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {aiProviderOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}{option.available ? "" : " — em breve"}
              </option>
            ))}
          </select>
        </label>

        {provider === "ollama" ? (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <label className="grid gap-2 text-sm font-medium">
              Modelo instalado
              <select
                aria-label="Modelo do Ollama"
                value={model}
                disabled={!status?.available || models.length === 0 || isTesting}
                onChange={(event) => {
                  setModel(event.target.value);
                  AISettings.saveModel("ollama", event.target.value);
                }}
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {models.length === 0 ? (
                  <option value="">Nenhum modelo encontrado</option>
                ) : models.map((item) => (
                  <option key={item.name} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={testOllama} disabled={isTesting}>
                <RefreshCw className={isTesting ? "animate-spin" : undefined} aria-hidden="true" />
                {isTesting ? "Testando..." : "Testar conexão"}
              </Button>
              <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
                {status && (
                  <>
                    <span
                      className={`size-2 rounded-full ${status.available ? "bg-emerald-500" : "bg-destructive"}`}
                      aria-hidden="true"
                    />
                    <span className="font-medium">{status.available ? "Conectado" : "Ollama indisponível"}</span>
                  </>
                )}
              </div>
            </div>

            {status?.available && (
              <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div><dt>Versão</dt><dd className="font-medium text-foreground">{status.version ?? "Não informada"}</dd></div>
                <div><dt>Modelo</dt><dd className="font-medium text-foreground">{model || "Não selecionado"}</dd></div>
                <div><dt>Latência</dt><dd className="font-medium text-foreground">{status.latencyMs} ms</dd></div>
              </dl>
            )}
            {status?.available && models.length === 0 && (
              <p className="text-xs text-muted-foreground">O Ollama está conectado, mas não possui modelos instalados.</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={provider === "gemini" ? "secondary" : "outline"}>
              {provider === "gemini" ? "Disponível" : "Stub arquitetural"}
            </Badge>
            A preferência é salva neste navegador.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
