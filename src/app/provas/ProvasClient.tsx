"use client";

import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { ExamWorkspace } from "@/features/exam/ExamWorkspace";
import { useStudyEngine } from "@/features/study/hooks/useStudyEngine";

export function ProvasClient({ requestedExamId }: { requestedExamId?: string }) {
  const auth = useAuth();
  const { records: studies, isLoading, error } = useStudyEngine();

  if (auth.isLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando estudos...</p>
      </div>
    );
  }

  const sessionOwner = auth.session?.user.id ?? SessionOperationManager.current().userId;

  return (
    <div className="space-y-3">
      {error ? (
        <p role="status" className="text-sm text-muted-foreground">
          Os estudos não puderam ser carregados agora. Seus vínculos existentes foram preservados.
        </p>
      ) : null}
      <ExamWorkspace studies={studies} sessionOwner={sessionOwner} requestedExamId={requestedExamId} />
    </div>
  );
}
