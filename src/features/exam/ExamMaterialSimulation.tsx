"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Exam, MaterialExamAttempt, MaterialExamQuestion } from "@/types/exam";
import { ExamService } from "./ExamService";
import { confirmedChoice, questionRevision } from "./ExamAnswerKey";
import { ErrorNotebookStorage, ERROR_NOTEBOOK_UPDATED_EVENT } from "@/features/learning/errors/ErrorNotebookStorage";
import type { ErrorNotebookEntry } from "@/features/learning/errors/types";

export function ExamMaterialSimulation({ exam, catalog, save }: {
  exam: Exam;
  catalog: MaterialExamQuestion[];
  save: (attempt: MaterialExamAttempt) => void;
}) {
  const attempts = (exam.materialAttempts ?? []).filter((item) => item.examId === exam.id && item.disciplineKey === exam.disciplineKey);
  const [selected, setSelected] = useState("");
  const [adaptiveNote, setAdaptiveNote] = useState<string | null>(null);
  const [errorEntries, setErrorEntries] = useState<ErrorNotebookEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadErrors = () => {
      void ErrorNotebookStorage.load()
        .then((loaded) => {
          if (!cancelled) setErrorEntries(loaded);
        })
        .catch(() => {
          if (!cancelled) setErrorEntries([]);
        });
    };
    loadErrors();
    window.addEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, loadErrors);
    return () => {
      cancelled = true;
      window.removeEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, loadErrors);
    };
  }, []);

  const active = attempts.find((item) => !item.completedAt);
  const attempt = active ?? attempts.find((item) => item.id === selected) ?? attempts[0];
  const [count, setCount] = useState(5);
  const limit = Math.min(30, catalog.length);
  const currentQuestions = new Map(catalog.map((question) => [question.id, question]));
  const answers = attempt?.questions.flatMap((question) => {
    const answer = attempt.answers[question.id];
    return answer ? [{ ...answer, key: confirmedChoice(attempt, question, currentQuestions.get(question.id)) }] : [];
  }) ?? [];

  return <section className="grid min-w-0 gap-3 break-words" aria-label="Simulado dos materiais">
    <h3 className="font-semibold">Simulado dos materiais</h3>
    <p>{catalog.length} questões disponíveis nos materiais vinculados.</p>
    {!active && <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1">Quantidade de questões
        <input className="w-24 rounded border bg-background p-2" type="number" min={1} max={30} value={count} onChange={(event) => setCount(event.target.valueAsNumber || 0)} />
      </label>
      <Button type="button" disabled={count < 1 || count > limit} onClick={() => {
        const next = ExamService.startMaterialAttempt(exam, catalog, count);
        if (next) { setAdaptiveNote(null); save(next); setSelected(next.id); }
      }}>Iniciar simulado dos materiais</Button>
      <Button type="button" variant="secondary" disabled={count < 1 || count > limit} onClick={() => {
        const next = ExamService.startAdaptiveMaterialAttempt(exam, catalog, count, errorEntries);
        if (next) { setAdaptiveNote(next.summary); save(next.attempt); setSelected(next.attempt.id); }
      }}>Simulado adaptativo dos materiais</Button>
    </div>}
    {adaptiveNote && <p role="status" className="text-xs text-muted-foreground">{adaptiveNote}</p>}
    {!active && count > limit && <p role="status">{limit ? `Escolha até ${limit} questões ou adicione outros materiais.` : "Sem questões confirmadas. Consulte os documentos originais ou use o Modo Prova do estudo."}</p>}
    {!catalog.length && exam.materialIds.length > 0 && <p className="text-sm text-muted-foreground">
      Se a extração antiga juntou alternativas, abra o material vinculado e confira o original. Na revisão de um PDF, reprocese apenas a página afetada e mantenha as correções manuais. Para outros formatos, reimporte uma cópia do original pela Biblioteca.
    </p>}
    {attempts.length > 0 && !active && <label className="grid gap-1">Histórico desta avaliação
      <select className="w-full min-w-0 rounded border bg-background p-2" value={attempt?.id} onChange={(event) => setSelected(event.target.value)}>
        {attempts.map((item, index) => <option key={item.id} value={item.id}>Tentativa {attempts.length - index} · {item.questions.length} questões</option>)}
      </select>
    </label>}
    {attempt && <>
      <p>Origem: questões extraídas dos materiais. A correção usa gabaritos conferidos por você no documento.</p>
      {attempt.completedAt && <p role="status">
        Resultado: {answers.length} respondidas · {answers.filter((answer) => answer.key === undefined && answer.assessment === "correct").length} acertos declarados · {answers.filter((answer) => answer.key === undefined && answer.assessment === "wrong").length} erros declarados · {answers.filter((answer) => answer.key === undefined && !answer.assessment).length} sem correção.
        {answers.some((answer) => answer.key !== undefined) && ` Gabarito conferido: ${answers.filter((answer) => answer.key === answer.choice).length} acertos e ${answers.filter((answer) => answer.key !== undefined && answer.key !== answer.choice).length} erros.`}
      </p>}
      {attempt.questions.map((question, index) => {
        const answer = attempt.answers[question.id];
        const current = currentQuestions.get(question.id);
        const matches = current && questionRevision(current) === questionRevision(question);
        const key = confirmedChoice(attempt, question, current);
        return <fieldset key={question.id} className="grid min-w-0 gap-2 rounded border p-3">
          <legend>Questão {index + 1} · {question.materialName}{question.page && ` · Página ${question.page}`}</legend>
          <p className="whitespace-pre-wrap">{question.statement}</p>
          {question.alternatives.map((text, choice) => <label key={choice} className="flex items-start gap-2">
            <input type="radio" name={`${attempt.id}-${index}`} checked={answer?.choice === choice} disabled={Boolean(attempt.completedAt)}
              onChange={() => save({ ...attempt, answers: { ...attempt.answers, [question.id]: { choice } } })} />
            <span>{String.fromCharCode(65 + choice)}. {text}</span>
          </label>)}
          {attempt.completedAt && matches && <label className="grid gap-1">Gabarito da questão {index + 1} conferido por mim no documento
            <select className="w-full rounded border bg-background p-2" value={key ?? ""} onChange={(event) => {
              const confirmedKeys = { ...attempt.confirmedKeys };
              if (!event.target.value) delete confirmedKeys[question.id];
              else {
                const choice = Number(event.target.value);
                confirmedKeys[question.id] = { choice, source: "student-document",
                  confirmedAt: new Date().toISOString(), revision: questionRevision(question) };
                if (answer && answer.choice !== choice) {
                  void ErrorNotebookStorage.recordEntries([
                    {
                      studyId: question.studyId ?? exam.studyId,
                      studyTitle: exam.title,
                      subject: exam.discipline,
                      topic: question.materialName,
                      source: "exam_material",
                      sourceId: question.id,
                      questionPrompt: question.statement,
                      wrongAnswer: question.alternatives[answer.choice] ?? `Alternativa ${answer.choice + 1}`,
                      correctAnswer: question.alternatives[choice],
                    },
                  ]);
                }
              }
              save({ ...attempt, confirmedKeys });
            }}>
              <option value="">Sem confirmação</option>
              {question.alternatives.map((text, choice) => <option key={choice} value={choice}>Confirmo {String.fromCharCode(65 + choice)}. {text}</option>)}
            </select>
          </label>}
          {attempt.completedAt && matches && current.suggestedChoice !== undefined && <p>Sugestão da extração: {String.fromCharCode(65 + current.suggestedChoice)}. Confira no documento antes de confirmar.</p>}
          {attempt.completedAt && current?.studyId && <Link className="underline" href={`/estudo?tema=${encodeURIComponent(current.studyId)}&arquivo=${encodeURIComponent(current.materialId)}&aba=material`}>Consultar documento original</Link>}
          {attempt.completedAt && attempt.confirmedKeys?.[question.id] && !matches && <p>Questão alterada ou material indisponível. O gabarito confirmado não será usado neste resultado.</p>}
          {attempt.completedAt && answer && key === undefined && <label className="grid gap-1">Autoavaliação da questão {index + 1}
            <select className="w-full rounded border bg-background p-2" value={answer.assessment ?? ""} onChange={(event) => {
              const value = event.target.value;
              const assessment = value === "correct" || value === "wrong" ? value : undefined;
              if (assessment === "wrong" && answer.assessment !== "wrong") {
                void ErrorNotebookStorage.recordEntries([
                  {
                    studyId: question.studyId ?? exam.studyId,
                    studyTitle: exam.title,
                    subject: exam.discipline,
                    topic: question.materialName,
                    source: "exam_material",
                    sourceId: question.id,
                    questionPrompt: question.statement,
                    wrongAnswer: question.alternatives[answer.choice] ?? `Alternativa ${answer.choice + 1}`,
                    correctAnswer:
                      question.suggestedChoice !== undefined
                        ? question.alternatives[question.suggestedChoice]
                        : undefined,
                  },
                ]);
              }
              save({ ...attempt, answers: { ...attempt.answers, [question.id]: { ...answer, assessment } } });
            }}>
              <option value="">Sem correção</option>
              <option value="correct">Acertei</option>
              <option value="wrong">Errei</option>
            </select>
          </label>}
        </fieldset>;
      })}
      {active && <Button type="button" disabled={!answers.length} onClick={() => save({ ...attempt, completedAt: new Date().toISOString() })}>Finalizar simulado dos materiais</Button>}
    </>}
  </section>;
}
