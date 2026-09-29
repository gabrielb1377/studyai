import { LearningService } from "@/features/learning/LearningService";
import { StudyEngine, STUDY_UPDATED_EVENT } from "@/features/study/services/StudyEngine";
import { StorageManager } from "@/lib/storage/StorageManager";
import { MATERIALS_UPDATED_EVENT } from "@/services/material-service";
import type { Material } from "@/types/material";
import type { StudyRecord } from "@/types/study-engine";
import { AcademyStorage } from "../storage/AcademyStorage";
import type { AcademyStudy, AcademyWorkspaceContract, CreateAcademyStudyInput } from "../types";
import { normalizeAcademyStudyInput, validateAcademyStudy } from "../validation/academy-validation";

function id(prefix: string) {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}

function emitIntegrations() {
  if (typeof window === "undefined") return;
  AcademyStorage.emitUpdate();
  window.dispatchEvent(new Event(MATERIALS_UPDATED_EVENT));
  window.dispatchEvent(new Event(STUDY_UPDATED_EVENT));
}

function workspaceContract(study: AcademyStudy): AcademyWorkspaceContract {
  return {
    version: 1,
    sourceType: "academy",
    academyStudyId: study.id,
    studyId: study.id,
    preferredPanel: "overview",
  };
}

export const AcademyService = {
  list: AcademyStorage.list,
  get: AcademyStorage.get,

  async create(rawInput: CreateAcademyStudyInput) {
    const input = normalizeAcademyStudyInput(rawInput);
    const validation = validateAcademyStudy(input);
    if (!validation.success) {
      const error = new Error("Revise os campos do estudo livre.");
      Object.assign(error, { fieldErrors: validation.errors });
      throw error;
    }

    const now = new Date().toISOString();
    const academyId = id("academy");
    const materialId = id("material");
    const academyStudy: AcademyStudy = {
      id: academyId,
      title: input.title ?? input.topic,
      topic: input.topic,
      subject: input.subject,
      level: input.level,
      goal: input.goal,
      duration: input.duration,
      language: input.language,
      depth: input.depth,
      style: input.style,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      sourceType: "ai-generated",
      modules: [],
      progress: 0,
      contents: [],
      exports: [],
    };
    const material: Material = {
      id: materialId,
      fileId: materialId,
      identity: `academy:${academyId}`,
      name: academyStudy.title,
      relativePath: `Academy/${academyStudy.subject}/${academyStudy.topic}`,
      fileType: "txt",
      mimeType: "application/x-studyai-academy",
      size: 0,
      lastModified: Date.now(),
      importedAt: now,
      updatedAt: now,
      progress: 0,
      status: "ready",
      isFavorite: false,
      studyId: academyId,
      subject: academyStudy.subject,
      topic: academyStudy.topic,
      persistentBinary: false,
      sourceType: "ai-generated",
      academyStudyId: academyId,
      academyMaterialKind: "free-study",
      tags: ["Academy", "Estudo livre"],
    };
    const study: StudyRecord = {
      studyId: academyId,
      title: academyStudy.topic,
      subject: academyStudy.subject,
      materialIds: [materialId],
      status: "not_started",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      language: academyStudy.language,
      readingTimeMinutes: academyStudy.duration,
    };

    await StorageManager.transaction(["academy", "documents", "studies"], async (storage) => {
      await storage.put("academy", academyStudy);
      await storage.put("documents", material);
      await storage.put("studies", study);
    });
    await LearningService.registerStudy({
      studyId: academyId,
      subject: academyStudy.subject,
      topic: academyStudy.topic,
      goal: academyStudy.goal,
      estimatedMinutes: academyStudy.duration,
      progress: 0,
      createdAt: now,
    });
    emitIntegrations();
    return { academyStudy, material, study, workspace: workspaceContract(academyStudy) };
  },

  workspaceContract,

  async activate(studyId: string) {
    const study = await AcademyStorage.get(studyId);
    if (!study) throw new Error("O estudo livre não foi encontrado.");
    const records = await StudyEngine.load();
    await StudyEngine.save(StudyEngine.recordAccess(records, studyId));
    return { study, workspace: workspaceContract(study) };
  },

  async beginContent(studyId: string) {
    const academyStudy = await AcademyStorage.get(studyId);
    if (!academyStudy) throw new Error("O estudo livre não foi encontrado.");
    const now = new Date().toISOString();
    const progress = Math.max(academyStudy.progress, 5);
    const updatedStudy: AcademyStudy = {
      ...academyStudy,
      status: academyStudy.status === "completed" ? "completed" : "in-progress",
      progress,
      modules: academyStudy.modules.map((module, index) => index === 0 && module.status === "not-started"
        ? { ...module, status: "in-progress", progress: Math.max(module.progress, 5) }
        : module),
      updatedAt: now,
    };
    const records = await StudyEngine.load();
    const updatedRecords = StudyEngine.recordAccess(
      StudyEngine.setProgress(records, studyId, progress, now),
      studyId,
      now,
    );
    const materials = await StorageManager.getAll<Material>("documents");
    const updatedMaterials = materials
      .filter((material) => material.studyId === studyId)
      .map((material) => ({ ...material, progress: Math.max(material.progress, progress), updatedAt: now }));
    const updatedRecord = updatedRecords.find((record) => record.studyId === studyId);

    await StorageManager.transaction(["academy", "studies", "documents"], async (storage) => {
      await storage.put("academy", updatedStudy);
      if (updatedRecord) await storage.put("studies", updatedRecord);
      for (const material of updatedMaterials) await storage.put("documents", material);
    });
    await LearningService.registerStudy({
      studyId,
      subject: updatedStudy.subject,
      topic: updatedStudy.topic,
      goal: updatedStudy.goal,
      estimatedMinutes: updatedStudy.duration,
      progress,
      createdAt: now,
    });
    return updatedStudy;
  },
};
