"use client";

import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Flashcard } from "@/types/flashcard";

const difficultyLabels = { easy: "Fácil", medium: "Médio", hard: "Difícil" };

export function FlashcardCard({ card, isAnswerVisible, onShowAnswer, onReview }: { card: Flashcard; isAnswerVisible: boolean; onShowAnswer: () => void; onReview: (wasCorrect: boolean) => void }) {
  return (
    <Card className="min-h-70 justify-between gap-6 p-6 shadow-none sm:p-8">
      <div className="flex items-center justify-between gap-3"><Badge variant="secondary">{difficultyLabels[card.difficulty]}</Badge><span className="text-xs text-muted-foreground">Pergunta</span></div>
      <div className="flex-1"><p className="text-xl font-semibold leading-relaxed tracking-tight">{isAnswerVisible ? card.answer : card.question}</p>{isAnswerVisible && <p className="mt-3 text-sm text-muted-foreground">Resposta</p>}</div>
      {isAnswerVisible ? (
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => onReview(false)}>Errei</Button><Button type="button" onClick={() => onReview(true)}>Acertei</Button></div>
      ) : <Button type="button" variant="outline" className="w-full" onClick={onShowAnswer}><RotateCcw className="size-4" />Mostrar resposta</Button>}
    </Card>
  );
}
