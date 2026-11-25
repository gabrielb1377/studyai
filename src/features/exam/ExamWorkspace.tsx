"use client";

import { useState, useEffect, useMemo } from "react";
import { Calendar, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Feedback } from "@/components/ui/feedback";
import { daysUntilExam, EXAM_UPDATED_EVENT, ExamService } from "./ExamService";
import type { Exam, ExamSubject, ExamPriority } from "@/types/exam";
import type { StudyRecord } from "@/types/study-engine";
import type { Material } from "@/types/material";
import { useMaterials } from "@/hooks/useMaterials";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { STORAGE_ERROR_EVENT, STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import { useUpdateGuard } from "@/features/platform/UpdateSafety";
import { resolveExamStudy } from "./ExamLearningNavigation";
import { useExamProgress } from "./useExamProgress";
import { disciplineKey, materialKind } from "@/features/tutor/services/DisciplineContext";
import { prepareReviewedTutorDraft } from "@/features/tutor/services/ReviewedTutorDraft";
import type { PracticeAssessment } from "./ExamMaterialPractice";
import { examQuestionCatalog } from "./ExamQuestionCatalog";
import { ContentStorage, EXTRACTION_UPDATE_EVENT } from "@/features/extraction/ContentStorage";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { TopicReviewStorage } from "@/features/learning/TopicReviewStorage";
import { reviewPeriod, type TopicReview } from "@/features/learning/TopicReview";
import type { MaterialExamAttempt } from "@/types/exam";

import { ExamListSidebar } from "./components/ExamListSidebar";
import { ExamDetailHeader } from "./components/ExamDetailHeader";
import { ExamLearningActionsCard } from "./components/ExamLearningActionsCard";
import { ExamRealProgressCard } from "./components/ExamRealProgressCard";
import { ExamChecklistAndPlan } from "./components/ExamChecklistAndPlan";
import { ExamMaterialsCard } from "./components/ExamMaterialsCard";
import { ExamFormCard } from "./components/ExamFormCard";

export function ExamWorkspace({
  studies,
  sessionOwner,
  requestedExamId,
}: {
  studies: readonly StudyRecord[];
  sessionOwner?: string;
  requestedExamId?: string;
}) {
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

  function handleReviewMaterialsWithTutor() {
    if (!selectedExam || !selectedExam.disciplineKey) return;
    if (SessionOperationManager.current().userId !== sessionOwner) return;
    prepareReviewedTutorDraft(
      `Revise comigo os assuntos desta prova: ${selectedExam.subjects.map(({ name }) => name).join(", ")}.`,
      {
        key: selectedExam.disciplineKey,
        subject: selectedExam.discipline,
        materialIds: linkedMaterials.map(({ id }) => id),
      }
    );
    router.push("/tutor");
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
        <ExamFormCard
          isEditing={Boolean(editingExamId)}
          title={title}
          discipline={discipline}
          examDate={examDate}
          examTime={examTime}
          selectedDisciplineKey={selectedDisciplineKey}
          dailyMinutes={dailyMinutes}
          subjectInput={subjectInput}
          subjectPriority={subjectPriority}
          subjects={subjects}
          disciplines={disciplines}
          onTitleChange={setTitle}
          onDisciplineChange={(val) => setDiscipline(val)}
          onSelectedDisciplineKeyChange={setSelectedDisciplineKey}
          onExamDateChange={setExamDate}
          onExamTimeChange={setExamTime}
          onDailyMinutesChange={setDailyMinutes}
          onSubjectInputChange={setSubjectInput}
          onSubjectPriorityChange={setSubjectPriority}
          onAddSubject={addSubject}
          onRemoveSubject={removeSubject}
          onSaveExam={handleSaveExam}
          onCancel={resetExamForm}
        />
      )}

      {exams.length === 0 && !isCreating ? (
        <EmptyState
          icon={Calendar}
          title="Nenhuma prova cadastrada"
          description="Cadastre sua data de prova para gerar automaticamente o plano de revisão ideal até o dia do exame."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ExamListSidebar
            exams={exams}
            selectedExamId={selectedExam?.id ?? null}
            onSelectExam={setSelectedExamId}
          />

          {selectedExam && (
            <div className="min-w-0 space-y-6">
              <ExamDetailHeader
                exam={selectedExam}
                daysLeft={daysLeft}
                progressPercent={progressPercent}
                completedCount={completedCount}
                totalCount={totalCount}
                linkedStudy={linkedStudy}
                onEdit={() => openEditExam(selectedExam)}
                onDelete={() => deleteExam(selectedExam.id)}
              />

              <ExamLearningActionsCard
                exam={selectedExam}
                linkedStudy={linkedStudy}
              />

              {progressLoading ? (
                <div role="status" aria-label="Carregando registros autorizados" className="space-y-3">
                  <Skeleton className="h-6 w-48" />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((slot) => (
                      <Skeleton key={slot} className="h-24 rounded-xl" />
                    ))}
                  </div>
                </div>
              ) : (
                <ExamRealProgressCard
                  examProgress={examProgress}
                  progressLoading={progressLoading}
                  progressError={progressError}
                />
              )}

              <ExamChecklistAndPlan
                exam={selectedExam}
                plan={plan}
                daysLeft={daysLeft}
                onToggleSubject={toggleSubject}
                onMoveSubject={moveSubject}
              />

              {materialsLoading ? (
                <div role="status" aria-label="Carregando materiais vinculados" className="space-y-3">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-32 rounded-xl" />
                </div>
              ) : (
                <ExamMaterialsCard
                  selectedExam={selectedExam}
                  linkedMaterials={linkedMaterials}
                  availableMaterials={availableMaterials}
                  studies={studies}
                  eligibleStudies={eligibleStudies}
                  linkedStudyIds={linkedStudyIds}
                  preparationKey={preparationKey}
                  catalog={catalog}
                  catalogError={catalogError}
                  materialsLoading={materialsLoading}
                  materialsError={Boolean(materialsError)}
                  materialNotice={materialNotice}
                  activePractice={activePractice}
                  onSetPracticeMaterial={setPracticeMaterial}
                  onRemoveMaterial={removeMaterialFromExam}
                  onAddMaterial={addMaterialToExam}
                  onLinkStudy={linkStudyToExam}
                  onSaveMaterialAttempt={saveMaterialAttempt}
                  onRecordPractice={recordPractice}
                  onReviewMaterialsWithTutor={handleReviewMaterialsWithTutor}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
