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
        <p className="type-eyebrow mb-2.5">
          {eyebrow}
        </p>
        <h1 className="type-page-title">
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
