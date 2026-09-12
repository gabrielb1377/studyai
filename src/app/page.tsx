import { PageHeading } from "@/components/page-heading";
import { StudyDashboard } from "@/features/dashboard/StudyDashboard";
import { WeeklyProgress } from "@/features/dashboard/weekly-progress";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Seu espaço de estudos"
        title="Que bom ter você por aqui."
        description="Um novo dia, uma nova descoberta. Vamos aprender algo?"
      />
      <StudyDashboard />
      <WeeklyProgress />
      <p className="pb-2 text-center text-[11px] text-muted-foreground">
        Aprender não é uma corrida. Encontre o seu ritmo.
      </p>
    </div>
  );
}
