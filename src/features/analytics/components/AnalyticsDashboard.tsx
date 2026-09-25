"use client";

import { BarChart3, CalendarRange, Clock3, Download, FileText, Flame, RotateCcw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnalyticsSnapshot, PeriodComparison } from "../types";
import { AnalyticsHeatmap, BreakdownList, ForgettingList, PeriodChart, RetentionList } from "./AnalyticsCharts";

function comparisonText(comparison: PeriodComparison) {
  if (comparison.deltaPercent === null) return "Sem período anterior comparável";
  return `${comparison.deltaPercent >= 0 ? "+" : ""}${comparison.deltaPercent}% em relação ao período anterior`;
}

function SummaryCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Clock3 }) {
  return <Card className="gap-2 p-4 shadow-none"><div className="flex items-center justify-between"><span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span></div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold tracking-tight">{value}</p><p className="text-[11px] leading-4 text-muted-foreground">{detail}</p></Card>;
}

export function AnalyticsDashboard({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const subjectRetention = snapshot.retention.filter((item) => item.scope === "subject");
  const conceptRetention = snapshot.retention.filter((item) => item.scope === "concept");
  const chapterRetention = snapshot.retention.filter((item) => item.scope === "chapter");
  const statusCounts = snapshot.forgetting.reduce<Record<string, number>>((result, item) => ({ ...result, [item.status]: (result[item.status] ?? 0) + 1 }), {});
  const exportReport = (format: "csv" | "pdf") => {
    void import("../AnalyticsExporter").then(({ AnalyticsExporter }) => AnalyticsExporter[format](snapshot));
  };

  return (
    <section aria-labelledby="analytics-title" className="space-y-5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 id="analytics-title" className="text-xl font-semibold tracking-tight">Analytics de aprendizagem</h2><Badge variant="secondary">Dados reais</Badge></div><p className="mt-1 text-sm text-muted-foreground">Tendências, retenção e estimativas calculadas somente a partir das atividades registradas.</p></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => exportReport("csv")}><Download />CSV</Button><Button variant="outline" size="sm" onClick={() => exportReport("pdf")}><FileText />PDF</Button></div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Tempo estudado" value={`${Math.round(snapshot.totalMinutes / 60 * 10) / 10}h`} detail={comparisonText(snapshot.weekComparison)} icon={Clock3} />
        <SummaryCard label="Revisões previstas" value={String(snapshot.forecast.reviewsNext7Days)} detail="Estimativa para os próximos 7 dias" icon={RotateCcw} />
        <SummaryCard label="Carga restante" value={`${Math.round(snapshot.forecast.remainingStudyMinutes / 60 * 10) / 10}h`} detail="Estimativa baseada no tempo de leitura e progresso" icon={CalendarRange} />
        <SummaryCard label="Sequência" value={`${snapshot.currentStreak} dias`} detail={`Melhor sequência: ${snapshot.longestStreak} dias`} icon={Flame} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="max-w-full overflow-x-auto"><TabsTrigger value="overview">Visão geral</TabsTrigger><TabsTrigger value="retention">Retenção</TabsTrigger><TabsTrigger value="evolution">Evolução</TabsTrigger></TabsList>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="gap-4 p-4 shadow-none"><div><h3 className="font-semibold">Evolução semanal</h3><p className="text-xs text-muted-foreground">Últimas 8 semanas · {comparisonText(snapshot.weekComparison)}</p></div><PeriodChart data={snapshot.weekly} label="Evolução semanal" /></Card>
            <Card className="gap-4 p-4 shadow-none"><div><h3 className="font-semibold">Evolução mensal</h3><p className="text-xs text-muted-foreground">Últimos 6 meses · {comparisonText(snapshot.monthComparison)}</p></div><PeriodChart data={snapshot.monthly} label="Evolução mensal" /></Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="gap-4 p-4 shadow-none"><h3 className="font-semibold">Tempo por matéria</h3><BreakdownList items={snapshot.timeBySubject} emptyMessage="Ainda não há tempo registrado por matéria." /></Card>
            <Card className="gap-4 p-4 shadow-none"><h3 className="font-semibold">Tempo por tema</h3><BreakdownList items={snapshot.timeByTopic} emptyMessage="Ainda não há tempo registrado por tema." /></Card>
            <Card className="gap-4 p-4 shadow-none"><h3 className="font-semibold">Tempo por capítulo</h3><BreakdownList items={snapshot.timeByChapter} emptyMessage="As atividades atuais ainda não registram tempo por capítulo." /></Card>
          </div>
          <Card className="gap-4 p-4 shadow-none"><div className="flex items-center gap-2"><BarChart3 className="size-4 text-primary"/><h3 className="font-semibold">Mapa de calor</h3></div><AnalyticsHeatmap days={snapshot.heatmap} /></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="gap-4 p-4 shadow-none"><div className="flex items-center gap-2"><Sparkles className="size-4 text-primary"/><h3 className="font-semibold">Insights</h3></div><div className="space-y-2">{snapshot.insights.map((insight) => <div key={insight.id} className="rounded-xl border p-3"><div className="flex items-start gap-2"><span className={`mt-1 size-2 rounded-full ${insight.tone === "attention" ? "bg-amber-500" : insight.tone === "positive" ? "bg-emerald-500" : "bg-muted-foreground"}`} /><div><p className="text-sm font-medium">{insight.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{insight.description}</p></div></div></div>)}</div></Card>
            <Card className="gap-4 p-4 shadow-none"><h3 className="font-semibold">Distribuição sugerida</h3><p className="text-xs text-muted-foreground">Estimativa proporcional ao histórico por matéria.</p><BreakdownList items={snapshot.forecast.sessionsBySubject} emptyMessage="Registre sessões para receber uma distribuição estimada." /></Card>
          </div>
        </TabsContent>

        <TabsContent value="retention" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3"><Card className="p-4 shadow-none"><TrendingDown className="size-4 text-amber-600"/><strong className="text-2xl">{statusCounts.forgetting ?? 0}</strong><span className="text-xs text-muted-foreground">Assuntos esquecendo</span></Card><Card className="p-4 shadow-none"><BarChart3 className="size-4 text-sky-600"/><strong className="text-2xl">{statusCounts.stable ?? 0}</strong><span className="text-xs text-muted-foreground">Assuntos estáveis</span></Card><Card className="p-4 shadow-none"><TrendingUp className="size-4 text-emerald-600"/><strong className="text-2xl">{statusCounts.mastered ?? 0}</strong><span className="text-xs text-muted-foreground">Assuntos dominados</span></Card></div>
          <Card className="gap-4 p-4 shadow-none"><div><h3 className="font-semibold">Curva de esquecimento</h3><p className="text-xs text-muted-foreground">Classificação calculada por retenção, confiança e recência.</p></div><ForgettingList items={snapshot.forgetting} /></Card>
          <div className="grid gap-4 lg:grid-cols-3"><RetentionList title="Por matéria" items={subjectRetention} /><RetentionList title="Por conceito" items={conceptRetention} /><RetentionList title="Por capítulo" items={chapterRetention} /></div>
          <p className="text-xs text-muted-foreground">Retenção por conceito e capítulo é uma estimativa herdada das evidências do tema correspondente; não representa uma avaliação isolada desses itens.</p>
        </TabsContent>

        <TabsContent value="evolution">
          <Card className="gap-4 p-4 shadow-none"><h3 className="font-semibold">Linha do tempo</h3>{snapshot.timeline.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Sua evolução aparecerá conforme atividades forem concluídas.</p> : <ol className="relative space-y-3 border-l pl-5">{snapshot.timeline.map((item) => <li key={`${item.type}-${item.id}`} className="relative rounded-xl border p-3 before:absolute before:-left-[1.55rem] before:top-4 before:size-2 before:rounded-full before:bg-primary"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{item.title}</p><time className="text-[11px] text-muted-foreground">{new Date(item.occurredAt).toLocaleString("pt-BR")}</time></div><p className="mt-1 text-xs text-muted-foreground">{item.description}</p></li>)}</ol>}</Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
