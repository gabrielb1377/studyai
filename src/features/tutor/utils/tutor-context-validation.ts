import type { TutorStudyContext } from "@/types/tutor-context";

export function isTutorStudyContext(value: unknown): value is TutorStudyContext {
  if (typeof value !== "object" || value === null) return false;
  const context = value as Partial<TutorStudyContext>;
  const validDocument = context.document === undefined || (
    typeof context.document === "object" && context.document !== null &&
    (context.document.title === undefined || typeof context.document.title === "string") &&
    (context.document.subject === undefined || typeof context.document.subject === "string") &&
    (context.document.topic === undefined || typeof context.document.topic === "string") &&
    (context.document.summaryPreview === undefined || typeof context.document.summaryPreview === "string") &&
    (context.document.language === undefined || typeof context.document.language === "string") &&
    Array.isArray(context.document.keywords) && context.document.keywords.every((keyword) => typeof keyword === "string") &&
    Array.isArray(context.document.subtopics) && context.document.subtopics.every((subtopic) => typeof subtopic === "string") &&
    typeof context.document.chapterCount === "number" &&
    Array.isArray(context.document.chapters) && context.document.chapters.every((chapter) =>
      typeof chapter === "object" && chapter !== null &&
      typeof chapter.title === "string" && typeof chapter.marker === "string" &&
      (chapter.page === undefined || typeof chapter.page === "number") &&
      (chapter.slide === undefined || typeof chapter.slide === "number"),
    )
  );
  const validLearning = context.learning === undefined || (
    typeof context.learning === "object" && context.learning !== null &&
    typeof context.learning.knowledge === "number" &&
    typeof context.learning.confidence === "number" &&
    (context.learning.mastery === "Iniciante" || context.learning.mastery === "Intermediário" || context.learning.mastery === "Avançado") &&
    (context.learning.classification === "difficult" || context.learning.classification === "forgotten" || context.learning.classification === "strong" || context.learning.classification === "never_studied" || context.learning.classification === "developing") &&
    (context.learning.priority === "Alta" || context.learning.priority === "Média" || context.learning.priority === "Baixa") &&
    Array.isArray(context.learning.reasons) && context.learning.reasons.every((reason) => typeof reason === "string")
  );
  const validKnowledge = context.knowledge === undefined || (
    typeof context.knowledge === "object" && context.knowledge !== null &&
    typeof context.knowledge.relationshipCount === "number" &&
    Array.isArray(context.knowledge.matchedConcepts) && context.knowledge.matchedConcepts.every((concept) =>
      typeof concept === "object" && concept !== null &&
      typeof concept.name === "string" && typeof concept.description === "string" &&
      Array.isArray(concept.aliases) && concept.aliases.every((alias) => typeof alias === "string") &&
      Array.isArray(concept.relatedConcepts) && concept.relatedConcepts.every((related) => typeof related === "string"),
    )
  );
  const validMentor = context.mentor === undefined || (
    typeof context.mentor === "object" && context.mentor !== null &&
    (context.mentor.lastSessionStatus === undefined || context.mentor.lastSessionStatus === "active" || context.mentor.lastSessionStatus === "paused" || context.mentor.lastSessionStatus === "completed") &&
    (context.mentor.lastSessionAt === undefined || typeof context.mentor.lastSessionAt === "string") &&
    Array.isArray(context.mentor.recommendations) && context.mentor.recommendations.every((recommendation) =>
      typeof recommendation === "object" && recommendation !== null &&
      typeof recommendation.title === "string" && typeof recommendation.reason === "string" &&
      (recommendation.priority === "Alta" || recommendation.priority === "Média" || recommendation.priority === "Baixa"),
    )
  );

  const validMemory = context.memory === undefined || (
    typeof context.memory === "object" && context.memory !== null &&
    typeof context.memory.enabled === "boolean" &&
    (context.memory.explanationLevel === undefined ||
      context.memory.explanationLevel === "basic" ||
      context.memory.explanationLevel === "intermediate" ||
      context.memory.explanationLevel === "advanced" ||
      context.memory.explanationLevel === "technical") &&
    Array.isArray(context.memory.items) &&
    context.memory.items.length <= 5 &&
    context.memory.items.every((item) =>
      typeof item === "object" && item !== null &&
      (item.category === "preference" || item.category === "goal" || item.category === "difficulty" || item.category === "continuity" || item.category === "milestone") &&
      (item.source === "explicit" || item.source === "session") &&
      typeof item.title === "string" && item.title.length <= 120 &&
      typeof item.content === "string" && item.content.length <= 320 &&
      typeof item.updatedAt === "string" &&
      (item.stale === undefined || typeof item.stale === "boolean"),
    ) &&
    (context.memory.pendingErrors === undefined || (
      Array.isArray(context.memory.pendingErrors) &&
      context.memory.pendingErrors.length <= 5 &&
      context.memory.pendingErrors.every((entry) =>
        typeof entry === "object" && entry !== null &&
        typeof entry.topic === "string" && entry.topic.length <= 100 &&
        typeof entry.prompt === "string" && entry.prompt.length <= 200 &&
        typeof entry.occurrences === "number",
      )
    ))
  );

  const validMedia = context.media === undefined || (
    Array.isArray(context.media) &&
    context.media.length <= 20 &&
    context.media.every((item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.name === "string" &&
      item.name.trim().length > 0 &&
      item.name.length <= 240 &&
      (item.type === "audio" || item.type === "video") &&
      (item.durationSeconds === undefined ||
        (typeof item.durationSeconds === "number" && Number.isFinite(item.durationSeconds) && item.durationSeconds >= 0)) &&
      typeof item.hasTranscription === "boolean" &&
      (item.transcriptionSource === undefined ||
        item.transcriptionSource === "automatic" ||
        item.transcriptionSource === "manual" ||
        item.transcriptionSource === "subtitle"),
    )
  );

  return typeof context.studyId === "string" && typeof context.title === "string" &&
    typeof context.subject === "string" && typeof context.topic === "string" &&
    typeof context.progress === "number" &&
    (context.status === "not_started" || context.status === "in_progress" || context.status === "completed") &&
    Array.isArray(context.notes) && context.notes.every((note) =>
      typeof note === "object" && note !== null && typeof note.title === "string" && typeof note.content === "string",
    ) && (context.summary === undefined || (
      typeof context.summary === "object" && context.summary !== null &&
      typeof context.summary.title === "string" && typeof context.summary.content === "string"
    )) && validDocument && validLearning && validKnowledge && validMentor && validMemory && validMedia;
}
