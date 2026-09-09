import type { OrganizationDestination, OrganizationFile } from "@/types/organization";

export const organizationFiles: readonly OrganizationFile[] = [
  {
    id: "org-01",
    name: "Aula01.pdf",
    type: "pdf",
    typeLabel: "PDF",
    size: "2,4 MB",
    course: "Ciência da Computação",
    semester: "1º Semestre",
    subject: "Algoritmos",
  },
  {
    id: "org-02",
    name: "Aula02.mp4",
    type: "video",
    typeLabel: "Vídeo",
    size: "184 MB",
    course: "Ciência da Computação",
    semester: "1º Semestre",
    subject: "Algoritmos",
  },
  {
    id: "org-03",
    name: "Exercícios.docx",
    type: "document",
    typeLabel: "Documento",
    size: "648 KB",
    course: "Ciência da Computação",
    semester: "1º Semestre",
    subject: "Algoritmos",
  },
  {
    id: "org-04",
    name: "Lógica proposicional.txt",
    type: "document",
    typeLabel: "Texto",
    size: "38 KB",
    course: "Ciência da Computação",
    semester: "1º Semestre",
    subject: "Matemática Discreta",
  },
  {
    id: "org-05",
    name: "Modelagem de dados.pptx",
    type: "document",
    typeLabel: "Slides",
    size: "6,1 MB",
    course: "Ciência da Computação",
    semester: "2º Semestre",
    subject: "Banco de Dados",
  },
];

export const organizationDestinations: readonly OrganizationDestination[] = [
  { semester: "1º Semestre", subject: "Algoritmos" },
  { semester: "1º Semestre", subject: "Matemática Discreta" },
  { semester: "2º Semestre", subject: "Banco de Dados" },
];
