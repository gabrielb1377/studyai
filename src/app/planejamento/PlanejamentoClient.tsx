"use client";

import { PageHeading } from "@/components/page-heading";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { PlanningWorkspace } from "@/features/planning/components/PlanningWorkspace";

export function PlanejamentoClient({ requestedExamId }: { requestedExamId?: string }) {
  const auth = useAuth();
  const session = SessionOperationManager.current();

  if (auth.isLoading || session.suspended) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando planejamento...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Planejamento inteligente"
        title="Plano de Estudos"
        description="Metas, prioridades reais, revisões pendentes e integração com a Semana de Prova."
      />
      <PlanningWorkspace key={session.generation} requestedExamId={requestedExamId} />
    </div>
  );
}
