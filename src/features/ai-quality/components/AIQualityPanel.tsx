"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  LoaderCircle,
  Play,
  Plus,
  Save,
  Settings,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  EvaluationCase,
  EvaluationRun,
  EvaluationSuite,
  QualityCriterion,
  EvaluationMode,
  LLMJudgeConfig,
} from "../types";
import {
  EvaluationStorage,
  createSuite,
  createCase,
  runEvaluation,
  compareRuns,
  DEFAULT_CRITERIA,
  CRITERION_LABELS,
  CRITERION_DESCRIPTIONS,
} from "../index";
import { BUILTIN_SUITE, ADVANCED_SUITE } from "../fixtures";

const modeOptions = [
  { value: "deterministic", label: "Determinístico (gratuito, offline)" },
  { value: "llm-judge", label: "LLM-as-a-Judge (usa BYOK)" },
];

const criterionOptions = DEFAULT_CRITERIA.map((c) => ({
  value: c,
  label: CRITERION_LABELS[c],
}));

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function AIQualityPanel() {
  const [suites, setSuites] = useState<EvaluationSuite[]>(() => {
    const stored = EvaluationStorage.getSuites();
    if (stored.length === 0) {
      const builtin = createSuite(BUILTIN_SUITE.name);
      builtin.cases = BUILTIN_SUITE.cases.map((c) => createCase(builtin.id, c));
      const advanced = createSuite(ADVANCED_SUITE.name);
      advanced.cases = ADVANCED_SUITE.cases.map((c) => createCase(advanced.id, c));
      EvaluationStorage.saveSuite(builtin);
      EvaluationStorage.saveSuite(advanced);
      return [builtin, advanced];
    }
    return stored;
  });
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | undefined>(suites[0]?.id);
  const [activeTab, setActiveTab] = useState<"cases" | "run" | "history" | "settings">("cases");
  const [mode, setMode] = useState<EvaluationMode>("deterministic");
  const [llmConfig, setLlmConfig] = useState<LLMJudgeConfig>({
    provider: "gemini",
    model: "gemini-2.5-flash",
    temperature: 0.1,
    maxTokens: 1000,
  });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentRun, setCurrentRun] = useState<EvaluationRun | null>(null);
  const [feedback, setFeedback] = useState("");
  const [editingCase, setEditingCase] = useState<EvaluationCase | null>(null);
  const [newCase, setNewCase] = useState<Partial<EvaluationCase>>({
    name: "",
    question: "",
    sourceMaterial: "",
    expectedAnswer: "",
    criteria: DEFAULT_CRITERIA,
  });

  const suite = suites.find((s) => s.id === selectedSuiteId);
  const runs = useMemo(() => EvaluationStorage.getRuns().filter((r) => r.suiteId === selectedSuiteId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [selectedSuiteId]);

  useEffect(() => {
    setSuites(EvaluationStorage.getSuites());
  }, []);

  const suiteNames = suites.map((s) => ({ value: s.id, label: s.name }));

  const handleAddSuite = () => {
    const s = createSuite("Nova Suite");
    EvaluationStorage.saveSuite(s);
    setSuites((prev) => [...prev, s]);
    setSelectedSuiteId(s.id);
  };

  const handleSaveCase = () => {
    if (!suite || !newCase.name || !newCase.question || !newCase.sourceMaterial || !newCase.expectedAnswer) {
      setFeedback("Preencha todos os campos obrigatórios.");
      return;
    }
    const c = createCase(suite.id, newCase as Omit<EvaluationCase, "id">);
    const updated = { ...suite, cases: [...suite.cases, c], updatedAt: new Date().toISOString() };
    EvaluationStorage.saveSuite(updated);
    setSuites((prev) => prev.map((s) => (s.id === suite.id ? updated : s)));
    setNewCase({ name: "", question: "", sourceMaterial: "", expectedAnswer: "", criteria: DEFAULT_CRITERIA });
    setFeedback("Caso adicionado.");
  };

  const handleEditCase = (c: EvaluationCase) => setEditingCase(c);
  const handleUpdateCase = () => {
    if (!editingCase || !suite) return;
    const updated = { ...suite, cases: suite.cases.map((c) => (c.id === editingCase.id ? editingCase : c)), updatedAt: new Date().toISOString() };
    EvaluationStorage.saveSuite(updated);
    setSuites((prev) => prev.map((s) => (s.id === suite.id ? updated : s)));
    setEditingCase(null);
    setFeedback("Caso atualizado.");
  };

  const handleDeleteCase = (caseId: string) => {
    if (!suite) return;
    const updated = { ...suite, cases: suite.cases.filter((c) => c.id !== caseId), updatedAt: new Date().toISOString() };
    EvaluationStorage.saveSuite(updated);
    setSuites((prev) => prev.map((s) => (s.id === suite.id ? updated : s)));
  };

  const handleRun = async () => {
    if (!suite || suite.cases.length === 0) {
      setFeedback("Nenhum caso para avaliar.");
      return;
    }
    setRunning(true);
    setProgress(0);
    setCurrentRun(null);
    setFeedback("");

    try {
      const run = await runEvaluation(suite, async (q, m) => {
        // Em produção, chamaria o Tutor/Professor real via API
        // Para demo, retorna resposta simulada baseada no expectedAnswer
        return m.includes("hash table") ? "O material não contém informação sobre hash tables." : "Resposta simulada para teste.";
      }, mode, mode === "llm-judge" ? llmConfig : undefined);

      setCurrentRun(run);
      setProgress(100);
      setFeedback(`Avaliação concluída: ${run.summary.passed}/${run.summary.total} passaram.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Erro na avaliação.");
    } finally {
      setRunning(false);
    }
  };

  const handleCompare = (runA: EvaluationRun, runB: EvaluationRun) => {
    const comp = compareRuns(runA, runB);
    setFeedback(`Comparação: ${comp.improved} melhoraram, ${comp.regressed} regrediram, ${comp.stable} estáveis.`);
  };

  if (!suite) return <Card className="p-6 text-center text-muted-foreground">Nenhuma suite selecionada.</Card>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Zap className="size-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">AI Quality Lab</h2>
            <Badge variant="outline">{suite.cases.length} casos</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={selectedSuiteId ?? ""} onValueChange={(v) => setSelectedSuiteId(v || undefined)} options={suiteNames} placeholder="Selecionar suite" className="w-56" />
            <Button variant="outline" size="sm" onClick={handleAddSuite}><Plus className="size-3.5" /> Nova</Button>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "cases" | "run" | "history" | "settings")} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="cases">Casos de Teste</TabsTrigger>
          <TabsTrigger value="run" disabled={suite.cases.length === 0}>Executar</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        {/* Cases Tab */}
        <TabsContent value="cases" className="space-y-4 mt-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Adicionar / Editar Caso</h3>
            <div className="space-y-3 max-w-3xl">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Nome do caso</label>
                  <Input value={newCase.name} onChange={(e) => setNewCase({ ...newCase, name: e.target.value })} placeholder="Ex: Fidelidade — Conceito presente" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Critérios</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {criterionOptions.map((opt) => (
                      <label key={opt.value} className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm cursor-pointer hover:bg-accent/50">
                        <input
                          type="checkbox"
                          checked={newCase.criteria?.includes(opt.value as QualityCriterion) ?? false}
                          onChange={(e) => setNewCase({
                            ...newCase,
                            criteria: e.target.checked
                              ? [...(newCase.criteria ?? []), opt.value as QualityCriterion]
                              : (newCase.criteria ?? []).filter((c) => c !== opt.value)
                          })}
                          className="size-4 rounded border-input"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Pergunta</label>
                <Input value={newCase.question} onChange={(e) => setNewCase({ ...newCase, question: e.target.value })} placeholder="O que é uma lista encadeada?" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Material-fonte</label>
                <Textarea value={newCase.sourceMaterial} onChange={(e) => setNewCase({ ...newCase, sourceMaterial: e.target.value })} rows={4} placeholder="Texto do material de estudo..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Resposta esperada (referência)</label>
                <Textarea value={newCase.expectedAnswer} onChange={(e) => setNewCase({ ...newCase, expectedAnswer: e.target.value })} rows={3} placeholder="Resposta ideal para comparação..." />
              </div>
              <div className="flex gap-2">
                {editingCase ? (
                  <Button variant="outline" onClick={() => setEditingCase(null)}>Cancelar</Button>
                ) : null}
                <Button onClick={editingCase ? handleUpdateCase : handleSaveCase} disabled={running}>
                  {editingCase ? "Atualizar" : <> <Save className="size-3.5 mr-1" /> Salvar Caso </>}
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b">
              <h3 className="font-semibold">{suite.name} — {suite.cases.length} casos</h3>
            </div>
            <div className="divide-y">
              {suite.cases.map((c) => (
                <div key={c.id} className="p-4 hover:bg-accent/30 transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        <Badge variant="outline">{c.criteria.map((cr) => CRITERION_LABELS[cr]).join(", ")}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{c.question}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEditCase(c)}><FileText className="size-4" /> Editar</Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteCase(c.id)}><Trash2 className="size-4" /> Excluir</Button>
                    </div>
                  </div>
                  <details className="mt-3 text-sm text-muted-foreground">
                    <summary className="cursor-pointer font-medium">Ver detalhes</summary>
                    <div className="mt-2 space-y-2">
                      <div><strong>Material:</strong> <span className="ml-2 line-clamp-3">{c.sourceMaterial}</span></div>
                      <div><strong>Esperada:</strong> <span className="ml-2 line-clamp-2">{c.expectedAnswer}</span></div>
                      {c.expectedCitations?.length ? <div><strong>Citações:</strong> <span className="ml-2">{c.expectedCitations.join(", ")}</span></div> : null}
                      {c.expectedPageRefs?.length ? <div><strong>Páginas:</strong> <span className="ml-2">{c.expectedPageRefs.join(", ")}</span></div> : null}
                    </div>
                  </details>
                </div>
              ))}
              {suite.cases.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">Nenhum caso. Adicione acima ou crie uma nova suite.</div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Run Tab */}
        <TabsContent value="run" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold">Executar Avaliação</h3>
                <p className="text-sm text-muted-foreground">{suite.cases.length} casos · {suite.cases.reduce((sum, c) => sum + c.criteria.length, 0)} avaliações individuais</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Select value={mode} onValueChange={(v) => setMode(v as EvaluationMode)} options={modeOptions} className="w-56" />
                {mode === "llm-judge" && (
                  <div className="flex flex-wrap gap-2">
                    <Select value={llmConfig.provider} onValueChange={(v) => setLlmConfig({ ...llmConfig, provider: v as "gemini" | "groq" | "openrouter" | "ollama" })} options={[{ value: "gemini", label: "Gemini" }, { value: "groq", label: "Groq" }, { value: "openrouter", label: "OpenRouter" }, { value: "ollama", label: "Ollama" }]} placeholder="Provider" />
                    <Input value={llmConfig.model} onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })} placeholder="Modelo" className="w-40" />
                  </div>
                )}
                <Button onClick={handleRun} disabled={running || suite.cases.length === 0} size="lg">
                  {running ? <> <LoaderCircle className="size-4 animate-spin mr-2" /> Executando... </> : <> <Play className="size-4 mr-2" /> Iniciar </>}
                </Button>
              </div>
            </div>

            {running && (
              <div className="space-y-2 mt-4">
                <Progress value={progress} />
                <p className="text-sm text-muted-foreground">{progress}% concluído</p>
              </div>
            )}

            {currentRun && (
              <Card className="mt-4 p-4 border-emerald-500/30 bg-emerald-500/5">
                <h4 className="font-semibold text-emerald-700 dark:text-emerald-300">Resultado: {currentRun.summary.passed}/{currentRun.summary.total} passaram</h4>
                <dl className="grid gap-2 mt-2 sm:grid-cols-4 text-sm">
                  <div><dt className="text-muted-foreground">Passou</dt><dd className="font-medium text-emerald-600">{currentRun.summary.passed}</dd></div>
                  <div><dt className="text-muted-foreground">Falhou</dt><dd className="font-medium text-destructive">{currentRun.summary.failed}</dd></div>
                  <div><dt className="text-muted-foreground">Score médio</dt><dd className="font-medium">{currentRun.summary.averageScore.toFixed(2)}</dd></div>
                  <div><dt className="text-muted-foreground">Modo</dt><dd className="font-medium capitalize">{currentRun.mode}</dd></div>
                </dl>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium">Detalhes por critério</summary>
                  <div className="mt-2 space-y-1 text-xs">
                    {currentRun.results.map((r) => (
                      <div key={`${r.caseId}-${r.criterion}`} className={cn("flex gap-2", r.passed ? "text-emerald-600" : "text-destructive")}>
                        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>{r.caseId.slice(0, 8)} — {CRITERION_LABELS[r.criterion]}: {r.score} — {r.reasoning}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </Card>
            )}

            {feedback && (
              <div className="mt-4 p-3 rounded-lg bg-secondary/50 text-sm" role="status">
                {feedback}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <Card>
            {runs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhuma execução ainda.</div>
            ) : (
              <div className="divide-y">
                {runs.map((run) => (
                  <div key={run.id} className="p-4 hover:bg-accent/30">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatDate(run.startedAt)}</span>
                          <Badge variant="outline">{run.mode}</Badge>
                          <Badge variant={run.summary.passed === run.summary.total ? "default" : "outline"}>{run.summary.passed}/{run.summary.total}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Score médio: {run.summary.averageScore.toFixed(2)} · {run.provider ?? "determinístico"}</p>
                      </div>
                      <div className="flex gap-1">
                        {runs.length > 1 && runs[0].id !== run.id && (
                          <Button variant="ghost" size="sm" onClick={() => handleCompare(runs[0], run)}>
                            Comparar com baseline
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => EvaluationStorage.deleteRun(run.id)}><Trash2 className="size-4" /></Button>
                      </div>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-muted-foreground">Ver detalhes</summary>
                      <div className="mt-2 space-y-1 text-xs">
                        {run.results.map((r) => (
                          <div key={`${r.caseId}-${r.criterion}`} className={cn("flex gap-2", r.passed ? "text-emerald-600" : "text-destructive")}>
                            <span>{r.caseId.slice(0, 8)} — {CRITERION_LABELS[r.criterion]}: {r.score}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-4">Configurações do LLM Judge</h3>
            <div className="space-y-3 max-w-md">
              <div>
                <label className="block text-sm font-medium mb-1">Provider</label>
                <Select value={llmConfig.provider} onValueChange={(v) => setLlmConfig({ ...llmConfig, provider: v as "gemini" | "groq" | "openrouter" | "ollama" })} options={[{ value: "gemini", label: "Gemini" }, { value: "groq", label: "Groq" }, { value: "openrouter", label: "OpenRouter" }, { value: "ollama", label: "Ollama" }]} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Modelo</label>
                <Input value={llmConfig.model} onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })} placeholder="gemini-2.5-flash" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Temperature</label>
                <Input type="number" step="0.1" min="0" max="1" value={llmConfig.temperature} onChange={(e) => setLlmConfig({ ...llmConfig, temperature: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Tokens</label>
                <Input type="number" step="100" min="100" max="4000" value={llmConfig.maxTokens} onChange={(e) => setLlmConfig({ ...llmConfig, maxTokens: Number(e.target.value) })} />
              </div>
              <p className="text-xs text-muted-foreground">
                O LLM Judge usa sua chave BYOK configurada em Configurações → IA.
                Avaliações LLM consomem tokens da sua cota.
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-semibold mb-3">Critérios Disponíveis</h3>
            <dl className="space-y-2 text-sm">
              {DEFAULT_CRITERIA.map((c) => (
                <div key={c} className="grid grid-cols-[auto_1fr] gap-4">
                  <dt className="font-medium">{CRITERION_LABELS[c]}</dt>
                  <dd className="text-muted-foreground">{CRITERION_DESCRIPTIONS[c]}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AIQualityPanel;