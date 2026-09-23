"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Bell, Bot, Cloud, Download, HardDrive, LayoutDashboard, LockKeyhole, Palette, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppearanceSettings } from "./appearance-settings";
import { ExperienceSettings } from "./experience-settings";
import { useExperiencePreferences } from "@/features/preferences/ExperiencePreferences";
import { cn } from "@/lib/utils";

const AISettingsPanel = dynamic(() => import("./ai-settings-panel").then((module) => module.AISettingsPanel), { loading: () => <SettingsLoading /> });
const PlatformSettings = dynamic(() => import("./platform-settings").then((module) => module.PlatformSettings), { loading: () => <SettingsLoading /> });

const categories = [
  { id: "interface", label: "Interface", icon: Palette },
  { id: "ai", label: "IA", icon: Bot },
  { id: "workspace", label: "Workspace", icon: LayoutDashboard },
  { id: "notifications", label: "Notificações", icon: Bell },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "storage", label: "Armazenamento", icon: HardDrive },
  { id: "account", label: "Conta", icon: UserRound },
  { id: "cloud", label: "Cloud", icon: Cloud },
  { id: "security", label: "Segurança", icon: LockKeyhole },
] as const;
type Category = (typeof categories)[number]["id"];

export function SettingsHub() {
  const [category, setCategory] = useState<Category>("interface");
  const experience = useExperiencePreferences();
  const visible = experience.mode === "advanced" ? categories : categories.filter((item) => !["workspace", "storage"].includes(item.id));
  const platformCategories: Category[] = ["workspace", "notifications", "downloads", "storage"];
  const platformSection = platformCategories.includes(category) ? category as "workspace" | "notifications" | "downloads" | "storage" : undefined;
  useEffect(() => {
    const stored = localStorage.getItem("studyai:settings-category") as Category | null;
    if (stored && categories.some((item) => item.id === stored)) setCategory(stored);
  }, []);
  function selectCategory(next: Category) {
    setCategory(next);
    localStorage.setItem("studyai:settings-category", next);
  }
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,760px)]">
      <nav aria-label="Categorias de configurações" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-2 lg:sticky lg:top-5 lg:block lg:space-y-1">
        {visible.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => selectCategory(item.id)} className={cn("flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors lg:w-full", category === item.id ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-4" />{item.label}</button>; })}
      </nav>
      <div className="min-w-0 space-y-5">
        {category === "interface" && <><ExperienceSettings /><AppearanceSettings /></>}
        {category === "ai" && <AISettingsPanel advanced={experience.mode === "advanced"} />}
        {platformSection && <PlatformSettings section={platformSection} />}
        {category === "account" && <SettingsLinkCard icon={UserRound} title="Conta e perfil" description="Nome, email, idioma, dispositivos e sessão." action="Abrir Conta" />}
        {category === "cloud" && <SettingsLinkCard icon={Cloud} title="Cloud Sync" description="Sincronização, backups, conflitos e compartilhamentos." action="Gerenciar sincronização" />}
        {category === "security" && <SettingsLinkCard icon={LockKeyhole} title="Segurança" description="Senha, email, sessões ativas e recuperação da conta." action="Revisar segurança" />}
      </div>
    </div>
  );
}

function SettingsLinkCard({ icon: Icon, title, description, action }: { icon: typeof UserRound; title: string; description: string; action: string }) {
  return <Card className="shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon className="size-4 text-primary" />{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><Button asChild><Link href="/conta">{action}</Link></Button></CardContent></Card>;
}

function SettingsLoading() {
  return <div className="h-52 animate-pulse rounded-2xl border bg-muted/40" role="status" aria-label="Carregando configurações" />;
}
