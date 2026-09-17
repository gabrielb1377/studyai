import type { DocumentSection } from "@/features/extraction/ExtractionTypes";
import type { StudyChapter, StudyChapterMarker } from "@/types/study-engine";
import type { TopicDetection } from "../types";
import { normalizeForDetection } from "./SubjectDetector";

const MARKER_PATTERN = /^(OBJETIVOS?|INTRODU[CÇ][AÃ]O|UNIDADE(?:\s+(?:[IVXLCDM]+|\d+))?|CAP[IÍ]TULO(?:\s+(?:[IVXLCDM]+|\d+))?|SE[CÇ][AÃ]O(?:\s+(?:[IVXLCDM]+|\d+))?|ATIVIDADES?|EXERC[IÍ]CIOS?|CONCLUS[AÃ]O|REFER[EÊ]NCIAS?)\b\s*(?:[-–—:]\s*)?(.*)$/iu;
const INLINE_MARKER_PATTERN = /\b(OBJETIVOS?|INTRODU[CÇ][AÃ]O|UNIDADE(?:\s+(?:[IVXLCDM]+|\d+))?|CAP[IÍ]TULO(?:\s+(?:[IVXLCDM]+|\d+))?|SE[CÇ][AÃ]O(?:\s+(?:[IVXLCDM]+|\d+))?|ATIVIDADES?|EXERC[IÍ]CIOS?|CONCLUS[AÃ]O|REFER[EÊ]NCIAS?)\b(?:\s*[-–—:]\s*([^\n.!?]{3,100}))?/giu;
const GENERIC_TITLES = new Set(["arquivo", "documento", "material", "digitalizado", "scan", "sem titulo"]);

function cleanFileTitle(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values: readonly string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeForDetection(value).trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function markerFrom(label: string): StudyChapterMarker {
  const normalized = normalizeForDetection(label);
  if (normalized.startsWith("objetivo")) return "objectives";
  if (normalized.startsWith("introducao")) return "introduction";
  if (normalized.startsWith("unidade")) return "unit";
  if (normalized.startsWith("capitulo")) return "chapter";
  if (normalized.startsWith("secao")) return "section";
  if (normalized.startsWith("atividade")) return "activities";
  if (normalized.startsWith("exercicio")) return "exercises";
  if (normalized.startsWith("conclusao")) return "conclusion";
  return "references";
}

function parseMarker(value: string) {
  const match = value.replace(/^#+\s*/, "").trim().match(MARKER_PATTERN);
  if (!match) return null;
  const label = match[1].replace(/\s+/g, " ").trim();
  const detail = match[2]?.replace(/\s+/g, " ").trim();
  return { label, detail, marker: markerFrom(label) };
}

function markerCandidates(text: string, sections: readonly DocumentSection[]) {
  const candidates: Array<{ value: string; page?: number; slide?: number }> = [];
  for (const section of sections) {
    const lines = section.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const [index, line] of lines.entries()) {
      const marker = parseMarker(line);
      if (!marker) continue;
      const next = lines[index + 1];
      const value = !marker.detail && next && next.length <= 100 && !parseMarker(next)
        ? `${marker.label}: ${next}`
        : line;
      candidates.push({ value, page: section.page, slide: section.slide });
    }
  }

  for (const match of text.matchAll(INLINE_MARKER_PATTERN)) {
    candidates.push({ value: `${match[1]}${match[2] ? `: ${match[2].trim()}` : ""}` });
  }
  return candidates;
}

function createChapters(text: string, sections: readonly DocumentSection[]): StudyChapter[] {
  const seen = new Set<string>();
  const chapters: StudyChapter[] = [];
  for (const candidate of markerCandidates(text, sections)) {
    const parsed = parseMarker(candidate.value);
    if (!parsed) continue;
    const displayTitle = parsed.detail ? `${parsed.label}: ${parsed.detail}` : parsed.label;
    const key = `${normalizeForDetection(displayTitle)}:${candidate.page ?? ""}:${candidate.slide ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chapters.push({
      id: `chapter-${chapters.length + 1}`,
      title: displayTitle,
      marker: parsed.marker,
      order: chapters.length,
      page: candidate.page,
      slide: candidate.slide,
    });
  }
  return chapters;
}

function chapterTopic(chapter: StudyChapter) {
  if (!(["unit", "chapter", "section"] as StudyChapterMarker[]).includes(chapter.marker)) return undefined;
  const parsed = parseMarker(chapter.title);
  return parsed?.detail;
}

export const TopicDetector = {
  detect(fileName: string, text: string, sections: readonly DocumentSection[] = []): TopicDetection {
    const headings = sections
      .filter((section) => section.type === "title" || section.type === "heading")
      .map((section) => section.text.replace(/^#+\s*/, "").trim())
      .filter(Boolean);
    const meaningfulHeadings = headings.filter((heading) => !parseMarker(heading));
    const fileTitle = cleanFileTitle(fileName);
    const titleCandidate = meaningfulHeadings[0] || fileTitle;
    const title = GENERIC_TITLES.has(normalizeForDetection(titleCandidate)) ? "Documento sem título" : titleCandidate;
    const chapters = createChapters(text, sections);
    const structuralTopic = chapters.map(chapterTopic).find(Boolean);
    const headingTopic = meaningfulHeadings.find((heading) => normalizeForDetection(heading) !== normalizeForDetection(title));
    const fallbackTopic = GENERIC_TITLES.has(normalizeForDetection(fileTitle)) ? "Tema desconhecido" : title;
    const topic = structuralTopic || headingTopic || fallbackTopic;
    const chapterDetails = chapters.map(chapterTopic).filter((value): value is string => Boolean(value));
    const subtopics = unique([
      ...chapterDetails,
      ...meaningfulHeadings.filter((heading) => normalizeForDetection(heading) !== normalizeForDetection(title)),
    ]).filter((value) => normalizeForDetection(value) !== normalizeForDetection(topic)).slice(0, 16);

    return { title, topic, subtopics, chapters };
  },

  isStructuralMarker(value: string) {
    return Boolean(parseMarker(value));
  },
};

