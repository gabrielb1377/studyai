import { SessionOperationManager } from "@/features/account/SessionOperationManager";

let pending: { text: string; clear: () => void } | undefined;

export function prepareReviewedTutorDraft(text: string) {
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
  pending = { text, clear };
}

export function takeReviewedTutorDraft() {
  const text = pending?.text;
  pending?.clear();
  return text;
}
