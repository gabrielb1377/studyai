/**
 * Cliente HTTP do serviço de aula narrada.
 *
 * O navegador nunca chama o AI Core diretamente: as chamadas passam pela
 * rota interna `/api/teacher/audio-lesson`, que aplica as chaves individuais
 * (BYOK) do usuário e o fallback do servidor.
 */

import type { TeacherRequest } from "../types";

export type NarratedLessonStep = {
  title: string;
  spoken: string;
  original: string;
  kind: "introduction" | "explanation" | "example" | "exercise" | "correction" | "summary";
  exercisePrompt?: string;
};

export type NarratedLessonPlan = {
  topic: string;
  steps: NarratedLessonStep[];
};

export type ExerciseCorrection = {
  originalText: string;
  suggestedText: string;
  explanation: string;
  action: string;
  correct: boolean;
};

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const csrf = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("studyai_csrf="))?.split("=").slice(1).join("=") ?? "";
  const response = await fetch("/api/teacher/audio-lesson", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error || "Não foi possível consultar o Professor.");
  return data as T;
}

export const TeacherAudioLessonClient = {
  async plan(input: { topic: string; context?: string; teaching: TeacherRequest; steps?: number }): Promise<NarratedLessonPlan> {
    return post<NarratedLessonPlan>({ action: "plan", ...input });
  },

  async alternative(input: { topic: string; previousExplanation: string; teaching: TeacherRequest }): Promise<string> {
    const data = await post<{ alternative: string }>({ action: "alternative", ...input });
    return data.alternative;
  },

  async correction(input: { question: string; studentAnswer: string; teaching: TeacherRequest }): Promise<ExerciseCorrection> {
    return post<ExerciseCorrection>({ action: "correction", ...input });
  },
};
