"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { useFlashcards } from "@/features/flashcards/useFlashcards";
import { useQuiz } from "@/features/quiz/useQuiz";
import { useStudyEngine } from "@/features/study/hooks/useStudyEngine";
import { disciplineKey, materialKind } from "@/features/tutor/services/DisciplineContext";
import { prepareReviewedTutorDraft } from "@/features/tutor/services/ReviewedTutorDraft";
import { useMaterials } from "@/hooks/useMaterials";
import { reviewPeriod, type ReviewDifficulty, type ReviewResult, type TopicReview } from "./TopicReview";
import { TopicReviewStorage } from "./TopicReviewStorage";

const labels = { new: "Sem revisão registrada", late: "Atrasadas", today: "Hoje", upcoming: "Próximas" };
const priority = { late: 0, today: 1, new: 2, upcoming: 3 };

export function TopicReviewWorkspace({ requestedDiscipline }: { requestedDiscipline?: string }) {
  const auth = useAuth();
  const session = SessionOperationManager.current();
  if (auth.isLoading || session.suspended || !session.userId) return <p role="status">Carregando sessão…</p>;
  return <ReviewSession key={session.generation} requestedDiscipline={requestedDiscipline} />;
}

function ReviewSession({ requestedDiscipline }: { requestedDiscipline?: string }) {
  const router = useRouter();
  const { records: studies, isLoading: studiesLoading } = useStudyEngine();
  const { materials, isLoading: materialsLoading, error: materialsError } = useMaterials();
  const { cards } = useFlashcards();
  const { results, questions } = useQuiz();
  const [reviews, setReviews] = useState<TopicReview[]>();
  const [discipline, setDiscipline] = useState("");
  const [activeId, setActiveId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [difficulty, setDifficulty] = useState<ReviewDifficulty>("normal");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);

  useEffect(() => {
    let active = true;
    void TopicReviewStorage.load().then((value) => {
      if (active) setReviews(value);
    }).catch(() => {
      if (active) setError("Não foi possível carregar as revisões.");
    });
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, string>();
    for (const material of materials) {
      const key = disciplineKey(material);
      if (key) map.set(key, [material.subject, material.course, material.semester].filter(Boolean).join(" · "));
    }
    for (const review of reviews ?? []) {
      if (!map.has(review.discipline)) {
        const [course, semester, subject] = JSON.parse(review.discipline) as string[];
        map.set(review.discipline, [subject, course, semester].filter(Boolean).join(" · "));
      }
    }
    return map;
  }, [materials, reviews]);
  const preferred = discipline || requestedDiscipline;
  const selected = preferred && groups.has(preferred) ? preferred : requestedDiscipline && !discipline ? "" : groups.keys().next().value || "";
  const now = new Date();
  const topics = useMemo(() => {
    const byStudy = new Map<string, typeof materials>();
    for (const material of materials) {
      if (!material.studyId || disciplineKey(material) !== selected) continue;
      const list = byStudy.get(material.studyId) ?? [];
      list.push(material);
      byStudy.set(material.studyId, list);
    }
    return studies.filter((study) => byStudy.has(study.studyId)).map((study) => {
      const sources = byStudy.get(study.studyId) ?? [];
      const practice = [...cards.filter((card) => card.studyId === study.studyId), ...results.filter((result) => result.studyId === study.studyId)];
      return {
        study, sources,
        review: reviews?.find((review) => review.studyId === study.studyId && review.discipline === selected),
        correct: practice.reduce((total, item) => total + item.correctAnswers, 0),
        wrong: practice.reduce((total, item) => total + item.wrongAnswers, 0),
        hasCards: cards.some((card) => card.studyId === study.studyId),
        hasQuiz: questions.some((question) => question.studyId === study.studyId),
      };
    });
  }, [materials, selected, studies, reviews, cards, results, questions]);
  const active = topics.find(({ study }) => study.studyId === activeId);
  const average = topics.length ? Math.round(topics.reduce((sum, { study }) => sum + study.progress, 0) / topics.length) : 0;
  const missing = reviews?.filter((review) => review.discipline === selected && !topics.some(({ study }) => study.studyId === review.studyId)) ?? [];
  const needsAttention = ({ review, wrong }: (typeof topics)[number]) =>
    wrong > 0 || (review?.wrong ?? 0) > 0 || review?.difficulty === "hard" || reviewPeriod(review?.nextReviewAt, now) === "late";

  async function record(result: ReviewResult) {
    if (!active || locked.current) return;
    locked.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    const source = active.sources.find(({ id }) => id === sourceId);
    try {
      const updated = await TopicReviewStorage.record({
        discipline: selected, studyId: active.study.studyId, topic: active.study.title,
        materialId: source?.id, materialName: source?.name,
      }, result, difficulty);
      setReviews(updated);
      setNotice("Revisão registrada.");
    } catch {
      setError("Não foi possível salvar a revisão. Confira a sessão e tente novamente.");
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }

  function openTutor() {
    if (!active) return;
    try {
      prepareReviewedTutorDraft(`Ajude-me a revisar o tema ${active.study.title}. Explique os pontos principais e proponha um exercício.`, {
        key: selected, subject: active.study.subject, materialIds: active.sources.map(({ id }) => id),
      });
      router.push("/tutor");
    } catch {
      setError("Não foi possível abrir o Tutor nesta sessão.");
    }
  }

  if (materialsError) return <p role="alert">Não foi possível carregar a Biblioteca.</p>;
  if (!reviews || studiesLoading || materialsLoading) return error ? <p role="alert">{error}</p> : <p role="status">Carregando revisões…</p>;
  if (!groups.size) return <p>Organize um material por disciplina e tema na <Link className="underline" href="/biblioteca">Biblioteca</Link> para começar.</p>;

  return <div className="grid min-w-0 gap-4">
    <label className="grid max-w-md gap-1">Disciplina
      <select className="w-full min-w-0 rounded border bg-background p-2" value={selected} disabled={saving} onChange={(event) => {
        setDiscipline(event.target.value);
        setActiveId("");
        setNotice("");
      }}>
        {!selected && <option value="" disabled>Selecione uma disciplina disponível</option>}
        {[...groups].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    <p>Progresso de estudo: {average}% · Temas revisados: {topics.filter(({ review }) => review).length}/{topics.length}</p>
    {selected && !topics.some(needsAttention) &&
      <p>Sem erros, dificuldades declaradas ou revisões atrasadas registradas nesta disciplina.</p>}
    {(["late", "today", "upcoming"] as const).map((period) => <p key={period}>
      {labels[period]}: {topics.filter(({ review }) => reviewPeriod(review?.nextReviewAt, now) === period).length}
    </p>)}
    {[...topics].sort((a, b) => (requestedDiscipline ? Number(needsAttention(b)) - Number(needsAttention(a)) : 0) ||
      priority[reviewPeriod(a.review?.nextReviewAt, now)] - priority[reviewPeriod(b.review?.nextReviewAt, now)]).map((item) => {
      const { study, review, correct, wrong } = item;
      return <section key={study.studyId} className="grid min-w-0 gap-2 rounded-xl border p-3 [overflow-wrap:anywhere]">
        <h2 className="font-semibold">{study.title}</h2>
        <p>{labels[reviewPeriod(review?.nextReviewAt, now)]}{review && ` · ${new Date(review.nextReviewAt).toLocaleDateString("pt-BR")}`}</p>
        {study.progress === 0 && <p>Conteúdo ainda não estudado.</p>}
        <p>{correct + wrong ? `Flashcards e quizzes: ${correct} acertos, ${wrong} erros.` : "Sem histórico suficiente de flashcards ou quizzes."}</p>
        {wrong >= 2 && wrong >= correct && <p>Precisa de atenção: erros repetidos na prática.</p>}
        {review && <p>Revisões: {review.attempts} · Autoavaliação: {review.correct} acertos, {review.wrong} erros{review.difficulty === "hard" && " · Dificuldade declarada"}</p>}
        <Button className="justify-self-start" variant="outline" disabled={saving} onClick={() => {
          setActiveId(study.studyId);
          setDifficulty(review?.difficulty ?? "normal");
          setSourceId(item.sources.some(({ id }) => id === review?.materialId) ? review?.materialId ?? "" : "");
          setNotice("");
        }}>Iniciar revisão</Button>
        {active?.study.studyId === study.studyId && <div className="grid min-w-0 gap-3">
          <h3 className="font-medium">Materiais e prática</h3>
          <ul className="grid gap-1">
            {[...item.sources].sort((a, b) => ["Exercícios", "Simulado", "Material de estudo"].indexOf(materialKind(a)) -
              ["Exercícios", "Simulado", "Material de estudo"].indexOf(materialKind(b))).map((material) => <li key={material.id}>
              <Link className="underline" href={`/estudo?tema=${encodeURIComponent(study.studyId)}&arquivo=${encodeURIComponent(material.id)}&aba=material`}>
                {materialKind(material)} · {material.name}
              </Link>
            </li>)}
          </ul>
          <div className="flex flex-wrap gap-3">
            {item.hasCards && <Link className="underline" href={`/estudo?tema=${encodeURIComponent(study.studyId)}&aba=flashcards`}>Praticar flashcards</Link>}
            {item.hasQuiz && <Link className="underline" href={`/estudo?tema=${encodeURIComponent(study.studyId)}&aba=quiz`}>Praticar quiz</Link>}
          </div>
          <label className="grid gap-1">Material usado
            <select className="w-full min-w-0 rounded border bg-background p-2" disabled={saving} value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              <option value="">Sem material específico</option>
              {item.sources.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={difficulty === "hard"} disabled={saving} onChange={(event) => setDifficulty(event.target.checked ? "hard" : "normal")} /> Achei difícil</label>
          <p>Registre sua avaliação. Para materiais sem gabarito confiável, use “Revisei sem corrigir”.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => void record("correct")}>Acertei</Button>
            <Button disabled={saving} variant="outline" onClick={() => void record("wrong")}>Errei</Button>
            <Button disabled={saving} variant="outline" onClick={() => void record("reviewed")}>Revisei sem corrigir</Button>
            <Button disabled={saving} variant="outline" onClick={openTutor}>Continuar no Tutor</Button>
          </div>
          {notice && <p role="status">{notice}</p>}
        </div>}
      </section>;
    })}
    {missing.map((review) => <p key={review.studyId}>{review.topic} · Material indisponível. Histórico preservado ({review.attempts} revisões).</p>)}
    {error && <p role="alert">{error}</p>}
  </div>;
}
