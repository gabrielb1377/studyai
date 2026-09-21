import { StorageManager } from "@/lib/storage/StorageManager";
import type { KnowledgeGraph } from "./types";

export const KNOWLEDGE_UPDATED_EVENT = "studyai:knowledge-updated";

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(KNOWLEDGE_UPDATED_EVENT));
}

export const KnowledgeStorage = {
  async load() {
    return await StorageManager.getAll<KnowledgeGraph>("knowledge");
  },
  async getByFileId(fileId: string) {
    return (await this.load()).find((graph) => graph.fileId === fileId) ?? null;
  },
  async getByStudyId(studyId: string) {
    return (await this.load()).filter((graph) => graph.studyId === studyId);
  },
  async upsert(graph: KnowledgeGraph) {
    await StorageManager.put("knowledge", graph);
    emit();
    return graph;
  },
  async updateFile(fileId: string, changes: { studyId?: string; documentName?: string }) {
    const graph = await this.getByFileId(fileId);
    if (!graph) return null;
    const concepts = graph.concepts.map((concept) => ({
      ...concept,
      ...(changes.studyId ? { studyId: changes.studyId } : {}),
      ...(changes.documentName ? { document: changes.documentName } : {}),
    }));
    const chunks = graph.chunks.map((chunk) => ({
      ...chunk,
      ...(changes.studyId ? { studyId: changes.studyId } : {}),
      metadata: changes.documentName ? { ...chunk.metadata, sourceName: changes.documentName } : chunk.metadata,
    }));
    return this.upsert({ ...graph, ...changes, concepts, chunks, updatedAt: new Date().toISOString() });
  },
  async removeByFileId(fileId: string) {
    const graph = await this.getByFileId(fileId);
    if (!graph) return;
    await StorageManager.delete("knowledge", graph.id);
    emit();
  },
};
