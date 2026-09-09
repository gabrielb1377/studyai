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
    <Card className="items-center px-6 py-16 text-center shadow-none sm:py-24">
      <div className="mb-1 flex size-16 items-center justify-center rounded-2xl border bg-sidebar text-primary">
        <Icon className="size-7" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </Card>
  );
}
