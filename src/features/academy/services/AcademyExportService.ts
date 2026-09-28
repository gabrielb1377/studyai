import type { AcademyExportKind, AcademyGeneratedContent, AcademyStudy } from "../types";
import { AcademyExportPipeline } from "./AcademyExportPipeline";

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export const AcademyExportService = {
  async export(study: AcademyStudy, content: AcademyGeneratedContent, kind: AcademyExportKind) {
    const artifact = kind === "presentation"
      ? await (await import("./PresentationContentGenerator")).PresentationContentGenerator.generate(study, content)
      : await (await import("./PdfContentGenerator")).PdfContentGenerator.generate(study, content, { workbook: kind === "workbook" });
    const persisted = await AcademyExportPipeline.persist(study, content, kind, artifact);
    download(artifact.blob, artifact.fileName);
    return { ...persisted, artifact };
  },
};
