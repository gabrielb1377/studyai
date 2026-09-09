import { BookOpen, FolderTree, House, Library, Settings, Upload } from "lucide-react";

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
];
