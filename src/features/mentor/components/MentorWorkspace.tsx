"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, CalendarClock, RefreshCw, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useStudyEngine } from "@/features/study/hooks/useStudyEngine";
import type { StudyRecord } from "@/types/study-engine";
import { useMentor } from "../hooks/useMentor";
import { GuidedSession } from "./GuidedSession";
import { MentorGoals } from "./MentorGoals";

export function MentorWorkspace({ study }: { study: StudyRecord }) {
  const { records } = useStudyEngine();
  const [selectedStudyId, setSelectedStudyId] = useState(study.studyId);
  const mentor = useMentor(selectedStudyId);
  const selected = records.find((record) => record.studyId === selectedStudyId) ?? study;
  const subjects = useMemo(() => Array.from(new Set(records.map((record) => record.subject))).sort(), [records]);
  const [subject, setSubject] = useState(study.subject);
  const topics = records.filter((record) => record.subject === subject);
  const goals = mentor.snapshot.goals.filter((goal) => !goal.studyId || goal.studyId === selectedStudyId);
  const recommendations = mentor.snapshot.recommendations.filter((item) => item.studyId === selectedStudyId);

  useEffect(() => { setSelectedStudyId(study.studyId); setSubject(study.subject); }, [study.studyId, study.subject]);
  useEffect(() => { if (!mentor.isLoading && recommendations.length === 0) void mentor.refreshRecommendations(); }, [mentor.isLoading, selectedStudyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const latestSession = mentor.snapshot.sessions.find((session) => session.studyId === selectedStudyId);
  const history = mentor.snapshot.sessions.filter((session) => session.studyId === selectedStudyId && session.status === "completed").slice(0, 3);
  const latestEvaluation = latestSession?.turns.flatMap((turn) => turn.evaluation ? [turn.evaluation] : []).at(-1);
  const motivation = latestSession && latestSession.turns.some((turn) => turn.evaluation)
    ? latestEvaluation?.result === "correct" ? "Você consolidou uma resposta com evidência do material. Continue no próximo conceito." : "A dificuldade foi registrada. Retome o ponto indicado antes de avançar."
    : null;

  return (
    <div className="space-y-4" aria-label="Mentor Inteligente">
      <Card className="gap-4 py-4"><CardHeader className="px-4"><div className="flex flex-wrap items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Brain className="size-5" /></span><div className="min-w-0 flex-1"><CardTitle>Mentor Inteligente</CardTitle><CardDescription>Uma sessão guiada baseada no seu progresso, nas revisões e no mapa de conhecimento.</CardDescription></div><Badge variant="outline">Modo socrático</Badge></div></CardHeader><CardContent className="grid gap-2 px-4 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Matéria<select aria-label="Escolher matéria para o Mentor" value={subject} onChange={(event) => { const value = event.target.value; setSubject(value); const first = records.find((record) => record.subject === value); if (first) setSelectedStudyId(first.studyId); }} className="block h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">{subjects.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Tema<select aria-label="Escolher tema para o Mentor" value={selectedStudyId} onChange={(event) => setSelectedStudyId(event.target.value)} className="block h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">{topics.map((item) => <option key={item.studyId} value={item.studyId}>{item.title}</option>)}</select></label>
      </CardContent></Card>

      {mentor.error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{mentor.error}</p>}
      {!mentor.activeSession || mentor.activeSession.status === "completed" ? <Card className="gap-4 py-5"><CardHeader className="px-5"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4 text-primary" />Sessão guiada</CardTitle><CardDescription>O Mentor cria uma sequência curta de leitura, explicação, revisão e prática usando apenas os dados deste tema.</CardDescription></CardHeader><CardContent className="px-5"><Button type="button" onClick={() => { void mentor.startSession(); }} disabled={mentor.isWorking || !selected}><Sparkles />Iniciar Sessão</Button></CardContent></Card> : <Card className="gap-4 py-5"><CardHeader className="px-5"><CardTitle className="text-base">Sessão de {mentor.activeSession.topic}</CardTitle><CardDescription>Responda com suas palavras. O Mentor oferece pistas antes de uma explicação pronta.</CardDescription></CardHeader><CardContent className="px-5"><GuidedSession session={mentor.activeSession} disabled={mentor.isWorking} onAnswer={(answer) => { void mentor.answer(mentor.activeSession!, answer); }} onStatus={(status) => { void mentor.setSessionStatus(mentor.activeSession!, status); }} onExplain={() => { void mentor.explain(mentor.activeSession!); }} /></CardContent></Card>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="gap-4 py-5"><CardHeader className="px-5"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="size-4 text-primary" />Recomendações e próximas revisões</CardTitle><CardDescription>Calculadas em segundo plano a partir de resultados reais.</CardDescription></CardHeader><CardContent className="space-y-2 px-5">{recommendations.length === 0 ? <p className="text-sm text-muted-foreground">Aguardando evidências suficientes.</p> : recommendations.map((item) => <div key={item.id} className="rounded-lg border p-3"><div className="flex items-start gap-2"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.title}</span><span className="block text-xs leading-5 text-muted-foreground">{item.reason}</span></span><Badge variant="outline">{item.priority}</Badge></div></div>)}<Button type="button" variant="ghost" size="sm" onClick={() => { void mentor.refreshRecommendations(); }} disabled={mentor.isWorking}><RefreshCw />Atualizar</Button></CardContent></Card>
        <Card className="gap-4 py-5"><CardHeader className="px-5"><CardTitle className="flex items-center gap-2 text-base"><Target className="size-4 text-primary" />Evolução</CardTitle><CardDescription>Feedback sem mensagens artificiais ou comparações sem dados.</CardDescription></CardHeader><CardContent className="px-5">{motivation ? <p className="rounded-lg bg-primary/5 p-4 text-sm leading-6">{motivation}</p> : <p className="text-sm text-muted-foreground">Conclua uma interação guiada para receber um feedback baseado na sessão.</p>}</CardContent></Card>
      </div>

      {history.length > 0 && <Card className="gap-4 py-5"><CardHeader className="px-5"><CardTitle className="text-base">Memória das sessões</CardTitle><CardDescription>O Mentor retoma o que já foi praticado neste tema.</CardDescription></CardHeader><CardContent className="space-y-2 px-5">{history.map((session) => <div key={session.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span><span className="block font-medium">{new Date(session.startedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span><span className="text-xs text-muted-foreground">{session.turns.length} pergunta(s) · nível {session.level}</span></span><Badge variant="outline">Concluída</Badge></div>)}</CardContent></Card>}

      <Card className="gap-4 py-5"><CardContent className="px-5"><MentorGoals studyId={selectedStudyId} goals={goals} disabled={mentor.isWorking} onCreate={(input) => { void mentor.createGoal(input); }} onUpdate={(id, changes) => { void mentor.updateGoal(id, changes); }} onRemove={(id) => { void mentor.removeGoal(id); }} /></CardContent></Card>
    </div>
  );
}
