import type { Metadata } from "next";
import { AcademyPage } from "@/features/academy/components/AcademyPage";

export const metadata: Metadata = { title: "Academy" };

export default function Page() {
  return <AcademyPage />;
}
