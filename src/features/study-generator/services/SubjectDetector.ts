const SUBJECT_HINTS: Array<{ subject: string; terms: string[] }> = [
  { subject: "Algoritmos e Estruturas de Dados", terms: ["algoritmo", "vetor", "lista", "pilha", "fila", "recursao", "ordenacao"] },
  { subject: "Banco de Dados", terms: ["banco", "dados", "sql", "tabela", "relacional", "consulta", "normalizacao"] },
  { subject: "Arquitetura de Computadores", terms: ["arquitetura", "processador", "memoria", "binario", "registrador"] },
  { subject: "Programação", terms: ["programacao", "codigo", "java", "python", "funcao", "classe", "objeto"] },
  { subject: "Matemática", terms: ["matematica", "equacao", "calculo", "matriz", "derivada", "integral"] },
  { subject: "Redes de Computadores", terms: ["redes", "tcp", "ip", "protocolo", "roteamento", "pacote"] },
  { subject: "Engenharia de Software", terms: ["software", "requisitos", "uml", "teste", "desenvolvimento", "projeto"] },
  { subject: "Sistemas Operacionais", terms: ["sistema operacional", "processo", "thread", "escalonamento", "kernel"] },
];

const GENERIC_SUBJECTS = new Set([
  "materiais importados",
  "material importado",
  "sem disciplina",
  "disciplina desconhecida",
]);

export function normalizeForDetection(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function isGenericSubject(value?: string) {
  return !value || GENERIC_SUBJECTS.has(normalizeForDetection(value).trim());
}

export const SubjectDetector = {
  detect(text: string, fallback?: string) {
    const normalized = normalizeForDetection(text);
    const ranked = SUBJECT_HINTS.map((candidate) => ({
      subject: candidate.subject,
      score: candidate.terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0),
    })).sort((left, right) => right.score - left.score);

    if ((ranked[0]?.score ?? 0) > 0) return ranked[0].subject;
    return isGenericSubject(fallback) ? "Disciplina desconhecida" : fallback!;
  },
};

