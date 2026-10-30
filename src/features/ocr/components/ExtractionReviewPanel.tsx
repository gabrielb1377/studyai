"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Square,
  Table2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMaterials } from "@/hooks/useMaterials";
import type { ExtractedPage, ExtractedTable, OcrMode } from "@/features/extraction/ExtractionTypes";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import { ExtractionReviewService, type PageUpdate } from "../ExtractionReviewService";
import { qualityLabel } from "../quality";
import { useExtractionRecord } from "../useExtractionRecord";
import { OriginalPagePreview } from "./OriginalPagePreview";

const modeOptions = [
  { value: "auto", label: "Automático (recomendado)" },
  { value: "native", label: "Somente texto nativo" },
  { value: "force", label: "Forçar OCR" },
];

const modeLabels: Record<OcrMode, string> = {
  auto: "Automático",
  native: "Texto nativo",
  force: "OCR forçado",
};

function formatDuration(milliseconds?: number) {
  if (milliseconds === undefined) return "—";
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)} s`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1_000);
  return `${minutes} min ${seconds} s`;
}

function methodLabel(page: ExtractedPage) {
  if (page.method === "ocr") return "OCR";
  if (page.method === "native") return "Texto nativo";
  return "Sem texto";
}

function qualityTone(level: ExtractedPage["quality"]["level"]) {
  if (level === "good") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (level === "fair") return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (level === "poor") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

function TableEditor({ table, disabled, onSave }: {
  table: ExtractedTable;
  disabled: boolean;
  onSave: (rows: string[][]) => Promise<void>;
}) {
  const [rows, setRows] = useState<string[][]>(() => table.rows.map((row) => [...row]));

  useEffect(() => {
    setRows(table.rows.map((row) => [...row]));
  }, [table]);

  const columns = Math.max(table.columns, ...rows.map((row) => row.length));
  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    setRows((current) => current.map((row, index) => {
      if (index !== rowIndex) return row;
      const next = [...row];
      while (next.length <= columnIndex) next.push("");
      next[columnIndex] = value;
      return next;
    }));
  };
  const changed = JSON.stringify(rows) !== JSON.stringify(table.rows);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Tabela {table.id}</p>
        <Badge variant="outline">{table.header ? "Com cabeçalho" : "Sem cabeçalho"}</Badge>
      </div>
      {table.warnings.length > 0 ? (
        <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
          {table.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr>
              {Array.from({ length: columns }, (_, columnIndex) => (
                <th key={columnIndex} scope="col" className="border px-2 py-1 text-left text-xs font-semibold text-muted-foreground">
                  Coluna {columnIndex + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }, (_, columnIndex) => (
                  <td key={columnIndex} className="border p-0">
                    <input
                      aria-label={`Célula ${rowIndex + 1}-${columnIndex + 1} da tabela ${table.id}`}
                      value={row[columnIndex] ?? ""}
                      onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                      className="min-h-9 w-full min-w-24 bg-transparent px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!table.complete ? (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
          A tabela tem células ausentes ou colunas irregulares. Nenhum conteúdo foi inventado; preencha manualmente se necessário.
        </p>
      ) : null}
      <Button type="button" size="sm" variant="outline" disabled={disabled || !changed} onClick={() => void onSave(rows)}>
        <Save aria-hidden="true" />
        Salvar tabela
      </Button>
    </div>
  );
}

export function ExtractionReviewPanel({ materialId }: { materialId?: string }) {
  const { materials } = useMaterials();
  const material = materials.find((item) => item.id === materialId) ?? materials[0];
  const { record, isLoading, error, setRecord } = useExtractionRecord(material?.fileId);
  const pages = useMemo(() => record?.pages ?? [], [record]);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const page = pages.find((item) => item.page === selected) ?? pages[0];
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<OcrMode>("auto");
  const [overwriteCorrections, setOverwriteCorrections] = useState(false);
  const [busy, setBusy] = useState<"save" | "restore" | "prepare" | "reprocess" | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (pages.length > 0 && !pages.some((item) => item.page === selected)) {
      setSelected(pages[0].page);
    }
  }, [pages, selected]);

  useEffect(() => {
    setDraft(page?.text ?? "");
  }, [page?.page, page?.text]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ocrCount = pages.filter((item) => item.method === "ocr").length;
  const nativeCount = pages.filter((item) => item.method === "native").length;
  const editedCount = pages.filter((item) => item.edited).length;
  const pageIndex = page ? pages.findIndex((item) => item.page === page.page) : -1;

  const goTo = (offset: number) => {
    if (pageIndex < 0) return;
    const next = pages[pageIndex + offset];
    if (next) setSelected(next.page);
  };

  const persist = async (update: PageUpdate) => {
    if (!record || !page || !material) return;
    setBusy("save");
    setFailure("");
    setFeedback("");
    try {
      const result = await ExtractionReviewService.savePage(material.fileId, page.page, update);
      setRecord(result.content);
      setFeedback("Correção salva. Chunks, busca, Tutor e Knowledge Graph foram atualizados.");
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Não foi possível salvar a correção.");
    } finally {
      setBusy(null);
    }
  };

  const restorePage = async () => {
    if (!record || !page || !material) return;
    setBusy("restore");
    setFailure("");
    setFeedback("");
    try {
      const result = await ExtractionReviewService.restorePage(material.fileId, page.page);
      setRecord(result.content);
      setFeedback("Extração original restaurada para esta página.");
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Não foi possível restaurar a extração.");
    } finally {
      setBusy(null);
    }
  };

  const preparePages = async () => {
    if (!material) return;
    setBusy("prepare");
    setFailure("");
    try {
      const result = await ExtractionReviewService.preparePages(material.fileId);
      setRecord(result.content);
      setFeedback("Texto existente estruturado em páginas para revisão.");
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Não foi possível estruturar as páginas.");
    } finally {
      setBusy(null);
    }
  };

  const reprocess = async (targetPages?: number[], forcedMode?: OcrMode) => {
    if (!record || !material) return;
    setFailure("");
    setFeedback("");
    setBusy("reprocess");
    setProgress(2);
    setProgressMessage("Preparando o arquivo original…");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const file = MaterialRuntimeStore.get(material.id)?.file ?? await MaterialBinaryStorage.load(material);
      if (!file) {
        throw new Error("O arquivo original não está disponível neste dispositivo. Reimporte o material para reprocessar.");
      }
      if (controller.signal.aborted) throw new DOMException("Processamento cancelado.", "AbortError");

      const result = await ExtractionReviewService.reprocess({
        content: record,
        file,
        pages: targetPages,
        mode: forcedMode ?? mode,
        overwriteCorrections,
        signal: controller.signal,
        onProgress: (event) => {
          setProgress(Math.max(0, Math.min(100, Math.round(event.progress))));
          setProgressMessage(event.message ?? (event.page ? `Processando página ${event.page} de ${event.pages ?? "?"}.` : "Processando…"));
        },
      });
      setRecord(result.content);
      setProgress(100);
      setProgressMessage(result.result.cancelled ? "Cancelado." : "Concluído.");
      setFeedback(result.result.cancelled
        ? "Reprocessamento cancelado. As páginas concluídas foram preservadas e podem ser revisadas."
        : `Reprocessamento concluído: ${result.content.pipeline?.ocrPages ?? 0} página(s) com OCR, ${result.preservedEdits} correção(ões) preservada(s).`);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setFeedback("Reprocessamento cancelado pelo usuário.");
      } else {
        setFailure(cause instanceof Error ? cause.message : "Não foi possível reprocessar o material.");
      }
    } finally {
      abortRef.current = null;
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="flex-row items-center gap-2 p-6 text-sm text-muted-foreground shadow-none">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Carregando conteúdo extraído…
      </Card>
    );
  }

  if (error) {
    return <Card role="alert" className="p-6 text-sm text-destructive shadow-none">{error}</Card>;
  }

  if (!material) {
    return <Card className="p-6 text-sm text-muted-foreground shadow-none">Selecione um material para revisar a extração.</Card>;
  }

  if (!record) {
    return (
      <Card className="gap-3 p-6 shadow-none">
        <h2 className="flex items-center gap-2 text-base font-semibold"><FileSearch className="size-4 text-primary" aria-hidden="true" />Revisão de extração</h2>
        <p className="text-sm text-muted-foreground">
          Este material ainda não possui conteúdo extraído. Importe-o novamente para gerar texto, páginas e indexação.
        </p>
      </Card>
    );
  }

  if (!page) {
    return (
      <Card className="gap-3 p-6 shadow-none">
        <h2 className="text-base font-semibold">Revisão de extração</h2>
        <p className="text-sm text-muted-foreground">
          O material tem texto extraído, mas ainda não possui páginas estruturadas. Estruture o conteúdo para revisar página por página.
        </p>
        <Button type="button" className="w-fit" disabled={busy !== null} onClick={() => void preparePages()}>
          {busy === "prepare" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FileSearch aria-hidden="true" />}
          Estruturar páginas
        </Button>
        {failure ? <p role="alert" className="text-sm text-destructive">{failure}</p> : null}
        {feedback ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{feedback}</p> : null}
      </Card>
    );
  }

  const pipeline = record.pipeline;
  const warnings = pipeline?.warnings ?? [];
  const pendingPages = pages.filter((item) => item.status !== "ready" || item.needsOcr).map((item) => item.page);
  const draftDirty = draft !== page.text;

  return (
    <div className="space-y-4">
      <Card className="gap-4 p-5 shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <ScanLine className="size-4 text-primary" aria-hidden="true" />
              Revisão de extração
            </h2>
            <p className="truncate text-xs text-muted-foreground">{material.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{pipeline?.version ?? "pipeline anterior"}</Badge>
            <Badge variant="outline">{modeLabels[pipeline?.mode ?? record.metadata.extractionMode ?? "auto"]}</Badge>
          </div>
        </div>

        <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Páginas</dt>
            <dd className="font-medium">{pages.length} · OCR {ocrCount} · nativo {nativeCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Revisadas</dt>
            <dd className="font-medium">{editedCount} de {pages.length}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Qualidade</dt>
            <dd className="font-medium">{qualityLabel(record.metadata.quality ?? page.quality.level)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tempo de extração</dt>
            <dd className="font-medium">{formatDuration(pipeline?.durationMs ?? record.metadata.processingTimeMs)}</dd>
          </div>
        </dl>

        {record.metadata.ocrConfidence !== undefined ? (
          <p className="text-xs text-muted-foreground">
            Confiança média informada pelo motor de OCR: {Math.round(record.metadata.ocrConfidence)}%.
          </p>
        ) : null}

        {warnings.length > 0 ? (
          <ul role="status" className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
            {warnings.map((warning) => <li key={warning} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{warning}</li>)}
          </ul>
        ) : null}
      </Card>

      <Card className="gap-3 p-4 shadow-none">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="w-full sm:max-w-xs">
            <label htmlFor="ocr-mode" className="text-xs font-medium text-muted-foreground">Modo de reprocessamento</label>
            <Select
              id="ocr-mode"
              value={mode}
              onValueChange={(value) => setMode(value as OcrMode)}
              options={modeOptions}
              disabled={busy !== null}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void reprocess(pendingPages)} disabled={busy !== null || pendingPages.length === 0}>
              <RefreshCw aria-hidden="true" />
              Reprocessar pendentes
            </Button>
            <Button type="button" variant="outline" onClick={() => void reprocess([page.page], "force")} disabled={busy !== null}>
              <ScanLine aria-hidden="true" />
              OCR forçado nesta página
            </Button>
            {busy === "reprocess" ? (
              <Button type="button" variant="destructive" onClick={() => abortRef.current?.abort()}>
                <Square aria-hidden="true" />
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={overwriteCorrections}
            onChange={(event) => setOverwriteCorrections(event.target.checked)}
            className="mt-0.5 size-4 rounded border-input"
          />
          Substituir correções manuais ao reprocessar. Sem esta opção, páginas corrigidas por você são preservadas.
        </label>

        {busy === "reprocess" ? (
          <div role="status" className="space-y-1">
            <Progress value={progress} aria-label="Progresso do reprocessamento" />
            <p className="text-xs text-muted-foreground">{progress}% · {progressMessage}</p>
          </div>
        ) : null}
        {failure ? <p role="alert" className="text-sm text-destructive">{failure}</p> : null}
        {feedback ? (
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {feedback}
          </p>
        ) : null}
      </Card>

      <Card className="gap-3 p-4 shadow-none">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => goTo(-1)} disabled={pageIndex <= 0}>
            Anterior
          </Button>
          <div className="min-w-40 flex-1 sm:max-w-xs">
            <Select
              aria-label="Selecionar página"
              value={String(page.page)}
              onValueChange={(value) => setSelected(Number(value))}
              options={pages.map((item) => ({
                value: String(item.page),
                label: `Página ${item.page} · ${methodLabel(item)}${item.edited ? " · corrigida" : ""}`,
              }))}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => goTo(1)} disabled={pageIndex >= pages.length - 1}>
            Próxima
          </Button>
          <Badge variant="outline">{methodLabel(page)}</Badge>
          <Badge className={qualityTone(page.quality.level)}>{qualityLabel(page.quality.level)}</Badge>
          {page.edited ? <Badge variant="outline">Corrigida</Badge> : null}
          {page.status === "error" ? <Badge variant="destructive">Erro</Badge> : null}
          {page.needsOcr && page.method !== "ocr" ? <Badge variant="destructive">OCR pendente</Badge> : null}
        </div>

        {page.confidence !== undefined ? (
          <p className="text-xs text-muted-foreground">Confiança informada pelo motor nesta página: {Math.round(page.confidence)}%</p>
        ) : null}
        {page.quality.issues.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {page.quality.issues.map((issue) => <li key={issue}>• {issue}</li>)}
          </ul>
        ) : null}
        {page.warnings.length > 0 ? (
          <ul role="status" className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
            {page.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
          </ul>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <section aria-label={`Página original ${page.page}`} className="space-y-2">
            <h3 className="text-sm font-semibold">Página original</h3>
            <OriginalPagePreview material={material} page={page.page} />
          </section>
          <section aria-label={`Texto extraído da página ${page.page}`} className="space-y-2">
            <h3 className="text-sm font-semibold">Texto extraído</h3>
            <Textarea
              aria-label={`Texto extraído da página ${page.page}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={14}
              className="min-h-64 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void persist({ text: draft })} disabled={busy !== null || !draftDirty}>
                <Save aria-hidden="true" />
                Salvar correção
              </Button>
              <Button type="button" variant="outline" onClick={() => void restorePage()} disabled={busy !== null || !page.edited}>
                <RotateCcw aria-hidden="true" />
                Restaurar extração original
              </Button>
              <Button type="button" variant="outline" onClick={() => void reprocess([page.page], mode)} disabled={busy !== null}>
                <RefreshCw aria-hidden="true" />
                Reprocessar esta página
              </Button>
            </div>
            <details className="rounded-lg border bg-muted/30 p-3">
              <summary className="cursor-pointer text-xs font-medium">Ver extração original da máquina</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{page.originalText || "Sem texto extraído."}</pre>
            </details>
          </section>
        </div>
      </Card>

      {page.tables.length > 0 ? (
        <Card className="gap-3 p-4 shadow-none">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Table2 className="size-4 text-primary" aria-hidden="true" />
            Tabelas detectadas ({page.tables.length})
          </h3>
          {draftDirty ? <p className="text-xs text-amber-700 dark:text-amber-300">Salve o texto antes de editar as tabelas para evitar conflitos.</p> : null}
          <div className="space-y-3">
            {page.tables.map((table) => (
              <TableEditor
                key={table.id}
                table={table}
                disabled={busy !== null || draftDirty}
                onSave={(rows) => persist({ tableRows: [{ tableId: table.id, rows }] })}
              />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
