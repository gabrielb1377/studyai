import {
  ingestionStageIds,
  type ExtractionErrorDetails,
  type IngestionLog,
  type IngestionStage,
  type IngestionStageId,
  type IngestionStageStatus,
} from "./ExtractionTypes";

const labels: Record<IngestionStageId, string> = {
  document: "Documento carregado",
  extraction: "Conteúdo extraído",
  ocr: "OCR",
  normalization: "Texto normalizado",
  analysis: "Documento analisado",
  chunks: "Chunks gerados",
  embeddings: "Embeddings gerados",
  indexed: "Conteúdo indexado",
};

export function createIngestionStages(): IngestionStage[] {
  return ingestionStageIds.map((id) => ({ id, status: "pending" }));
}

export function updateIngestionStage(
  stages: readonly IngestionStage[],
  id: IngestionStageId,
  status: IngestionStageStatus,
  message?: string,
  now = new Date().toISOString(),
) {
  return stages.map((stage) => stage.id === id
    ? {
        ...stage,
        status,
        message,
        startedAt: stage.startedAt ?? (status === "processing" ? now : undefined),
        completedAt: status === "completed" || status === "skipped" || status === "error" ? now : undefined,
      }
    : stage,
  );
}

export function createIngestionLog(
  stage: IngestionStageId,
  status: Exclude<IngestionStageStatus, "pending">,
  message = labels[stage],
): IngestionLog {
  return {
    id: crypto.randomUUID(),
    stage,
    status,
    message,
    createdAt: new Date().toISOString(),
  };
}

export function createExtractionError(
  error: unknown,
  fileName: string,
  stage: IngestionStageId,
): ExtractionErrorDetails {
  const reason = error instanceof Error ? error.message : typeof error === "string" ? error : "Erro inesperado.";
  const stackLine = error instanceof Error
    ? error.stack?.split("\n").slice(0, 2).join("\n")
    : undefined;
  const suggestedActions: Partial<Record<IngestionStageId, string>> = {
    document: "Verifique se o arquivo existe, não está vazio e pode ser lido pelo navegador.",
    extraction: "Confirme se o formato é válido e tente exportar o arquivo novamente.",
    ocr: "Tente uma imagem mais nítida ou um PDF com resolução maior.",
    normalization: "Verifique o encoding e os caracteres do documento.",
    analysis: "Tente novamente após confirmar que o texto foi extraído.",
    chunks: "Reduza o tamanho do documento e execute a importação novamente.",
    embeddings: "Libere armazenamento local ou remova materiais antigos antes de reindexar.",
    indexed: "Reprocesse o documento para reconstruir o índice local.",
  };

  return {
    reason,
    fileName,
    stage,
    simplifiedStack: stackLine,
    suggestedAction: suggestedActions[stage] ?? "Tente importar o arquivo novamente.",
  };
}
