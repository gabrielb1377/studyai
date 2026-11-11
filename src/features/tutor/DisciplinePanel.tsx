"use client";

import { useState } from "react";
import { useMaterials } from "@/hooks/useMaterials";
import { useStudyEngine } from "@/features/study/hooks/useStudyEngine";
import { Button } from "@/components/ui/button";
import { disciplineKey, disciplineMaterials, materialKind, type DisciplineSelection } from "./services/DisciplineContext";

export function DisciplinePanel({ selection, onConfirm, disabled }: {
  selection?: DisciplineSelection;
  onConfirm: (selection: DisciplineSelection) => void;
  disabled: boolean;
}) {
  const { materials, isLoading, error } = useMaterials();
  const { records } = useStudyEngine();
  const [key, setKey] = useState(selection?.key ?? "");
  const [ids, setIds] = useState<string[]>(selection?.materialIds ?? []);
  const groups = new Map(materials.filter(disciplineKey).map((material) => [disciplineKey(material), material]));
  const candidates = materials.filter((material) => key && disciplineKey(material) === key);
  const saved = selection ? disciplineMaterials(materials, selection) : [];
  const selected = candidates.filter((material) => ids.includes(material.id)).sort((a, b) =>
    ["Material de estudo", "Exercícios", "Simulado"].indexOf(materialKind(a)) -
    ["Material de estudo", "Exercícios", "Simulado"].indexOf(materialKind(b)) ||
    a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
  const subject = groups.get(key)?.subject?.trim();
  return (
    <details className="mb-4 min-w-0 rounded-xl border p-3">
      <summary className="cursor-pointer font-medium">Estudar matéria completa{selection ? ` · ${selection.subject}` : ""}</summary>
      <div className="mt-3 grid gap-3">
        {selection && <p className="break-words text-sm">Materiais da conversa: {saved.map((material) => material.name).join(", ") || "nenhum disponível"}.
          {!isLoading && saved.length < selection.materialIds.length && " Alguns materiais foram removidos ou mudaram de disciplina."}</p>}
        {isLoading && <p>Carregando Biblioteca…</p>}
        {error && <p role="alert">{error.message}</p>}
        {!isLoading && !error && groups.size === 0 && <p>Na Biblioteca, use Mover para atribuir uma disciplina aos materiais.</p>}
        <label className="grid gap-1">Disciplina
          <select className="w-full min-w-0 rounded border bg-background p-2" value={key} onChange={(event) => {
            setKey(event.target.value);
            setIds([]);
          }}>
            <option value="">Selecione</option>
            {[...groups].map(([value, material]) => <option key={value} value={value}>
              {[material.subject, material.course, material.semester].filter(Boolean).join(" · ")}
            </option>)}
          </select>
        </label>
        {candidates.length > 0 && <Button variant="outline" type="button" onClick={() => setIds(candidates.map((material) => material.id))}>Selecionar todos</Button>}
        {candidates.map((material) => <label key={material.id} className="flex gap-2 break-all text-sm">
          <input type="checkbox" checked={ids.includes(material.id)} onChange={(event) => {
            const checked = event.target.checked;
            setIds((current) => checked ? [...current, material.id] : current.filter((id) => id !== material.id));
          }} />
          {materialKind(material)} · {material.name}
        </label>)}
        {selected.length > 0 && <div className="text-sm">
          <p>Sequência sugerida</p>
          <ol className="list-decimal pl-5">{selected.map((material) => <li key={material.id} className="break-all">
            {material.name}{records.some((study) => study.studyId === material.studyId && study.status === "completed") ? " · Concluído" : ""}
          </li>)}</ol>
          <p>Use os títulos e a ordem das unidades como guia. Pré-requisitos precisam ser conferidos nos materiais.</p>
        </div>}
        <Button type="button" disabled={disabled || isLoading || !subject || selected.length === 0} onClick={() => {
          if (subject) onConfirm({ key, subject, materialIds: selected.map((material) => material.id) });
        }}>Confirmar seleção e abrir conversa</Button>
      </div>
    </details>
  );
}
