import { TextNormalizationService } from "./TextNormalizationService";
import type { MediaChapter, TranscriptionSegment } from "./ExtractionTypes";

export const MEDIA_LIMITS = {
  maxAudioBytes: 100 * 1024 * 1024,
  maxVideoBytes: 250 * 1024 * 1024,
  maxTranscriptionDecodeBytes: 60 * 1024 * 1024,
  maxManualTranscriptChars: 200_000,
  maxSubtitleFileBytes: 5 * 1024 * 1024,
} as const;

export const AUDIO_MEDIA_EXTENSIONS = new Set(["mp3", "wav", "m4a"]);
export const VIDEO_MEDIA_EXTENSIONS = new Set(["mp4"]);
export const SUBTITLE_EXTENSIONS = new Set(["srt", "vtt", "txt"]);

const BLOCKED_MIME_PREFIXES = ["text/html", "application/javascript", "text/javascript", "image/svg+xml"];
const BLOCKED_MIMES = new Set([
  "application/x-msdownload",
  "application/x-dosexec",
  "application/x-sh",
  "application/x-executable",
]);

export function getExtension(name: string) {
  return name.split(".").pop()?.toLocaleLowerCase("pt-BR") ?? "";
}

export function isAudioExtension(ext: string) {
  return AUDIO_MEDIA_EXTENSIONS.has(ext);
}

export function isVideoExtension(ext: string) {
  return VIDEO_MEDIA_EXTENSIONS.has(ext);
}

export function isMediaExtension(ext: string) {
  return isAudioExtension(ext) || isVideoExtension(ext);
}

export function hasBlockedMediaMime(file: File) {
  const mime = file.type.toLocaleLowerCase("en").split(";")[0]?.trim() ?? "";
  if (!mime) return false;
  return BLOCKED_MIMES.has(mime) || BLOCKED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

export function isWithinMediaLimit(file: File) {
  if (file.size <= 0) return false;
  const ext = getExtension(file.name);
  if (isAudioExtension(ext)) return file.size <= MEDIA_LIMITS.maxAudioBytes;
  if (isVideoExtension(ext)) return file.size <= MEDIA_LIMITS.maxVideoBytes;
  return true;
}

export function assertMediaSize(file: File) {
  if (file.size <= 0) {
    throw new Error(`O arquivo ${file.name} está vazio.`);
  }
  const ext = getExtension(file.name);
  if (isAudioExtension(ext) && file.size > MEDIA_LIMITS.maxAudioBytes) {
    throw new Error(`O áudio ${file.name} excede o limite de 100 MB.`);
  }
  if (isVideoExtension(ext) && file.size > MEDIA_LIMITS.maxVideoBytes) {
    throw new Error(`O vídeo ${file.name} excede o limite de 250 MB.`);
  }
}

function asciiAt(bytes: Uint8Array, offset: number, length: number) {
  let result = "";
  for (let i = 0; i < length && offset + i < bytes.length; i += 1) {
    result += String.fromCharCode(bytes[offset + i]);
  }
  return result;
}

function looksDangerousHeader(bytes: Uint8Array) {
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true; // MZ (PE/EXE)
  if (bytes.length >= 4 && bytes[0] === 0x7f && asciiAt(bytes, 1, 3) === "ELF") return true;
  if (bytes.length >= 2 && asciiAt(bytes, 0, 2) === "#!") return true;
  if (bytes.length >= 5 && asciiAt(bytes, 0, 5) === "%PDF-") return true;
  const head = asciiAt(bytes, 0, Math.min(bytes.length, 64)).trimStart().toLocaleLowerCase("en");
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<script") || head.startsWith("<svg");
}

function isValidMp3Header(bytes: Uint8Array) {
  if (bytes.length >= 3 && asciiAt(bytes, 0, 3) === "ID3") return true;
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    const versionBits = (bytes[1] >> 3) & 0x03;
    const layerBits = (bytes[1] >> 1) & 0x03;
    return versionBits !== 1 && layerBits !== 0;
  }
  return false;
}

function isValidIsoBmffHeader(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return boxSize >= 8 && asciiAt(bytes, 4, 4) === "ftyp";
}

