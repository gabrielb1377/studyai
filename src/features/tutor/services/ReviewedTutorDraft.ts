import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import type { DisciplineSelection } from "./DisciplineContext";

let pending: { text: string; selection?: DisciplineSelection; clear: () => void } | undefined;

export function prepareReviewedTutorDraft(text: string, selection?: DisciplineSelection) {
  pending?.clear();
  const operation = SessionOperationManager.start();
  const clear = () => {
    pending = undefined;
    window.clearTimeout(expiry);
    operation.signal.removeEventListener("abort", clear);
    operation.release();
  };
  const expiry = window.setTimeout(clear, 60_000);
  operation.signal.addEventListener("abort", clear, { once: true });
  pending = { text, selection, clear };
}

export function takeReviewedTutorDraft() {
  const draft = pending;
  pending?.clear();
  return draft;
}
