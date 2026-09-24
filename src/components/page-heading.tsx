export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="text-[1.85rem] font-semibold tracking-[-0.04em] text-balance sm:text-[2.15rem] sm:leading-tight">
          {title}
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-6 text-pretty text-muted-foreground sm:text-[15px]">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}
