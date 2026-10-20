import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = Omit<React.ComponentProps<"select">, "onChange" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
};

/**
 * Select nativo estilizado pelo Design System.
 *
 * Usa o elemento `<select>` do navegador para preservar acessibilidade,
 * navegação por teclado e o seletor nativo em dispositivos móveis.
 */
function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled,
  ...props
}: SelectProps) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select"
        className={cn(
          "h-10 w-full min-w-0 appearance-none rounded-xl border border-input bg-background/75 py-1 ps-3 pe-9 text-base shadow-xs transition-[color,background-color,border-color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/20",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          className,
        )}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

export { Select };
