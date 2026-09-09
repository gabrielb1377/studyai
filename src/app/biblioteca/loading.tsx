import { LibraryHeader } from "@/features/library/LibraryHeader";
import { LibraryLoading } from "@/features/library/LibraryStates";

export default function Loading() {
  return (
    <>
      <LibraryHeader />
      <LibraryLoading />
    </>
  );
}
