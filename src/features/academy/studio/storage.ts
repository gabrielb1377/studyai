import { StorageManager } from "@/lib/storage/StorageManager";
import type { StudioDocument } from "./types";

export const STUDIO_UPDATED_EVENT = "studyai:studio-updated";
const STUDIO_STORE = "studio-documents";

function emitUpdate() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STUDIO_UPDATED_EVENT));
}

function isStudioDocument(value: unknown): value is StudioDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<StudioDocument>;
  return (
    typeof doc.id === "string" &&
    typeof doc.studyId === "string" &&
    typeof doc.title === "string" &&
    typeof doc.type === "string" &&
    typeof doc.template === "string" &&
    typeof doc.customization === "object" &&
    typeof doc.version === "number" &&
    typeof doc.status === "string" &&
    typeof doc.createdAt === "string" &&
    typeof doc.updatedAt === "string"
  );
}

export const StudioStorage = {
  async list(studyId?: string) {
    const documents = await StorageManager.getAll<unknown>(STUDIO_STORE);
    const filtered = documents.filter(isStudioDocument);
    if (studyId) {
      return filtered.filter((doc) => doc.studyId === studyId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
    return filtered.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  },

  async get(id: string) {
    const document = await StorageManager.get<unknown>(STUDIO_STORE, id);
    return isStudioDocument(document) ? document : null;
  },

  async put(document: StudioDocument) {
    const now = new Date().toISOString();
    const updatedDocument = {
      ...document,
      version: document.version + 1,
      updatedAt: now,
    };
    await StorageManager.put(STUDIO_STORE, updatedDocument);
    emitUpdate();
    return updatedDocument;
  },

  async create(document: Omit<StudioDocument, "id" | "version" | "createdAt" | "updatedAt">) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record: StudioDocument = {
      ...document,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await StorageManager.put(STUDIO_STORE, record);
    emitUpdate();
    return record;
  },

  async remove(id: string) {
    await StorageManager.delete(STUDIO_STORE, id);
    emitUpdate();
  },

  async duplicate(id: string) {
    const original = await this.get(id);
    if (!original) throw new Error("Documento não encontrado");
    const duplicated = await this.create({
      ...original,
      title: `${original.title} (cópia)`,
      status: "draft",
    });
    return duplicated;
  },

  async getByStudyId(studyId: string) {
    const all = await this.list(studyId);
    return all;
  },
};