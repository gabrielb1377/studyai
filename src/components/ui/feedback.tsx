import * as React from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const icons = { info: Info, success: CheckCircle2, warning: TriangleAlert, error: AlertCircle };

type FeedbackProps = Omit<React.ComponentProps<"div">, "title"> & {
  variant: keyof typeof icons;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

export function Feedback({ variant, title, description, children, className, ...props }: FeedbackProps) {
  const Icon = icons[variant];
  return (
    <div className={cn("flex min-w-0 items-start gap-3 rounded-xl border p-3 text-sm", {
      "feedback-info": variant === "info",
      "feedback-success": variant === "success",
      "feedback-warning": variant === "warning",
      "feedback-error": variant === "error",
    }, className)} {...props}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {description && <p className={title ? "mt-1" : undefined}>{description}</p>}
        {children}
      </div>
    </div>
  );
}
