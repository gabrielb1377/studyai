"use client";

import { FileText, Film, Headphones, ImageIcon, MoreHorizontal, Pencil, Presentation, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatFileSize } from "@/features/import/import-utils";
import type { Material } from "@/types/material";

const fileIcons = {
  pdf: FileText,
  docx: FileText,
  pptx: Presentation,
  txt: FileText,
  mp4: Film,
  mp3: Headphones,
  wav: Headphones,
  m4a: Headphones,
  png: ImageIcon,
  jpg: ImageIcon,
  jpeg: ImageIcon,
  webp: ImageIcon,
};

export function OrganizationFileItem({
  file,
  onRename,
  onMove,
  onDelete,
  selected = false,
  onSelectedChange,
}: {
  file: Material;
  onRename: (file: Material) => void;
  onMove: (file: Material) => void;
  onDelete: (file: Material) => void;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}) {
  const Icon = fileIcons[file.fileType];

  return (
    <li draggable onDragStart={(event) => { event.dataTransfer.setData("text/material-id", file.id); event.dataTransfer.setData("text/plain", file.id); event.dataTransfer.effectAllowed = "move"; }} className="group flex min-w-0 cursor-grab items-center gap-3 rounded-lg border bg-card px-3 py-3 transition-colors hover:border-primary/30 active:cursor-grabbing sm:px-4">
      <input type="checkbox" checked={selected} onChange={(event) => onSelectedChange?.(event.target.checked)} aria-label={`Selecionar ${file.name}`} className="size-4 accent-primary" />
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
            {file.fileType.toUpperCase()}
          </Badge>
          <span>{formatFileSize(file.size)}</span>
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