function isValidWavHeader(bytes: Uint8Array) {
  return bytes.length >= 12 && asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WAVE";
}

export async function validateMediaSignature(file: File, extension: string) {
  assertMediaSize(file);
  if (hasBlockedMediaMime(file)) {
    throw new Error(`Tipo MIME incompatível ou bloqueado para mídia em ${file.name}.`);
  }
  const buffer = await file.slice(0, 64).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (looksDangerousHeader(bytes)) {
    throw new Error(`Conteúdo inválido ou não autorizado detectado em ${file.name}.`);
  }
  const valid =
    extension === "wav" ? isValidWavHeader(bytes) :
    extension === "mp3" ? isValidMp3Header(bytes) :
    extension === "mp4" || extension === "m4a" ? isValidIsoBmffHeader(bytes) :
    false;

  if (!valid) {
    throw new Error(`O arquivo ${file.name} não possui assinatura válida de mídia ${extension.toUpperCase()}.`);
  }
}

function parseTimestamp(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".");
  const parts = cleaned.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function stripCueTags(text: string) {
  return text.replace(/<[^>]{1,120}>/g, " ");
}

function buildManualChapters(segments: readonly TranscriptionSegment[]): MediaChapter[] {
  if (segments.length === 0) return [];
  const totalDuration = segments[segments.length - 1]?.end ?? 0;
  if (totalDuration <= 0) {
    return [{ title: segments[0].text.slice(0, 72) || "Transcrição", start: 0, end: 0 }];
  }
  const chapters: MediaChapter[] = [];
  const bucketSeconds = 300;
  for (let start = 0; start < totalDuration; start += bucketSeconds) {
    const end = Math.min(totalDuration, start + bucketSeconds);
    const first = segments.find((segment) => segment.start >= start && segment.start < end);
    if (!first) continue;
    chapters.push({
      title: first.text.replace(/[.!?].*$/, "").slice(0, 72) || `Trecho ${chapters.length + 1}`,
      start,
      end,
    });
  }
  return chapters;
}

export function parseSubtitleOrTranscript(
  rawText: string,
  durationSeconds?: number,
): {
  text: string;
  segments: TranscriptionSegment[];
  chapters: MediaChapter[];
  source: "manual" | "subtitle";
} {
  const bounded = rawText.replace(/\r\n?/g, "\n").slice(0, MEDIA_LIMITS.maxManualTranscriptChars);
  const lines = bounded.split("\n");
  const segments: TranscriptionSegment[] = [];
  const timingPattern = /^(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)/;

  let hasCueTimestamps = false;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].trim().match(timingPattern);
    if (!match) continue;
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    if (start === null || end === null || end < start) continue;
    hasCueTimestamps = true;
    const cueLines: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor].trim() !== "") {
      cueLines.push(lines[cursor].trim());
      cursor += 1;
    }
    const text = TextNormalizationService.normalizeSentence(stripCueTags(cueLines.join(" ")));
    if (text) segments.push({ start, end, text });
    index = cursor;
  }

  if (hasCueTimestamps && segments.length > 0) {
    const text = TextNormalizationService.normalize(segments.map((segment) => segment.text).join(" "));
    return {
      text,
      segments,
      chapters: buildManualChapters(segments),
      source: "subtitle",
    };
  }

  const normalized = TextNormalizationService.normalize(stripCueTags(bounded));
  if (!normalized) {
    throw new Error("A transcrição ou legenda não contém texto utilizável.");
  }
  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const effectiveDuration = durationSeconds && durationSeconds > 0 ? durationSeconds : 0;
  const fallbackSegments: TranscriptionSegment[] = paragraphs.map((paragraph, index) => {
    const slice = effectiveDuration > 0 ? effectiveDuration / paragraphs.length : 0;
    return {
      start: Math.round(index * slice * 10) / 10,
      end: Math.round((index + 1) * slice * 10) / 10,
      text: paragraph,
    };
  });

  return {
    text: normalized,
    segments: fallbackSegments,
    chapters: buildManualChapters(fallbackSegments),
    source: "manual",
  };
}

export function formatMediaDuration(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}
