import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/providers";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "Dashboard · StudyAI", template: "%s · StudyAI" },
  description:
    "Seu workspace pessoal de estudos. Um espaço tranquilo para aprender no seu ritmo.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Providers nonce={nonce}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
