import { PageHeading } from "@/components/page-heading";
import { StudyDashboard } from "@/features/dashboard/StudyDashboard";
import { WeeklyProgress } from "@/features/dashboard/weekly-progress";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Painel de estudos"
        title="Que bom ter você por aqui."
        description="Acompanhe seu ritmo semanal, revise materiais recentes e retome o foco de onde parou."
      />
      <StudyDashboard />
      <WeeklyProgress />
      <p className="type-caption pb-2 text-center">
        Aprender não é uma corrida. Encontre o seu ritmo.
      </p>
    </div>
  );
}
