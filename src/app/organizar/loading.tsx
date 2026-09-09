export default function OrganizationLoading() {
  return (
    <div className="space-y-6" aria-label="Carregando organização">
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      <div className="h-96 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
