export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Carregando importação"
      className="space-y-7 motion-safe:animate-pulse"
    >
      <span className="sr-only">Carregando importação...</span>
      <div className="h-4 w-24 rounded bg-muted" />
      <div className="h-10 w-52 rounded bg-muted" />
      <div className="h-5 w-full max-w-xl rounded bg-muted" />
      <div className="h-72 rounded-xl border bg-muted/50" />
    </div>
  );
}
