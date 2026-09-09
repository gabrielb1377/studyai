import { Leaf } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeading } from "@/components/page-heading";
import { ContinueStudying } from "@/features/dashboard/continue-studying";
import { ImportMaterial } from "@/features/dashboard/import-material";
import { RecentTopics } from "@/features/dashboard/recent-topics";
import { WeeklyProgress } from "@/features/dashboard/weekly-progress";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Seu espaço de estudos"
        title="Que bom ter você por aqui."
        description="Um novo dia, uma nova descoberta. Vamos aprender algo?"
        action={
          <Badge
            variant="outline"
            className="gap-1.5 py-1.5 font-normal text-muted-foreground"
          >
            <Leaf className="size-3" />
            Dados demonstrativos
          </Badge>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_0.43fr]">
        <ContinueStudying />
        <ImportMaterial />
      </div>
      <RecentTopics />
      <WeeklyProgress />
      <p className="pb-2 text-center text-[11px] text-muted-foreground">
        Aprender não é uma corrida. Encontre o seu ritmo.
      </p>
    </div>
  );
}
