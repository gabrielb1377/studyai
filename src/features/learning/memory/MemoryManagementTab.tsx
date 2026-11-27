"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BrainCircuit,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StudyRecord } from "@/types/study-engine";
import { isMemoryStale } from "./MemoryValidation";
import type {
  ExplanationLevel,
  LongTermMemoryEntry,
  LongTermMemorySettings,
  MemoryCategory,
} from "./types";

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: "Preferência",
  goal: "Objetivo",
  difficulty: "Dificuldade",
  continuity: "Continuidade",
  milestone: "Marco",
};

export type ExplicitMemoryDraft = {
  category: MemoryCategory;
  studyId?: string;
  title: string;
  content: string;
};

export function MemoryManagementTab({
  studies,
  settings,
  memories,
  isSaving,
  onToggleEnabled,
  onToggleAdaptivePersonalization,
  onChangeLevel,
  onAddMemory,
  onUpdateMemory,
  onRemoveMemory,
  onClearAll,
}: {
  studies: readonly StudyRecord[];
  settings: LongTermMemorySettings;
  memories: readonly LongTermMemoryEntry[];
  isSaving: boolean;
  onToggleEnabled: (enabled: boolean) => Promise<void>;
  onToggleAdaptivePersonalization?: (enabled: boolean) => Promise<void>;
  onChangeLevel: (level: ExplanationLevel | undefined) => Promise<void>;
  onAddMemory: (draft: ExplicitMemoryDraft) => Promise<void>;
  onUpdateMemory: (id: string, patch: { title?: string; content?: string }) => Promise<void>;
  onRemoveMemory: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
}) {
  const adaptiveEnabled = settings.adaptivePersonalizationEnabled !== false;
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<MemoryCategory>("preference");
  const [studyId, setStudyId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !content.trim()) {
      setFormError("Informe um título e o conteúdo da memória para salvar.");
      return;
    }
    setFormError(null);
    await onAddMemory({
      category,
      studyId: studyId || undefined,
      title,
      content,
    });
    setTitle("");
    setContent("");
    setShowForm(false);
  };

  return (
    <section aria-label="Memória de longo prazo" className="space-y-4">
      <Card className="gap-4 p-4 shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Controle da memória de aprendizagem</h2>
            <p className="text-xs text-muted-foreground">
              Memória local deste navegador (isolada por conta; não sincroniza entre dispositivos). O Tutor consulta somente registros ativos e relevantes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              variant={settings.enabled ? "default" : "outline"}
              size="sm"
              disabled={isSaving}
              onClick={() => void onToggleEnabled(!settings.enabled)}
            >
              {settings.enabled ? "Memória ativa no Tutor" : "Memória desativada"}
            </Button>
            {onToggleAdaptivePersonalization ? (
              <Button
                type="button"
                aria-pressed={adaptiveEnabled}
                variant={adaptiveEnabled ? "secondary" : "outline"}
                size="sm"
                disabled={isSaving}
                onClick={() => void onToggleAdaptivePersonalization(!adaptiveEnabled)}
              >
                {adaptiveEnabled
                  ? "Personalização adaptativa ativa"
                  : "Personalização adaptativa desativada"}
              </Button>
            ) : null}
          </div>
        </div>
        {onToggleAdaptivePersonalization ? (
          <p className="text-xs text-muted-foreground">
            {adaptiveEnabled
              ? "A seleção adaptativa sugere skill, nível e método explicáveis usando apenas sinais autorizados desta conta."
              : "Personalização adaptativa desativada nesta conta: sua seleção manual e o comportamento padrão são preservados."}
          </p>
        ) : null}

        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 sm:items-end">
          <label className="grid gap-1.5 text-xs font-medium">
            Nível de explicação preferido no Tutor
            <select
              aria-label="Nível de explicação preferido"
              className="h-9 rounded-md border bg-background px-3 text-sm font-normal"
              value={settings.explanationLevel ?? ""}
              disabled={isSaving}
              onChange={(event) => {
                const value = event.target.value;
                void onChangeLevel(value ? (value as ExplanationLevel) : undefined);
              }}
            >
              <option value="">Automático (adaptar pelo progresso)</option>
              <option value="basic">Básico (passo a passo simples)</option>
              <option value="intermediate">Intermediário</option>
              <option value="advanced">Avançado</option>
              <option value="technical">Técnico</option>
            </select>
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForm((current) => !current)}
            >
              <Plus className="size-4" />
              Registrar memória
            </Button>
            {memories.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSaving}
                onClick={() => void onClearAll()}
              >
                Limpar memórias
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {showForm ? (
        <Card className="gap-3 p-4 shadow-none">
          <h3 className="text-sm font-semibold">Nova memória explícita</h3>
          <form onSubmit={handleSubmit} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium">
                Categoria
                <select
                  aria-label="Categoria da memória"
                  className="h-9 rounded-md border bg-background px-3 text-sm font-normal"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as MemoryCategory)}
                >
                  <option value="preference">Preferência de aprendizagem</option>
                  <option value="goal">Objetivo de estudo</option>
                  <option value="difficulty">Dificuldade recorrente</option>
                  <option value="milestone">Marco / assunto já dominado</option>
                </select>
              </label>

              <label className="grid gap-1.5 text-xs font-medium">
                Estudo relacionado (opcional)
                <select
                  aria-label="Estudo da memória"
                  className="h-9 rounded-md border bg-background px-3 text-sm font-normal"
                  value={studyId}
                  onChange={(event) => setStudyId(event.target.value)}
                >
                  <option value="">Geral (todas as matérias)</option>
                  {studies.map((study) => (
                    <option key={study.studyId} value={study.studyId}>
                      {study.title} ({study.subject})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid gap-1.5 text-xs font-medium">
              Título curto *
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Preferência por exemplos práticos"
                maxLength={100}
              />
            </label>

            <label className="grid gap-1.5 text-xs font-medium">
              O que lembrar entre sessões *
              <textarea
                className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm font-normal"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Ex.: Sempre mostrar um exemplo numérico antes da definição formal."
                maxLength={280}
              />
            </label>

            {formError ? (
              <p role="alert" className="text-xs text-destructive">
                {formError}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={isSaving}>
                Salvar memória
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setFormError(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {memories.length === 0 ? (
        <Card className="items-center gap-2 p-8 text-center shadow-none">
          <BrainCircuit className="size-8 text-muted-foreground" />
          <h3 className="text-base font-semibold">Nenhuma memória registrada</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Registre preferências, objetivos ou dificuldades importantes, ou converse com o Tutor para criar continuidade automática entre sessões.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {memories.map((entry) => {
            const isEditing = editingId === entry.id;
            const stale = isMemoryStale(entry);
            return (
              <Card key={entry.id} className="gap-3 p-4 shadow-none">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={entry.source === "explicit" ? "default" : "secondary"}>
                    {entry.source === "explicit" ? "Explícita" : "Sessão anterior"}
                  </Badge>
                  <Badge variant="outline">{CATEGORY_LABELS[entry.category]}</Badge>
                  {entry.studyTitle ? (
                    <Badge variant="outline">
                      {entry.studyTitle}
                      {entry.subject ? ` · ${entry.subject}` : ""}
                    </Badge>
                  ) : null}
                  {entry.sourceUnavailable ? (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                      Estudo indisponível
                    </Badge>
                  ) : null}
                  {stale ? (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                      Antiga · revisar
                    </Badge>
                  ) : null}
                </div>

                {isEditing ? (
                  <div className="grid gap-2">
                    <Input
                      aria-label="Editar título da memória"
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      maxLength={100}
                    />
                    <textarea
                      aria-label="Editar conteúdo da memória"
                      className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm"
                      value={editContent}
                      onChange={(event) => setEditContent(event.target.value)}
                      maxLength={280}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isSaving}
                        onClick={() => {
                          void onUpdateMemory(entry.id, {
                            title: editTitle,
                            content: editContent,
                          }).then(() => setEditingId(null));
                        }}
                      >
                        Salvar edição
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold">{entry.title}</h3>
                      <p className="text-sm text-muted-foreground">{entry.content}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.studyId && !entry.sourceUnavailable ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/estudo?tema=${encodeURIComponent(entry.studyId)}&aba=tutor`}>
                            Continuar no Tutor
                          </Link>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar memória ${entry.title}`}
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditTitle(entry.title);
                          setEditContent(entry.content);
                        }}
                      >
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remover memória ${entry.title}`}
                        disabled={isSaving}
                        onClick={() => void onRemoveMemory(entry.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Excluir
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
