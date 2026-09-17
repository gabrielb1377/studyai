"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StorageBootstrap } from "@/lib/storage/StorageBootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      storageKey="studyai-theme"
      disableTransitionOnChange
    >
      <StorageBootstrap />
      <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
    </ThemeProvider>
  );
}
