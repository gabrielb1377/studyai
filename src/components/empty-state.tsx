import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="relative items-center overflow-hidden border-dashed px-6 py-14 text-center sm:py-20">
      <div className="pointer-events-none absolute inset-x-1/4 -top-24 h-48 rounded-full bg-primary/8 blur-3xl" aria-hidden="true" />
      <div className="relative mb-1 flex size-16 items-center justify-center rounded-2xl border bg-sidebar text-primary shadow-sm">
        <Icon className="size-7" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="relative">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </Card>
  );
}
