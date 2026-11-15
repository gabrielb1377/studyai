"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  NotebookPen,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DifficultyLevelState } from "./DifficultyMapEngine";
import type { ErrorReviewStatus, ErrorSource } from "./types";
import { usePersonalizedLearning } from "./usePersonalizedLearning";
import { MemoryManagementTab } from "../memory/MemoryManagementTab";

export type LearningWorkspaceTab = "mapa" | "erros" | "revisoes" | "memoria";

const LEVEL_LABELS: Record<DifficultyLevelState, string> = {
  critical: "Dificuldade alta",
  attention: "Requer atenção",
  insufficient_data: "Sem dados suficientes",
  mastered: "Domínio satisfatório",
};

const LEVEL_BADGE_CLASSES: Record<DifficultyLevelState, string> = {
  critical: "border-destructive/30 bg-destructive/10 text-destructive",
  attention: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  insufficient_data: "border-border bg-muted/60 text-muted-foreground",
  mastered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const SOURCE_LABELS: Record<ErrorSource, string> = {
  quiz: "Quiz",
  flashcard: "Flashcard",
  exam_material: "Simulado de material",
  manual: "Registro manual",
};

const ERROR_STATUS_LABELS: Record<ErrorReviewStatus, string> = {
  pending: "Pendente",
  reviewed: "Revisado",
  resolved: "Resolvido",
};

const ERROR_STATUS_CLASSES: Record<ErrorReviewStatus, string> = {
  pending: "border-destructive/30 bg-destructive/10 text-destructive",
  reviewed: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const REVIEW_STATUS_LABELS = {
  late: "Revisão atrasada",
  today: "Revisar hoje",
  upcoming: "Em dia",
  new: "Sem revisão",
} as const;

export function PersonalizedLearningWorkspace({
  initialStudyId,
  initialTab,
}: {
  initialStudyId?: string;
  initialTab?: LearningWorkspaceTab;
}) {
  const {
    studies,
    entries,
    memories,
    memorySettings,
    difficultyItems,
    recommendations,
    assessmentIndicator,
    summary,
    isLoading,
    isSaving,
    error,
    statusMessage,
    addManualEntry,
    markErrorStatus,
    removeEntry,
    completeTargetedReview,
    toggleMemoryEnabled,
    setExplanationLevel,
    addExplicitMemory,
    updateMemory,
    removeMemory,
    clearAllMemories,
  } = usePersonalizedLearning();

  const [activeTab, setActiveTab] = useState<LearningWorkspaceTab>(initialTab ?? "mapa");
  const [studyFilter, setStudyFilter] = useState(initialStudyId ?? "");
  const [statusFilter, setStatusFilter] = useState<ErrorReviewStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);

  const [manualStudyId, setManualStudyId] = useState(initialStudyId ?? "");
  const [manualTopic, setManualTopic] = useState("");
  const [manualPrompt, setManualPrompt] = useState("");
  const [manualWrong, setManualWrong] = useState("");
  const [manualCorrect, setManualCorrect] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const filteredErrors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (studyFilter && entry.studyId !== studyFilter) return false;
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (!query) return true;
      return (
        entry.questionPrompt.toLowerCase().includes(query) ||
        entry.wrongAnswer.toLowerCase().includes(query) ||
        entry.topic.toLowerCase().includes(query) ||
        entry.studyTitle.toLowerCase().includes(query) ||
        entry.subject.toLowerCase().includes(query)
      );
    });
  }, [entries, searchQuery, statusFilter, studyFilter]);

  const filteredRecommendations = useMemo(() => {
    if (!studyFilter) return recommendations;
    return recommendations.filter((item) => item.studyId === studyFilter);
  }, [recommendations, studyFilter]);

  const handleManualSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualPrompt.trim() || !manualWrong.trim()) {
      setFormError("Informe o enunciado/conceito e o erro observado para salvar.");
      return;
    }
    setFormError(null);
    await addManualEntry({
      studyId: manualStudyId || undefined,
      topic: manualTopic,
      questionPrompt: manualPrompt,
      wrongAnswer: manualWrong,
      correctAnswer: manualCorrect,
    });
    setManualTopic("");
    setManualPrompt("");
    setManualWrong("");
    setManualCorrect("");
    setShowManualForm(false);
    setActiveTab("erros");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((slot) => (
            <div key={slot} className="h-24 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border bg-muted/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section aria-label="Resumo da aprendizagem" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-1.5 p-4 shadow-none">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Pontos de atenção</span>
            <BrainCircuit className="size-4 text-primary" />
          </div>
          <p className="text-2xl font-semibold tracking-tight">
            {summary.criticalCount + summary.attentionCount}
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.criticalCount} crítico(s) · {summary.attentionCount} em atenção
          </p>
        </Card>

        <Card className="gap-1.5 p-4 shadow-none">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Erros pendentes</span>
            <NotebookPen className="size-4 text-destructive" />
          </div>
          <p className="text-2xl font-semibold tracking-tight">{summary.pendingErrorsCount}</p>
          <p className="text-xs text-muted-foreground">
            {summary.reviewedErrorsCount} revisado(s) · {summary.resolvedErrorsCount} resolvido(s)
          </p>
        </Card>

        <Card className="gap-1.5 p-4 shadow-none">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Revisões direcionadas</span>
            <RotateCcw className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-2xl font-semibold tracking-tight">{summary.recommendationsCount}</p>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Fila priorizada</span>
            <Link href="/planejamento" className="font-medium text-primary hover:underline">
              Ver planejamento
            </Link>
          </div>
        </Card>

        <Card className="gap-1.5 p-4 shadow-none">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Domínio consolidado</span>
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-semibold tracking-tight">{summary.masteredCount}</p>
          <p className="text-xs text-muted-foreground">
            {summary.insufficientCount} tema(s) sem dados suficientes
          </p>
        </Card>
      </section>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      {statusMessage ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground"
        >
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="flex-1">{statusMessage}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div role="tablist" aria-label="Visões de aprendizagem personalizada" className="flex flex-wrap gap-2">
          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === "mapa"}
            variant={activeTab === "mapa" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("mapa")}
          >
            Mapa de dificuldades ({difficultyItems.length})
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === "erros"}
            variant={activeTab === "erros" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("erros")}
          >
            Caderno de erros ({entries.length})
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === "revisoes"}
            variant={activeTab === "revisoes" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("revisoes")}
          >
            Revisões direcionadas ({recommendations.length})
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === "memoria"}
            variant={activeTab === "memoria" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("memoria")}
          >
            Memória ({memories.length})
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {studyFilter ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setStudyFilter("")}>
              Limpar filtro de tema
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTab("erros");
              setShowManualForm((current) => !current);
            }}
          >
            <Plus className="size-4" />
            Registrar erro manual
          </Button>
        </div>
      </div>

      {activeTab === "mapa" ? (
        <section aria-label="Mapa de dificuldades" className="space-y-4">
          {difficultyItems.length > 0 ? (
            <Card className="gap-2 p-4 shadow-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Indicadores confiáveis de avaliação</h2>
                  <p className="text-xs text-muted-foreground">{assessmentIndicator.disclaimer}</p>
                </div>
                <Badge variant="outline">
                  {assessmentIndicator.reliabilityLabel} · {assessmentIndicator.sampleSize} questão(ões)
                </Badge>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>
                  Acurácia média:{" "}
                  <strong className="text-foreground">
                    {assessmentIndicator.accuracyPercent !== null ? `${assessmentIndicator.accuracyPercent}%` : "Sem questões avaliadas"}
                  </strong>
                </span>
                <span>
                  Sessões avaliadas: <strong className="text-foreground">{assessmentIndicator.sessionsCount}</strong>
                </span>
                <span>
                  Revisões vencidas: <strong className="text-foreground">{assessmentIndicator.dueFlashcardsCount}</strong>
                </span>
              </div>
            </Card>
          ) : null}
          {difficultyItems.length === 0 ? (
            <Card className="items-center gap-3 p-8 text-center shadow-none">
              <BookOpen className="size-8 text-muted-foreground" />
              <div className="space-y-1">
                <h2 className="text-base font-semibold">Nenhum tema avaliado ainda</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  Importe materiais na Biblioteca ou pratique no Quiz, Flashcards e Semana de Prova para construir seu mapa real de dificuldades.
                </p>
              </div>
              <Button asChild size="sm">
                <Link href="/biblioteca">Ir para Biblioteca</Link>
              </Button>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {difficultyItems.map((item) => (
                <Card key={item.study.studyId} className="gap-3 p-4 shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h2 className="truncate text-base font-semibold">{item.study.title}</h2>
                      <p className="text-xs text-muted-foreground">
                        {item.study.subject} · {REVIEW_STATUS_LABELS[item.reviewStatus]}
                      </p>
                    </div>
                    <Badge variant="outline" className={LEVEL_BADGE_CLASSES[item.level]}>
                      {LEVEL_LABELS[item.level]}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Domínio: {item.knowledge.knowledge}%</span>
                    <span>·</span>
                    <span>Confiança: {item.knowledge.confidence}%</span>
                    <span>·</span>
                    <span>{item.pendingErrorsCount} erro(s) pendente(s)</span>
                    {item.dueFlashcardsCount > 0 ? (
                      <>
                        <span>·</span>
                        <span>{item.dueFlashcardsCount} flashcard(s) pendente(s)</span>
                      </>
                    ) : null}
                  </div>

                  <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Evolução: {item.evolution.label}
                  </p>

                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {item.reasons.slice(0, 3).map((reason) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/estudo?tema=${encodeURIComponent(item.study.studyId)}&origem=aprendizagem`}>
                        Abrir estudo
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </Button>
                    {item.pendingErrorsCount > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setStudyFilter(item.study.studyId);
                          setActiveTab("erros");
                        }}
                      >
                        Ver erros ({item.pendingErrorsCount})
                      </Button>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "erros" ? (
        <section aria-label="Caderno de erros" className="space-y-4">
          {showManualForm ? (
            <Card className="gap-4 p-4 shadow-none">
              <div>
                <h2 className="text-base font-semibold">Novo registro no Caderno de Erros</h2>
                <p className="text-xs text-muted-foreground">
                  Anote erros de exercícios externos, provas impressas ou dúvidas pontuais para revisar depois.
                </p>
              </div>
              <form onSubmit={handleManualSubmit} className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium">
                    Estudo relacionado
                    <select
                      className="h-9 rounded-md border bg-background px-3 text-sm font-normal"
                      value={manualStudyId}
                      onChange={(event) => setManualStudyId(event.target.value)}
                    >
                      <option value="">Sem estudo vinculado</option>
                      {studies.map((study) => (
                        <option key={study.studyId} value={study.studyId}>
                          {study.title} ({study.subject})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium">
                    Tópico / assunto
                    <Input
                      value={manualTopic}
                      onChange={(event) => setManualTopic(event.target.value)}
                      placeholder="Ex.: Integrais por partes"
                      maxLength={120}
                    />
                  </label>
                </div>

                <label className="grid gap-1.5 text-xs font-medium">
                  Questão ou conceito que gerou erro *
                  <textarea
                    className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm font-normal"
                    value={manualPrompt}
                    onChange={(event) => setManualPrompt(event.target.value)}
                    placeholder="Descreva a pergunta, fórmula ou conceito..."
                    maxLength={400}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium">
                    Erro cometido / dúvida *
                    <Input
                      value={manualWrong}
                      onChange={(event) => setManualWrong(event.target.value)}
                      placeholder="Ex.: Troquei o sinal na substituição"
                      maxLength={240}
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium">
                    Resposta correta (opcional)
                    <Input
                      value={manualCorrect}
                      onChange={(event) => setManualCorrect(event.target.value)}
                      placeholder="Ex.: u·v - ∫ v du"
                      maxLength={240}
                    />
                  </label>
                </div>

                {formError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {formError}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" size="sm" disabled={isSaving}>
                    Salvar no Caderno de Erros
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowManualForm(false);
                      setFormError(null);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar no Caderno de Erros"
                className="pl-9"
                placeholder="Buscar erro, tema ou resposta..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            <select
              aria-label="Filtrar por status do erro"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ErrorReviewStatus | "all")}
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
              onChange={(event) => setStudyFilter(event.target.value)}
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
            <Card className="items-center gap-2 p-8 text-center shadow-none">
              <NotebookPen className="size-8 text-muted-foreground" />
              <h2 className="text-base font-semibold">Nenhum erro encontrado</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {entries.length === 0
                  ? "Erros cometidos no Quiz, Flashcards ou Simulado de Materiais aparecem aqui automaticamente. Você também pode registrar erros manualmente."
                  : "Ajuste os filtros acima para visualizar outros registros."}
              </p>
            </Card>
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
                        onClick={() => void markErrorStatus(entry.id, "reviewed")}
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
                        onClick={() => void markErrorStatus(entry.id, "resolved")}
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
                        onClick={() => void markErrorStatus(entry.id, "pending")}
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
                      onClick={() => void removeEntry(entry.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "revisoes" ? (
        <section aria-label="Revisões direcionadas" className="space-y-4">
          {filteredRecommendations.length === 0 ? (
            <Card className="items-center gap-2 p-8 text-center shadow-none">
              <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-semibold">Nenhuma revisão urgente pendente</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Quando houver erros pendentes, flashcards vencidos ou revisões atrasadas, eles serão priorizados aqui com ação direta.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredRecommendations.map((rec) => (
                <Card key={rec.id} className="gap-3 p-4 shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h2 className="text-base font-semibold">{rec.studyTitle}</h2>
                      <p className="text-xs text-muted-foreground">
                        {rec.subject} · {REVIEW_STATUS_LABELS[rec.reviewStatus]}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        rec.urgencyLabel === "Alta"
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : rec.urgencyLabel === "Média"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : "border-border bg-muted/60 text-muted-foreground"
                      }
                    >
                      Urgência {rec.urgencyLabel}
                    </Badge>
                  </div>

                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {rec.reasons.map((reason) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>

                  {rec.sampleErrors.length > 0 ? (
                    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                      <p className="font-semibold text-foreground">Erros recentes para focar:</p>
                      <ul className="mt-1 space-y-1 text-muted-foreground">
                        {rec.sampleErrors.map((sample) => (
                          <li key={sample.id} className="truncate">
                            — {sample.questionPrompt}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm">
                      <Link href={rec.targetHref}>
                        Revisar no Estudo
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => void completeTargetedReview(rec, "correct")}
                    >
                      Acertei na revisão
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => void completeTargetedReview(rec, "wrong")}
                    >
                      Ainda com dificuldade
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "memoria" ? (
        <MemoryManagementTab
          studies={studies}
          settings={memorySettings}
          memories={memories}
          isSaving={isSaving}
          onToggleEnabled={toggleMemoryEnabled}
          onChangeLevel={setExplanationLevel}
          onAddMemory={addExplicitMemory}
          onUpdateMemory={updateMemory}
          onRemoveMemory={removeMemory}
          onClearAll={clearAllMemories}
        />
      ) : null}
    </div>
  );
}
