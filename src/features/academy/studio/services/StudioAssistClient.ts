/**
 * Cliente HTTP da assistência contextual do Academy Studio.
 *
 * O navegador nunca chama o AI Core diretamente: as chamadas passam pela rota
 * interna `/api/academy/studio/assist`, que aplica as chaves individuais
 * (BYOK) do usuário e o fallback do servidor.
 */

export type StudioAssistAction =
  | "improve-writing"
  | "summarize"
  | "expand"
  | "simplify"
  | "create-example"
  | "create-exercise"
  | "reorganize";

export type StudioAssistResponse = {
  originalText: string;
  suggestedText: string;
  explanation: string;
  action: StudioAssistAction;
};

function csrfToken() {
  if (typeof document === "undefined") return "";
  return (
    document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("studyai_csrf="))
      ?.split("=")
      .slice(1)
      .join("=") ?? ""
  );
}

export const StudioAssistClient = {
  async assist(input: { action: StudioAssistAction; text: string; context?: string }): Promise<StudioAssistResponse> {
    const response = await fetch("/api/academy/studio/assist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
      body: JSON.stringify(input),
    });
    const data = (await response.json().catch(() => null)) as (StudioAssistResponse & { error?: string }) | null;
    if (!response.ok || !data) {
      throw new Error(data?.error || "Não foi possível consultar a assistência de IA.");
    }
    return data;
  },
};
