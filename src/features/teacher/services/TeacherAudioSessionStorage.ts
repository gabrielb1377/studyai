import { StorageManager } from "@/lib/storage/StorageManager";

type MetadataRecord = { key: string; value: unknown; updatedAt: string };

/**
 * Sessão de aula narrada do Professor.
 *
 * Persistida no IndexedDB do usuário (store `metadata`) para permitir
 * interromper e retomar a aula sem perder progresso.
 * O estado pedagógico é leve: nenhuma gravação de áudio é mantida.
 */

export const TEACHER_AUDIO_SESSION_KEY = "teacher-audio-session:v1";
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

export const TeacherAudioSessionStorage = {
  async load(): Promise<TeacherAudioSession | null> {
    const record = await StorageManager.get<MetadataRecord>("metadata", TEACHER_AUDIO_SESSION_KEY);
    return isSession(record?.value) ? record.value : null;
  },

  async save(session: TeacherAudioSession): Promise<TeacherAudioSession> {
    const updated: TeacherAudioSession = { ...session, updatedAt: now() };
    await StorageManager.put("metadata", {
      key: TEACHER_AUDIO_SESSION_KEY,
      value: updated,
      updatedAt: updated.updatedAt,
    } satisfies MetadataRecord);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(TEACHER_AUDIO_SESSION_EVENT, { detail: updated }));
    }
    return updated;
  },

  async remove(): Promise<void> {
    await StorageManager.delete("metadata", TEACHER_AUDIO_SESSION_KEY);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(TEACHER_AUDIO_SESSION_EVENT, { detail: null }));
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
