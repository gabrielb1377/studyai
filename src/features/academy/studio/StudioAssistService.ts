import "server-only";

import { AIService } from "@/features/ai/AIService";
import type { AIProviderId } from "@/features/ai/AIProvider";
import { TokenCounter } from "@/features/ai/TokenCounter";

/**
 * Assistência contextual do Academy Studio.
 *
 * Usa exclusivamente o AI Core (AIService → ProviderManager → provider).
 * O texto original nunca é sobrescrito sem confirmação: o retorno carrega a
 * sugestão e a justificativa para a interface exibir antes de aplicar.
 */

export type StudioAssistAction =
  | "improve-writing"
  | "summarize"
  | "expand"
  | "simplify"
  | "create-example"
  | "create-exercise"
  | "reorganize";

export type StudioAssistRequest = {
  action: StudioAssistAction;
  text: string;
  context?: string;
  apiKeys?: Partial<Record<AIProviderId, string>>;
};

export type StudioAssistResponse = {
  originalText: string;
  suggestedText: string;
  explanation: string;
  action: StudioAssistAction;
};

const instructions: Record<StudioAssistAction, string> = {
  "improve-writing": "Melhore a redação deste texto: mais claro, fluido e profissional, sem alterar o significado técnico. Preserve termos técnicos.",
  summarize: "Resuma este texto de forma concisa, preservando os conceitos essenciais.",
  expand: "Expanda esta explicação com mais detalhes, exemplos e contexto, sem sair do tema.",
  simplify: "Simplifique a linguagem deste texto para um estudante iniciante, sem perder a precisão conceitual.",
  "create-example": "Crie um exemplo prático e didático que ilustre o conceito deste texto.",
  "create-exercise": "Crie um exercício sobre este conteúdo, com enunciado, resposta esperada e justificativa.",
  reorganize: "Reorganize este conteúdo em uma sequência didática mais lógica, preservando todo o conteúdo original.",
};

export const StudioAssistService = {
  async assist(request: StudioAssistRequest): Promise<StudioAssistResponse> {
    const text = TokenCounter.truncate(request.text ?? "", 3_000);
    const instruction = [
      instructions[request.action],
      "Responda somente com o texto final, sem preâmbulo, sem justificativa e sem aspas.",
      "Não inclua links externos, credenciais ou código executável.",
      request.context ? `Contexto do documento: ${TokenCounter.truncate(request.context, 800)}` : "",
    ].filter(Boolean).join("\n");

    const response = await AIService.generate({
      history: [],
      message: `${instruction}\n\n---\n${text}`,
      mode: "automatic",
      stream: false,
      apiKeys: request.apiKeys,
    });

    return {
      originalText: request.text,
      suggestedText: response.text.trim(),
      explanation: `Sugestão gerada pela IA para "${request.action}".`,
      action: request.action,
    };
  },
};
