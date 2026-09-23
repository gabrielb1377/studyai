import { BookOpen, Bot, Database, FolderTree, House, Library, Settings, Upload, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  advanced?: boolean;
  compact?: boolean;
};

export const navigation = [
  {
    href: "/",
    label: "Dashboard",
    icon: House,
    description: "Seu ponto de partida",
  },
  {
    href: "/biblioteca",
    label: "Biblioteca",
    icon: Library,
    description: "Um lugar para seus materiais",
  },
  {
    href: "/estudo",
    label: "Estudo",
    icon: BookOpen,
    description: "Seu espaço para aprender",
  },
  {
    href: "/tutor",
    label: "Tutor IA",
    icon: Bot,
    description: "Seu assistente de estudo",
  },
  {
    href: "/importar",
    label: "Importar",
    icon: Upload,
    description: "Adicionar materiais à biblioteca",
    compact: true,
  },
  {
    href: "/organizar",
    label: "Organizar",
    icon: FolderTree,
    description: "Revisar a estrutura dos materiais",
    advanced: true,
  },
  {
    href: "/storage",
    label: "Diagnóstico",
    icon: Database,
    description: "Armazenamento e dados técnicos",
    advanced: true,
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    description: "Deixe o espaço com a sua cara",
  },
  {
    href: "/conta",
    label: "Conta",
    icon: UserRound,
    description: "Sincronização e segurança",
  },
] satisfies NavigationItem[];
