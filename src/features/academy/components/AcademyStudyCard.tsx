import { BookOpen, Clock3, Layers3, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { academyLabels, type AcademyStudy } from "../types";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export function AcademyStudyCard({ study }: { study: AcademyStudy }) {
  return (
    <Card className="surface-hover h-full gap-4 py-5">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-5" aria-hidden="true" /></span>
          <Badge variant="outline">Material Gerado por IA</Badge>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold leading-6">{study.title}</h3>
          <p className="text-sm text-muted-foreground">{study.subject}</p>
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-secondary/55 p-3"><dt className="text-muted-foreground">Nível</dt><dd className="mt-1 font-medium">{academyLabels.levels[study.level]}</dd></div>
          <div className="rounded-xl bg-secondary/55 p-3"><dt className="text-muted-foreground">Objetivo</dt><dd className="mt-1 font-medium">{academyLabels.goals[study.goal]}</dd></div>
        </dl>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Progresso inicial</span><span>{study.progress}%</span></div>
          <Progress value={study.progress} aria-label={`Progresso de ${study.title}`} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{study.duration} min</span>
          <span className="flex items-center gap-1.5"><Layers3 className="size-3.5" />{study.modules.length} módulos</span>
          <span className="flex items-center gap-1.5"><BookOpen className="size-3.5" /><time dateTime={study.createdAt}>{dateFormatter.format(new Date(study.createdAt))}</time></span>
        </div>
      </CardContent>
    </Card>
  );
}
