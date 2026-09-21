"use client";

import { FileText, Headphones, ImageIcon, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFileSize } from "@/features/import/import-utils";
import type { StudyMaterial } from "@/types/study";
import { MaterialViewer } from "./MaterialViewer";
import { VirtualizedList } from "@/features/workspace/components/VirtualizedList";

const materialIcons = {
  pdf: FileText,
  video: Video,
  audio: Headphones,
  text: FileText,
  document: FileText,
  image: ImageIcon,
};

export function MaterialTab({ studyId, materials, selectedMaterialId, onMaterialChange, compact = false }: { studyId: string; materials: readonly StudyMaterial[]; selectedMaterialId?: string; onMaterialChange: (materialId: string) => void; compact?: boolean }) {
  const selectedIndex = Math.max(0, materials.findIndex((material) => material.id === selectedMaterialId));
  const selectedMaterial = materials[selectedIndex] ?? materials[0];
  const renderMaterial = (material: StudyMaterial, index: number) => {
    const Icon = materialIcons[material.type];
    const isSelected = index === selectedIndex;
    return <Button type="button" variant="ghost" aria-pressed={isSelected} className={`h-auto w-full justify-start gap-3 whitespace-normal px-3 py-3 text-left ${isSelected ? "bg-accent text-accent-foreground" : ""}`} onClick={() => onMaterialChange(material.id)}><Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{material.name}</span><span className="mt-1 flex items-center gap-2 text-[11px] font-normal text-muted-foreground"><Badge variant="outline" className="h-4 px-1 text-[9px]">{material.type.toUpperCase()}</Badge>{formatFileSize(material.size)}</span></span></Button>;
  };

  if (!selectedMaterial) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum material disponível.</p>;
  }

  return (
    <section aria-labelledby="materials-title" className={compact ? "space-y-3" : "space-y-5"}>
      <div className={compact ? "sr-only" : undefined}>
        <h2 id="materials-title" className="text-lg font-semibold tracking-tight">Visualizador de materiais</h2>
        <p className="mt-1 text-sm text-muted-foreground">Abra cada arquivo no visualizador correspondente.</p>
      </div>
      <div className={`grid items-start gap-4 ${compact ? "2xl:grid-cols-[minmax(0,1fr)_15rem]" : "xl:grid-cols-[minmax(0,1fr)_18rem]"}`}>
        <MaterialViewer
          material={selectedMaterial}
          studyId={studyId}
          compact={compact}
          hasPrevious={selectedIndex > 0}
          hasNext={selectedIndex < materials.length - 1}
          onPrevious={() => onMaterialChange(materials[Math.max(0, selectedIndex - 1)].id)}
          onNext={() => onMaterialChange(materials[Math.min(materials.length - 1, selectedIndex + 1)].id)}
        />
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="border-b px-5 py-5">
            <CardTitle className="text-base">Materiais</CardTitle>
            <p className="text-sm text-muted-foreground">{materials.length} {materials.length === 1 ? "arquivo importado" : "arquivos importados"}</p>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {materials.length > 20 ? <VirtualizedList items={materials} itemHeight={68} height={Math.min(476, materials.length * 68)} getKey={(material) => material.id} renderItem={renderMaterial} ariaLabel="Materiais virtualizados" /> : materials.map((material, index) => <div key={material.id}>{renderMaterial(material, index)}</div>)}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
