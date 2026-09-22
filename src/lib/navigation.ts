import { BookOpen, Bot, FolderTree, House, Library, Settings, Upload, UserRound } from "lucide-react";

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
  },
  {
    href: "/organizar",
    label: "Organizar",
    icon: FolderTree,
    description: "Revisar a estrutura dos materiais",
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
];
