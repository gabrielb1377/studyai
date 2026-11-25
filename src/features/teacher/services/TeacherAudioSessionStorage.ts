import { StorageManager } from "@/lib/storage/StorageManager";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";

type MetadataRecord = { key: string; value: unknown; updatedAt: string };

/**
 * Sessão de aula narrada do Professor.
 *
 * Persistida no IndexedDB do usuário (store `metadata`) para permitir
 * interromper e retomar a aula sem perder progresso.
 * O estado pedagógico é leve: nenhuma gravação de áudio é mantida.
 *
 * A chave de armazenamento é escopada por `userId` para impedir que
 * outra conta acesse a sessão de áudio de um usuário diferente.
 */

export const TEACHER_AUDIO_SESSION_KEY_PREFIX = "teacher-audio-session:v1:";
export const LEGACY_TEACHER_AUDIO_SESSION_KEY = "teacher-audio-session:v1";
export const TEACHER_AUDIO_SESSION_EVENT = "studyai:teacher-audio-session";

export type TeacherAudioLessonStep = {
  id: string;
  title: string;
  spoken: string;
  original: string;
  kind: "introduction" | "explanation" | "example" | "exercise" | "correction" | "summary";
  completed: boolean;
  exercisePrompt?: string;
  exerciseAnswer?: string;
  exerciseResolved: boolean;
};

export type TeacherAudioSession = {
  id: string;
  studyId: string;
  topic: string;
  subject: string;
  steps: TeacherAudioLessonStep[];
  currentStep: number;
  startedAt: string;
  updatedAt: string;
  activeSeconds: number;
  lastTickAt: string | null;
  voice: string;
  rate: number;
  autoplay: boolean;
  narrationEnabled: boolean;
};

export const DEFAULT_AUDIO_SESSION_STEP_KIND: TeacherAudioLessonStep["kind"] = "explanation";

function isSession(value: unknown): value is TeacherAudioSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<TeacherAudioSession>;
  return (
    typeof session.id === "string" &&
    typeof session.studyId === "string" &&
    typeof session.topic === "string" &&
    Array.isArray(session.steps) &&
    typeof session.currentStep === "number"
  );
}

function now() {
  return new Date().toISOString();
}

function currentUserId(): string | null {
  if (typeof window === "undefined") return null;
  const session = SessionOperationManager.current();
  return session.userId ?? null;
}

function sessionKey(userId: string) {
  return `${TEACHER_AUDIO_SESSION_KEY_PREFIX}${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export const TeacherAudioSessionStorage = {
  async load(): Promise<TeacherAudioSession | null> {
    const userId = currentUserId();
    if (!userId) return null;
    const operation = SessionOperationManager.start(userId);
    try {
      const record = await StorageManager.get<MetadataRecord>("metadata", sessionKey(userId));
      operation.assertCurrent();
      if (isSession(record?.value)) return record.value;

      // O registro legado permanece no IndexedDB já escopado ao usuário.
      // Ele é lido como recuperação e só ganha a nova chave em um próximo save.
      const legacy = await StorageManager.get<MetadataRecord>("metadata", LEGACY_TEACHER_AUDIO_SESSION_KEY);
      operation.assertCurrent();
      return isSession(legacy?.value) ? legacy.value : null;
    } catch (error) {
      if (error instanceof Error && error.name === "SessionChangedError") return null;
      throw error;
    } finally {
      operation.release();
    }
  },

  async save(session: TeacherAudioSession): Promise<TeacherAudioSession> {
    const userId = currentUserId();
    if (!userId) throw new Error("Nenhum usuário autenticado para salvar sessão de áudio.");
    const operation = SessionOperationManager.start(userId);
    const updated: TeacherAudioSession = { ...session, updatedAt: now() };
    try {
      await StorageManager.put("metadata", {
        key: sessionKey(userId),
        value: updated,
        updatedAt: updated.updatedAt,
      } satisfies MetadataRecord);
      operation.assertCurrent();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(TEACHER_AUDIO_SESSION_EVENT, { detail: updated }));
      }
      return updated;
    } finally {
      operation.release();
    }
  },

  async remove(): Promise<void> {
    const userId = currentUserId();
    if (!userId) return;
    const operation = SessionOperationManager.start(userId);
    try {
      await StorageManager.delete("metadata", sessionKey(userId));
      operation.assertCurrent();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(TEACHER_AUDIO_SESSION_EVENT, { detail: null }));
      }
    } finally {
      operation.release();
    }
  },
};

/**
 * Calcula o tempo ativo acumulado sem contar reprodução pausada.
 * O tempo só corre enquanto a narração está efetivamente tocando.
 */
export function accumulateActiveSeconds(session: TeacherAudioSession, nowIso: string): number {
  if (!session.lastTickAt) return session.activeSeconds;
  const elapsed = Math.floor((new Date(nowIso).getTime() - new Date(session.lastTickAt).getTime()) / 1000);
  if (elapsed <= 0) return session.activeSeconds;
  // Descontima o tempo em que a sessão ficou pausada (limite de 5 min por bloco).
  return session.activeSeconds + Math.min(elapsed, 300);
}
