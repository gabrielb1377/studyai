"use client";

import type { KeyboardEvent } from "react";
import { Code2, RotateCcw } from "lucide-react";
import { labLanguageLabels, labLanguages, type LabLanguage } from "../types";

export function LabEditor({
  language,
  value,
  canReset = false,
  onChange,
  onLanguageChange,
  onReset,
}: {
  language: LabLanguage;
  value: string;
  canReset?: boolean;
  onChange: (value: string) => void;
  onLanguageChange: (language: LabLanguage) => void;
  onReset?: () => void;
}) {
  function tab(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const target = event.currentTarget;
    const next = `${value.slice(0, target.selectionStart)}  ${value.slice(target.selectionEnd)}`;
    onChange(next);
    requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = target.selectionStart + 2; });
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-[#0f172a] text-slate-100" aria-labelledby="lab-editor-title">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
        <Code2 className="size-4 text-sky-300" />
        <h2 id="lab-editor-title" className="text-sm font-semibold">Editor</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canReset && onReset ? (
            <button
              type="button"
              onClick={onReset}
              aria-label="Restaurar código inicial"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-xs text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <RotateCcw className="size-3.5" />
              Restaurar inicial
            </button>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-slate-300">
            Linguagem
            <select
              aria-label="Linguagem do Laboratório"
              value={language}
              onChange={(event) => onLanguageChange(event.target.value as LabLanguage)}
              className="h-8 rounded-lg border border-white/15 bg-slate-900 px-2 text-xs text-white outline-none focus:ring-2 focus:ring-sky-400"
            >
              {labLanguages.map((item) => (
                <option key={item} value={item}>
                  {labLanguageLabels[item]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <textarea
        aria-label="Código do exercício"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={tab}
        className="min-h-[25rem] w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-6 text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400"
        placeholder="Escreva sua solução…"
      />
    </section>
  );
}
