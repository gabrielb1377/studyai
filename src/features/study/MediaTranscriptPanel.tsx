"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Save, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MediaTranscriptService } from "@/features/extraction/MediaTranscriptService";
import { formatMediaDuration, MEDIA_LIMITS } from "@/features/extraction/media-validation";
import type { StudyMaterial } from "@/types/study";

const sourceLabels: Record<NonNullable<StudyMaterial["transcriptionSource"]>, string> = {
  automatic: "Transcrição automática local",
  manual: "Transcrição manual",
  subtitle: "Legenda importada",
};

type LocalTranscriptOverride = {
  text: string;
  source?: StudyMaterial["transcriptionSource"];
  segments?: StudyMaterial["transcriptionSegments"];
};

export function MediaTranscriptPanel({
  material,
  studyId,
}: {
  material: StudyMaterial;
  studyId: string;
}) {
  const [localOverride, setLocalOverride] = useState<LocalTranscriptOverride | null>(null);
  const activeText = localOverride?.text ?? material.textContent ?? "";
  const activeSource = localOverride?.source ?? material.transcriptionSource;
  const activeSegments = localOverride?.segments ?? material.transcriptionSegments;

  const [draft, setDraft] = useState(activeText);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalOverride(null);
    setDraft(material.textContent ?? "");
    setIsEditing(false);
    setFeedback(null);
    setError(null);
  }, [material.id, material.textContent]);

  const hasTranscript = Boolean(activeText.trim());
  const statusLabel = activeSource
    ? sourceLabels[activeSource]
    : hasTranscript
      ? "Transcrição disponível"
      : "Sem transcrição (apenas metadados)";

  const saveText = async (rawText: string) => {
    setIsSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = await MediaTranscriptService.saveManualOrSubtitle({
        fileId: material.id,
        studyId,
        rawText,
        duration: material.duration,
      });
      setLocalOverride({
        text: saved.extractedText,
        source: saved.metadata.transcriptionSource,
        segments: saved.transcription?.segments,
      });
      setDraft(saved.extractedText);
      setIsEditing(false);
      setFeedback("Transcrição salva e indexada para consulta no Tutor IA.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a transcrição.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubtitleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size <= 0 || file.size > MEDIA_LIMITS.maxSubtitleFileBytes) {
      setError("O arquivo de legenda deve ter entre 1 byte e 5 MB.");
      return;
    }
    const text = await file.text();
    await saveText(text);
  };

  return (
    <section aria-label="Transcrição e legendas" className="mt-4 rounded-xl border bg-background/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="size-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Transcrição e legendas</h3>
          <Badge variant={hasTranscript ? "secondary" : "outline"}>{statusLabel}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={subtitleInputRef}
            type="file"
            accept=".srt,.vtt,.txt,text/plain,text/vtt"
            className="sr-only"
            aria-label="Importar arquivo de legenda"
            onChange={(event) => {
              void handleSubtitleFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={() => subtitleInputRef.current?.click()}
          >
            <Upload className="size-3.5" aria-hidden="true" />
            Importar legenda (.srt/.vtt)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={() => setIsEditing((current) => !current)}
          >
            {isEditing ? "Cancelar edição" : hasTranscript ? "Editar transcrição" : "Adicionar transcrição manual"}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {feedback && (
        <p role="status" className="mt-3 rounded-lg border bg-secondary/50 px-3 py-2 text-xs text-foreground">
          {feedback}
        </p>
      )}

      {isEditing ? (
        <div className="mt-3 space-y-2">
          <label htmlFor={`transcript-editor-${material.id}`} className="block text-xs font-medium text-muted-foreground">
            Cole a transcrição manual ou conteúdo de legenda (.srt/.vtt)
          </label>
          <textarea
            id={`transcript-editor-${material.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={5}
            maxLength={MEDIA_LIMITS.maxManualTranscriptChars}
            placeholder="Digite ou cole aqui a transcrição desta mídia..."
            className="w-full rounded-lg border bg-background p-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={isSaving || !draft.trim()} onClick={() => { void saveText(draft); }}>
              <Save className="size-3.5" aria-hidden="true" />
              {isSaving ? "Salvando..." : "Salvar transcrição"}
            </Button>
          </div>
        </div>
      ) : hasTranscript ? (
        activeSegments && activeSegments.length > 0 ? (
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border bg-secondary/20 p-3 text-sm">
            {activeSegments.map((segment, index) => (
              <li key={`${segment.start}-${index}`} className="flex gap-2 leading-6">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  [{formatMediaDuration(segment.start) || "00:00"}]
                </span>
                <span>{segment.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border bg-secondary/20 p-3 text-sm leading-6">
            {activeText}
          </pre>
        )
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Esta mídia está pronta para reprodução sem transcrição. Adicione uma transcrição manual ou importe uma legenda para pesquisar trechos e usá-los como referência no Tutor IA.
        </p>
      )}
    </section>
  );
}
