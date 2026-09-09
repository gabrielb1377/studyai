import { Library, SearchX, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImportMaterialButton } from "./ImportMaterialButton";

export function LibraryEmptyState() {
  return (
    <EmptyState
      icon={Library}
      title="Você ainda não possui materiais."
      description="Este será o lugar para reunir os materiais dos seus estudos. Comece selecionando o primeiro material."
    >
      <ImportMaterialButton label="Importar primeiro material" />
    </EmptyState>
  );
}

export function LibraryNoResults({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title="Nenhum material encontrado"
      description="Tente outro termo ou remova os filtros para ver todos os materiais."
    >
      <Button variant="outline" onClick={onClear}>
        Limpar pesquisa e filtros
      </Button>
    </EmptyState>
  );
}

export function LibraryLoading() {
  return (
    <div
      role="status"
      aria-label="Carregando materiais"
      className="space-y-6 motion-safe:animate-pulse"
    >
      <span className="sr-only">Carregando materiais...</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="h-11 w-full max-w-md rounded-md bg-muted" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-11 w-20 rounded-md bg-muted" />
          ))}
        </div>
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Card key={index} className="min-h-80 gap-5 p-5 shadow-none">
              <div className="size-10 rounded-lg bg-muted" />
              <div className="h-5 w-3/4 rounded bg-muted" />
              <div className="space-y-3">
                {Array.from({ length: 4 }, (_, row) => (
                  <div key={row} className="h-4 w-full rounded bg-muted" />
                ))}
              </div>
              <div className="mt-auto h-4 w-2/3 rounded bg-muted" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LibraryErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        icon={TriangleAlert}
        title="Não foi possível carregar os materiais"
        description="Tente novamente para abrir sua biblioteca."
      >
        <Button variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      </EmptyState>
    </div>
  );
}
