import "server-only";

export const LatencyService = {
  async measure<T>(operation: () => Promise<T>) {
    const startedAt = performance.now();
    try {
      const value = await operation();
      return { value, latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      return {
        error,
        latencyMs: Math.round(performance.now() - startedAt),
      } as const;
    }
  },
};
