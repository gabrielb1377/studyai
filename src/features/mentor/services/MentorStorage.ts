import { StorageManager } from "@/lib/storage/StorageManager";
import type { MentorSnapshot } from "../types";

const KEY = "mentor:v1";
export const MENTOR_UPDATED_EVENT = "studyai:mentor-updated";

type StoredMentor = { key: typeof KEY; value: MentorSnapshot; updatedAt: string };

function empty(): MentorSnapshot {
  return { goals: [], sessions: [], recommendations: [], updatedAt: new Date().toISOString() };
}

function normalize(value: unknown): MentorSnapshot {
  if (!value || typeof value !== "object") return empty();
  const snapshot = value as Partial<MentorSnapshot>;
  return {
    goals: Array.isArray(snapshot.goals) ? snapshot.goals : [],
    sessions: Array.isArray(snapshot.sessions) ? snapshot.sessions : [],
    recommendations: Array.isArray(snapshot.recommendations) ? snapshot.recommendations : [],
    updatedAt: typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : new Date().toISOString(),
  };
}

export const MentorStorage = {
  async load() {
    const record = await StorageManager.get<StoredMentor>("metadata", KEY);
    return normalize(record?.value);
  },

  async save(snapshot: MentorSnapshot) {
    const next = { ...snapshot, updatedAt: new Date().toISOString() };
    await StorageManager.put("metadata", { key: KEY, value: next, updatedAt: next.updatedAt } satisfies StoredMentor);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(MENTOR_UPDATED_EVENT));
    return next;
  },
};

