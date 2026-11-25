"use client";

import { PageHeading } from "@/components/page-heading";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import {
  PersonalizedLearningWorkspace,
  type LearningWorkspaceTab,
} from "@/features/learning/errors/PersonalizedLearningWorkspace";

export function AprendizagemClient({
  initialStudyId,
  initialTab,
}: {
  initialStudyId?: string;
  initialTab?: LearningWorkspaceTab;
}) {
  const auth = useAuth();
  const session = SessionOperationManager.current();

  if (auth.isLoading || session.suspended) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando aprendizagem personalizada...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Aprendizagem personalizada"
        title="Dificuldades e Caderno de Erros"
        description="Acompanhe pontos frágeis reais, erros registrados nas práticas e revisões direcionadas."
      />
      <PersonalizedLearningWorkspace
        key={session.generation}
        initialStudyId={initialStudyId}
        initialTab={initialTab}
      />
    </div>
  );
}
