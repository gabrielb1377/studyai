"use client";

import dynamic from "next/dynamic";
import { Bot } from "lucide-react";
import type { TutorMessage as TutorMessageType } from "@/types/tutor";

const MarkdownRenderer = dynamic(() => import("./MarkdownRenderer"), {
  loading: () => <p className="whitespace-pre-wrap">Carregando resposta…</p>,
});

export function TutorMessage({ message }: { message: TutorMessageType }) {
  const isUser = message.role === "user";

  return (
    <article className={isUser ? "flex justify-end" : "flex gap-3"}>
      {!isUser && <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><Bot className="size-4" aria-hidden="true" /></span>}
      <div className={isUser ? "max-w-[90%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground sm:max-w-[80%]" : "min-w-0 max-w-[90%] rounded-2xl rounded-bl-md bg-secondary px-4 py-3 text-sm leading-6 text-secondary-foreground sm:max-w-[80%]"}>
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
      </div>
    </article>
  );
}
