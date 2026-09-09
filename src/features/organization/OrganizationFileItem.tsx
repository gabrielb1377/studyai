"use client";

import { FileText, Film, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrganizationFile } from "@/types/organization";

const fileIcons = {
  pdf: FileText,
  video: Film,
  document: FileText,
};

export function OrganizationFileItem({
  file,
  onRename,
  onMove,
  onDelete,
}: {
  file: OrganizationFile;
  onRename: (file: OrganizationFile) => void;
  onMove: (file: OrganizationFile) => void;
  onDelete: (file: OrganizationFile) => void;
}) {
  const Icon = fileIcons[file.type];

  return (
    <li className="group flex min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-3 transition-colors hover:border-primary/30 sm:px-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
            {file.typeLabel}
          </Badge>
          <span>{file.size}</span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Ações para ${file.name}`}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onRename(file)}>
            <Pencil aria-hidden="true" />
            Renomear
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onMove(file)}>
            <FileText aria-hidden="true" />
            Mover
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(file)}>
            <Trash2 aria-hidden="true" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
