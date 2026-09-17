"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, ChevronLeft, ChevronRight, LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StudyRecord } from "@/types/study-engine";
import { FlashcardCard } from "./FlashcardCard";
import { useFlashcards } from "./useFlashcards";
import { hasStructuredStudyContent } from "@/features/study/services/StudyEngine";
import { WorkspacePersistence } from "@/features/study/services/WorkspacePersistence";

export function FlashcardWorkspace({ study }: { study: StudyRecord }) {
  const { cards, error, isGenerating, reviewedCount, generate, review } = useFlashcards(study.studyId);
  const [index, setIndex] = useState(() => WorkspacePersistence.load(study.studyId).flashcardIndex);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const currentCard = cards[index];
  const canGenerate = hasStructuredStudyContent(study);

  useEffect(() => {
    if (cards.length > 0 && index >= cards.length) setIndex(cards.length - 1);
  }, [cards.length, index]);

  useEffect(() => {
    WorkspacePersistence.save(study.studyId, { flashcardIndex: index });
  }, [index, study.studyId]);

  const moveTo = (nextIndex: number) => {
    setIndex((nextIndex + cards.length) % cards.length);
    setIsAnswerVisible(false);
  };

  const registerReview = (wasCorrect: boolean) => {
    if (!currentCard) return;
    review(currentCard.id, wasCorrect);
    setIsAnswerVisible(false);
    if (cards.length > 1) setIndex((current) => (current + 1) % cards.length);
  };

  return (
    <section aria-labelledby="flashcard-workspace-title" className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="flashcard-workspace-title" className="text-lg font-semibold tracking-tight">Flashcards</h2><p className="mt-1 text-sm text-muted-foreground">{cards.length} cartões · {reviewedCount} revisões registradas</p></div><Button type="button" variant="outline" onClick={() => { void generate(study); }} disabled={isGenerating || !canGenerate}><Plus className="size-4" />{isGenerating ? "Criando..." : "Criar flashcards"}</Button></div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {!currentCard ? <Card className="items-center gap-3 border-dashed p-8 text-center shadow-none"><BrainCircuit className="size-8 text-primary" /><h3 className="font-semibold">Seu primeiro deck começa aqui</h3><p className="max-w-md text-sm text-muted-foreground">Crie cartões para revisar os conceitos de {study.title}.</p></Card> : <><FlashcardCard card={currentCard} isAnswerVisible={isAnswerVisible} onShowAnswer={() => setIsAnswerVisible(true)} onReview={registerReview} /><div className="flex items-center justify-between gap-3"><Button type="button" variant="ghost" size="sm" onClick={() => moveTo(index - 1)} disabled={cards.length < 2}><ChevronLeft className="size-4" />Anterior</Button><span className="text-xs text-muted-foreground">{index + 1} de {cards.length}</span><Button type="button" variant="ghost" size="sm" onClick={() => moveTo(index + 1)} disabled={cards.length < 2}>Próximo<ChevronRight className="size-4" /></Button></div></>}
      {isGenerating && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />A IA está preparando os cartões...</p>}
    </section>
  );
}
