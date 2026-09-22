import type { MentorGoal, MentorGoalType } from "../types";
import { MentorStorage } from "./MentorStorage";

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export const GoalManager = {
  async create(input: { title: string; type: MentorGoalType; studyId?: string; targetAt?: string; targetMinutes?: number }) {
    const snapshot = await MentorStorage.load();
    const now = new Date().toISOString();
    const goal: MentorGoal = {
      id: `mentor-goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: input.title.trim(),
      type: input.type,
      studyId: input.studyId,
      targetAt: input.targetAt,
      targetMinutes: input.targetMinutes,
      progress: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await MentorStorage.save({ ...snapshot, goals: [goal, ...snapshot.goals] });
    return goal;
  },

  async update(id: string, changes: Partial<Pick<MentorGoal, "title" | "targetAt" | "targetMinutes" | "progress" | "status">>) {
    const snapshot = await MentorStorage.load();
    const goals = snapshot.goals.map((goal) => goal.id === id ? {
      ...goal,
      ...changes,
      progress: changes.progress === undefined ? goal.progress : clamp(changes.progress),
      updatedAt: new Date().toISOString(),
    } : goal);
    return MentorStorage.save({ ...snapshot, goals });
  },

  async remove(id: string) {
    const snapshot = await MentorStorage.load();
    return MentorStorage.save({ ...snapshot, goals: snapshot.goals.filter((goal) => goal.id !== id) });
  },
};
