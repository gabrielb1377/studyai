"use client";

import { useEffect, useMemo, useState } from "react";
import { RetrievalPipeline } from "@/features/ai/RetrievalPipeline";
import type { TutorConversation } from "@/types/tutor";
import { TutorService } from "../services/TutorService";
import { TutorStorage } from "../services/TutorStorage";
import { useTutorContext } from "./useTutorContext";
import { LearningService } from "@/features/learning/LearningService";
import { isBroadTeacherAction, type TeacherRequest } from "@/features/teacher/types";
import { AIClientError } from "@/features/ai/AIClient";
import type { AIFallbackOffer, AIProviderId } from "@/features/ai/AIProvider";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import type { TutorStudyContext } from "@/types/tutor-context";

type PendingFallback = {
  offer: AIFallbackOffer;
  conversationId: string;
  history: TutorConversation["messages"];
  message: string;
  context?: TutorStudyContext | null;
  chunks: readonly RetrievedChunk[];
  teaching?: TeacherRequest;
};

export function useTutor(instanceId?: string) {
  const context = useTutorContext();
  const [conversations, setConversations] = useState<TutorConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFallback, setPendingFallback] = useState<PendingFallback | null>(null);

  const updateConversations = (
    updater: (current: TutorConversation[]) => TutorConversation[],
  ) => {
    setConversations((current) => {
      const nextConversations = updater(current);
      void TutorStorage.save(nextConversations);
      return nextConversations;
    });
  };

  useEffect(() => {
    void Promise.all([TutorStorage.load(), TutorStorage.loadActive(instanceId)]).then(([storedConversations, storedActive]) => {
      if (storedConversations?.length) {
        setConversations(storedConversations);
        setActiveConversationId(storedConversations.some((item) => item.id === storedActive) ? storedActive! : storedConversations[0].id);
      }
    });
  }, [instanceId]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0],
    [activeConversationId, conversations],
  );

  const createConversation = () => {
    setPendingFallback(null);
    const conversation = TutorService.createConversation();
    updateConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
    void TutorStorage.saveActive(conversation.id, instanceId);
    return conversation;
  };

  const renameConversation = (conversationId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    updateConversations((current) =>
      TutorService.renameConversation(current, conversationId, nextTitle),
    );
  };

  const deleteConversation = (conversationId: string) => {
    if (pendingFallback?.conversationId === conversationId) setPendingFallback(null);
    updateConversations((current) => {
      const nextConversations = TutorService.deleteConversation(current, conversationId);
      if (conversationId === activeConversationId) {
        setActiveConversationId(nextConversations[0]?.id ?? "");
        if (nextConversations[0]) void TutorStorage.saveActive(nextConversations[0].id, instanceId);
      }
      return nextConversations;
    });
  };

  const sendMessage = async (content: string, options?: { teaching?: TeacherRequest }) => {
    const nextContent = content.trim();
    if (!nextContent || isLoading) return false;

    const conversation = activeConversation ?? TutorService.createConversation();
    const userMessage = TutorService.createMessage("user", nextContent);
    const assistantMessage = TutorService.createMessage("assistant", "");
    const requestId = crypto.randomUUID();
    setError(null);
    setPendingFallback(null);
    setIsLoading(true);

    if (!activeConversation) setActiveConversationId(conversation.id);
    updateConversations((current) => TutorService.addMessage(
      TutorService.addMessage(activeConversation ? current : [conversation, ...current], conversation.id, userMessage),
      conversation.id,
      assistantMessage,
    ));

    let streamedText = "";
    let requestContext: TutorStudyContext | null | undefined = context;
    let requestChunks: readonly RetrievedChunk[] = [];
    try {
      const retrieval = options?.teaching && context?.studyId && isBroadTeacherAction(options.teaching.action)
        ? await RetrievalPipeline.forStudy(context.studyId)
        : await RetrievalPipeline.forQuestion(options?.teaching?.selection?.text ?? nextContent, context?.studyId);
      const contextualized = context && retrieval.knowledge?.hasContext
        ? {
            ...context,
            knowledge: {
              matchedConcepts: retrieval.knowledge.concepts.map((match) => ({
                name: match.concept.name,
                description: match.concept.description,
                aliases: match.concept.aliases,
                relatedConcepts: match.related.map((concept) => concept.name),
              })),
              relationshipCount: retrieval.knowledge.relationCount,
            },
          }
        : context;
      requestContext = contextualized;
      requestChunks = retrieval.chunks;
      const response = await TutorService.requestReply(
        conversation.messages,
        nextContent,
        contextualized,
        retrieval.chunks,
        {
          onDelta: (delta) => {
            streamedText += delta;
            setConversations((current) => TutorService.replaceMessage(
              current,
              conversation.id,
              assistantMessage.id,
              { content: streamedText },
            ));
          },
          teaching: options?.teaching,
          requestId,
        },
      );
      updateConversations((current) =>
        TutorService.replaceMessage(current, conversation.id, assistantMessage.id, {
          content: response.text,
          metadata: response.metadata,
        }),
      );
      if (context?.studyId) LearningService.enqueueActivity({ type: "tutor", studyId: context.studyId });
      return true;
    } catch (requestError) {
      if (!streamedText) {
        updateConversations((current) => TutorService.removeMessage(current, conversation.id, assistantMessage.id));
      } else {
        updateConversations((current) => TutorService.replaceMessage(current, conversation.id, assistantMessage.id, { content: streamedText }));
      }
      if (!streamedText && requestError instanceof AIClientError && requestError.code === "FALLBACK_CONSENT_REQUIRED" && requestError.fallback) {
        setPendingFallback({
          offer: requestError.fallback,
          conversationId: conversation.id,
          history: conversation.messages,
          message: nextContent,
          context: requestContext,
          chunks: requestChunks,
          teaching: options?.teaching,
        });
        setError(null);
      } else {
        setError(requestError instanceof Error ? requestError.message : "Erro inesperado no Tutor IA.");
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const acceptFallback = async (provider: AIProviderId) => {
    if (!pendingFallback || isLoading) return false;
    const pending = pendingFallback;
    const alternative = pending.offer.alternatives.find((item) => item.provider === provider);
    if (!alternative) return false;
    const assistantMessage = TutorService.createMessage("assistant", "");
    setPendingFallback(null);
    setError(null);
    setIsLoading(true);
    updateConversations((current) => TutorService.addMessage(current, pending.conversationId, assistantMessage));
    try {
      const response = await TutorService.requestReply(
        pending.history,
        pending.message,
        pending.context,
        pending.chunks,
        {
          requestId: pending.offer.requestId,
          provider: pending.offer.primaryProvider,
          model: pending.offer.primaryModel,
          fallbackConsent: {
            requestId: pending.offer.requestId,
            originalProvider: pending.offer.primaryProvider,
            provider: alternative.provider,
            model: alternative.model,
          },
          teaching: pending.teaching,
        },
      );
      updateConversations((current) => TutorService.replaceMessage(current, pending.conversationId, assistantMessage.id, {
        content: response.text,
        metadata: response.metadata,
      }));
      if (pending.context?.studyId) LearningService.enqueueActivity({ type: "tutor", studyId: pending.context.studyId });
      return true;
    } catch (requestError) {
      updateConversations((current) => TutorService.removeMessage(current, pending.conversationId, assistantMessage.id));
      setError(requestError instanceof Error ? requestError.message : "A alternativa autorizada não conseguiu responder.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    activeConversation,
    activeConversationId,
    conversations,
    context,
    error,
    pendingFallback: pendingFallback?.offer ?? null,
    isLoading,
    clearError: () => setError(null),
    setError,
    createConversation,
    renameConversation,
    deleteConversation,
    selectConversation: (conversationId: string) => {
      setPendingFallback(null);
      setActiveConversationId(conversationId);
      void TutorStorage.saveActive(conversationId, instanceId);
    },
    sendMessage,
    acceptFallback,
    declineFallback: () => setPendingFallback(null),
  };
}
