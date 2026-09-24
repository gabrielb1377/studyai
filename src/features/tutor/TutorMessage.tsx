"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Bot, Check, Copy, RefreshCcw, Sparkles, StepForward } from "lucide-react";
import type { TutorMessage as TutorMessageType } from "@/types/tutor";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MarkdownRenderer = dynamic(() => import("./MarkdownRenderer"), {
  loading: () => <p className="whitespace-pre-wrap">Carregando resposta…</p>,
});

export function TutorMessage({ message, onResponseAction }: { message: TutorMessageType; onResponseAction?: (action: "continue" | "regenerate" | "explain", response: string) => void }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <article className={isUser ? "group flex justify-end" : "group flex gap-3"}>
      {!isUser && <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Bot className="size-4" aria-hidden="true" /></span>}
      <div className={isUser ? "max-w-[92%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-sm sm:max-w-[78%]" : "min-w-0 max-w-[92%] rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm leading-6 text-card-foreground shadow-sm sm:max-w-[85%]"}>
        {message.heading && <h3 className="mb-2 font-semibold">{message.heading}</h3>}
        {isUser ? <p className="whitespace-pre-wrap">{message.content}</p> : <MarkdownRenderer content={message.content} />}
        {message.list && <ul className="mt-3 list-disc space-y-1 pl-5">{message.list.map((item) => <li key={item}>{item}</li>)}</ul>}
        {message.code && <div className="mt-4 overflow-hidden rounded-lg border border-black/10 bg-black/90 text-left text-xs text-white"><p className="border-b border-white/10 px-3 py-2 text-white/60">{message.code.language}</p><pre className="overflow-x-auto p-3 leading-6"><code>{message.code.code}</code></pre></div>}
        {message.table && <div className="mt-4 overflow-x-auto rounded-lg border border-black/10 bg-background text-foreground"><table className="min-w-full text-left text-xs"><thead className="bg-muted"><tr>{message.table.headers.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody>{message.table.rows.map((row) => <tr key={row.join("-")} className="border-t">{row.map((cell) => <td key={cell} className="px-3 py-2">{cell}</td>)}</tr>)}</tbody></table></div>}
        {!isUser && message.metadata && (
          <p className="mt-3 border-t border-current/10 pt-2 text-[10px] opacity-60">
            {message.metadata.provider ?? "IA"}{message.metadata.model ? ` · ${message.metadata.model}` : ""}
            {message.metadata.inputTokens !== undefined ? ` · Prompt ${message.metadata.inputTokens}` : ""}
            {message.metadata.outputTokens !== undefined ? ` · Resposta ${message.metadata.outputTokens}` : ""}
            {message.metadata.contextTokens !== undefined ? ` · Contexto ${message.metadata.contextTokens}` : ""}
            {message.metadata.chunkTokens !== undefined ? ` · Chunks ${message.metadata.chunkTokens}` : ""}
            {message.metadata.inputTokens !== undefined ? ` · Enviados ${message.metadata.inputTokens}` : ""}
            {message.metadata.outputTokens !== undefined ? ` · Recebidos ${message.metadata.outputTokens}` : ""}
            {message.metadata.cached ? " · cache" : ""}
          </p>
        )}
        {!isUser && message.content && <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-2 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <MessageAction label={copied ? "Copiado" : "Copiar"} icon={copied ? Check : Copy} onClick={() => { void copy(); }} />
          <MessageAction label="Continuar resposta" icon={StepForward} onClick={() => onResponseAction?.("continue", message.content)} />
          <MessageAction label="Regenerar" icon={RefreshCcw} onClick={() => onResponseAction?.("regenerate", message.content)} />
          <MessageAction label="Explicar diferente" icon={Sparkles} onClick={() => onResponseAction?.("explain", message.content)} />
        </div>}
      </div>
    </article>
  );
}

function MessageAction({ label, icon: Icon, onClick }: { label: string; icon: typeof Copy; onClick: () => void }) {
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}><Icon className="size-3.5" /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
