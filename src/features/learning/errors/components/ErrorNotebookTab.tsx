import Link from "next/link";
import { NotebookPen, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import type { StudyRecord } from "@/types/study-engine";
import type { ErrorNotebookEntry, ErrorReviewStatus } from "../types";
import {
  ERROR_STATUS_CLASSES,
  ERROR_STATUS_LABELS,
  SOURCE_LABELS,
} from "./learning-constants";
import { ManualErrorForm } from "./ManualErrorForm";

export function ErrorNotebookTab({
  entries,
  filteredErrors,
  studies,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  studyFilter,
  onStudyFilterChange,
  showManualForm,
  onCloseManualForm,
  onSubmitManualEntry,
  isSaving,
  onMarkErrorStatus,
  onRemoveEntry,
}: {
  entries: ErrorNotebookEntry[];
  filteredErrors: ErrorNotebookEntry[];
  studies: StudyRecord[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  statusFilter: ErrorReviewStatus | "all";
  onStatusFilterChange: (status: ErrorReviewStatus | "all") => void;
  studyFilter: string;
  onStudyFilterChange: (studyId: string) => void;
  showManualForm: boolean;
  onCloseManualForm: () => void;
  onSubmitManualEntry: (entry: {
    studyId?: string;
    topic: string;
    questionPrompt: string;
    wrongAnswer: string;
    correctAnswer: string;
  }) => Promise<void>;
  isSaving: boolean;
  onMarkErrorStatus: (id: string, status: ErrorReviewStatus) => Promise<void>;
  onRemoveEntry: (id: string) => Promise<void>;
}) {
  return (
    <section aria-label="Caderno de erros" className="space-y-4">
      {showManualForm ? (
        <ManualErrorForm
          studies={studies}
          initialStudyId={studyFilter}
          isSaving={isSaving}
          onSubmit={onSubmitManualEntry}
          onCancel={onCloseManualForm}
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar no Caderno de Erros"
            className="pl-9"
            placeholder="Buscar erro, tema ou resposta..."
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </div>

        <select
          aria-label="Filtrar por status do erro"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as ErrorReviewStatus | "all")}
        >
          <option value="all">Todos os status</option>
          <option value="pending">Pendentes</option>
          <option value="reviewed">Revisados</option>
          <option value="resolved">Resolvidos</option>
        </select>

        <select
          aria-label="Filtrar por tema"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={studyFilter}
          onChange={(event) => onStudyFilterChange(event.target.value)}
        >
          <option value="">Todos os estudos</option>
          {studies.map((study) => (
            <option key={study.studyId} value={study.studyId}>
              {study.title}
            </option>
          ))}
        </select>
      </div>

      {filteredErrors.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Nenhum erro encontrado"
          description={
            entries.length === 0
              ? "Erros cometidos no Quiz, Flashcards ou Simulado de Materiais aparecem aqui automaticamente. Você também pode registrar erros manualmente."
              : "Ajuste os filtros acima para visualizar outros registros."
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredErrors.map((entry) => (
            <Card key={entry.id} className="gap-3 p-4 shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={ERROR_STATUS_CLASSES[entry.status]}>
                      {ERROR_STATUS_LABELS[entry.status]}
                    </Badge>
                    <Badge variant="secondary">{SOURCE_LABELS[entry.source]}</Badge>
                    {entry.occurrences > 1 ? (
                      <Badge variant="outline">Reincidência · {entry.occurrences}x</Badge>
                    ) : null}
                    {entry.sourceUnavailable ? (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                        Estudo indisponível
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {entry.studyTitle} · {entry.subject}
                    {entry.topic && entry.topic !== entry.studyTitle ? ` · ${entry.topic}` : ""}
                  </p>
                </div>
              </div>

              <p className="text-sm font-medium leading-relaxed">{entry.questionPrompt}</p>

              <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-destructive">Sua resposta / erro:</span>
                  <p className="mt-1 text-foreground">{entry.wrongAnswer}</p>
                </div>
                {entry.correctAnswer ? (
                  <div>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                      Referência correta:
                    </span>
                    <p className="mt-1 text-foreground">{entry.correctAnswer}</p>
                  </div>
                ) : null}
              </div>

              {entry.explanation ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  Explicação: {entry.explanation}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {entry.studyId && !entry.sourceUnavailable ? (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/estudo?tema=${encodeURIComponent(entry.studyId)}&aba=tutor&origem=aprendizagem`}
                    >
                      Revisar no Tutor
                    </Link>
                  </Button>
                ) : entry.sourceUnavailable ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/biblioteca">Abrir biblioteca</Link>
                  </Button>
                ) : null}

                {entry.status !== "reviewed" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => void onMarkErrorStatus(entry.id, "reviewed")}
                  >
                    Marcar revisado
                  </Button>
                ) : null}

                {entry.status !== "resolved" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => void onMarkErrorStatus(entry.id, "resolved")}
                  >
                    Marcar resolvido
                  </Button>
                ) : null}

                {entry.status !== "pending" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => void onMarkErrorStatus(entry.id, "pending")}
                  >
                    Reabrir
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover erro ${entry.questionPrompt}`}
                  disabled={isSaving}
                  onClick={() => void onRemoveEntry(entry.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
