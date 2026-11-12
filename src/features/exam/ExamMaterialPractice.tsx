"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useExtractionRecord } from "@/features/ocr/useExtractionRecord";
import { detectExercises, pageNeedsTutorReview } from "@/features/ocr/exercise-review";

export type PracticeAssessment = "correct" | "wrong" | "reviewed";

export function ExamMaterialPractice({ materialId, onAssess }: {
  materialId: string;
  onAssess: (assessment: PracticeAssessment) => void;
}) {
  const { record, isLoading, error } = useExtractionRecord(materialId);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [saved, setSaved] = useState(false);
  const questions = record?.fileId === materialId
    ? record.pages?.filter((page) => !pageNeedsTutorReview(page)).flatMap((page) => detectExercises(page.text, page.page)) ?? []
    : [];
  const question = questions[index];
  if (isLoading) return <p role="status">Carregando questões…</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!question) return <p>Não encontramos questões confirmadas nesta extração. Consulte o documento original.</p>;

  return <div className="grid gap-3 break-words">
    <fieldset className="grid min-w-0 gap-2">
      <legend className="mb-2 font-medium">Questão {question.number} · Página {question.page}</legend>
      <p className="whitespace-pre-wrap">{question.statement}</p>
      {question.alternatives.map(({ label, text }) => <label key={label} className="flex items-start gap-2">
        <input type="radio" name="material-practice-answer" checked={answer === label} disabled={saved} onChange={() => setAnswer(label)} />
        <span>{label}. {text}</span>
      </label>)}
    </fieldset>
    <p className="text-sm text-muted-foreground">Sem gabarito verificado. Confira a resposta no original e registre sua autoavaliação.</p>
    {saved ? <p role="status">Prática registrada.</p> : <div className="flex flex-wrap gap-2">
      {([["correct", "Acertei"], ["wrong", "Errei"], ["reviewed", "Pratiquei sem corrigir"]] as const).map(([value, label]) =>
        <Button key={value} type="button" variant="outline" disabled={!answer} onClick={() => { onAssess(value); setSaved(true); }}>{label}</Button>)}
    </div>}
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="ghost" disabled={index === 0} onClick={() => { setIndex(index - 1); setAnswer(""); setSaved(false); }}>Anterior</Button>
      <span>{index + 1} de {questions.length}</span>
      <Button type="button" variant="ghost" disabled={index + 1 >= questions.length} onClick={() => { setIndex(index + 1); setAnswer(""); setSaved(false); }}>Próxima</Button>
    </div>
  </div>;
}
