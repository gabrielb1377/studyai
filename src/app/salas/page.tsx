import type { Metadata } from "next";
import { CollaborationPage } from "@/features/collaboration/CollaborationPage";

export const metadata: Metadata = { title: "Salas de estudo", description: "Colabore com estudantes e professores no StudyAI." };
export default function Page(){return <CollaborationPage/>;}
