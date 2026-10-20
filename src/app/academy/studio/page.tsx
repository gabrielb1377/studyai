import type { Metadata } from "next";
import { StudioPage } from "@/features/academy/studio/StudioPage";

export const metadata: Metadata = { title: "Academy Studio" };

export default function Page() {
  return <StudioPage />;
}
