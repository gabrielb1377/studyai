import { ArrowDown } from "lucide-react";

function label(value: string) {
  const cleaned = value.trim();
  const decorated = cleaned.match(/^[\w-]+\s*(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})$/);
  return (decorated?.slice(1).find(Boolean) ?? cleaned.replace(/^[\w-]+\s+/, "")).trim();
}

export function MermaidPreview({ source }: { source: string }) {
  const lines = source.split("\n").map((line) => line.trim()).filter((line) => line && !/^(?:graph|flowchart)\b/i.test(line));
  const steps = lines.flatMap((line) => line.split(/-->|==>|---/).map(label).filter(Boolean));
  const unique = [...new Set(steps)].slice(0, 20);
  if (!unique.length) return <p className="text-sm text-muted-foreground">Use `flowchart TD` e conecte os nós com `--&gt;`.</p>;
  return <div className="flex min-h-64 flex-col items-center justify-center gap-2 p-5">{unique.map((step, index) => <div key={`${step}-${index}`} className="contents"><div className="max-w-sm rounded-xl border bg-card px-4 py-2 text-center text-sm font-medium shadow-sm">{step}</div>{index < unique.length - 1 ? <ArrowDown className="size-4 text-primary" /> : null}</div>)}</div>;
}
