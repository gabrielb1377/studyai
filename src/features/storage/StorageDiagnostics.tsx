"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, HardDrive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  STORAGE_UPDATED_EVENT,
  StorageManager,
  type StorageDiagnostics as Diagnostics,
} from "@/lib/storage/StorageManager";
import { STORAGE_STORES } from "@/lib/storage/StorageVersion";

function formatBytes(value?: number) {
  if (value === undefined) return "Indisponível";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const position = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** position).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[position]}`;
}

export function StorageDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDiagnostics(await StorageManager.diagnostics());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o diagnóstico.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleUpdate = () => { void reload(); };
    void reload();
    window.addEventListener(STORAGE_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(STORAGE_UPDATED_EVENT, handleUpdate);
  }, [reload]);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => { void reload(); }} disabled={loading}>
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
          Atualizar status
        </Button>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo do armazenamento">
            {[
              ["Banco", diagnostics?.database ?? "Carregando...", Database],
              ["Versão", diagnostics?.version?.toString() ?? "—", Database],
              ["Espaço ocupado", formatBytes(diagnostics?.usageBytes), HardDrive],
              ["Cota estimada", formatBytes(diagnostics?.quotaBytes), HardDrive],
            ].map(([label, value, Icon]) => (
              <Card key={String(label)} className="gap-3 py-5">
                <CardContent className="flex items-center gap-3 px-5">
                  <span className="rounded-lg bg-accent p-2 text-primary"><Icon className="size-4" aria-hidden="true" /></span>
                  <div><p className="text-xs text-muted-foreground">{String(label)}</p><p className="mt-1 font-semibold">{String(value)}</p></div>
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Object Stores</CardTitle>
              <CardDescription>Quantidade de registros persistidos por domínio.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-secondary/60 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Store</th><th className="px-4 py-3 text-right font-medium">Registros</th></tr></thead>
                  <tbody className="divide-y">
                    {STORAGE_STORES.map((store) => <tr key={store}><td className="px-4 py-3 font-mono text-xs">{store}</td><td className="px-4 py-3 text-right font-medium">{diagnostics?.counts[store] ?? 0}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Última migração: {diagnostics?.lastMigration ? new Date(diagnostics.lastMigration).toLocaleString("pt-BR") : "não registrada"}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
