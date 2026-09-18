import { StorageManager } from "@/lib/storage/StorageManager";
import type { LearningProfile } from "./types";

const PROFILE_KEY = "learning-profile:v1";

type ProfileRecord = {
  key: typeof PROFILE_KEY;
  value: LearningProfile;
  updatedAt: string;
};

function isProfile(value: unknown): value is LearningProfile {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Partial<LearningProfile>;
  return profile.id === "local-user" && typeof profile.totalStudyMinutes === "number" &&
    typeof profile.timeBySubject === "object" && profile.timeBySubject !== null &&
    typeof profile.topics === "object" && profile.topics !== null &&
    typeof profile.flashcardsAnswered === "number" && typeof profile.quizzesCompleted === "number" &&
    typeof profile.correctAnswers === "number" && typeof profile.wrongAnswers === "number" &&
    typeof profile.averageScore === "number" && Array.isArray(profile.activeDates) &&
    typeof profile.streak === "number" && Array.isArray(profile.activities) &&
    typeof profile.createdAt === "string" && typeof profile.updatedAt === "string";
}

export function createEmptyLearningProfile(now = new Date().toISOString()): LearningProfile {
  return {
    id: "local-user",
    totalStudyMinutes: 0,
    timeBySubject: {},
    topics: {},
    flashcardsAnswered: 0,
    quizzesCompleted: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    averageScore: 0,
    activeDates: [],
    streak: 0,
    activities: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const LearningStorage = {
  async load() {
    const record = await StorageManager.get<ProfileRecord>("metadata", PROFILE_KEY);
    return isProfile(record?.value) ? record.value : createEmptyLearningProfile();
  },

  async save(profile: LearningProfile) {
    await StorageManager.put("metadata", {
      key: PROFILE_KEY,
      value: profile,
      updatedAt: profile.updatedAt,
    } satisfies ProfileRecord);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("studyai:learning-updated"));
  },
};
