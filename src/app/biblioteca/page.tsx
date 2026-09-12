import type { Metadata } from "next";
import { LibraryBrowser } from "@/features/library/LibraryBrowser";
import { LibraryHeader } from "@/features/library/LibraryHeader";

export const metadata: Metadata = { title: "Biblioteca" };

export default function LibraryPage() {
  return (
    <>
      <LibraryHeader />
      <LibraryBrowser />
    </>
  );
}
