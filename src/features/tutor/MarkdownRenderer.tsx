"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { ComponentPropsWithoutRef } from "react";

function MarkdownImage({ src, alt }: ComponentPropsWithoutRef<"img">) {
  if (!src) return null;
  return (
    <span className="block overflow-hidden rounded-xl border bg-background p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt ?? "Imagem da resposta"} loading="lazy" className="mx-auto max-h-96 rounded-lg object-contain" />
    </span>
  );
}

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="min-w-0 space-y-3 break-words text-sm leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => <h1 className="mt-5 text-xl font-semibold tracking-tight first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-5 text-lg font-semibold tracking-tight first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-4 font-semibold first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => <blockquote className="rounded-r-lg border-l-4 border-primary bg-background/60 px-4 py-2 text-muted-foreground">{children}</blockquote>,
          table: ({ children }) => <div className="overflow-x-auto rounded-lg border bg-background"><table className="min-w-full text-left text-xs">{children}</table></div>,
          thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
          th: ({ children }) => <th className="border-b px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
          code: ({ className, children }) => className
            ? <code className={`${className} block overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-6 text-zinc-100`}>{children}</code>
            : <code className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>,
          pre: ({ children }) => <pre className="overflow-x-auto whitespace-pre-wrap">{children}</pre>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-4">{children}</a>,
          img: MarkdownImage,
          input: ({ checked, ...props }) => <input {...props} checked={checked} readOnly className="mr-2 size-4 accent-primary" />,
          hr: () => <hr className="my-5 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
