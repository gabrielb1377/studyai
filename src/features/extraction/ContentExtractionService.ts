import type {
  DocumentSection,
  DocumentSectionType,
  ExtractionFileType,
  ExtractionMetadata,
  ExtractionResult,
} from "./ExtractionTypes";

function baseMetadata(file: File): ExtractionMetadata {
  const now = new Date().toISOString();
  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    createdAt: now,
    updatedAt: now,
  };
}

function textFromNode(node: Element) {
  return Array.from(node.getElementsByTagName("*"))
    .filter((child) => child.localName === "t" || child.localName === "tab" || child.localName === "br")
    .map((child) => child.localName === "tab" ? "\t" : child.localName === "br" ? "\n" : child.textContent ?? "")
    .join("")
    .trim();
}

function hasAncestor(node: Element, localName: string) {
  let current = node.parentElement;
  while (current) {
    if (current.localName === localName) return true;
    current = current.parentElement;
  }
  return false;
}

function attributeByLocalName(node: Element | null, localName: string) {
  if (!node) return undefined;
  return Array.from(node.attributes).find((attribute) => attribute.localName === localName)?.value;
}

function parseXml(xml: string) {
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  if (documentNode.querySelector("parsererror")) throw new Error("O documento contém XML inválido.");
  return documentNode;
}

function paragraphType(node: Element, sourceType: DocumentSectionType): Pick<DocumentSection, "type" | "level"> {
  if (sourceType === "header" || sourceType === "footer" || sourceType === "note") {
    return { type: sourceType };
  }
  const styleNode = Array.from(node.getElementsByTagName("*")).find((element) => element.localName === "pStyle");
  const style = attributeByLocalName(styleNode ?? null, "val")?.toLocaleLowerCase("en") ?? "";
  const heading = style.match(/heading\s*(\d+)|titulo\s*(\d+)|title/);
  if (heading) {
    const level = Number(heading[1] ?? heading[2] ?? 1);
    return { type: level === 1 ? "title" : "heading", level };
  }
  const numbered = Array.from(node.getElementsByTagName("*")).some((element) => element.localName === "numPr");
  return { type: numbered ? "list" : sourceType };
}

function parseDocumentXml(xml: string, sourceType: DocumentSectionType = "paragraph") {
  const documentNode = parseXml(xml);
  const sections: DocumentSection[] = [];
  const paragraphs = Array.from(documentNode.getElementsByTagName("*")).filter(
    (node) => node.localName === "p" && !hasAncestor(node, "tbl"),
  );

  for (const paragraph of paragraphs) {
    const text = textFromNode(paragraph);
    if (!text) continue;
    sections.push({ ...paragraphType(paragraph, sourceType), text });
  }

  const tables = Array.from(documentNode.getElementsByTagName("*")).filter((node) => node.localName === "tbl");
  for (const table of tables) {
    const rows = Array.from(table.getElementsByTagName("*")).filter((node) => node.localName === "tr");
    const markdownRows = rows.map((row) => Array.from(row.children)
      .filter((cell) => cell.localName === "tc")
      .map((cell) => textFromNode(cell).replace(/\s+/g, " ").trim()))
      .filter((row) => row.length > 0);
    if (markdownRows.length === 0) continue;
    const width = Math.max(...markdownRows.map((row) => row.length));
    const normalizedRows = markdownRows.map((row) => [...row, ...Array<string>(width - row.length).fill("")]);
    const markdown = [
      `| ${normalizedRows[0].join(" | ")} |`,
      `| ${normalizedRows[0].map(() => "---").join(" | ")} |`,
      ...normalizedRows.slice(1).map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");
    sections.push({ type: "table", text: markdown });
  }

  if (sections.length === 0) {
    const fallback = Array.from(documentNode.getElementsByTagName("*"))
      .filter((node) => node.localName === "t")
      .map((node) => node.textContent ?? "")
      .join(" ")
      .trim();
    if (fallback) sections.push({ type: sourceType, text: fallback });
  }

  return sections;
}

function sectionsToText(sections: readonly DocumentSection[]) {
  return sections.map((section) => {
    if (section.type === "title") return `# ${section.text}`;
    if (section.type === "heading") return `${"#".repeat(Math.min(6, section.level ?? 2))} ${section.text}`;
    if (section.type === "list") return `- ${section.text}`;
    return section.text;
  }).join("\n\n");
}

async function loadZip(file: File) {
  const { default: JSZip } = await import("jszip");
  return JSZip.loadAsync(await file.arrayBuffer());
}

async function extractPdf(file: File): Promise<ExtractionResult> {
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const documentProxy = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const sections: DocumentSection[] = [];
  let documentTitle: string | undefined;

  try {
    const documentMetadata = await documentProxy.getMetadata().catch(() => null);
    const info = documentMetadata?.info as { Title?: string } | undefined;
    documentTitle = info?.Title?.trim() || undefined;
    if (documentTitle) sections.push({ type: "title", text: documentTitle });

    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str : "").filter(Boolean).join(" ").trim();
      if (text) sections.push({ type: "paragraph", text, page: pageNumber });
    }

    const extractedText = sectionsToText(sections);
    return {
      extractedText,
      sections,
      metadata: {
        ...baseMetadata(file),
        title: documentTitle,
        pageCount: documentProxy.numPages,
        hasTextLayer: extractedText.trim().length > 0,
      },
    };
  } finally {
    await documentProxy.destroy();
  }
}

