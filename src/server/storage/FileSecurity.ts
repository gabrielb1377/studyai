import "server-only";

export const MAX_FILE_BYTES = 100 * 1024 * 1024;

type FileFamily =
  | "pdf"
  | "png"
  | "jpeg"
  | "webp"
  | "mp3"
  | "wav"
  | "m4a"
  | "mp4"
  | "docx"
  | "pptx"
  | "text";

type FilePolicy = {
  family: FileFamily;
  canonicalMime: string;
  inlineSafe: boolean;
};

const BLOCKED_EXTENSIONS = new Set([
  "html",
  "htm",
  "xhtml",
  "svg",
  "svgz",
  "js",
  "mjs",
  "cjs",
  "xml",
  "exe",
  "dll",
  "bat",
  "cmd",
  "sh",
  "ps1",
  "msi",
  "php",
  "jsp",
  "asp",
  "aspx",
]);

const BLOCKED_MIMES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/javascript",
  "text/javascript",
  "application/ecmascript",
  "text/ecmascript",
  "application/xml",
  "text/xml",
  "application/x-msdownload",
  "application/x-dosexec",
  "application/x-sh",
  "application/x-executable",
]);

const MIME_POLICIES: Record<string, FilePolicy> = {
  "application/pdf": { family: "pdf", canonicalMime: "application/pdf", inlineSafe: true },
  "image/png": { family: "png", canonicalMime: "image/png", inlineSafe: true },
  "image/jpeg": { family: "jpeg", canonicalMime: "image/jpeg", inlineSafe: true },
  "image/jpg": { family: "jpeg", canonicalMime: "image/jpeg", inlineSafe: true },
  "image/webp": { family: "webp", canonicalMime: "image/webp", inlineSafe: true },
  "audio/mpeg": { family: "mp3", canonicalMime: "audio/mpeg", inlineSafe: true },
  "audio/mp3": { family: "mp3", canonicalMime: "audio/mpeg", inlineSafe: true },
  "audio/wav": { family: "wav", canonicalMime: "audio/wav", inlineSafe: true },
  "audio/x-wav": { family: "wav", canonicalMime: "audio/wav", inlineSafe: true },
  "audio/wave": { family: "wav", canonicalMime: "audio/wav", inlineSafe: true },
  "audio/vnd.wave": { family: "wav", canonicalMime: "audio/wav", inlineSafe: true },
  "audio/mp4": { family: "m4a", canonicalMime: "audio/mp4", inlineSafe: true },
  "audio/x-m4a": { family: "m4a", canonicalMime: "audio/mp4", inlineSafe: true },
  "audio/m4a": { family: "m4a", canonicalMime: "audio/mp4", inlineSafe: true },
  "audio/aac": { family: "m4a", canonicalMime: "audio/mp4", inlineSafe: true },
  "video/mp4": { family: "mp4", canonicalMime: "video/mp4", inlineSafe: true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    family: "docx",
    canonicalMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    inlineSafe: false,
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    family: "pptx",
    canonicalMime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    inlineSafe: false,
  },
  "text/plain": { family: "text", canonicalMime: "text/plain", inlineSafe: true },
  "text/markdown": { family: "text", canonicalMime: "text/markdown", inlineSafe: true },
  "text/csv": { family: "text", canonicalMime: "text/csv", inlineSafe: true },
  "text/vtt": { family: "text", canonicalMime: "text/vtt", inlineSafe: true },
  "application/x-subrip": { family: "text", canonicalMime: "text/plain", inlineSafe: true },
};

const EXTENSION_POLICIES: Record<string, FilePolicy> = {
  pdf: MIME_POLICIES["application/pdf"],
  png: MIME_POLICIES["image/png"],
  jpg: MIME_POLICIES["image/jpeg"],
  jpeg: MIME_POLICIES["image/jpeg"],
  webp: MIME_POLICIES["image/webp"],
  mp3: MIME_POLICIES["audio/mpeg"],
  wav: MIME_POLICIES["audio/wav"],
  m4a: MIME_POLICIES["audio/mp4"],
  mp4: MIME_POLICIES["video/mp4"],
  docx: MIME_POLICIES["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pptx: MIME_POLICIES["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  txt: MIME_POLICIES["text/plain"],
  md: MIME_POLICIES["text/markdown"],
  csv: MIME_POLICIES["text/csv"],
  srt: MIME_POLICIES["text/plain"],
  vtt: MIME_POLICIES["text/vtt"],
};

function badFileRequest(error: string, status = 400): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function normalizeMimeType(rawMime: string | null | undefined): string {
  return (rawMime ?? "").toLowerCase().split(";")[0]?.trim() || "application/octet-stream";
}

export function validateFileId(id: string): string {
  if (!id || id === "." || id === ".." || !/^[a-zA-Z0-9._-]{1,200}$/.test(id)) {
    throw badFileRequest("Identificador de arquivo inválido.");
  }
  return id;
}

export function sanitizeFileName(rawName: string): string {
  const baseName = rawName.split(/[/\\]/).pop() ?? "";
  const cleaned = baseName
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/["`;]/g, "_")
    .trim()
    .slice(0, 255);
  return cleaned;
}

export function parseUploadFileName(rawHeader: string | null, fallbackId: string): string {
  if (rawHeader === null) {
    const cleanedFallback = sanitizeFileName(fallbackId);
    if (!cleanedFallback) throw badFileRequest("Nome de arquivo inválido.");
    return cleanedFallback;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawHeader);
  } catch {
    throw badFileRequest("Nome de arquivo malformado.");
  }
  const cleaned = sanitizeFileName(decoded);
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw badFileRequest("Nome de arquivo inválido.");
  }
  return cleaned;
}

function fileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return "";
  return name.slice(lastDot + 1).toLowerCase();
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let index = 0; index < length && offset + index < bytes.length; index += 1) {
    out += String.fromCharCode(bytes[offset + index]);
  }
  return out;
}

export function looksDangerousPayload(bytes: Uint8Array): boolean {
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true; // MZ
  if (bytes.length >= 4 && bytes[0] === 0x7f && asciiAt(bytes, 1, 3) === "ELF") return true;
  if (bytes.length >= 2 && asciiAt(bytes, 0, 2) === "#!") return true;
  const sample = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 4096)))
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  if (
    sample.startsWith("<!doctype") ||
    sample.startsWith("<html") ||
    sample.startsWith("<script") ||
    sample.startsWith("<svg") ||
    sample.startsWith("<?xml")
  ) {
    return true;
  }
  return /<(?:script|svg|html|iframe|object|embed)\b/i.test(sample);
}

function matchesFamilySignature(family: FileFamily, bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  switch (family) {
    case "pdf":
      return bytes.length >= 5 && asciiAt(bytes, 0, 5) === "%PDF-";
    case "png":
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "jpeg":
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "webp":
      return bytes.length >= 12 && asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP";
    case "wav":
      return bytes.length >= 12 && asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WAVE";
    case "mp3": {
      if (bytes.length >= 3 && asciiAt(bytes, 0, 3) === "ID3") return true;
      if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
        const versionBits = (bytes[1] >> 3) & 0x03;
        const layerBits = (bytes[1] >> 1) & 0x03;
        return versionBits !== 1 && layerBits !== 0;
      }
      return false;
    }
    case "mp4":
    case "m4a": {
      if (bytes.length >= 12 && asciiAt(bytes, 4, 4) === "ftyp") {
        const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
        return boxSize >= 8;
      }
      return family === "m4a" && bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0;
    }
    case "docx":
    case "pptx":
      return (
        bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04
      );
    case "text": {
      const scanLen = Math.min(bytes.length, 4096);
      for (let index = 0; index < scanLen; index += 1) {
        if (bytes[index] === 0) return false;
      }
      return !looksDangerousPayload(bytes);
    }
  }
}

export function validateFileUpload(input: {
  fileName: string;
  declaredMime: string | null | undefined;
  content: Buffer;
}): { safeName: string; safeMime: string } {
  if (input.content.byteLength <= 0) {
    throw badFileRequest("O arquivo está vazio.");
  }
  if (input.content.byteLength > MAX_FILE_BYTES) {
    throw badFileRequest("Arquivo maior que 100 MB.", 413);
  }

  const safeName = sanitizeFileName(input.fileName);
  if (!safeName) {
    throw badFileRequest("Nome de arquivo inválido.");
  }

  const ext = fileExtension(safeName);
  const mime = normalizeMimeType(input.declaredMime);

  if (BLOCKED_EXTENSIONS.has(ext) || BLOCKED_MIMES.has(mime)) {
    throw badFileRequest("Tipo de arquivo não permitido.");
  }

  if (looksDangerousPayload(input.content)) {
    throw badFileRequest("Conteúdo ativo ou não autorizado detectado.");
  }

  const extPolicy = ext ? EXTENSION_POLICIES[ext] : undefined;
  if (ext && !extPolicy) {
    throw badFileRequest("Extensão de arquivo não permitida.");
  }

  let policy: FilePolicy | undefined;
  if (mime === "application/octet-stream") {
    policy = extPolicy;
  } else {
    const mimePolicy = MIME_POLICIES[mime];
    if (!mimePolicy) {
      throw badFileRequest("Tipo MIME não permitido.");
    }
    if (extPolicy && extPolicy.family !== mimePolicy.family) {
      throw badFileRequest("Tipo MIME incompatível com a extensão do arquivo.");
    }
    policy = mimePolicy;
  }

  if (!policy) {
    throw badFileRequest("Tipo de arquivo não permitido.");
  }

  if (!matchesFamilySignature(policy.family, input.content)) {
    throw badFileRequest("A assinatura do arquivo não corresponde ao tipo informado.");
  }

  return { safeName, safeMime: policy.canonicalMime };
}

export function buildDownloadHeaders(input: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  content: Buffer;
}): Record<string, string> {
  const safeName = sanitizeFileName(input.name) || "material";
  const asciiFallback = safeName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "material";
  const mime = normalizeMimeType(input.mimeType);
  const ext = fileExtension(safeName);
  const policy = MIME_POLICIES[mime];
  const dangerous =
    BLOCKED_MIMES.has(mime) ||
    BLOCKED_EXTENSIONS.has(ext) ||
    looksDangerousPayload(input.content);

  const inlineSafe =
    !dangerous &&
    Boolean(policy?.inlineSafe) &&
    matchesFamilySignature(policy!.family, input.content);

  const contentType = dangerous
    ? "application/octet-stream"
    : (policy?.canonicalMime ?? "application/octet-stream");
  const disposition = inlineSafe ? "inline" : "attachment";

  return {
    "content-type": contentType,
    "content-length": String(input.sizeBytes),
    "content-disposition": `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    etag: `"${input.hash}"`,
    "cache-control": "private, max-age=3600",
  };
}
