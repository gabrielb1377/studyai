"use client";

import { LibraryHeader } from "@/features/library/LibraryHeader";
import { LibraryErrorState } from "@/features/library/LibraryStates";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <>
      <LibraryHeader />
      <LibraryErrorState onRetry={reset} />
    </>
  );
}
