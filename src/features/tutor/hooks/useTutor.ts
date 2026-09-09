"use client";

import { useEffect, useMemo, useState } from "react";
import { tutorConversations } from "@/lib/mock/tutor";
import type { TutorConversation } from "@/types/tutor";
import { TutorService } from "../services/TutorService";
import { TutorStorage } from "../services/TutorStorage";

export function useTutor() {
  const [conversations, setConversations] = useState<TutorConversation[]>(() =>
    tutorConversations.map((conversation) => ({ ...conversation, messages: [...conversation.messages] })),
  );
  const [activeConversationId, setActiveConversationId] = useState(tutorConversations[0]?.id ?? "");
  const [isReady, setIsReady] = useState(false);

  const updateConversations = (
    updater: (current: TutorConversation[]) => TutorConversation[],
  ) => {
    setConversations((current) => {
      const nextConversations = updater(current);
      TutorStorage.save(nextConversations);
      return nextConversations;
    });
  };

  useEffect(() => {
    const storedConversations = TutorStorage.load();
    if (storedConversations?.length) {
      setConversations(storedConversations);
      setActiveConversationId(storedConversations[0].id);
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (isReady) TutorStorage.save(conversations);
  }, [conversations, isReady]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0],
    [activeConversationId, conversations],
  );

  const createConversation = () => {
    const conversation = TutorService.createConversation();
    updateConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
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
      }
      return nextConversations;
    });
  };

  const sendMessage = (content: string) => {
    const nextContent = content.trim();
    if (!nextContent) return;
    if (activeConversation) {
      updateConversations((current) =>
        TutorService.addMessage(current, activeConversation.id, nextContent),
      );
      return;
    }

    const conversation = TutorService.createConversation();
    updateConversations((current) =>
      TutorService.addMessage([conversation, ...current], conversation.id, nextContent),
    );
    setActiveConversationId(conversation.id);
  };

  return {
    activeConversation,
    activeConversationId,
    conversations,
    isReady,
    createConversation,
    renameConversation,
    deleteConversation,
    selectConversation: setActiveConversationId,
    sendMessage,
  };
}
