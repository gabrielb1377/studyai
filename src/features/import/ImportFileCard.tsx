import { CheckCircle2, CircleDot, LoaderCircle, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ImportFile } from "@/types/import";
import {
  fileTypeDetails,
  formatFileSize,
  importStatusDetails,
  getFileRelativePath,
} from "./import-utils";

const statusIcons = {
  uploaded: CircleDot,
  processing: LoaderCircle,
  complete: CheckCircle2,
  error: TriangleAlert,
} as const;

export function ImportFileCard({
  item,
  disabled,
  onRemove,
}: {
  item: ImportFile;
  disabled: boolean;
  onRemove: () => void;
}) {
  const type = fileTypeDetails[item.extension as keyof typeof fileTypeDetails];
  const TypeIcon = type.icon;
  const status = importStatusDetails[item.status];
  const StatusIcon = statusIcons[item.status];
  const relativePath = getFileRelativePath(item.file);

  return (
    <Card role="listitem" className="gap-4 p-4 shadow-none sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <TypeIcon className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium leading-5">
            {item.file.name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-normal">
              {type.label}
            </Badge>
            <span>{formatFileSize(item.file.size)}</span>
          </div>
          {relativePath !== item.file.name && (
            <p className="mt-1 break-all text-xs text-muted-foreground">{relativePath}</p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
          disabled={disabled}
          aria-label={`Remover ${item.file.name}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <StatusIcon
          className={`size-4 ${status.className} ${item.status === "processing" ? "motion-safe:animate-spin" : ""}`}
          aria-hidden="true"
        />
        <span className={status.className}>{status.label}</span>
        <span className="ml-auto tabular-nums text-muted-foreground">
          {item.progress}%
        </span>
      </div>
      <Progress
        value={item.progress}
        aria-label={`Progresso de ${item.file.name}`}
      />
      {item.message && item.status === "processing" ? (
        <p className="text-xs text-muted-foreground">{item.message}</p>
      ) : null}
      {item.errorDetails ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <p className="font-medium">{item.errorDetails.reason}</p>
          <p className="mt-1 opacity-80">Etapa: {item.errorDetails.stage}</p>
          <p className="mt-1 opacity-80">{item.errorDetails.suggestedAction}</p>
          {item.errorDetails.simplifiedStack && (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium">Detalhes técnicos</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[10px] opacity-75">{item.errorDetails.simplifiedStack}</pre>
            </details>
          )}
        </div>
      ) : null}
    </Card>
  );
}
