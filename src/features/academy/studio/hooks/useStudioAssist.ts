"use client";

import { useCallback, useState } from "react";

import { StudioAssistClient, type StudioAssistAction, type StudioAssistResponse } from "../services/StudioAssistClient";

/**
 * Orquestra a assistência contextual do Studio.
 *
 * A proposta da IA é devolvida separadamente para que a interface a exiba
 * antes de qualquer alteração: o conteúdo original nunca é sobrescrito
 * silenciosamente.
 */
export function useStudioAssist() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<StudioAssistResponse | null>(null);

  const request = useCallback(async (input: { action: StudioAssistAction; text: string; context?: string }) => {
    setIsLoading(true);
    setError(null);
    setProposal(null);
    try {
      const result = await StudioAssistClient.assist(input);
      setProposal(result);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar a assistência de IA.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    setProposal(null);
    setError(null);
  }, []);

  return { isLoading, error, proposal, request, dismiss };
}