async function extractDocx(file: File): Promise<ExtractionResult> {
  const zip = await loadZip(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir).sort(
    (left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }),
  );
  const sections: DocumentSection[] = [];
  const patterns: Array<{ pattern: RegExp; type: DocumentSectionType }> = [
    { pattern: /^word\/document\.xml$/, type: "paragraph" },
    { pattern: /^word\/header\d+\.xml$/, type: "header" },
    { pattern: /^word\/footer\d+\.xml$/, type: "footer" },
    { pattern: /^word\/(footnotes|endnotes)\.xml$/, type: "note" },
  ];
  for (const definition of patterns) {
    for (const entry of entries.filter((candidate) => definition.pattern.test(candidate.name))) {
      sections.push(...parseDocumentXml(await entry.async("string"), definition.type));
    }
  }
  return { extractedText: sectionsToText(sections), sections, metadata: baseMetadata(file) };
}

async function extractPptx(file: File): Promise<ExtractionResult> {
  const zip = await loadZip(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const slideEntries = entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name)).sort(
    (left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }),
  );
  const noteEntries = entries.filter((entry) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(entry.name)).sort(
    (left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }),
  );
  const sections: DocumentSection[] = [];

  for (const [index, entry] of slideEntries.entries()) {
    const parsed = parseDocumentXml(await entry.async("string"), "slide");
    parsed.forEach((section, sectionIndex) => sections.push({
      ...section,
      type: sectionIndex === 0 ? "heading" : section.type === "paragraph" ? "slide" : section.type,
      level: sectionIndex === 0 ? 2 : section.level,
      slide: index + 1,
    }));
  }
  for (const [index, entry] of noteEntries.entries()) {
    parseDocumentXml(await entry.async("string"), "note").forEach((section) => sections.push({
      ...section,
      type: "note",
      slide: index + 1,
    }));
  }
  return {
    extractedText: sectionsToText(sections),
    sections,
    metadata: { ...baseMetadata(file), pageCount: slideEntries.length },
  };
}

function detectTextEncoding(bytes: Uint8Array) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: "UTF-8", offset: 3 };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: "UTF-16LE", offset: 2 };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: "UTF-16BE", offset: 2 };
  const sample = bytes.slice(0, Math.min(bytes.length, 512));
  const oddZeros = sample.filter((value, index) => index % 2 === 1 && value === 0).length;
  const evenZeros = sample.filter((value, index) => index % 2 === 0 && value === 0).length;
  if (oddZeros > sample.length / 8) return { encoding: "UTF-16LE", offset: 0 };
  if (evenZeros > sample.length / 8) return { encoding: "UTF-16BE", offset: 0 };
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { encoding: "UTF-8", offset: 0 };
  } catch {
    return { encoding: "windows-1252", offset: 0 };
  }
}

async function extractTxt(file: File): Promise<ExtractionResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { encoding, offset } = detectTextEncoding(bytes);
  const extractedText = new TextDecoder(encoding).decode(bytes.slice(offset));
  return {
    extractedText,
    sections: extractedText.split(/\n{2,}/).filter(Boolean).map((text) => ({ type: "paragraph", text })),
    metadata: { ...baseMetadata(file), encoding },
  };
}

function extractMedia(file: File, type: "audio" | "video"): Promise<ExtractionResult> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(type);
    const source = URL.createObjectURL(file);
    const finish = (callback: () => void) => {
      window.clearTimeout(timeout);
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(source);
      callback();
    };
    const timeout = window.setTimeout(() => finish(() => reject(
      new Error("Não foi possível ler os metadados da mídia em até 10 segundos."),
    )), 10_000);

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
    element.onerror = () => finish(() => reject(new Error(`O navegador não conseguiu decodificar ${file.name}.`)));
    element.src = source;
    element.load();
  });
}

async function extractImage(file: File): Promise<ExtractionResult> {
  const bitmap = await createImageBitmap(file);
  try {
    return {
      extractedText: "",
      metadata: { ...baseMetadata(file), width: bitmap.width, height: bitmap.height },
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
