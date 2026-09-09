import type { Metadata } from "next";
import { LibraryBrowser } from "@/features/library/LibraryBrowser";
import { LibraryHeader } from "@/features/library/LibraryHeader";
import { materials } from "@/lib/mock/materials";

export const metadata: Metadata = { title: "Biblioteca" };

export default function LibraryPage() {
  return (
    <>
      <LibraryHeader />
      <LibraryBrowser materials={materials} />
    </>
  );
}
