import Link from "next/link";
import { Clock3, FilePlus2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Material } from "@/types/material";
import type { StudyRecord } from "@/types/study-engine";

const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function RecentActivityPanel({ materials, studies }: { materials: readonly Material[]; studies: readonly StudyRecord[] }) {
  const recentMaterials = [...materials].sort((left, right) => right.importedAt.localeCompare(left.importedAt)).slice(0, 4);
  const recentStudies = [...studies].sort((left, right) => right.lastAccessedAt.localeCompare(left.lastAccessedAt)).slice(0, 4);
  if (recentMaterials.length === 0 && recentStudies.length === 0) return null;
  return <section className="grid gap-5 lg:grid-cols-2"><Card className="gap-4 p-5 shadow-none"><div className="flex items-center gap-2"><FilePlus2 className="size-4 text-primary" /><h2 className="font-semibold">Últimas importações</h2></div><div className="space-y-2">{recentMaterials.map((material) => <div key={material.id} className="flex items-center gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{material.name}</p><p className="text-xs text-muted-foreground">{material.subject ?? "Organização pendente"} · {date.format(new Date(material.importedAt))}</p></div><Button asChild size="sm" variant="ghost"><Link href={`/estudo?tema=${material.studyId ?? ""}&arquivo=${material.id}`}>Abrir</Link></Button></div>)}</div></Card><Card className="gap-4 p-5 shadow-none"><div className="flex items-center gap-2"><History className="size-4 text-primary" /><h2 className="font-semibold">Atividade recente</h2></div><div className="space-y-2">{recentStudies.map((study) => <div key={study.studyId} className="flex items-center gap-3 rounded-lg border p-3"><Clock3 className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{study.title}</p><p className="text-xs text-muted-foreground">{study.progress}% concluído · {date.format(new Date(study.lastAccessedAt))}</p></div></div>)}</div></Card></section>;
}
