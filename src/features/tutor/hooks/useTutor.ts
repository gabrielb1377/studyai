"use client";

import { useEffect, useMemo, useState } from "react";
import { RetrievalPipeline } from "@/features/ai/RetrievalPipeline";
import type { TutorConversation } from "@/types/tutor";
import { TutorService } from "../services/TutorService";
import { TutorStorage } from "../services/TutorStorage";
import { useTutorContext } from "./useTutorContext";

export function useTutor() {
  const context = useTutorContext();
  const [conversations, setConversations] = useState<TutorConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    void Promise.all([TutorStorage.load(), TutorStorage.loadActive()]).then(([storedConversations, storedActive]) => {
      if (storedConversations?.length) {
        setConversations(storedConversations);
        setActiveConversationId(storedConversations.some((item) => item.id === storedActive) ? storedActive! : storedConversations[0].id);
      }
    });
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0],
    [activeConversationId, conversations],
  );

  const createConversation = () => {
    const conversation = TutorService.createConversation();
    updateConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
    void TutorStorage.saveActive(conversation.id);
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
    updateConversations((current) => {
      const nextConversations = TutorService.deleteConversation(current, conversationId);
      if (conversationId === activeConversationId) {
        setActiveConversationId(nextConversations[0]?.id ?? "");
        if (nextConversations[0]) void TutorStorage.saveActive(nextConversations[0].id);
      }
      return nextConversations;
    });
  };

  const sendMessage = async (content: string) => {
    const nextContent = content.trim();
    if (!nextContent || isLoading) return false;

    const conversation = activeConversation ?? TutorService.createConversation();
    const userMessage = TutorService.createMessage("user", nextContent);
    setError(null);
    setIsLoading(true);

    if (!activeConversation) setActiveConversationId(conversation.id);
    updateConversations((current) => TutorService.addMessage(
      activeConversation ? current : [conversation, ...current],
      conversation.id,
      userMessage,
    ));

    try {
      const retrieval = await RetrievalPipeline.forQuestion(nextContent, context?.studyId);
      const response = await TutorService.requestReply(
        conversation.messages,
        nextContent,
        context,
        retrieval.chunks,
      );
      const assistantMessage = TutorService.createMessage("assistant", response.text);
      updateConversations((current) =>
        TutorService.addMessage(current, conversation.id, assistantMessage),
      );
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro inesperado no Tutor IA.");
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
    isLoading,
    clearError: () => setError(null),
    setError,
    createConversation,
    renameConversation,
    deleteConversation,
    selectConversation: (conversationId: string) => {
      setActiveConversationId(conversationId);
      void TutorStorage.saveActive(conversationId);
    },
    sendMessage,
  };
}
