"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AIProviderId } from "@/features/ai/AIProvider";
import { AISettings, aiProviderOptions } from "@/features/ai/AISettings";

export function AISettingsPanel() {
  const [provider, setProvider] = useState<AIProviderId>("gemini");

  useEffect(() => setProvider(AISettings.load().provider), []);

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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={provider === "gemini" ? "secondary" : "outline"}>
            {provider === "gemini" ? "Disponível" : "Stub arquitetural"}
          </Badge>
          A preferência é salva neste navegador.
        </div>
      </CardContent>
    </Card>
  );
}
