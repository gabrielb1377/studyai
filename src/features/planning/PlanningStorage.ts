import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { StorageManager } from "@/lib/storage/StorageManager";
import { sanitizeStudyPlan } from "./PlanningValidation";
import type { StudyPlan } from "./types";

const PLAN_METADATA_KEY = "study-plan-v1";
export const PLANNING_UPDATED_EVENT = "studyai:planning-updated";

type StudyPlanMetadataRecord = {
  key: typeof PLAN_METADATA_KEY;
  value: StudyPlan | null;
  updatedAt: string;
};

export const PlanningStorage = {
  async load(): Promise<StudyPlan | null> {
    const session = SessionOperationManager.current();
    if (session.suspended) return null;

    const record = await StorageManager.get<StudyPlanMetadataRecord>("metadata", PLAN_METADATA_KEY);
    return sanitizeStudyPlan(record?.value);
  },

  async save(plan: StudyPlan): Promise<StudyPlan> {
    const sanitized = sanitizeStudyPlan(plan);
    if (!sanitized) {
      throw new Error("O plano de estudos possui dados inválidos para salvar.");
    }

    const operation = SessionOperationManager.start();
    try {
      const updated = {
        ...sanitized,
        updatedAt: new Date().toISOString(),
      };
      const record = await StorageManager.updateMetadata<StudyPlanMetadataRecord>(
        PLAN_METADATA_KEY,
        () => {
          operation.assertCurrent();
          return {
            key: PLAN_METADATA_KEY,
            value: updated,
            updatedAt: updated.updatedAt,
          };
        },
      );
      operation.assertCurrent();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(PLANNING_UPDATED_EVENT));
      }
      return record.value ?? updated;
    } finally {
      operation.release();
    }
  },

  async clear(): Promise<void> {
    const operation = SessionOperationManager.start();
    try {
      await StorageManager.updateMetadata<StudyPlanMetadataRecord>(PLAN_METADATA_KEY, () => {
        operation.assertCurrent();
        return {
          key: PLAN_METADATA_KEY,
          value: null,
          updatedAt: new Date().toISOString(),
        };
      });
      operation.assertCurrent();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(PLANNING_UPDATED_EVENT));
      }
    } finally {
      operation.release();
    }
  },
};
