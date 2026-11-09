"use client";

import { useState, useEffect, useMemo } from "react";
import { Bot, BrainCircuit, Calendar, CheckCircle2, ClipboardCheck, Clock, FileText, Plus, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ExamService } from "./ExamService";
import type { Exam, ExamSubject, ExamPriority } from "@/types/exam";
import type { StudyRecord } from "@/types/study-engine";
import type { Material } from "@/types/material";
import { useMaterials } from "@/hooks/useMaterials";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { examLearningHref, resolveExamStudy, type ExamLearningAction } from "./ExamLearningNavigation";

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

export function ExamWorkspace({ studies, sessionOwner }: { studies: readonly StudyRecord[]; sessionOwner?: string }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [examDate, setExamDate] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [subjectInput, setSubjectInput] = useState("");
  const [subjectPriority, setSubjectPriority] = useState<ExamPriority>("medium");
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);

  const { materials: allMaterials, isLoading: materialsLoading, error: materialsError } = useMaterials();

  useEffect(() => {
    const loaded = ExamService.load();
    setExams(loaded);
    setSelectedExamId((current) => loaded.some((exam) => exam.id === current) ? current : loaded[0]?.id ?? null);
  }, [sessionOwner]);

  useEffect(() => {
    if (!sessionOwner) return;
    const session = SessionOperationManager.current();
    const cleaned = ExamService.pruneOrphanMaterials({
      materialIds: allMaterials.map((material) => material.id),
      isComplete: !materialsLoading && !materialsError,
      userId: sessionOwner,
      generation: session.generation,
    });
    if (cleaned) setExams(cleaned);
  }, [allMaterials, materialsError, materialsLoading, sessionOwner]);

  const selectedExam = exams.find((exam) => exam.id === selectedExamId) ?? exams[0];
  const linkedStudy = resolveExamStudy(selectedExam, studies);
  const materialsById = useMemo(
    () => new Map(allMaterials.map((material) => [material.id, material])),
    [allMaterials],
  );
  const linkedMaterials = useMemo(
    () => selectedExam
      ? selectedExam.materialIds.flatMap((id) => {
        const material = materialsById.get(id);
        return material ? [material] : [];
      })
      : [],
    [materialsById, selectedExam],
  );
  const availableMaterials = useMemo(() => {
    if (!selectedExam || materialsLoading || materialsError) return [];
    const linked = new Set(selectedExam.materialIds);
    const studyMaterials: Material[] = [];
    const otherMaterials: Material[] = [];
    for (const material of allMaterials) {
      if (linked.has(material.id)) continue;
      (material.studyId === selectedExam.studyId ? studyMaterials : otherMaterials).push(material);
    }
    return [...studyMaterials, ...otherMaterials];
  }, [allMaterials, materialsError, materialsLoading, selectedExam]);

  const handleSaveExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !discipline.trim() || !examDate || subjects.length === 0) return;
    const newExam = ExamService.create({
      title: title.trim(),
      discipline: discipline.trim(),
      examDate,
      dailyMinutes: Number(dailyMinutes) || 60,
      subjects,
      materialIds: [],
      studyId: undefined,
    });
    const next = [newExam, ...exams];
    ExamService.save(next);
    setExams(next);
    setSelectedExamId(newExam.id);
    setIsCreating(false);
    setTitle("");
    setDiscipline("");
    setExamDate("");
    setSubjects([]);
  };

  const addMaterialToExam = (materialId: string) => {
    const exam = exams.find((e) => e.id === selectedExamId);
    if (!exam || exam.materialIds.includes(materialId)) return;
    const nextExams = exams.map((e) => {
      if (e.id !== selectedExamId) return e;
      return { ...e, materialIds: [...e.materialIds, materialId], updatedAt: new Date().toISOString() };
    });
    ExamService.save(nextExams);
    setExams(nextExams);
  };

  const removeMaterialFromExam = (materialId: string) => {
    const exam = exams.find((e) => e.id === selectedExamId);
    if (!exam || !exam.materialIds.includes(materialId)) return;
    const nextExams = exams.map((e) => {
      if (e.id !== selectedExamId) return e;
      return { ...e, materialIds: e.materialIds.filter((id) => id !== materialId), updatedAt: new Date().toISOString() };
    });
    ExamService.save(nextExams);
    setExams(nextExams);
  };

  const linkStudyToExam = (studyId: string) => {
    const exam = exams.find((e) => e.id === selectedExamId);
    if (!exam || exam.studyId === studyId) return;
    const study = studies.find((s) => s.studyId === studyId);
    const nextExams = exams.map((e) => {
      if (e.id !== selectedExamId) return e;
      const materialIds = study ? Array.from(new Set([...e.materialIds, ...study.materialIds])) : e.materialIds;
      return { ...e, studyId, materialIds, updatedAt: new Date().toISOString() };
    });
    ExamService.save(nextExams);
    setExams(nextExams);
  };

  const addSubject = () => {
    if (!subjectInput.trim()) return;
    setSubjects([...subjects, { id: `subj-${Date.now()}`, name: subjectInput.trim(), priority: subjectPriority, completed: false }]);
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
    ExamService.save(next);
    setExams(next);
  };

  const deleteExam = (id: string) => {
    const next = exams.filter((e) => e.id !== id);
    ExamService.save(next);
    setExams(next);
    if (selectedExamId === id) {
      setSelectedExamId(next[0]?.id ?? null);
    }
  };

  const plan = selectedExam ? ExamService.generatePlan(selectedExam) : [];

  const daysLeft = selectedExam ? Math.ceil((new Date(selectedExam.examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
  const completedCount = selectedExam?.subjects.filter((s) => s.completed).length ?? 0;
  const totalCount = selectedExam?.subjects.length ?? 0;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Modo Semana de Prova</h1>
          <p className="text-sm text-muted-foreground">Organize seus estudos, priorize assuntos e acompanhe sua contagem regressiva.</p>
        </div>
        <Button type="button" onClick={() => setIsCreating(true)}><Plus className="size-4 mr-2" />Nova Prova</Button>
      </div>

      {isCreating && (
        <Card className="p-6 border-primary/30 bg-card shadow-sm space-y-4">
          <h2 className="font-semibold text-lg">Configurar Nova Prova ou Avaliação</h2>
          <form onSubmit={handleSaveExam} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Disciplina / Matéria</label>
                <Input placeholder="Ex: Cálculo II, Direito Constitucional" value={discipline} onChange={(e) => setDiscipline(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Nome da Prova</label>
                <Input placeholder="Ex: P2, Exame Final, Teste 1" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Data da Prova</label>
                <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Meta Diária (minutos)</label>
                <Input type="number" min={15} max={360} value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value))} required className="mt-1" />
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Assuntos / Conteúdos da Prova</label>
              <div className="flex gap-2">
                <Input placeholder="Nome do assunto (ex: Derivadas parciais)" value={subjectInput} onChange={(e) => setSubjectInput(e.target.value)} />
                <select className="rounded-md border bg-background px-3 py-2 text-sm" value={subjectPriority} onChange={(e) => setSubjectPriority(e.target.value as ExamPriority)}>
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
                      <button type="button" onClick={() => removeSubject(s.id)} className="text-muted-foreground hover:text-destructive">×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>Cancelar</Button>
              <Button type="submit" disabled={!title || !discipline || !examDate || subjects.length === 0}>Salvar Prova</Button>
            </div>
          </form>
        </Card>
      )}

      {exams.length === 0 && !isCreating ? (
        <Card className="p-12 text-center space-y-3">
          <Calendar className="size-10 text-primary mx-auto" />
          <h3 className="font-semibold text-lg">Nenhuma prova cadastrada</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">Cadastre sua data de prova para gerar automaticamente o plano de revisão ideal até o dia do exame.</p>
          <Button onClick={() => setIsCreating(true)}><Plus className="size-4 mr-2" />Cadastrar primeira prova</Button>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Suas Provas</p>
            {exams.map((exam) => {
              const active = exam.id === selectedExam?.id;
              const dLeft = Math.ceil((new Date(exam.examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
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
                      <Calendar className="size-4" /> Data: {new Date(selectedExam.examDate).toLocaleDateString("pt-BR")} ({daysLeft < 0 ? "Prova já ocorreu" : daysLeft === 0 ? "É hoje!" : `Faltam ${daysLeft} dias`})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="destructive" size="sm" onClick={() => deleteExam(selectedExam.id)}><Trash2 className="size-4" /></Button>
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
                        <Link href={examLearningHref(linkedStudy.studyId, "exam")}><ShieldCheck className="mr-1.5 size-3.5" />Abrir Modo Prova</Link>
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
                            <Link href={examLearningHref(linkedStudy.studyId, action.id)}>Abrir</Link>
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" size="sm" className="mt-3 w-full" disabled>Indisponível</Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="p-6 space-y-4 shadow-none">
                  <h3 className="font-semibold text-base flex items-center gap-2"><CheckCircle2 className="size-5 text-primary" /> Checklist de Assuntos</h3>
                  <div className="space-y-2">
                    {selectedExam.subjects.map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between p-3 rounded-xl border bg-card/40">
                        <label className="flex items-center gap-3 cursor-pointer flex-1">
                          <input type="checkbox" checked={sub.completed} onChange={() => toggleSubject(selectedExam.id, sub.id)} className="size-4 rounded border-primary text-primary focus:ring-primary" />
                          <span className={`text-sm font-medium ${sub.completed ? "line-through text-muted-foreground" : ""}`}>{sub.name}</span>
                        </label>
                        <Badge variant={sub.priority === "high" ? "destructive" : sub.priority === "medium" ? "default" : "secondary"}>
                          {sub.priority === "high" ? "Alta" : sub.priority === "medium" ? "Média" : "Baixa"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-6 space-y-4 shadow-none">
                  <h3 className="font-semibold text-base flex items-center gap-2"><Calendar className="size-5 text-primary" /> Plano Automático de Revisão</h3>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {plan.map((item) => (
                      <div key={item.dayIndex} className="p-3 rounded-xl border bg-card/40 flex items-center justify-between text-sm">
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
                          <div key={m.id} className="flex items-center justify-between p-3 rounded-xl border bg-card/40">
                            <div className="flex items-center gap-3 flex-1">
                              <FileText className="size-4 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium truncate">{m.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {m.subject ?? m.topic ?? "Sem assunto definido"} · {m.fileType.toUpperCase()}
                                </p>
                              </div>
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeMaterialFromExam(m.id)}>
                              Remover
                            </Button>
                          </div>
                        ))}
                  </div>
                ) : null}

                <div className="space-y-2">
                  {selectedExam && (
                    <>
                      <label className="text-xs font-semibold text-muted-foreground uppercase">Vincular Estudo</label>
                      <select
                        className="rounded-md border bg-background px-3 py-2 text-sm mt-1 w-full"
                        value={selectedExam.studyId ?? ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          if (id) linkStudyToExam(id);
                        }}
                      >
                        <option value="">Selecionar estudo…</option>
                        {selectedExam.studyId && !studies.some((study) => study.studyId === selectedExam.studyId) ? (
                          <option value={selectedExam.studyId}>Estudo indisponível (vínculo preservado)</option>
                        ) : null}
                        {studies.map((s) => (
                          <option key={s.studyId} value={s.studyId}>
                            {s.title} ({s.subject})
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Adicionar Material da Biblioteca</label>
                  {!materialsLoading && !materialsError && availableMaterials.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      Nenhum material disponível para vincular. Importe ou organize materiais na Biblioteca primeiro.
                    </p>
                  ) : null}
                  {availableMaterials.length > 0 && !materialsLoading && !materialsError ? (
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {availableMaterials.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between p-3 rounded-xl border bg-card/40 hover:bg-accent/30 transition-colors cursor-pointer group"
                          onClick={() => addMaterialToExam(m.id)}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <FileText className="size-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium truncate">{m.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {m.subject ?? m.topic ?? "Sem assunto definido"} · {m.fileType.toUpperCase()}
                                {m.studyId ? " · vinculado a estudo" : ""}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-primary">Adicionar</span>
                        </div>
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
