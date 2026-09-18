import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { KnowledgeScore, StudyPriority } from "../types";

const classificationLabels = {
  difficult: "Tema difícil",
  forgotten: "Esquecido",
  strong: "Tema forte",
  never_studied: "Nunca estudado",
  developing: "Em desenvolvimento",
};

export function KnowledgeCard({ score, priority }: { score: KnowledgeScore; priority: StudyPriority }) {
  return (
    <Card className="gap-4 p-4 shadow-none" aria-label={`Conhecimento em ${score.topic}: ${score.knowledge}%`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate font-medium">{score.topic}</p><p className="truncate text-xs text-muted-foreground">{score.subject}</p></div>
        <Badge variant={priority.level === "Alta" ? "destructive" : "secondary"}>{priority.level}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="text-lg font-semibold">{score.knowledge}%</p><p className="text-[11px] text-muted-foreground">Conhecimento</p></div>
        <div><p className="text-lg font-semibold">{score.confidence}%</p><p className="text-[11px] text-muted-foreground">Confiança</p></div>
        <div><p className="text-sm font-semibold leading-7">{score.mastery}</p><p className="text-[11px] text-muted-foreground">Domínio</p></div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${score.knowledge}%` }} /></div>
      <p className="text-xs text-muted-foreground">{classificationLabels[score.classification]} · {priority.reasons.join(" · ")}</p>
    </Card>
  );
}
