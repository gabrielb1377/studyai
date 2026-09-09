"use client";

import { useState } from "react";
import { FileText, Headphones, Play, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudyMaterial } from "@/types/study";

const materialIcons = {
  pdf: FileText,
  video: Video,
  audio: Headphones,
};

export function MaterialTab({ materials }: { materials: readonly StudyMaterial[] }) {
  const [message, setMessage] = useState("");

  return (
    <section aria-labelledby="materials-title" className="space-y-5">
      <div>
        <h2 id="materials-title" className="text-lg font-semibold tracking-tight">
          Materiais deste tema
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Prévia visual dos materiais disponíveis para estudo.
        </p>
      </div>
      {message && (
        <p role="status" className="rounded-lg border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
          {message}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {materials.map((material) => {
          const Icon = materialIcons[material.type];
          return (
            <Card key={material.id} className="gap-0 overflow-hidden py-0 shadow-none">
              <div className="flex min-h-36 items-center justify-center border-b bg-secondary/55 text-primary">
                <span className="flex size-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
                  <Icon className="size-7" strokeWidth={1.5} aria-hidden="true" />
                </span>
              </div>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    {material.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{material.size}</span>
                </div>
                <h3 className="min-h-11 text-sm font-semibold leading-5">{material.name}</h3>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5 w-full"
                  onClick={() => setMessage(`Abertura de “${material.name}” disponível em breve.`)}
                >
                  <Play className="size-4" aria-hidden="true" />
                  Abrir material
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
