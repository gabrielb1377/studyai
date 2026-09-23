import "server-only";

type Metric = {
  name: string;
  value: number;
  unit: "ms" | "count" | "bytes" | "score";
  source: "server" | "client";
  createdAt: string;
};

type TelemetryState = {
  startedAt: number;
  metrics: Metric[];
  errors: Array<{ area: string; message: string; createdAt: string }>;
};

const runtime = globalThis as typeof globalThis & { __studyAiTelemetry?: TelemetryState };
const state = runtime.__studyAiTelemetry ??= { startedAt: Date.now(), metrics: [], errors: [] };
const limit = 500;

function trim<T>(items: T[]) {
  if (items.length > limit) items.splice(0, items.length - limit);
}

export const Telemetry = {
  metric(metric: Omit<Metric, "createdAt">) {
    state.metrics.push({ ...metric, createdAt: new Date().toISOString() });
    trim(state.metrics);
  },
  error(area: string, error: unknown) {
    const message = error instanceof Error ? error.message : "Erro não identificado";
    state.errors.push({ area, message: message.slice(0, 300), createdAt: new Date().toISOString() });
    trim(state.errors);
    console.error(JSON.stringify({ level: "error", area, message: message.slice(0, 300), timestamp: new Date().toISOString() }));
  },
  async measure<T>(name: string, operation: () => Promise<T>) {
    const startedAt = performance.now();
    try {
      return await operation();
    } catch (error) {
      this.error(name, error);
      throw error;
    } finally {
      this.metric({ name, value: Math.round(performance.now() - startedAt), unit: "ms", source: "server" });
    }
  },
  snapshot() {
    const memory = process.memoryUsage();
    const recent = state.metrics.slice(-100);
    const responseMetrics = recent.filter((metric) => metric.unit === "ms");
    return {
      uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000),
      memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal },
      averageResponseMs: responseMetrics.length ? Math.round(responseMetrics.reduce((sum, metric) => sum + metric.value, 0) / responseMetrics.length) : 0,
      metrics: recent,
      errors: state.errors.slice(-20),
    };
  },
};
