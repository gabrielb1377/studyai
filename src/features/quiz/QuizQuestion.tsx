"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { QuizQuestion as QuizQuestionType } from "@/types/quiz";

const labels = ["A", "B", "C", "D"];

const difficultyLabels = {
  easy: "Fácil",
  medium: "Médio",
  hard: "Difícil",
};

export function QuizQuestion({
  question,
  selectedAnswer,
  onAnswer,
}: {
  question: QuizQuestionType;
  selectedAnswer: number | null;
  onAnswer: (answer: number) => void;
}) {
  const isAnswered = selectedAnswer !== null;
  const isCorrect = selectedAnswer === question.correctAnswer;

  return (
    <Card className="gap-5 p-5 shadow-none sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="secondary">{difficultyLabels[question.difficulty]}</Badge>
        <span className="text-xs text-muted-foreground">Questão</span>
      </div>
      <h3 className="text-lg font-semibold leading-relaxed">{question.question}</h3>
      <div className="grid gap-2">
        {question.alternatives.map((alternative, index) => {
          const isCorrectAnswer = isAnswered && index === question.correctAnswer;
          const isIncorrectAnswer = isAnswered && index === selectedAnswer && !isCorrect;

          return (
            <Button
              key={alternative}
              type="button"
              variant="outline"
              className={`h-auto min-h-11 justify-start whitespace-normal px-4 py-3 text-left ${isCorrectAnswer ? "border-primary bg-primary/10" : ""} ${isIncorrectAnswer ? "border-destructive bg-destructive/5" : ""}`}
              disabled={isAnswered}
              onClick={() => onAnswer(index)}
            >
              <span className="mr-2 font-semibold">{labels[index] ?? index + 1}.</span>
              {alternative}
            </Button>
          );
        })}
      </div>
      {isAnswered && (
        <div
          role="status"
          className={`rounded-lg border p-4 text-sm ${isCorrect ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}
        >
          <p className="font-semibold">{isCorrect ? "✓ Correta" : "✗ Incorreta"}</p>
          <p className="mt-2 leading-6 text-muted-foreground">
            {question.explanation}
          </p>
        </div>
      )}
    </Card>
  );
}
