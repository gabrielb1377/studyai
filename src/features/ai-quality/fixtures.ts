/**
 * Casos de teste built-in para o AI Quality Lab.
 * Fixtures determinísticas — não dependem de serviços externos.
 */

import type { EvaluationCase, EvaluationSuite, QualityCriterion } from "./types";

export const BUILTIN_SUITE: Omit<EvaluationSuite, "id" | "createdAt" | "updatedAt"> = {
  name: "Suite Básica — Tutor/Professor",
  cases: [
    {
      id: "case-fidelity-basic",
      name: "Fidelidade — Conceito presente no material",
      question: "O que é uma lista encadeada?",
      sourceMaterial: `Uma lista encadeada é uma estrutura de dados linear onde cada elemento (nó) contém um valor e uma referência para o próximo nó. Diferente de arrays, listas encadeadas não requerem memória contígua. Operações de inserção e remoção são O(1) quando se tem a referência do nó anterior.`,
      expectedAnswer: "Uma lista encadeada é uma estrutura linear com nós que têm valor e ponteiro para o próximo. Inserção/remoção O(1) com referência anterior.",
      expectedCitations: ["estrutura de dados linear", "nó", "referência para o próximo"],
      expectedPageRefs: [1],
      criteria: ["fidelity", "relevance", "citations", "pedagogical"],
      metadata: { topic: "estruturas de dados", difficulty: "basic" },
    },
    {
      id: "case-fidelity-hallucination",
      name: "Fidelidade — Alucinação (conceito ausente)",
      question: "Qual a complexidade de busca em lista encadeada?",
      sourceMaterial: `Listas encadeadas permitem inserção e remoção O(1) com referência. Busca sequencial é O(n) pois não há acesso direto por índice.`,
      expectedAnswer: "Busca em lista encadeada é O(n) — busca sequencial, sem acesso direto por índice.",
      expectedCitations: ["O(n)", "busca sequencial", "acesso direto"],
      criteria: ["fidelity", "relevance", "citations"],
      metadata: { topic: "complexidade", difficulty: "basic" },
    },
    {
      id: "case-relevance-generic",
      name: "Relevância — Resposta genérica",
      question: "Explique a diferença entre array e lista encadeada.",
      sourceMaterial: `Arrays têm memória contígua e acesso O(1) por índice. Listas encadeadas usam nós dispersos com ponteiros, inserção/remoção O(1) mas busca O(n).`,
      expectedAnswer: "Arrays têm memória contígua e acesso O(1); listas usam nós com ponteiros, inserção O(1) mas busca O(n).",
      criteria: ["relevance", "pedagogical", "citations"],
      metadata: { topic: "comparação", difficulty: "intermediate" },
    },
    {
      id: "case-no-context",
      name: "Sem Contexto — Material não contém a resposta",
      question: "Qual a complexidade de hash table?",
      sourceMaterial: `Listas encadeadas são estruturas lineares com nós. Cada nó tem valor e próximo. Inserção O(1) com referência anterior. Busca O(n).`,
      expectedAnswer: "O material não contém informação sobre hash tables.",
      criteria: ["no-context", "relevance"],
      metadata: { topic: "fora do escopo", difficulty: "basic" },
    },
    {
      id: "case-citations-pages",
      name: "Citações — Página e trecho",
      question: "Como funciona inserção em lista encadeada?",
      sourceMaterial: `Página 1: Inserção em lista encadeada requer ajustar o ponteiro do nó anterior para o novo nó, e o novo nó aponta para o próximo. É O(1) com referência anterior. Página 2: Remoção similar — anterior aponta para próximo do removido.`,
      expectedAnswer: "Inserção é O(1) com referência anterior: ajusta ponteiro do anterior para novo nó, novo nó aponta para próximo (p. 1).",
      expectedCitations: ["ponteiro do nó anterior", "novo nó aponta"],
      expectedPageRefs: [1],
      criteria: ["citations", "fidelity", "relevance"],
      metadata: { topic: "operações", difficulty: "basic" },
    },
    {
      id: "case-pedagogical-analogy",
      name: "Pedagógica — Estrutura didática",
      question: "Compare array vs lista encadeada para um iniciante.",
      sourceMaterial: `Arrays: memória contígua, acesso rápido por índice, tamanho fixo. Listas encadeadas: memória dispersa, ponteiros, tamanho dinâmico, inserção/remoção eficiente.`,
      expectedAnswer: "Arrays são como uma fileira de armários numerados — acesso direto mas tamanho fixo. Listas encadeadas são como uma corrente — pode crescer mas para achar um item precisa percorrer.",
      criteria: ["pedagogical", "relevance", "language-consistency"],
      metadata: { topic: "analogia", difficulty: "basic" },
    },
    {
      id: "case-exercise-correction",
      name: "Correção de Exercício — Com justificativa",
      question: "Corrija: 'Inserção no início de lista encadeada é O(n)'",
      sourceMaterial: `Inserção no início de lista encadeada: novo nó aponta para head atual, head vira novo nó. O(1).`,
      expectedAnswer: "Incorreto. Inserção no início é O(1): novo nó aponta para head, head vira o novo nó. Não precisa percorrer a lista.",
      expectedCitations: ["O(1)", "head", "novo nó"],
      criteria: ["exercise-correction", "fidelity", "pedagogical"],
      metadata: { topic: "correção", difficulty: "intermediate" },
    },
    {
      id: "case-language-consistency",
      name: "Consistência de Idioma — PT-BR",
      question: "O que é ponteiro em lista encadeada?",
      sourceMaterial: `Um ponteiro (ou referência) em lista encadeada guarda o endereço do próximo nó na memória. Permite ligar nós não contíguos.`,
      expectedAnswer: "Ponteiro guarda o endereço do próximo nó, permitindo ligar nós dispersos na memória.",
      criteria: ["language-consistency", "fidelity", "relevance"],
      metadata: { topic: "conceito base", difficulty: "basic" },
    },
    {
      id: "case-provider-error",
      name: "Erro de Provider — Mensagem amigável",
      question: "Qualquer pergunta",
      sourceMaterial: "Material qualquer para teste.",
      expectedAnswer: "O serviço de IA está temporariamente indisponível. Tente novamente em alguns instantes ou configure sua chave de API.",
      criteria: ["provider-error-handling", "language-consistency"],
      metadata: { topic: "erro", difficulty: "basic" },
    },
  ],
};

