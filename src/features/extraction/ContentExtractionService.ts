import type {
  ExtractionFileType,
  ExtractionMetadata,
  ExtractionResult,
} from "./ExtractionTypes";

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function detectLanguage(text: string) {
  const words = text.toLocaleLowerCase("pt-BR").match(/[a-zà-ÿ]+/g) ?? [];
  if (words.length < 8) return undefined;

  const portuguese = new Set(["a", "de", "do", "e", "em", "o", "os", "para", "que", "uma"]);
  const english = new Set(["a", "and", "for", "in", "is", "of", "the", "to", "with"]);
  const portugueseScore = words.filter((word) => portuguese.has(word)).length;
  const englishScore = words.filter((word) => english.has(word)).length;
  if (portugueseScore === englishScore) return undefined;
  return portugueseScore > englishScore ? "pt-BR" : "en";
}

function baseMetadata(file: File): ExtractionMetadata {
  return { name: file.name, type: file.type || "application/octet-stream", size: file.size };
}

function extractXmlText(xml: string) {
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  if (documentNode.querySelector("parsererror")) {
    throw new Error("O documento contém XML inválido.");
  }

  return normalizeText(
    Array.from(documentNode.getElementsByTagName("*"))
      .filter((node) => node.localName === "t")
      .map((node) => node.textContent ?? "")
      .join(" "),
  );
}

async function readZipText(file: File, pattern: RegExp) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && pattern.test(entry.name))
    .sort((first, second) => first.name.localeCompare(second.name, undefined, { numeric: true }));

  const sections = await Promise.all(entries.map(async (entry) =>
    extractXmlText(await entry.async("string")),
  ));
  return { text: sections.filter(Boolean).join("\n\n"), entryCount: entries.length };
}

async function extractPdf(file: File): Promise<ExtractionResult> {
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const documentTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const documentProxy = await documentTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items
        .map((item) => "str" in item ? item.str : "")
        .filter(Boolean)
        .join(" "));
    }
  } finally {
    await documentProxy.destroy();
  }

  const extractedText = pages.map(normalizeText).filter(Boolean).join("\n\n");
  return {
    extractedText,
    metadata: {
      ...baseMetadata(file),
      pageCount: documentProxy.numPages,
      language: detectLanguage(extractedText),
    },
  };
}

async function extractDocx(file: File): Promise<ExtractionResult> {
  const { text } = await readZipText(
    file,
    /^word\/(document|footnotes|endnotes|header\d+|footer\d+)\.xml$/,
  );
  return {
    extractedText: text,
    metadata: { ...baseMetadata(file), language: detectLanguage(text) },
  };
}

async function extractPptx(file: File): Promise<ExtractionResult> {
  const slides = await readZipText(file, /^ppt\/slides\/slide\d+\.xml$/);
  const notes = await readZipText(file, /^ppt\/notesSlides\/notesSlide\d+\.xml$/);
  const extractedText = [slides.text, notes.text].filter(Boolean).join("\n\n");
  return {
    extractedText,
    metadata: {
      ...baseMetadata(file),
      pageCount: slides.entryCount,
      language: detectLanguage(extractedText),
    },
  };
}

async function extractTxt(file: File): Promise<ExtractionResult> {
  const extractedText = await file.text();
  return {
    extractedText,
    metadata: { ...baseMetadata(file), language: detectLanguage(extractedText) },
  };
}

function extractMedia(file: File, type: "audio" | "video"): Promise<ExtractionResult> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(type);
    const source = URL.createObjectURL(file);
    const timeout = window.setTimeout(() => finish(() => reject(
      new Error("Não foi possível ler os metadados da mídia a tempo."),
    )), 10_000);

    const finish = (callback: () => void) => {
      window.clearTimeout(timeout);
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(source);
      callback();
    };

    element.preload = "metadata";
    element.onloadedmetadata = () => finish(() => {
      const duration = Number.isFinite(element.duration) ? element.duration : undefined;
      const video = type === "video" ? element as HTMLVideoElement : undefined;
      resolve({
        extractedText: "",
        metadata: {
          ...baseMetadata(file),
          duration,
          width: video?.videoWidth || undefined,
          height: video?.videoHeight || undefined,
        },
      });
    });
    element.onerror = () => finish(() => reject(
      new Error(`Não foi possível ler os metadados do arquivo ${file.name}.`),
    ));
    element.src = source;
    element.load();
  });
}

async function extractImage(file: File): Promise<ExtractionResult> {
  const bitmap = await createImageBitmap(file);
  try {
    return {
      extractedText: "",
      metadata: {
        ...baseMetadata(file),
        width: bitmap.width,
        height: bitmap.height,
      },
    };
  } finally {
    bitmap.close();
  }
}

const extractors: Record<ExtractionFileType, (file: File) => Promise<ExtractionResult>> = {
  pdf: extractPdf,
  docx: extractDocx,
  pptx: extractPptx,
  txt: extractTxt,
  mp3: (file) => extractMedia(file, "audio"),
  wav: (file) => extractMedia(file, "audio"),
  m4a: (file) => extractMedia(file, "audio"),
  mp4: (file) => extractMedia(file, "video"),
  png: extractImage,
  jpg: extractImage,
  jpeg: extractImage,
  webp: extractImage,
};

export const ContentExtractionService = {
  extract(file: File, fileType: ExtractionFileType) {
    return extractors[fileType](file);
  },

  createBaseMetadata: baseMetadata,
};
