"use client";

import type { KeyboardEvent } from "react";
import { Code2 } from "lucide-react";
import { labLanguageLabels, labLanguages, type LabLanguage } from "../types";

export function LabEditor({ language, value, onChange, onLanguageChange }: { language: LabLanguage; value: string; onChange: (value: string) => void; onLanguageChange: (language: LabLanguage) => void }) {
  function tab(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const target = event.currentTarget;
    const next = `${value.slice(0, target.selectionStart)}  ${value.slice(target.selectionEnd)}`;
    onChange(next);
    requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = target.selectionStart + 2; });
  }
  return <section className="overflow-hidden rounded-2xl border bg-[#0f172a] text-slate-100" aria-labelledby="lab-editor-title">
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
      <Code2 className="size-4 text-sky-300" />
      <h2 id="lab-editor-title" className="text-sm font-semibold">Editor</h2>
      <label className="ml-auto flex items-center gap-2 text-xs text-slate-300">Linguagem<select aria-label="Linguagem do Laboratório" value={language} onChange={(event) => onLanguageChange(event.target.value as LabLanguage)} className="h-8 rounded-lg border border-white/15 bg-slate-900 px-2 text-xs text-white outline-none focus:ring-2 focus:ring-sky-400">{labLanguages.map((item) => <option key={item} value={item}>{labLanguageLabels[item]}</option>)}</select></label>
    </div>
    <textarea aria-label="Código do exercício" spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={tab} className="min-h-[25rem] w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-6 text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400" placeholder="Escreva sua solução…" />
  </section>;
}
