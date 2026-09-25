import type { AnalyticsSnapshot } from "./types";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function ascii(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
}

function pdfEscape(value: string) {
  return ascii(value).replace(/([\\()])/g, "\\$1");
}

function createPdf(lines: readonly string[]) {
  const pageLines = 46;
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / pageLines)) }, (_, index) => lines.slice(index * pageLines, (index + 1) * pageLines));
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    const text = page.map((line, lineIndex) => `BT /F1 ${lineIndex === 0 && index === 0 ? 16 : 10} Tf 48 ${792 - lineIndex * 16} Td (${pdfEscape(line.slice(0, 92))}) Tj ET`).join("\n");
    objects[contentId] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  });
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = output.length;
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = output.length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([output], { type: "application/pdf" });
}

function reportLines(snapshot: AnalyticsSnapshot) {
  const statusLabels = { forgetting: "Esquecendo", stable: "Estavel", mastered: "Dominado" };
  return [
    "StudyAI - Relatorio de aprendizagem",
    `Gerado em: ${new Date(snapshot.generatedAt).toLocaleString("pt-BR")}`,
    `Tempo total: ${Math.round(snapshot.totalMinutes)} minutos`,
    `Sequencia atual: ${snapshot.currentStreak} dias`,
    `Maior sequencia: ${snapshot.longestStreak} dias`,
    "",
    "Tempo por materia",
    ...snapshot.timeBySubject.map((item) => `${item.label}: ${item.minutes} min (${item.percentage}%)`),
    "",
    "Retencao e curva de esquecimento",
    ...snapshot.forgetting.map((item) => `${item.subject} / ${item.topic}: ${item.retention}% - ${statusLabels[item.status]}`),
    "",
    "Estimativas",
    `Carga restante: ${snapshot.forecast.remainingStudyMinutes} minutos`,
    `Revisoes nos proximos 7 dias: ${snapshot.forecast.reviewsNext7Days}`,
    "",
    "Insights derivados dos dados registrados",
    ...snapshot.insights.map((item) => `${item.title}: ${item.description}`),
  ];
}

export const AnalyticsExporter = {
  csv(snapshot: AnalyticsSnapshot) {
    const rows = [
      ["secao", "item", "valor", "unidade"],
      ...snapshot.weekly.map((item) => ["evolucao_semanal", item.label, item.minutes, "minutos"]),
      ...snapshot.monthly.map((item) => ["evolucao_mensal", item.label, item.minutes, "minutos"]),
      ...snapshot.timeBySubject.map((item) => ["tempo_por_materia", item.label, item.minutes, "minutos"]),
      ...snapshot.timeByTopic.map((item) => ["tempo_por_tema", item.label, item.minutes, "minutos"]),
      ...snapshot.timeByChapter.map((item) => ["tempo_por_capitulo", item.label, item.minutes, "minutos"]),
      ...snapshot.retention.map((item) => [`retencao_${item.scope}`, item.label, item.value, "percentual"]),
      ...snapshot.forgetting.map((item) => ["curva_esquecimento", `${item.subject} / ${item.topic}`, item.retention, item.status]),
      ["estimativa", "carga_restante", snapshot.forecast.remainingStudyMinutes, "minutos"],
      ["estimativa", "revisoes_proximos_7_dias", snapshot.forecast.reviewsNext7Days, "revisoes"],
    ];
    const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    download(new Blob([content], { type: "text/csv;charset=utf-8" }), "studyai-analytics.csv");
  },

  pdf(snapshot: AnalyticsSnapshot) {
    download(createPdf(reportLines(snapshot)), "studyai-analytics.pdf");
  },
};
