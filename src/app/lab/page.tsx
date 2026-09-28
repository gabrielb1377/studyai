import type { Metadata } from "next";
import { LabPage } from "@/features/lab/components/LabPage";

export const metadata: Metadata = { title: "Laboratório" };

export default function Page() { return <LabPage />; }
