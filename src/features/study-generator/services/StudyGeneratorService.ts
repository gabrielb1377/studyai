import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { MaterialService } from "@/services/material-service";
import type { Material } from "@/types/material";
import { StudyAnalyzer } from "./StudyAnalyzer";
import { isGenericSubject } from "./SubjectDetector";

function shouldPreserveFolderOrganization(material: Material) {
  return material.relativePath.split("/").filter(Boolean).length >= 3;
}

export const StudyGeneratorService = {
  async generate(record: ExtractedContent, material: Material | null) {
    const analysis = StudyAnalyzer.analyze({
      fileName: record.metadata.name,
      text: record.extractedText,
      sections: record.sections,
      metadata: record.metadata,
      fallbackSubject: material?.subject,
    });
    const preserveOrganization = material ? shouldPreserveFolderOrganization(material) : false;
    const subject = preserveOrganization && !isGenericSubject(material?.subject)
      ? material!.subject!
      : analysis.subject;
    const topic = preserveOrganization && material?.topic
      ? material.topic
      : analysis.topic;
    const enrichedRecord: ExtractedContent = {
      ...record,
      metadata: { ...record.metadata, ...analysis, subject, topic },
      status: "extracted",
    };

    let updatedMaterial = material;
    if (material) {
      updatedMaterial = await MaterialService.update(material.id, { subject, topic });
      if (updatedMaterial) {
        const synchronized = StudyEngine.syncMaterial(await StudyEngine.load(), updatedMaterial);
        await StudyEngine.save(StudyEngine.applyAnalysis(synchronized, record.studyId, {
          initialSummary: analysis.summaryPreview,
          detectedTitle: analysis.title,
          detectedSubject: analysis.subject,
          detectedTopic: analysis.topic,
          keywords: analysis.keywords,
          language: analysis.language,
          subtopics: analysis.subtopics,
          chapters: analysis.chapters,
          pageCount: analysis.pageCount,
          wordCount: analysis.wordCount,
          readingTimeMinutes: analysis.readingTimeMinutes,
          analysisStatus: analysis.analysisStatus,
          analyzedAt: analysis.analyzedAt,
        }, { subject, topic }));
      }
    } else {
      await StudyEngine.save(StudyEngine.applyAnalysis(await StudyEngine.load(), record.studyId, {
        initialSummary: analysis.summaryPreview,
        detectedTitle: analysis.title,
        detectedSubject: analysis.subject,
        detectedTopic: analysis.topic,
        keywords: analysis.keywords,
        language: analysis.language,
        subtopics: analysis.subtopics,
        chapters: analysis.chapters,
        pageCount: analysis.pageCount,
        wordCount: analysis.wordCount,
        readingTimeMinutes: analysis.readingTimeMinutes,
        analysisStatus: analysis.analysisStatus,
        analyzedAt: analysis.analyzedAt,
      }, { subject, topic }));
    }

    return {
      record: enrichedRecord,
      material: updatedMaterial,
      logs: [
        `Documento analisado: ${record.metadata.name}.`,
        `Tema criado: ${topic}.`,
        analysis.chapters.length > 0
          ? `${analysis.chapters.length} capítulos ou seções identificados.`
          : "Capítulos não encontrados; estrutura básica criada.",
        `Study criado ou atualizado: ${record.studyId}.`,
      ],
    };
  },
};

