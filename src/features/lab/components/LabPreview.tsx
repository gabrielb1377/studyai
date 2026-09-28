"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, TerminalSquare } from "lucide-react";
import type { LabProject } from "../types";
import { LabService } from "../services/LabService";
import { MermaidPreview } from "./MermaidPreview";

function webDocument(project: LabProject) {
  const html = project.files.html ?? LabService.template("html");
  const css = project.files.css ?? LabService.template("css");
  const js = project.files.javascript ?? "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'"><style>${css.replace(/<\/style/gi, "<\\/style")}</style></head><body>${html}<script>${js.replace(/<\/script/gi, "<\\/script")}<\/script></body></html>`;
}

export function LabPreview({ project }: { project: LabProject }) {
  const code = project.files[project.language] ?? "";
  const result = project.lastResult;
  return <section className="overflow-hidden rounded-2xl border bg-card" aria-labelledby="lab-preview-title">
    <div className="flex items-center gap-2 border-b px-4 py-3"><Eye className="size-4 text-primary" /><h2 id="lab-preview-title" className="text-sm font-semibold">Preview e resultado</h2>{result ? <span className={`ml-auto rounded-full px-2 py-1 text-[11px] font-medium ${result.status === "success" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive"}`}>{result.status === "success" ? "Executado" : result.status === "unsupported" ? "Não executável" : "Erro"} · {result.durationMs} ms</span> : null}</div>
    <div className="min-h-[22rem] overflow-auto p-4">
      {(project.language === "html" || project.language === "css") ? <iframe title="Preview HTML isolado" sandbox="allow-scripts" srcDoc={webDocument(project)} className="h-80 w-full rounded-xl border bg-white" /> : null}
      {project.language === "markdown" ? <article className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{code}</ReactMarkdown></article> : null}
      {project.language === "mermaid" ? <MermaidPreview source={code} /> : null}
      {project.language === "sql" && result?.columns ? <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr>{result.columns.map((column) => <th key={column} className="border bg-secondary px-3 py-2 text-left">{column}</th>)}</tr></thead><tbody>{result.rows?.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border px-3 py-2">{String(cell ?? "NULL")}</td>)}</tr>)}</tbody></table></div> : null}
      {!["html", "css", "markdown", "mermaid"].includes(project.language) && !result ? <div className="grid min-h-64 place-items-center text-center text-sm text-muted-foreground"><p>Execute o código para visualizar a saída.</p></div> : null}
      {result && !result.columns ? <div className="rounded-xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100"><p className="mb-2 flex items-center gap-2 text-slate-400"><TerminalSquare className="size-4" />Saída</p>{result.output.map((line, index) => <p key={index}>{line}</p>)}{result.error ? <p className="text-red-300">{result.error}</p> : null}</div> : null}
    </div>
  </section>;
}
