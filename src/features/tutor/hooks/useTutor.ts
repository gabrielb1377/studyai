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
import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { ContentStorage } from "@/features/extraction/ContentStorage";
import { MaterialService } from "@/services/material-service";
import { disciplineMaterials, retrieveDiscipline, type DisciplineSelection } from "../services/DisciplineContext";
import { StudyEngine } from "@/features/study/services/StudyEngine";

function sourceReferences(chunks: readonly RetrievedChunk[]) {
  return chunks.map(({ id, metadata, text }) => ({
    id, name: metadata.sourceName, page: metadata.pageStart, excerpt: text,
  }));
}

type PendingFallback = {
  offer: AIFallbackOffer;
  conversationId: string;
  history: TutorConversation["messages"];
  message: string;
  context?: TutorStudyContext | null;
  chunks: readonly RetrievedChunk[];
  teaching?: TeacherRequest;
};

export function useTutor(instanceId?: string, studyId?: string) {
  const auth = useAuth();
  const context = useTutorContext(studyId);
  const [stored, setConversations] = useState<TutorConversation[]>([]);
  const [loadedGeneration, setLoadedGeneration] = useState<number>();
  const session = SessionOperationManager.current();
  const ready = !auth.isLoading && !session.suspended && loadedGeneration === session.generation;
  const conversations = useMemo(
    () => ready ? stored.filter((item) => !studyId || !item.discipline) : [],
    [ready, stored, studyId],
  );
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
    let active = true;
    const session = SessionOperationManager.current();
    setConversations([]);
    setLoadedGeneration(undefined);
    setActiveConversationId("");
    setPendingFallback(null);
    setError(null);
    setIsLoading(false);
    if (auth.isLoading || session.suspended || !session.userId) return () => { active = false; };
    void Promise.all([TutorStorage.load(), TutorStorage.loadActive(instanceId)]).then(([storedConversations, storedActive]) => {
      const current = SessionOperationManager.current();
      if (active && current.userId === session.userId && current.generation === session.generation) {
        const items = storedConversations ?? [];
        setConversations(items);
        setActiveConversationId(items.some((item) => item.id === storedActive) ? storedActive! : items[0]?.id ?? "");
        setLoadedGeneration(session.generation);
      }
    });
    return () => { active = false; };
  }, [auth.isLoading, auth.session?.user.id, instanceId]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0],
    [activeConversationId, conversations],
  );

  const createConversation = (discipline?: DisciplineSelection) => {
    if (!ready) return;
    setPendingFallback(null);
    const conversation = TutorService.createConversation(discipline?.subject);
    if (discipline) conversation.discipline = discipline;
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
    if (!nextContent || isLoading || !ready) return false;
    let sessionOperation: ReturnType<typeof SessionOperationManager.start>;
    try {
      sessionOperation = SessionOperationManager.start();
    } catch {
      setError("Sua sessão mudou. Abra o estudo novamente para continuar.");
      return false;
    }

    const conversation = activeConversation ?? TutorService.createConversation();
    const userMessage = TutorService.createMessage("user", nextContent);
    const assistantMessage = TutorService.createMessage("assistant", "");
    const requestId = crypto.randomUUID();
    setError(null);
    setPendingFallback(null);
    setIsLoading(true);

    if (!activeConversation) setActiveConversationId(conversation.id);
    if (!activeConversation) void TutorStorage.saveActive(conversation.id, instanceId);
    updateConversations((current) => TutorService.addMessage(
      TutorService.addMessage(activeConversation ? current : [conversation, ...current], conversation.id, userMessage),
      conversation.id,
      assistantMessage,
    ));

    let streamedText = "";
    let requestContext: TutorStudyContext | null | undefined = context;
    let requestChunks: readonly RetrievedChunk[] = [];
    try {
      const discipline = conversation.discipline;
      const query = options?.teaching?.selection?.text ?? nextContent;
      let retrieval;
      if (discipline) {
        const [materials, extracted, studies] = await Promise.all([MaterialService.load(), ContentStorage.load(), StudyEngine.load()]);
        sessionOperation.assertCurrent();
        retrieval = { chunks: retrieveDiscipline(query, discipline, materials, extracted.records), knowledge: undefined };
        const studyIds = new Set(disciplineMaterials(materials, discipline).map((material) => material.studyId));
        const relatedStudies = studies.filter((study) => studyIds.has(study.studyId));
        const progress = relatedStudies.length
          ? Math.round(relatedStudies.reduce((total, study) => total + study.progress, 0) / relatedStudies.length)
          : 0;
        requestContext = {
          studyId: conversation.id, title: discipline.subject, subject: discipline.subject,
          topic: query.slice(0, 200), status: progress === 100 ? "completed" : progress ? "in_progress" : "not_started", progress, notes: [],
        };
      } else {
        retrieval = options?.teaching && context?.studyId && isBroadTeacherAction(options.teaching.action)
        ? await RetrievalPipeline.forStudy(context.studyId)
        : await RetrievalPipeline.forQuestion(query, context?.studyId);
      }
      sessionOperation.assertCurrent();
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
        : requestContext;
      requestContext = contextualized;
      requestChunks = retrieval.chunks;
      const response = await TutorService.requestReply(
        conversation.messages,
        nextContent,
        contextualized,
        retrieval.chunks,
        {
          onDelta: (delta) => {
            try {
              sessionOperation.assertCurrent();
            } catch {
              return;
            }
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
      sessionOperation.assertCurrent();
      updateConversations((current) =>
        TutorService.replaceMessage(current, conversation.id, assistantMessage.id, {
          content: response.text,
          metadata: response.metadata,
          sources: discipline ? sourceReferences(requestChunks) : undefined,
        }),
      );
      if (!discipline && context?.studyId) LearningService.enqueueActivity({ type: "tutor", studyId: context.studyId });
      return true;
    } catch (requestError) {
      if (sessionOperation.signal.aborted) return false;
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
      const current = SessionOperationManager.current();
      if (current.userId === sessionOperation.userId && current.generation === sessionOperation.generation) {
        setIsLoading(false);
      }
      sessionOperation.release();
    }
  };

  const acceptFallback = async (provider: AIProviderId) => {
    if (!pendingFallback || isLoading) return false;
    let sessionOperation: ReturnType<typeof SessionOperationManager.start>;
    try {
      sessionOperation = SessionOperationManager.start();
    } catch {
      setError("Sua sessão mudou. Solicite uma nova resposta para continuar.");
      return false;
    }
    const pending = pendingFallback;
    const alternative = pending.offer.alternatives.find((item) => item.provider === provider);
    if (!alternative) {
      sessionOperation.release();
      return false;
    }
    const discipline = conversations.find((item) => item.id === pending.conversationId)?.discipline;
    const assistantMessage = TutorService.createMessage("assistant", "");
    setPendingFallback(null);
    setError(null);
    setIsLoading(true);
    updateConversations((current) => TutorService.addMessage(current, pending.conversationId, assistantMessage));
    try {
      const chunks = pending.chunks;
      if (discipline) {
        const [materials, extracted] = await Promise.all([MaterialService.load(), ContentStorage.load()]);
        sessionOperation.assertCurrent();
        const currentChunks = retrieveDiscipline(pending.teaching?.selection?.text ?? pending.message, discipline, materials, extracted.records);
        if (JSON.stringify(currentChunks) !== JSON.stringify(chunks)) {
          throw new Error("Os materiais mudaram. Envie a pergunta novamente para atualizar as fontes.");
        }
      }
      const response = await TutorService.requestReply(
        pending.history,
        pending.message,
        pending.context,
        chunks,
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
      sessionOperation.assertCurrent();
      updateConversations((current) => TutorService.replaceMessage(current, pending.conversationId, assistantMessage.id, {
        content: response.text,
        metadata: response.metadata,
        sources: discipline ? sourceReferences(chunks) : undefined,
      }));
      if (!discipline && pending.context?.studyId) LearningService.enqueueActivity({ type: "tutor", studyId: pending.context.studyId });
      return true;
    } catch (requestError) {
      if (sessionOperation.signal.aborted) return false;
      updateConversations((current) => TutorService.removeMessage(current, pending.conversationId, assistantMessage.id));
      setError(requestError instanceof Error ? requestError.message : "A alternativa autorizada não conseguiu responder.");
      return false;
    } finally {
      const current = SessionOperationManager.current();
      if (current.userId === sessionOperation.userId && current.generation === sessionOperation.generation) {
        setIsLoading(false);
      }
      sessionOperation.release();
    }
  };

  return {
    activeConversation,
    activeConversationId,
    conversations,
    context: activeConversation?.discipline ? null : context,
    error,
    pendingFallback: pendingFallback?.offer ?? null,
    isLoading,
    ready,
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
