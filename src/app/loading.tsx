export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Carregando página"
      className="space-y-7 motion-safe:animate-pulse"
    >
      <span className="sr-only">Carregando seu espaço...</span>
      <div className="h-5 w-32 rounded bg-muted" />
      <div className="h-10 w-3/4 rounded bg-muted" />
      <div className="h-72 rounded-xl border bg-muted/60" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-48 rounded-xl border bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
