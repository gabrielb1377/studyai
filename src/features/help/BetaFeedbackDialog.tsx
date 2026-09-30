"use client";

import { useEffect, useState } from "react";
import { Bug, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type BetaFeedbackKind = "feedback" | "issue";

type Props = {
  kind: BetaFeedbackKind | null;
  onOpenChange: (open: boolean) => void;
};

type Ratings = { overall: number; interface: number; ai: number; performance: number };
const initialRatings: Ratings = { overall: 0, interface: 0, ai: 0, performance: 0 };

function Rating({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex gap-1" aria-label={`Nota para ${label}`}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            aria-label={`${rating} de 5 para ${label}`}
            aria-pressed={value === rating}
            onClick={() => onChange(rating)}
            className={cn("flex size-9 items-center justify-center rounded-lg border text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring", value === rating ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            {rating}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TextArea({ label, value, onChange, placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}{required && <span className="sr-only"> (obrigatório)</span>}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={4_000}
        rows={3}
        className="min-h-24 resize-y rounded-xl border border-input bg-background/75 px-3 py-2 text-sm font-normal outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </label>
  );
}

export function BetaFeedbackDialog({ kind, onOpenChange }: Props) {
  const [ratings, setRatings] = useState(initialRatings);
  const [fields, setFields] = useState({ liked: "", confusing: "", blocked: "", missing: "", suggestion: "", action: "", description: "", contactEmail: "" });
  const [allowContact, setAllowContact] = useState(false);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!kind) return;
    setRatings(initialRatings);
    setFields({ liked: "", confusing: "", blocked: "", missing: "", suggestion: "", action: "", description: "", contactEmail: "" });
    setAllowContact(false);
    setIncludeDiagnostics(true);
    setStatus("idle");
    setMessage("");
  }, [kind]);

  const update = (field: keyof typeof fields) => (value: string) => setFields((current) => ({ ...current, [field]: value }));
  const submit = async () => {
    if (!kind || fields.description.trim().length < 10) { setMessage("Descreva sua experiência com pelo menos 10 caracteres."); setStatus("error"); return; }
    if (kind === "feedback" && Object.values(ratings).some((value) => value === 0)) { setMessage("Avalie todos os quatro aspectos."); setStatus("error"); return; }
    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          ratings: kind === "feedback" ? ratings : undefined,
          liked: fields.liked,
          confusing: fields.confusing,
          blocked: fields.blocked,
          missing: fields.missing,
          suggestion: fields.suggestion,
          action: fields.action,
          description: fields.description,
          screen: includeDiagnostics ? window.location.pathname : undefined,
          device: includeDiagnostics ? navigator.platform : undefined,
          browser: includeDiagnostics ? navigator.userAgent : undefined,
          occurredAt: new Date().toISOString(),
          contactEmail: allowContact ? fields.contactEmail : undefined,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar o relato.");
      setStatus("sent");
      setMessage("Obrigado. Seu relato foi enviado para a equipe da Beta.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar o relato.");
    }
  };

  const issue = kind === "issue";
  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(820px,92dvh)] max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{issue ? <Bug className="size-5" /> : <MessageSquare className="size-5" />}{issue ? "Reportar um problema" : "Enviar feedback da Beta"}</DialogTitle>
          <DialogDescription>{issue ? "Conte o que aconteceu. Diagnósticos técnicos seguros só serão enviados com sua permissão." : "Sua avaliação ajuda a priorizar correções e melhorar a experiência antes do lançamento."}</DialogDescription>
        </DialogHeader>
        {status === "sent" ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-700 dark:text-emerald-300" role="status">{message}</div>
        ) : (
          <div className="grid gap-5 overflow-y-auto pr-1">
            {!issue && <div className="grid gap-4 sm:grid-cols-2"><Rating label="Experiência geral" value={ratings.overall} onChange={(value) => setRatings((current) => ({ ...current, overall: value }))} /><Rating label="Interface" value={ratings.interface} onChange={(value) => setRatings((current) => ({ ...current, interface: value }))} /><Rating label="IA" value={ratings.ai} onChange={(value) => setRatings((current) => ({ ...current, ai: value }))} /><Rating label="Performance" value={ratings.performance} onChange={(value) => setRatings((current) => ({ ...current, performance: value }))} /></div>}
            {issue ? <TextArea label="O que você estava tentando fazer?" value={fields.action} onChange={update("action")} placeholder="Ex.: importar um PDF e abrir no Workspace" /> : <TextArea label="O que funcionou bem?" value={fields.liked} onChange={update("liked")} placeholder="Conte o que você mais gostou." />}
            {!issue && <TextArea label="O que ficou confuso ou impediu o uso?" value={fields.confusing} onChange={update("confusing")} placeholder="Descreva telas, textos ou etapas difíceis." />}
            {!issue && <TextArea label="O que faltou?" value={fields.missing} onChange={update("missing")} placeholder="Conte o que você esperava encontrar." />}
            <TextArea label={issue ? "Descreva o problema" : "Comentário principal"} value={fields.description} onChange={update("description")} placeholder={issue ? "O que ocorreu, o que você esperava e se conseguiu repetir." : "Sugestão, impressão ou detalhe importante."} required />
            {!issue && <TextArea label="Sugestão" value={fields.suggestion} onChange={update("suggestion")} placeholder="Como poderíamos melhorar?" />}
            {issue && <label className="flex items-start gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" checked={includeDiagnostics} onChange={(event) => setIncludeDiagnostics(event.target.checked)} className="mt-0.5 size-4" /><span><span className="font-medium">Incluir diagnóstico seguro</span><span className="mt-1 block text-xs text-muted-foreground">Envia somente tela atual, navegador, dispositivo e horário. Conteúdo de estudo, arquivos e credenciais nunca são incluídos.</span></span></label>}
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={allowContact} onChange={(event) => setAllowContact(event.target.checked)} className="size-4" />Autorizo contato sobre este relato.</label>
            {allowContact && <Input type="email" value={fields.contactEmail} onChange={(event) => update("contactEmail")(event.target.value)} placeholder="seu@email.com" aria-label="Email para contato" />}
            {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{status === "sent" ? "Fechar" : "Cancelar"}</Button>
          {status !== "sent" && <Button onClick={() => void submit()} disabled={status === "sending"}>{status === "sending" ? "Enviando…" : "Enviar relato"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
