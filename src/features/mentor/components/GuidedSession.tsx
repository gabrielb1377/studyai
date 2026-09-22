"use client";

import { useState } from "react";
import { CheckCircle2, CirclePause, CirclePlay, Send, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import MarkdownRenderer from "@/features/tutor/MarkdownRenderer";
import type { MentorSession } from "../types";
import { MentorPlan } from "./MentorPlan";

export function GuidedSession({ session, disabled, onAnswer, onStatus, onExplain }: { session: MentorSession; disabled?: boolean; onAnswer: (answer: string) => void; onStatus: (status: MentorSession["status"]) => void; onExplain: () => void }) {
  const [answer, setAnswer] = useState("");
  const [showExplanation, setShowExplanation] = useState(false);
  const turn = session.turns.at(-1);
  const evaluation = session.turns.findLast((item) => item.evaluation)?.evaluation;
  const evaluatedTurn = session.turns.findLast((item) => item.evaluation);
  const progress = session.plan.length ? Math.round(session.plan.filter((step) => step.status === "completed").length / session.plan.length * 100) : 0;
  return (
    <section aria-label="Sessão guiada" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{session.level}</Badge><Badge variant="outline">Conhecimento {session.knowledge}%</Badge><Badge variant="outline">Prioridade {session.priority.level}</Badge><span className="ml-auto text-xs text-muted-foreground">{progress}% da sessão</span></div>
      <Progress value={progress} aria-label="Progresso da sessão guiada" />
      <MentorPlan steps={session.plan} />
      {session.status !== "completed" && turn && <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">Pergunta do Mentor</p>
        <p className="text-sm font-medium leading-6">{turn.question.prompt}</p>
        {turn.question.source && <p className="mt-2 text-xs text-muted-foreground">Fonte: {turn.question.source.document}{turn.question.source.page ? ` · página ${turn.question.source.page}` : ""}</p>}
        {!turn.evaluation && <div className="mt-4 space-y-2"><textarea aria-label="Sua resposta ao Mentor" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Explique com suas palavras…" className="min-h-24 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" disabled={session.status === "paused"} /><Button type="button" size="sm" onClick={() => { onAnswer(answer); setAnswer(""); }} disabled={disabled || session.status === "paused" || !answer.trim()}><Send />Responder</Button></div>}
      </div>}
      {evaluation && <div role="status" className={`rounded-xl border p-4 ${evaluation.result === "correct" ? "border-emerald-500/30 bg-emerald-500/5" : evaluation.result === "partial" ? "border-amber-500/30 bg-amber-500/5" : "border-destructive/30 bg-destructive/5"}`}>
        <div className="flex items-center gap-2 font-medium">{evaluation.result === "correct" ? <CheckCircle2 className="size-5 text-emerald-500" /> : <XCircle className="size-5 text-destructive" />}{evaluation.result === "correct" ? "Acertou" : evaluation.result === "partial" ? "Parcialmente correto" : "Ainda não"} · {evaluation.score}%</div>
        <dl className="mt-3 grid gap-2 text-sm"><div><dt className="font-medium">Por quê</dt><dd className="text-muted-foreground">{evaluation.why}</dd></div><div><dt className="font-medium">Como melhorar</dt><dd className="text-muted-foreground">{evaluation.improvement}</dd></div><div><dt className="font-medium">Onde revisar</dt><dd className="text-muted-foreground">{evaluation.reviewTarget}</dd></div></dl>
        {evaluation.followUpQuestion && <p className="mt-3 rounded-lg bg-background p-3 text-sm"><span className="font-medium">Pense antes de continuar:</span> {evaluation.followUpQuestion}</p>}
        {evaluation.result !== "correct" && <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setShowExplanation((value) => !value)}>{showExplanation ? "Ocultar explicação" : "Explicar novamente"}</Button><Button type="button" variant="outline" size="sm" onClick={onExplain} disabled={disabled}>Explicar com Tutor IA</Button>{showExplanation && <p className="w-full rounded-lg bg-background p-3 text-sm leading-6">{evaluatedTurn?.question.explanation}</p>}{evaluatedTurn?.mentorExplanation && <div className="w-full rounded-lg border bg-background p-3"><MarkdownRenderer content={evaluatedTurn.mentorExplanation} /><p className="mt-2 text-xs text-muted-foreground">{evaluatedTurn.provider ?? "Provider"} · {evaluatedTurn.model ?? "modelo ativo"}</p></div>}</div>}
      </div>}
      <div className="flex flex-wrap gap-2">
        {session.status === "active" ? <Button type="button" variant="outline" size="sm" onClick={() => onStatus("paused")}><CirclePause />Pausar</Button> : session.status === "paused" ? <Button type="button" variant="outline" size="sm" onClick={() => onStatus("active")}><CirclePlay />Continuar</Button> : null}
        {session.status !== "completed" && <Button type="button" variant="outline" size="sm" onClick={() => onStatus("completed")}>Concluir sessão</Button>}
      </div>
    </section>
  );
}
