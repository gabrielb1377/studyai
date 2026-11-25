import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Área de rolagem simples.
 *
 * Usa overflow nativo para preservar o comportamento de scroll do sistema
 * (inclusive em trackpads e dispositivos móveis) sem camadas extras.
 */
function ScrollArea({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="scroll-area"
      className={cn("relative overflow-y-auto overflow-x-hidden overscroll-contain", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { ScrollArea };
