"use client";

import { useState, useEffect, useMemo } from "react";
import { Activity, Bot, BrainCircuit, Calendar, CheckCircle2, ClipboardCheck, Clock, FileText, Pencil, Plus, ShieldCheck, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { daysUntilExam, EXAM_UPDATED_EVENT, ExamService, formatExamDate } from "./ExamService";
import type { Exam, ExamSubject, ExamPriority } from "@/types/exam";
import type { StudyRecord } from "@/types/study-engine";
import type { Material } from "@/types/material";
import { useMaterials } from "@/hooks/useMaterials";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { STORAGE_ERROR_EVENT, STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import { useUpdateGuard } from "@/features/platform/UpdateSafety";
import { examLearningHref, resolveExamStudy, type ExamLearningAction } from "./ExamLearningNavigation";
import { useExamProgress } from "./useExamProgress";
import { disciplineKey, materialKind } from "@/features/tutor/services/DisciplineContext";
import { prepareReviewedTutorDraft } from "@/features/tutor/services/ReviewedTutorDraft";
import { ExamMaterialPractice, type PracticeAssessment } from "./ExamMaterialPractice";
import { ExamMaterialSimulation } from "./ExamMaterialSimulation";
import { examQuestionCatalog } from "./ExamQuestionCatalog";
import { ContentStorage, EXTRACTION_UPDATE_EVENT } from "@/features/extraction/ContentStorage";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { TopicReviewStorage } from "@/features/learning/TopicReviewStorage";
import { reviewPeriod, type TopicReview } from "@/features/learning/TopicReview";
import type { MaterialExamAttempt } from "@/types/exam";

const learningActions: Array<{
  id: ExamLearningAction;
  title: string;
  description: string;
  icon: typeof Bot;
}> = [
  { id: "tutor", title: "Estudar com Tutor", description: "Conversar usando o contexto autorizado deste estudo.", icon: Bot },
  { id: "flashcards", title: "Revisar Flashcards", description: "Retomar cartões e agendamento deste estudo.", icon: BrainCircuit },
  { id: "quiz", title: "Praticar Quiz", description: "Usar questões e resultados já vinculados ao estudo.", icon: ClipboardCheck },
  { id: "exam", title: "Abrir Simulado", description: "Entrar no Modo Prova com gabarito protegido no servidor.", icon: ShieldCheck },
];

const progressStateLabels = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  completed: "Concluído",
  insufficient_data: "Sem dados suficientes",
} as const;

export function ExamWorkspace({ studies, sessionOwner, requestedExamId }: { studies: readonly StudyRecord[]; sessionOwner?: string; requestedExamId?: string }) {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [materialNotice, setMaterialNotice] = useState<string>();
  const [storageError, setStorageError] = useState<string>();
  const [practiceMaterial, setPracticeMaterial] = useState<{ examId: string; materialId: string }>();
  const [extracted, setExtracted] = useState<ExtractedContent[]>([]);
  const [reviews, setReviews] = useState<TopicReview[]>([]);
  const [catalogError, setCatalogError] = useState(false);

  useUpdateGuard(Boolean(isCreating || practiceMaterial), "exam-workspace", "Semana de Prova");

  useEffect(() => {
    let revision = 0;
    const reload = () => {
      const request = ++revision;
      void ContentStorage.load().then(({ records }) => {
        if (request === revision) { setExtracted(records); setCatalogError(false); }
      }).catch(() => {
        if (request === revision) { setExtracted([]); setCatalogError(true); }
      });
      void TopicReviewStorage.load().then((records) => {
        if (request === revision) setReviews(records);
      }).catch(() => {
        if (request === revision) setReviews([]);
      });
    };
    reload();
    window.addEventListener(EXTRACTION_UPDATE_EVENT, reload);
    return () => { revision++; window.removeEventListener(EXTRACTION_UPDATE_EVENT, reload); };
  }, []);

  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [examDate, setExamDate] = useState("");
  const [examTime, setExamTime] = useState("");
  const [selectedDisciplineKey, setSelectedDisciplineKey] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [subjectInput, setSubjectInput] = useState("");
  const [subjectPriority, setSubjectPriority] = useState<ExamPriority>("medium");
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);

  const { materials: allMaterials, isLoading: materialsLoading, error: materialsError } = useMaterials();
  const disciplines = new Map<string, Material>();
  for (const material of allMaterials) {
    const key = disciplineKey(material);
    if (key) disciplines.set(key, material);
  }

  useEffect(() => {
    const syncFromStorage = () => {
      const loaded = ExamService.load();
      setExams(loaded);
      setSelectedExamId((current) => {
        if (requestedExamId && loaded.some((exam) => exam.id === requestedExamId)) return requestedExamId;
        return loaded.some((exam) => exam.id === current) ? current : loaded[0]?.id ?? null;
      });
    };

    syncFromStorage();
    setIsCreating(false);
    setEditingExamId(null);
    setMaterialNotice(undefined);
    setStorageError(undefined);

    const handleStorageEvent = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("studyai:exams:")) syncFromStorage();
    };
    const handleStorageError = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as { message?: string } | undefined : undefined;
      if (detail?.message) setStorageError(detail.message);
    };

    window.addEventListener(EXAM_UPDATED_EVENT, syncFromStorage);
    window.addEventListener(STORAGE_UPDATED_EVENT, syncFromStorage);
    window.addEventListener(STORAGE_ERROR_EVENT, handleStorageError);
    window.addEventListener("storage", handleStorageEvent);
    return () => {
      window.removeEventListener(EXAM_UPDATED_EVENT, syncFromStorage);
      window.removeEventListener(STORAGE_UPDATED_EVENT, syncFromStorage);
      window.removeEventListener(STORAGE_ERROR_EVENT, handleStorageError);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [requestedExamId, sessionOwner]);

  useEffect(() => {
    if (!sessionOwner) return;
    const session = SessionOperationManager.current();
    const cleaned = ExamService.pruneOrphanMaterials({
      materialIds: allMaterials.map((material) => material.id),
      isComplete: !materialsLoading && !materialsError,
      userId: sessionOwner,
      generation: session.generation,
    });
    if (cleaned) {
      setExams(cleaned);
      setMaterialNotice("Materiais removidos da Biblioteca foram retirados dos vínculos desta prova. Os demais dados foram preservados.");
    }
  }, [allMaterials, materialsError, materialsLoading, sessionOwner]);

  const selectedExam = exams.find((exam) => exam.id === selectedExamId) ?? exams[0];
  const materialsById = useMemo(
    () => new Map(allMaterials.map((material) => [material.id, material])),
    [allMaterials],
  );
  const linkedMaterials = useMemo(
    () => selectedExam
      ? selectedExam.materialIds.flatMap((id) => {
        const material = materialsById.get(id);
        return material && (!selectedExam.disciplineKey || disciplineKey(material) === selectedExam.disciplineKey) ? [material] : [];
      })
      : [],
    [materialsById, selectedExam],
  );
  const scopedExam = useMemo(() => {
    if (!selectedExam?.disciplineKey) return selectedExam;
    return {
      ...selectedExam,
      materialIds: linkedMaterials.map(({ id }) => id),
      studyId: linkedMaterials.some(({ studyId }) => studyId === selectedExam.studyId) ? selectedExam.studyId : undefined,
    };
  }, [selectedExam, linkedMaterials]);
  const eligibleStudies = selectedExam?.disciplineKey
    ? studies.filter((study) => study.materialIds.length > 0 && study.materialIds.every((id) => linkedMaterials.some((material) => material.id === id)))
    : studies;
  const linkedStudy = resolveExamStudy(scopedExam, eligibleStudies);
  const { snapshot: examProgress, isLoading: progressLoading, error: progressError } = useExamProgress(scopedExam, studies, sessionOwner);
  const availableMaterials = useMemo(() => {
    if (!selectedExam || materialsLoading || materialsError) return [];
    const linked = new Set(selectedExam.materialIds);
    const studyMaterials: Material[] = [];
    const otherMaterials: Material[] = [];
    for (const material of allMaterials) {
      if (linked.has(material.id)) continue;
      if (selectedExam.disciplineKey && disciplineKey(material) !== selectedExam.disciplineKey) continue;
      (material.studyId === selectedExam.studyId ? studyMaterials : otherMaterials).push(material);
    }
    return [...studyMaterials, ...otherMaterials];
  }, [allMaterials, materialsError, materialsLoading, selectedExam]);

  const resetExamForm = () => {
    setIsCreating(false);
    setEditingExamId(null);
    setTitle("");
    setDiscipline("");
    setExamDate("");
    setExamTime("");
    setSelectedDisciplineKey("");
    setDailyMinutes(60);
    setSubjectInput("");
    setSubjectPriority("medium");
    setSubjects([]);
  };

  const openCreateExam = () => {
    resetExamForm();
    setIsCreating(true);
  };

  const openEditExam = (exam: Exam) => {
    setEditingExamId(exam.id);
    setTitle(exam.title);
    setDiscipline(exam.discipline);
    setExamDate(exam.examDate);
    setExamTime(exam.examTime ?? "");
    setSelectedDisciplineKey(exam.disciplineKey ?? "");
    setDailyMinutes(exam.dailyMinutes);
    setSubjectInput("");
    setSubjectPriority("medium");
    setSubjects(exam.subjects);
    setIsCreating(true);
  };

  const persistExams = (next: Exam[]): boolean => {
    if (!ExamService.save(next)) {
      setStorageError("Não foi possível salvar os dados da prova no armazenamento local. Libere espaço no navegador e tente novamente.");
      return false;
    }
    setStorageError(undefined);
    setExams(next);
    return true;
  };

  const handleSaveExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !discipline.trim() || !examDate || subjects.length === 0) return;
    if (editingExamId) {
      const next = exams.map((exam) => exam.id === editingExamId ? {
        ...exam,
        title: title.trim(),
        discipline: discipline.trim(),
        examDate,
        examTime: examTime || undefined,
        disciplineKey: selectedDisciplineKey || undefined,
        materialIds: selectedDisciplineKey !== (exam.disciplineKey ?? "") ? [] : exam.materialIds,
        studyId: selectedDisciplineKey !== (exam.disciplineKey ?? "") ? undefined : exam.studyId,
        dailyMinutes: Number(dailyMinutes) || 60,
        subjects,
        updatedAt: new Date().toISOString(),
      } : exam);
      if (!persistExams(next)) return;
      setSelectedExamId(editingExamId);
      resetExamForm();
      return;
    }
    const newExam = ExamService.create({
      title: title.trim(),
      discipline: discipline.trim(),
      examDate,
      examTime: examTime || undefined,
      disciplineKey: selectedDisciplineKey || undefined,
      dailyMinutes: Number(dailyMinutes) || 60,
      subjects,
      materialIds: [],
      studyId: undefined,
    });
    const next = [newExam, ...exams];
    if (!persistExams(next)) return;
    setSelectedExamId(newExam.id);
    resetExamForm();
  };

  const addMaterialToExam = (materialId: string) => {
    const exam = exams.find((e) => e.id === selectedExamId);
    if (!exam || exam.materialIds.includes(materialId)) return;
    if (!availableMaterials.some(({ id }) => id === materialId)) return;
    const nextExams = exams.map((e) => {
      if (e.id !== selectedExamId) return e;
      return { ...e, materialIds: [...e.materialIds, materialId], updatedAt: new Date().toISOString() };
    });
    if (!persistExams(nextExams)) return;
    setMaterialNotice(undefined);
  };

  const removeMaterialFromExam = (materialId: string) => {
    const exam = exams.find((e) => e.id === selectedExamId);
    if (!exam || !exam.materialIds.includes(materialId)) return;
    const nextExams = exams.map((e) => {
      if (e.id !== selectedExamId) return e;
      return { ...e, materialIds: e.materialIds.filter((id) => id !== materialId), updatedAt: new Date().toISOString() };
    });
    if (!persistExams(nextExams)) return;
    setMaterialNotice(undefined);
  };

  const linkStudyToExam = (studyId?: string) => {
    const exam = exams.find((e) => e.id === selectedExamId);
    if (!exam || exam.studyId === studyId) return;
    const study = studyId ? studies.find((s) => s.studyId === studyId) : undefined;
    const nextExams = exams.map((e) => {
      if (e.id !== selectedExamId) return e;
      const allowedIds = study?.materialIds.filter((id) => !e.disciplineKey || (
        materialsById.has(id) && disciplineKey(materialsById.get(id)!) === e.disciplineKey
      ));
      if (e.disciplineKey && study && !allowedIds?.length) return e;
      const materialIds = allowedIds ? Array.from(new Set([...e.materialIds, ...allowedIds])) : e.materialIds;
      return { ...e, studyId, materialIds, updatedAt: new Date().toISOString() };
    });
    persistExams(nextExams);
  };

  const addSubject = () => {
    if (!subjectInput.trim()) return;
    setSubjects((current) => [...current, { id: `subj-${Date.now()}`, name: subjectInput.trim(), priority: subjectPriority, completed: false }]);
    setSubjectInput("");
  };

  const removeSubject = (id: string) => {
    setSubjects(subjects.filter((s) => s.id !== id));
  };

  const toggleSubject = (examId: string, subjectId: string) => {
    const next = exams.map((exam) => {
      if (exam.id !== examId) return exam;
      const updatedSubjects = exam.subjects.map((s) => s.id === subjectId ? { ...s, completed: !s.completed } : s);
      return { ...exam, subjects: updatedSubjects, updatedAt: new Date().toISOString() };
    });
    persistExams(next);
  };

  const deleteExam = (id: string) => {
    const next = exams.filter((e) => e.id !== id);
    if (!persistExams(next)) return;
    if (selectedExamId === id) {
      setSelectedExamId(next[0]?.id ?? null);
    }
    if (editingExamId === id) resetExamForm();
  };

  const linkedStudyIds = new Set(linkedMaterials.map(({ studyId }) => studyId));
  const preparationKey = selectedExam?.disciplineKey;
  const catalog = preparationKey && !materialsLoading && !materialsError
    ? examQuestionCatalog(linkedMaterials, extracted, preparationKey) : [];
  const preparationActivities: ExamSubject[] = [];
  if (preparationKey) {
    for (const review of reviews) {
      if (review.discipline !== preparationKey || !linkedStudyIds.has(review.studyId)) continue;
      if (review.difficulty !== "hard" && reviewPeriod(review.nextReviewAt, new Date()) !== "late") continue;
      preparationActivities.push({ id: `review:${review.studyId}`, name: `Revisar: ${review.topic}`, priority: "high", completed: false });
    }
    if (catalog.length || linkedMaterials.some((material) => materialKind(material) === "Exercícios")) {
      preparationActivities.push({ id: "practice", name: "Praticar exercícios dos materiais", priority: "medium", completed: false });
    }
    if (catalog.length || linkedMaterials.some((material) => materialKind(material) === "Simulado")) {
      preparationActivities.push({ id: "simulation", name: "Fazer um simulado dos materiais", priority: "low",
        completed: Boolean(selectedExam?.materialAttempts?.some((item) => item.examId === selectedExam.id && item.disciplineKey === preparationKey && item.completedAt)) });
    }
  }
  const plan = selectedExam ? ExamService.generatePlan({
    ...selectedExam, subjects: [...selectedExam.subjects, ...preparationActivities],
  }) : [];

  function saveMaterialAttempt(attempt: MaterialExamAttempt) {
    const session = SessionOperationManager.current();
    if (!selectedExam || session.suspended || session.userId !== sessionOwner || attempt.examId !== selectedExam.id) return;
    const next = ExamService.load().map((exam) => {
      if (exam.id !== attempt.examId || exam.disciplineKey !== attempt.disciplineKey) return exam;
      const previous = exam.materialAttempts ?? [];
      const exists = previous.some((item) => item.id === attempt.id);
      if (!exists && previous.some((item) => item.disciplineKey === exam.disciplineKey && !item.completedAt)) return exam;
      return { ...exam, materialAttempts: exists ? previous.map((item) => item.id === attempt.id ? attempt : item) : [attempt, ...previous] };
    });
    persistExams(next);
  }
  const activePractice = practiceMaterial?.examId === selectedExam?.id
    ? linkedMaterials.find(({ id }) => id === practiceMaterial?.materialId) : undefined;

  function recordPractice(assessment: PracticeAssessment) {
    const session = SessionOperationManager.current();
    if (!selectedExam || !activePractice || session.suspended || session.userId !== sessionOwner) return;
    const next = ExamService.load().map((exam) => {
      if (exam.id !== selectedExam.id) return exam;
      const totals = exam.practiceTotals ?? { correct: 0, wrong: 0, reviewed: 0 };
      return { ...exam, practiceTotals: { ...totals, [assessment]: totals[assessment] + 1 }, updatedAt: new Date().toISOString() };
    });
    persistExams(next);
  }

  function moveSubject(index: number, offset: number) {
    if (!selectedExam) return;
    const nextSubjects = [...selectedExam.subjects];
    const target = index + offset;
    if (target < 0 || target >= nextSubjects.length) return;
    [nextSubjects[index], nextSubjects[target]] = [nextSubjects[target], nextSubjects[index]];
    const next = exams.map((exam) => exam.id === selectedExam.id
      ? { ...exam, subjects: nextSubjects, manualOrder: true, updatedAt: new Date().toISOString() }
      : exam);
    persistExams(next);
  }

  const daysLeft = selectedExam ? daysUntilExam(selectedExam.examDate) ?? 0 : 0;
  const completedCount = selectedExam?.subjects.filter((s) => s.completed).length ?? 0;
  const totalCount = selectedExam?.subjects.length ?? 0;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="type-page-title">Modo Semana de Prova</h1>
          <p className="text-sm text-muted-foreground">Organize seus estudos, priorize assuntos e acompanhe sua contagem regressiva.</p>
        </div>
        <Button type="button" onClick={openCreateExam}><Plus className="size-4 mr-2" />Nova Prova</Button>
      </div>

      {storageError && (
        <Feedback variant="error" role="alert">{storageError}</Feedback>
      )}

      {isCreating && (
        <Card className="p-6 border-primary/30 bg-card shadow-sm space-y-4">
          <h2 className="font-semibold text-lg">{editingExamId ? "Editar Prova ou Avaliação" : "Configurar Nova Prova ou Avaliação"}</h2>
          <form onSubmit={handleSaveExam} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="exam-discipline" className="text-xs font-semibold text-muted-foreground uppercase">Disciplina / Matéria</label>
                <Input id="exam-discipline" autoFocus placeholder="Ex: Cálculo II, Direito Constitucional" value={discipline} onChange={(e) => { setDiscipline(e.target.value); setSelectedDisciplineKey(""); }} required className="mt-1" />
                <label className="mt-2 grid gap-1 text-sm">Disciplina da Biblioteca
                  <select className="w-full min-w-0 rounded border bg-background p-2" value={selectedDisciplineKey} onChange={(event) => {
                    const key = event.target.value;
                    setSelectedDisciplineKey(key);
                    const material = disciplines.get(key);
                    if (material?.subject) setDiscipline(material.subject);
                  }}>
                    <option value="">Sem vínculo com a Biblioteca</option>
                    {selectedDisciplineKey && !disciplines.has(selectedDisciplineKey) && <option value={selectedDisciplineKey}>Disciplina indisponível</option>}
                    {[...disciplines].map(([key, material]) => <option key={key} value={key}>{[material.subject, material.course, material.semester].filter(Boolean).join(" · ")}</option>)}
                  </select>
                </label>
              </div>
              <div>
                <label htmlFor="exam-title" className="text-xs font-semibold text-muted-foreground uppercase">Nome da Prova</label>
                <Input id="exam-title" placeholder="Ex: P2, Exame Final, Teste 1" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <label htmlFor="exam-date" className="text-xs font-semibold text-muted-foreground uppercase">Data da Prova</label>
                <Input id="exam-date" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} required className="mt-1" />
                <label className="mt-2 grid gap-1 text-sm">Horário da prova (opcional)
                  <Input type="time" value={examTime} onChange={(event) => setExamTime(event.target.value)} />
                </label>
              </div>
              <div>
                <label htmlFor="exam-daily-minutes" className="text-xs font-semibold text-muted-foreground uppercase">Meta Diária (minutos)</label>
                <Input id="exam-daily-minutes" type="number" min={15} max={360} value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value))} required className="mt-1" />
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <label htmlFor="exam-subject" className="text-xs font-semibold text-muted-foreground uppercase">Assuntos / Conteúdos da Prova</label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Input id="exam-subject" placeholder="Nome do assunto (ex: Derivadas parciais)" value={subjectInput} onChange={(e) => setSubjectInput(e.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSubject(); } }} />
                <label htmlFor="exam-subject-priority" className="sr-only">Prioridade do assunto</label>
                <select id="exam-subject-priority" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={subjectPriority} onChange={(e) => setSubjectPriority(e.target.value as ExamPriority)}>
                  <option value="high">Alta Prioridade</option>
                  <option value="medium">Média Prioridade</option>
                  <option value="low">Baixa Prioridade</option>
                </select>
                <Button type="button" variant="secondary" onClick={addSubject}>Adicionar</Button>
              </div>
              {subjects.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {subjects.map((s) => (
                    <Badge key={s.id} variant="outline" className="gap-2 py-1.5 px-3">
                      <span>{s.name} ({s.priority})</span>
                      <button type="button" aria-label={`Remover assunto ${s.name}`} onClick={() => removeSubject(s.id)} className="rounded text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={resetExamForm}>Cancelar</Button>
              <Button type="submit" disabled={!title.trim() || !discipline.trim() || !examDate || subjects.length === 0}>{editingExamId ? "Salvar alterações" : "Salvar Prova"}</Button>
            </div>
          </form>
        </Card>
      )}

      {exams.length === 0 && !isCreating ? (
        <Card className="p-12 text-center space-y-3">
          <Calendar className="size-10 text-primary mx-auto" />
          <h2 className="type-section-title">Nenhuma prova cadastrada</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">Cadastre sua data de prova para gerar automaticamente o plano de revisão ideal até o dia do exame.</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Suas Provas</p>
            {exams.map((exam) => {
              const active = exam.id === selectedExam?.id;
              const dLeft = daysUntilExam(exam.examDate) ?? 0;
              return (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => setSelectedExamId(exam.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${active ? "border-primary bg-accent/60 font-semibold shadow-sm" : "bg-card hover:bg-accent/30 text-muted-foreground"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{exam.discipline}</span>
                    <Badge variant={dLeft < 0 ? "destructive" : dLeft <= 3 ? "default" : "secondary"}>
                      {dLeft < 0 ? "Realizada" : dLeft === 0 ? "Hoje!" : `${dLeft} dias`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{exam.title}</p>
                </button>
              );
            })}
          </div>

          {selectedExam && (
            <div className="space-y-6">
              <Card className="p-6 space-y-4 shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Badge variant="outline" className="mb-2">{selectedExam.discipline}</Badge>
                    <h2 className="text-xl font-bold">{selectedExam.title}</h2>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                      <Calendar className="size-4" /> Data: {formatExamDate(selectedExam.examDate)} {selectedExam.examTime && `às ${selectedExam.examTime}`} ({daysLeft < 0 ? "Prova já ocorreu" : daysLeft === 0 ? "É hoje!" : `Faltam ${daysLeft} dias`})
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm"><Link href={`/planejamento?prova=${encodeURIComponent(selectedExam.id)}`}>Planejar no cronograma</Link></Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => openEditExam(selectedExam)}><Pencil className="mr-1.5 size-4" />Editar prova</Button>
                    <Button type="button" aria-label={`Excluir prova ${selectedExam.title}`} variant="destructive" size="icon-sm" onClick={() => deleteExam(selectedExam.id)}><Trash2 className="size-4" /></Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t">
                  <div className="p-3 rounded-lg border bg-card/50">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Progresso dos Assuntos</p>
                    <p className="text-2xl font-bold mt-1">{progressPercent}%</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{completedCount} de {totalCount} concluídos</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-card/50">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Meta Diária</p>
                    <p className="text-2xl font-bold mt-1 flex items-center gap-1"><Clock className="size-5 text-primary" /> {selectedExam.dailyMinutes} min</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Tempo dedicado por dia</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-card/50 flex flex-col justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-semibold">Ação rápida</p>
                      <p className="text-sm font-medium mt-1">Simulado protegido</p>
                    </div>
                    {linkedStudy ? (
                      <Button asChild size="sm" className="mt-2 w-full">
                        <Link href={examLearningHref(linkedStudy.studyId, "exam", selectedExam.id)}><ShieldCheck className="mr-1.5 size-3.5" />Abrir Modo Prova</Link>
                      </Button>
                    ) : (
                    <Button type="button" size="sm" className="mt-2 w-full" disabled>Vincule um estudo</Button>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="p-6 shadow-none" aria-labelledby="exam-learning-actions-title">
                <div>
                  <h3 id="exam-learning-actions-title" className="text-base font-semibold">Atividades desta prova</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {linkedStudy
                      ? `As atividades usarão somente o estudo “${linkedStudy.title}”.`
                      : selectedExam.studyId
                        ? "O estudo vinculado não está disponível nesta conta. O vínculo foi preservado."
                        : "Vincule um estudo para abrir atividades com o contexto correto."}
                  </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {learningActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <div key={action.id} className="flex flex-col rounded-xl border bg-card/40 p-4">
                        <Icon className="size-5 text-primary" aria-hidden="true" />
                        <p className="mt-3 text-sm font-semibold">{action.title}</p>
                        <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">{action.description}</p>
                        {linkedStudy ? (
                          <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                            <Link href={examLearningHref(linkedStudy.studyId, action.id, selectedExam.id)}>Abrir</Link>
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" size="sm" className="mt-3 w-full" disabled>Indisponível</Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="p-6 shadow-none" aria-labelledby="exam-real-progress-title">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="exam-real-progress-title" className="text-base font-semibold">Progresso real vinculado</h3>
                    <p className="text-sm font-medium">Histórico dos estudos · compartilhado entre avaliações que usam o mesmo estudo</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Conteúdo, atividades e desempenho são exibidos separadamente e nunca alterados apenas por abrir esta página.
                    </p>
                  </div>
                  {examProgress ? <Badge variant="outline">{progressStateLabels[examProgress.state]}</Badge> : null}
                </div>

                {progressLoading ? (
                  <p className="mt-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Carregando registros autorizados…</p>
                ) : progressError ? (
                  <Feedback variant="warning" role="status" className="mt-5 p-4">{progressError}</Feedback>
                ) : !examProgress || examProgress.state === "insufficient_data" ? (
                  <p className="mt-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Sem dados suficientes. Vincule um estudo ou material organizado desta conta para consolidar o progresso.
                  </p>
                ) : (
                  <div className="mt-5 space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border bg-card/40 p-4">
                        <Target className="size-5 text-primary" aria-hidden="true" />
                        <p className="mt-2 text-2xl font-bold">{examProgress.studyProgress ?? 0}%</p>
                        <p className="text-xs text-muted-foreground">Progresso do conteúdo · {examProgress.topicsStudied} tema(s) estudado(s)</p>
                      </div>
                      <div className="rounded-xl border bg-card/40 p-4">
                        <Activity className="size-5 text-primary" aria-hidden="true" />
                        <p className="mt-2 text-2xl font-bold">{examProgress.activitiesCompleted}</p>
                        <p className="text-xs text-muted-foreground">Atividades registradas · {examProgress.studyMinutes} min</p>
                      </div>
                      <div className="rounded-xl border bg-card/40 p-4">
                        <BrainCircuit className="size-5 text-primary" aria-hidden="true" />
                        <p className="mt-2 text-2xl font-bold">{examProgress.flashcardReviews}</p>
                        <p className="text-xs text-muted-foreground">Revisões · {examProgress.reviewedCards} cartão(ões) distinto(s)</p>
                      </div>
                      <div className="rounded-xl border bg-card/40 p-4">
                        <ClipboardCheck className="size-5 text-primary" aria-hidden="true" />
                        <p className="mt-2 text-2xl font-bold">{examProgress.performance === null ? "—" : `${examProgress.performance}%`}</p>
                        <p className="text-xs text-muted-foreground">Desempenho em {examProgress.quizAttempts} quiz(zes) · {examProgress.correctAnswers} acertos / {examProgress.wrongAnswers} erros</p>
                      </div>
                    </div>

                    <div className="space-y-2" aria-label="Estudos associados à prova">
                      {examProgress.studies.map((study) => (
                        <div key={study.studyId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                          <div>
                            <p className="font-medium">{study.title}</p>
                            <p className="text-xs text-muted-foreground">{study.subject}</p>
                          </div>
                          <span className="font-semibold">{study.progress}% · {progressStateLabels[study.status]}</span>
                        </div>
                      ))}
                    </div>

                    {!examProgress.canAssociateDatedActivities ? (
                      <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                        Esta prova não possui uma data de criação válida; atividades históricas não foram associadas automaticamente.
                      </p>
                    ) : null}
                    <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                      Resultados do Modo Prova protegido não entram neste resumo porque as tentativas atuais não persistem `examId` ou `studyId`. O gabarito permanece protegido no servidor.
                    </p>
                  </div>
                )}
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="p-6 space-y-4 shadow-none">
                  <h3 className="font-semibold text-base flex items-center gap-2"><CheckCircle2 className="size-5 text-primary" /> Checklist de Assuntos</h3>
                  <div className="space-y-2">
                    {selectedExam.subjects.map((sub, index) => (
                      <div key={sub.id} className="flex flex-wrap items-center justify-between gap-1 p-3 rounded-xl border bg-card/40">
                        <label className="flex min-w-0 items-center gap-3 cursor-pointer flex-1">
                          <input type="checkbox" checked={sub.completed} onChange={() => toggleSubject(selectedExam.id, sub.id)} className="size-4 rounded border-primary text-primary focus:ring-primary" />
                          <span className={`min-w-0 break-words text-sm font-medium ${sub.completed ? "line-through text-muted-foreground" : ""}`}>{sub.name}</span>
                        </label>
                        <Badge variant={sub.priority === "high" ? "destructive" : sub.priority === "medium" ? "default" : "secondary"}>
                          {sub.priority === "high" ? "Alta" : sub.priority === "medium" ? "Média" : "Baixa"}
                        </Badge>
                        <button type="button" disabled={index === 0} aria-label={`Subir ${sub.name}`} className="p-2 disabled:opacity-40" onClick={() => moveSubject(index, -1)}>↑</button>
                        <button type="button" disabled={index === selectedExam.subjects.length - 1} aria-label={`Descer ${sub.name}`} className="p-2 disabled:opacity-40" onClick={() => moveSubject(index, 1)}>↓</button>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-6 space-y-4 shadow-none">
                  <h3 className="font-semibold text-base flex items-center gap-2"><Calendar className="size-5 text-primary" /> Plano Automático de Revisão</h3>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {!plan.length && <p className="text-sm text-muted-foreground">{daysLeft < 0 ? "A data da prova já passou. Edite a avaliação para gerar um novo plano." : "Adicione assuntos para montar o plano."}</p>}
                    {plan.map((item, index) => (
                      <div key={index} className="p-3 rounded-xl border bg-card/40 flex items-center justify-between gap-2 text-sm">
                        <div>
                          <p className="font-semibold">Dia {item.dayIndex} ({item.dateStr})</p>
                          <p className="text-muted-foreground text-xs mt-0.5">Focar em: {item.subjectName}</p>
                        </div>
                        <Badge variant="outline">{item.estimatedMinutes} min</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card className="p-6 space-y-4 shadow-none">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <FileText className="size-5 text-primary" /> Materiais Vinculados
                  </h3>
                  <Badge variant="outline">{linkedMaterials.length}</Badge>
                </div>
                {selectedExam.practiceTotals && <p className="text-sm">
                  Autoavaliação dos materiais: {selectedExam.practiceTotals.correct} acertos, {selectedExam.practiceTotals.wrong} erros, {selectedExam.practiceTotals.reviewed} sem correção.
                </p>}
                {selectedExam.disciplineKey && <div className="flex flex-wrap gap-3">
                  <Link className="underline" href={`/estudo/revisao?disciplina=${encodeURIComponent(selectedExam.disciplineKey)}`}>Revisar meus pontos fracos</Link>
                  {linkedMaterials.length > 0 && <Button type="button" variant="outline" onClick={() => {
                    if (SessionOperationManager.current().userId !== sessionOwner) return;
                    prepareReviewedTutorDraft(`Revise comigo os assuntos desta prova: ${selectedExam.subjects.map(({ name }) => name).join(", ")}.`, {
                      key: selectedExam.disciplineKey!,
                      subject: selectedExam.discipline,
                      materialIds: linkedMaterials.map(({ id }) => id),
                    });
                    router.push("/tutor");
                  }}>Revisar materiais com Tutor</Button>}
                </div>}

                {materialNotice ? (
                  <Feedback variant="warning" role="status">{materialNotice}</Feedback>
                ) : null}

                {materialsLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Carregando materiais vinculados...</p>
                ) : materialsError ? (
                  <p role="status" className="text-sm text-muted-foreground text-center py-4">
                    A Biblioteca está temporariamente indisponível. Os vínculos existentes foram preservados.
                  </p>
                ) : linkedMaterials.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum material vinculado. Selecione materiais da biblioteca abaixo para associar a esta prova.
                  </p>
                ) : null}

                {linkedMaterials.length > 0 && !materialsLoading && !materialsError ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {linkedMaterials.map((m) => (
                      <div key={m.id} className="flex flex-wrap items-center justify-between gap-1 rounded-xl border bg-card/40 p-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                              {m.studyId ? <Link className="block truncate text-sm font-medium underline" href={`/estudo?tema=${encodeURIComponent(m.studyId)}&arquivo=${encodeURIComponent(m.id)}&aba=material`}>{m.name}</Link> : <p className="truncate text-sm font-medium">{m.name}</p>}
                            <p className="truncate text-xs text-muted-foreground">
                              {m.subject ?? m.topic ?? "Sem assunto definido"} · {materialKind(m)}
                            </p>
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setPracticeMaterial({ examId: selectedExam.id, materialId: m.id })}>Praticar</Button>
                        <Button type="button" aria-label={`Remover material ${m.name}`} variant="ghost" size="sm" onClick={() => removeMaterialFromExam(m.id)}>
                          Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {activePractice && <ExamMaterialPractice key={`${selectedExam.id}:${activePractice.id}`} materialId={activePractice.id} onAssess={recordPractice} />}
                {preparationKey && <div className="border-t pt-4">
                  {catalogError && <p role="alert">Não foi possível carregar as questões extraídas.</p>}
                  <ExamMaterialSimulation key={JSON.stringify([selectedExam.id, preparationKey])} exam={selectedExam} catalog={catalog} save={saveMaterialAttempt} />
                </div>}

                <div className="space-y-2">
                  {selectedExam && (
                    <>
                      <label htmlFor="exam-linked-study" className="text-xs font-semibold text-muted-foreground uppercase">Vincular Estudo</label>
                      <select
                        id="exam-linked-study"
                        className="rounded-md border bg-background px-3 py-2 text-sm mt-1 w-full"
                        value={selectedExam.studyId ?? ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          linkStudyToExam(id || undefined);
                        }}
                      >
                        <option value="">Nenhum estudo vinculado</option>
                        {selectedExam.studyId && !studies.some((study) => study.studyId === selectedExam.studyId) ? (
                          <option value={selectedExam.studyId}>Estudo indisponível (vínculo preservado)</option>
                        ) : null}
                        {eligibleStudies.filter((study) => !selectedExam.disciplineKey || linkedStudyIds.has(study.studyId)).map((s) => (
                          <option key={s.studyId} value={s.studyId}>
                            {s.title} ({s.subject})
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Adicionar Material da Biblioteca</p>
                  {!materialsLoading && !materialsError && availableMaterials.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      Nenhum material disponível para vincular. Importe ou organize materiais na Biblioteca primeiro.
                    </p>
                  ) : null}
                  {availableMaterials.length > 0 && !materialsLoading && !materialsError ? (
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {availableMaterials.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          aria-label={`Adicionar material ${m.name}`}
                          className="flex w-full items-center justify-between rounded-xl border bg-card/40 p-3 text-left transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => addMaterialToExam(m.id)}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <FileText className="size-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium truncate">{m.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {m.subject ?? m.topic ?? "Sem assunto definido"} · {m.fileType.toUpperCase()}
                                {m.studyId ? " · vinculado a estudo" : ""}
                              </p>
                            </div>
                          </div>
                          <span className="ml-3 shrink-0 text-xs text-primary">Adicionar</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
