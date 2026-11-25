import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StudyRecord } from "@/types/study-engine";

export function ManualErrorForm({
  studies,
  initialStudyId = "",
  isSaving,
  onSubmit,
  onCancel,
}: {
  studies: StudyRecord[];
  initialStudyId?: string;
  isSaving: boolean;
  onSubmit: (entry: {
    studyId?: string;
    topic: string;
    questionPrompt: string;
    wrongAnswer: string;
    correctAnswer: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [manualStudyId, setManualStudyId] = useState(initialStudyId);
  const [manualTopic, setManualTopic] = useState("");
  const [manualPrompt, setManualPrompt] = useState("");
  const [manualWrong, setManualWrong] = useState("");
  const [manualCorrect, setManualCorrect] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualPrompt.trim() || !manualWrong.trim()) {
      setFormError("Informe o enunciado/conceito e o erro observado para salvar.");
      return;
    }
    setFormError(null);
    await onSubmit({
      studyId: manualStudyId || undefined,
      topic: manualTopic,
      questionPrompt: manualPrompt,
      wrongAnswer: manualWrong,
      correctAnswer: manualCorrect,
    });
    setManualTopic("");
    setManualPrompt("");
    setManualWrong("");
    setManualCorrect("");
  };

  return (
    <Card className="gap-4 p-4 shadow-none">
      <div>
        <h2 className="text-base font-semibold">Novo registro no Caderno de Erros</h2>
        <p className="text-xs text-muted-foreground">
          Anote erros de exercícios externos, provas impressas ou dúvidas pontuais para revisar depois.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium">
            Estudo relacionado
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm font-normal"
              value={manualStudyId}
              onChange={(event) => setManualStudyId(event.target.value)}
            >
              <option value="">Sem estudo vinculado</option>
              {studies.map((study) => (
                <option key={study.studyId} value={study.studyId}>
                  {study.title} ({study.subject})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            Tópico / assunto
            <Input
              value={manualTopic}
              onChange={(event) => setManualTopic(event.target.value)}
              placeholder="Ex.: Integrais por partes"
              maxLength={120}
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-xs font-medium">
          Questão ou conceito que gerou erro *
          <textarea
            className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm font-normal"
            value={manualPrompt}
            onChange={(event) => setManualPrompt(event.target.value)}
            placeholder="Descreva a pergunta, fórmula ou conceito..."
            maxLength={400}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium">
            Erro cometido / dúvida *
            <Input
              value={manualWrong}
              onChange={(event) => setManualWrong(event.target.value)}
              placeholder="Ex.: Troquei o sinal na substituição"
              maxLength={240}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            Resposta correta (opcional)
            <Input
              value={manualCorrect}
              onChange={(event) => setManualCorrect(event.target.value)}
              placeholder="Ex.: u·v - ∫ v du"
              maxLength={240}
            />
          </label>
        </div>

        {formError ? (
          <p role="alert" className="text-xs text-destructive">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={isSaving}>
            Salvar no Caderno de Erros
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFormError(null);
              onCancel();
            }}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
