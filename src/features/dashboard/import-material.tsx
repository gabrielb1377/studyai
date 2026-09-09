import Link from "next/link";
import { ArrowUpRight, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ImportMaterial({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Button variant="outline" asChild>
        <Link href="/importar">
          <Plus className="size-4" />
          Importar material
        </Link>
      </Button>
    );
  }

  return (
    <Link
      href="/importar"
      className="group flex h-full min-h-60 w-full flex-col items-start rounded-xl border border-dashed bg-card p-6 text-left transition-colors hover:border-primary/50 hover:bg-secondary/30 sm:p-7"
    >
      <span className="mb-auto flex size-11 items-center justify-center rounded-xl border bg-background text-primary">
        <Upload className="size-5" strokeWidth={1.5} />
      </span>
      <span className="mt-7 flex w-full items-center justify-between text-lg font-semibold tracking-tight">
        Importar material
        <ArrowUpRight className="size-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </span>
      <span className="mt-2 max-w-56 text-sm leading-6 text-muted-foreground">
        Tudo o que você quer aprender, em um só lugar.
      </span>
      <span className="mt-4 text-xs text-muted-foreground">
        Preparar uma importação
      </span>
    </Link>
  );
}
