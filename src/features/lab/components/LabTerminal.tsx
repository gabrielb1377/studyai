"use client";

import { useState } from "react";
import { CornerDownLeft, TerminalSquare } from "lucide-react";
import { TerminalService } from "../services/TerminalService";
import type { VirtualTerminalState } from "../types";

export function LabTerminal({ state, onChange }: { state: VirtualTerminalState; onChange: (state: VirtualTerminalState) => void }) {
  const [terminal, setTerminal] = useState(state);
  const [command, setCommand] = useState("");
  const submit = (value = command) => {
    if (!value.trim()) return;
    const next = TerminalService.execute(terminal, value);
    setTerminal(next);
    onChange(next);
    setCommand("");
  };
  return <section className="overflow-hidden rounded-2xl border bg-slate-950 text-slate-100" aria-labelledby="lab-terminal-title"><div className="flex items-center gap-2 border-b border-white/10 px-4 py-3"><TerminalSquare className="size-4 text-emerald-300" /><h2 id="lab-terminal-title" className="text-sm font-semibold">Terminal simulado</h2><span className="ml-auto text-[11px] text-slate-400">Sem acesso ao sistema</span></div><div className="h-48 overflow-y-auto p-4 font-mono text-xs leading-5">{terminal.history.map((entry) => <div key={entry.id} className="mb-2"><p><span className="text-emerald-300">{terminal.cwd} $</span> {entry.command}</p>{entry.output ? <pre className="whitespace-pre-wrap text-slate-300">{entry.output}</pre> : null}</div>)}<form className="flex items-center" onSubmit={(event) => { event.preventDefault(); submit(); }}><span className="shrink-0 text-emerald-300">{terminal.cwd} $&nbsp;</span><input aria-label="Comando do terminal simulado" value={command} onChange={(event) => setCommand(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" autoComplete="off" /><button type="submit" aria-label="Executar comando" className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"><CornerDownLeft className="size-4" /></button></form></div></section>;
}
