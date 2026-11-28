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

export type ExpectedAudioSessionContext = {
  readonly userId: string;
  readonly generation?: number;
};

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

function sessionChangedError(message: string): Error {
  const err = new Error(message);
  err.name = "SessionChangedError";
  return err;
}

function currentUserId(): string | null {
  if (typeof window === "undefined") return null;
  const session = SessionOperationManager.current();
  return session.suspended ? null : session.userId ?? null;
}

function assertExpectedContext(expected?: ExpectedAudioSessionContext): string {
  const session = SessionOperationManager.current();
  if (session.suspended || !session.userId) {
    throw sessionChangedError("Nenhuma sessão ativa para acessar a aula em áudio.");
  }
  if (expected) {
    if (session.userId !== expected.userId) {
      throw sessionChangedError("A conta mudou antes da persistência da aula em áudio.");
    }
    if (expected.generation !== undefined && session.generation !== expected.generation) {
      throw sessionChangedError("A geração de sessão mudou antes da persistência da aula em áudio.");
    }
  }
  return session.userId;
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

      // O registro legado permanece no IndexedDB já escopado ao usuário (studyai-db:user-<id>).
      // Ele é lido como recuperação segura apenas dentro do banco da própria conta e só ganha a nova chave no próximo save.
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

  async save(
    session: TeacherAudioSession,
    expected?: ExpectedAudioSessionContext,
  ): Promise<TeacherAudioSession> {
    const userId = assertExpectedContext(expected);
    const operation = SessionOperationManager.start(userId);
    const updated: TeacherAudioSession = { ...session, updatedAt: now() };
    try {
      // Validação imediatamente antes da fronteira efetiva de escrita
      operation.assertCurrent();
      await StorageManager.put("metadata", {
        key: sessionKey(userId),
        value: updated,
        updatedAt: updated.updatedAt,
      } satisfies MetadataRecord);
      operation.assertCurrent();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(TEACHER_AUDIO_SESSION_EVENT, {
            detail: { ownerId: userId, session: updated },
          }),
        );
      }
      return updated;
    } finally {
      operation.release();
    }
  },

  async remove(expected?: ExpectedAudioSessionContext): Promise<void> {
    const userId = assertExpectedContext(expected);
    const operation = SessionOperationManager.start(userId);
    try {
      operation.assertCurrent();
      await StorageManager.delete("metadata", sessionKey(userId));
      operation.assertCurrent();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(TEACHER_AUDIO_SESSION_EVENT, {
            detail: { ownerId: userId, session: null },
          }),
        );
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
