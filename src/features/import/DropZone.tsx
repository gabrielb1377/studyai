"use client";

import { useRef, useState } from "react";
import { FilePlus2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { acceptedFileTypes, supportedExtensions } from "./import-utils";

export function DropZone({
  disabled,
  onFiles,
}: {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function selectFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    onFiles(Array.from(fileList));
  }

  return (
    <section>
      <div
        role="region"
        aria-labelledby="dropzone-title"
        className={cn(
          "flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card px-5 py-10 text-center transition-[background-color,border-color,transform] sm:min-h-72 sm:px-10",
          dragging && "scale-[1.005] border-primary bg-accent/50",
          disabled && "opacity-70",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) selectFiles(event.dataTransfer.files);
        }}
      >
        <span className="mb-5 flex size-14 items-center justify-center rounded-2xl border bg-secondary text-primary">
          <UploadCloud
            className="size-6"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </span>
        <h2
          id="dropzone-title"
          className="text-lg font-semibold tracking-tight"
        >
          Arraste seus materiais para cá
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Os arquivos ficam somente neste navegador durante a simulação.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptedFileTypes}
          disabled={disabled}
          className="sr-only"
          aria-label="Selecionar arquivos do dispositivo"
          onChange={(event) => {
            selectFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="mt-6 h-11"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <FilePlus2 className="size-4" aria-hidden="true" />
          Selecionar arquivos
        </Button>
        <p className="mt-5 text-xs text-muted-foreground">
          Formatos aceitos:{" "}
          {supportedExtensions.map((item) => item.toUpperCase()).join(", ")}
        </p>
      </div>
    </section>
  );
}
