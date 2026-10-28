import type { Metadata } from "next";
import { ExamWorkspace } from "@/features/exam/ExamWorkspace";

export const metadata: Metadata = { title: "Modo Semana de Prova" };

export default function ProvasPage() {
  return <ExamWorkspace studies={[]} />;
}
