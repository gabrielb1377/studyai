"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ExamPriority, ExamSubject } from "@/types/exam";
import type { Material } from "@/types/material";

export function ExamFormCard({
  isEditing,
  title,
  discipline,
  examDate,
  examTime,
  selectedDisciplineKey,
  dailyMinutes,
  subjectInput,
  subjectPriority,
  subjects,
  disciplines,
  onTitleChange,
  onDisciplineChange,
  onSelectedDisciplineKeyChange,
  onExamDateChange,
  onExamTimeChange,
  onDailyMinutesChange,
  onSubjectInputChange,
  onSubjectPriorityChange,
  onAddSubject,
  onRemoveSubject,
  onSaveExam,
  onCancel,
}: {
  isEditing: boolean;
  title: string;
  discipline: string;
  examDate: string;
  examTime: string;
  selectedDisciplineKey: string;
  dailyMinutes: number;
  subjectInput: string;
  subjectPriority: ExamPriority;
  subjects: readonly ExamSubject[];
  disciplines: ReadonlyMap<string, Material>;
  onTitleChange: (v: string) => void;
  onDisciplineChange: (v: string) => void;
  onSelectedDisciplineKeyChange: (v: string) => void;
  onExamDateChange: (v: string) => void;
  onExamTimeChange: (v: string) => void;
  onDailyMinutesChange: (v: number) => void;
  onSubjectInputChange: (v: string) => void;
  onSubjectPriorityChange: (v: ExamPriority) => void;
  onAddSubject: () => void;
  onRemoveSubject: (id: string) => void;
  onSaveExam: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <Card className="p-6 border-primary/30 bg-card shadow-sm space-y-4">
      <h2 className="font-semibold text-lg">
        {isEditing ? "Editar Prova ou Avaliação" : "Configurar Nova Prova ou Avaliação"}
      </h2>
      <form onSubmit={onSaveExam} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="exam-discipline" className="text-xs font-semibold text-muted-foreground uppercase">
              Disciplina / Matéria
            </label>
            <Input
              id="exam-discipline"
              autoFocus
              placeholder="Ex: Cálculo II, Direito Constitucional"
              value={discipline}
              onChange={(e) => {
                onDisciplineChange(e.target.value);
                onSelectedDisciplineKeyChange("");
              }}
              required
              className="mt-1"
            />
            <label className="mt-2 grid gap-1 text-sm">
              Disciplina da Biblioteca
              <select
                className="w-full min-w-0 rounded border bg-background p-2"
                value={selectedDisciplineKey}
                onChange={(event) => {
                  const key = event.target.value;
                  onSelectedDisciplineKeyChange(key);
                  const material = disciplines.get(key);
                  if (material?.subject) onDisciplineChange(material.subject);
                }}
              >
                <option value="">Sem vínculo com a Biblioteca</option>
                {selectedDisciplineKey && !disciplines.has(selectedDisciplineKey) && (
                  <option value={selectedDisciplineKey}>Disciplina indisponível</option>
                )}
                {[...disciplines].map(([key, material]) => (
                  <option key={key} value={key}>
                    {[material.subject, material.course, material.semester].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label htmlFor="exam-title" className="text-xs font-semibold text-muted-foreground uppercase">
              Nome da Prova
            </label>
            <Input
              id="exam-title"
              placeholder="Ex: P2, Exame Final, Teste 1"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="exam-date" className="text-xs font-semibold text-muted-foreground uppercase">
              Data da Prova
            </label>
            <Input
              id="exam-date"
              type="date"
              value={examDate}
              onChange={(e) => onExamDateChange(e.target.value)}
              required
              className="mt-1"
            />
            <label className="mt-2 grid gap-1 text-sm">
              Horário da prova (opcional)
              <Input
                type="time"
                value={examTime}
                onChange={(event) => onExamTimeChange(event.target.value)}
              />
            </label>
          </div>
          <div>
            <label htmlFor="exam-daily-minutes" className="text-xs font-semibold text-muted-foreground uppercase">
              Meta Diária (minutos)
            </label>
            <Input
              id="exam-daily-minutes"
              type="number"
              min={15}
              max={360}
              value={dailyMinutes}
              onChange={(e) => onDailyMinutesChange(Number(e.target.value))}
              required
              className="mt-1"
            />
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <label htmlFor="exam-subject" className="text-xs font-semibold text-muted-foreground uppercase">
            Assuntos / Conteúdos da Prova
          </label>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Input
              id="exam-subject"
              placeholder="Nome do assunto (ex: Derivadas parciais)"
              value={subjectInput}
              onChange={(e) => onSubjectInputChange(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddSubject();
                }
              }}
            />
            <label htmlFor="exam-subject-priority" className="sr-only">Prioridade do assunto</label>
            <select
              id="exam-subject-priority"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={subjectPriority}
              onChange={(e) => onSubjectPriorityChange(e.target.value as ExamPriority)}
            >
              <option value="high">Alta Prioridade</option>
              <option value="medium">Média Prioridade</option>
              <option value="low">Baixa Prioridade</option>
            </select>
            <Button type="button" variant="secondary" onClick={onAddSubject}>Adicionar</Button>
          </div>
          {subjects.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {subjects.map((s) => (
                <Badge key={s.id} variant="outline" className="gap-2 py-1.5 px-3">
                  <span>{s.name} ({s.priority})</span>
                  <button
                    type="button"
                    aria-label={`Remover assunto ${s.name}`}
                    onClick={() => onRemoveSubject(s.id)}
                    className="rounded text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button
            type="submit"
            disabled={!title.trim() || !discipline.trim() || !examDate || subjects.length === 0}
          >
            {isEditing ? "Salvar alterações" : "Salvar Prova"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
