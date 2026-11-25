import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/providers";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: { default: "Dashboard · StudyAI", template: "%s · StudyAI" },
  description:
    "Seu workspace pessoal de estudos. Um espaço tranquilo para aprender no seu ritmo.",
  manifest: "/manifest.webmanifest",
  applicationName: "StudyAI",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "StudyAI" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png" }],
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8faf7" },
    { media: "(prefers-color-scheme: dark)", color: "#161b18" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body>
        <Providers nonce={nonce}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
