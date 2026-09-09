import { CheckCircle2, CircleDot, LoaderCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ImportFile } from "@/types/import";
import {
  fileTypeDetails,
  formatFileSize,
  importStatusDetails,
} from "./import-utils";

const statusIcons = {
  uploaded: CircleDot,
  processing: LoaderCircle,
  complete: CheckCircle2,
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
    </Card>
  );
}
