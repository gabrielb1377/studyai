"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RouteLoading } from "@/components/route-states";
import type { ErrorReviewStatus } from "./types";
import { usePersonalizedLearning } from "./usePersonalizedLearning";
import { MemoryManagementTab } from "../memory/MemoryManagementTab";
import { LearningSummaryCards } from "./components/LearningSummaryCards";
import { DifficultyMapTab } from "./components/DifficultyMapTab";
import { ErrorNotebookTab } from "./components/ErrorNotebookTab";
import { TargetedReviewsTab } from "./components/TargetedReviewsTab";

export type LearningWorkspaceTab = "mapa" | "erros" | "revisoes" | "memoria";

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

  const handleManualSubmit = async (entry: {
    studyId?: string;
    topic: string;
    questionPrompt: string;
    wrongAnswer: string;
    correctAnswer: string;
  }) => {
    await addManualEntry(entry);
    setShowManualForm(false);
    setActiveTab("erros");
  };

  if (isLoading) {
    return (
      <RouteLoading label="Carregando aprendizagem personalizada">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((slot) => (
            <div key={slot} className="h-24 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border bg-muted/30" />
      </RouteLoading>
    );
  }

  return (
    <div className="space-y-6">
      <LearningSummaryCards summary={summary} />

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
        <DifficultyMapTab
          difficultyItems={difficultyItems}
          assessmentIndicator={assessmentIndicator}
          onSelectStudyFilter={(studyId) => setStudyFilter(studyId)}
          onGoToErrorsTab={() => setActiveTab("erros")}
        />
      ) : null}

      {activeTab === "erros" ? (
        <ErrorNotebookTab
          entries={entries}
          filteredErrors={filteredErrors}
          studies={studies}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          studyFilter={studyFilter}
          onStudyFilterChange={setStudyFilter}
          showManualForm={showManualForm}
          onCloseManualForm={() => setShowManualForm(false)}
          onSubmitManualEntry={handleManualSubmit}
          isSaving={isSaving}
          onMarkErrorStatus={markErrorStatus}
          onRemoveEntry={removeEntry}
        />
      ) : null}

      {activeTab === "revisoes" ? (
        <TargetedReviewsTab
          filteredRecommendations={filteredRecommendations}
          isSaving={isSaving}
          onCompleteTargetedReview={completeTargetedReview}
        />
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
