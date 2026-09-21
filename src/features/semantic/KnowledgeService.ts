import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { KnowledgeGraphBuilder, SEMANTIC_PARSER_VERSION } from "./KnowledgeGraphBuilder";
import { KnowledgeStorage } from "./KnowledgeStorage";
import { SemanticParser } from "./SemanticParser";

async function yieldToMainThread() {
  const scheduler = (globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) await scheduler.yield();
  else await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export const KnowledgeService = {
  async process(content: ExtractedContent) {
    const previous = await KnowledgeStorage.getByFileId(content.fileId);
    const sourceHash = KnowledgeGraphBuilder.sourceHash(content);
    if (previous?.sourceHash === sourceHash && previous.parserVersion === SEMANTIC_PARSER_VERSION) {
      return { graph: previous, reused: true };
    }
    await yieldToMainThread();
    const parsed = SemanticParser.parse(content);
    await yieldToMainThread();
    const graph = KnowledgeGraphBuilder.build(content, parsed, previous ?? undefined);
    await KnowledgeStorage.upsert(graph);
    return { graph, reused: false };
  },

  async statistics() {
    const graphs = await KnowledgeStorage.load();
    return graphs.reduce((total, graph) => ({
      documents: total.documents + 1,
      concepts: total.concepts + graph.statistics.conceptCount,
      relations: total.relations + graph.statistics.relationCount,
      chapters: total.chapters + graph.statistics.chapterCount,
      isolated: total.isolated + graph.statistics.isolatedConceptCount,
    }), { documents: 0, concepts: 0, relations: 0, chapters: 0, isolated: 0 });
  },
};