export const ADVANCED_SUITE: Omit<EvaluationSuite, "id" | "createdAt" | "updatedAt"> = {
  name: "Suite Avançada — Casos de Borda",
  cases: [
    {
      id: "case-adv-fidelity-invented",
      name: "Fidelidade — Número inventado",
      question: "Quantos elementos a lista tem?",
      sourceMaterial: `A lista contém vários elementos. Cada nó aponta para o próximo.`,
      expectedAnswer: "O material não informa a quantidade exata de elementos.",
      criteria: ["fidelity", "no-context"],
      metadata: { topic: "quantidade não especificada" },
    },
    {
      id: "case-adv-relevance-short",
      name: "Relevância — Resposta muito curta",
      question: "Explique detalhadamente como funciona remoção em lista encadeada.",
      sourceMaterial: `Remoção: nó anterior aponta para próximo do nó removido. Se for head, head vira próximo. O(1) com referência.`,
      expectedAnswer: "Remove ajustando ponteiros.",
      criteria: ["relevance", "pedagogical"],
      metadata: { topic: "resposta curta demais" },
    },
    {
      id: "case-adv-citations-no-page",
      name: "Citações — Sem referência de página",
      question: "Qual a complexidade de busca?",
      sourceMaterial: `Busca sequencial em lista encadeada é O(n). Não há índice.`,
      expectedAnswer: "Busca é O(n) porque não tem índice.",
      expectedCitations: ["O(n)", "busca sequencial"],
      criteria: ["citations", "fidelity"],
      metadata: { topic: "citação parcial" },
    },
  ],
};