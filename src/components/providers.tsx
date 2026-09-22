"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StorageBootstrap } from "@/lib/storage/StorageBootstrap";
import { AuthProvider } from "@/features/account/AuthProvider";
import { CloudSyncProvider } from "@/features/sync/CloudSyncProvider";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      storageKey="studyai-theme"
      disableTransitionOnChange
      nonce={nonce}
    >
      <StorageBootstrap />
      <AuthProvider>
        <CloudSyncProvider />
        <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
