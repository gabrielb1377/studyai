/**
 * StudyAI — Intelligence Engine (IE-4D)
 * Fixtures sintéticas e determinísticas (data fixa: 2026-11-26T12:00:00.000Z) para:
 * - feedback.personal (0.1.0)
 * - review.from-errors (0.1.0)
 * - explain.multimodal (0.1.0)
 */

import type { FeedbackPersonalOutput } from "../feedbackPersonal";
import type { ReviewFromErrorsOutput } from "../reviewFromErrors";
import type { ExplainMultimodalOutput } from "../explainMultimodal";

export const IE4D_FIXED_DATE = "2026-11-26T12:00:00.000Z";

export const FEEDBACK_PERSONAL_FIXTURES = {
  noHistoryValid: {
    inputs: { referenceDate: IE4D_FIXED_DATE },
    simulatedOutput: JSON.stringify({
      hasHistory: false,
      dataSufficiency: "insufficient",
      observedResults: [],
      strengths: [],
      difficulties: [],
      pedagogicalInterpretation:
        "Não há avaliações ou respostas registradas ainda; é necessário coletar uma primeira evidência antes de diagnosticar domínio.",
      recommendations: [
        {
          action: "Responder a um exercício diagnóstico curto sobre o tema selecionado.",
          rationale: "Permite observar compreensão real sem rotular ausência de dados como dificuldade.",
          proportionalToLevel: "foundational",
        },
      ],
      nextSteps: ["Realizar 3 questões iniciais sobre o tema atual."],
    } satisfies FeedbackPersonalOutput),
  },

  fabricatedMetricsInvalid: {
    inputs: { referenceDate: IE4D_FIXED_DATE },
    rawInvalid: JSON.stringify({
      hasHistory: true,
      dataSufficiency: "sufficient",
      observedResults: [
        {
          studyId: "study-ed",
          topic: "Estruturas de Dados",
          metricSummary: "Nota fabricada de 99% sem erros.",
          knowledgeScore: 99, // divergente do snapshot
          pendingErrorsCount: 0, // divergente do snapshot
        },
      ],
      strengths: [{ point: "Excelência inventada", evidence: "Nota 99%" }],
      difficulties: [],
      pedagogicalInterpretation: "Desempenho excelente segundo nota fabricada.",
      recommendations: [
        {
          action: "Avançar imediatamente",
          rationale: "Baseado em métrica inventada.",
          proportionalToLevel: "advancement",
        },
      ],
      nextSteps: ["Pular revisão."],
    } satisfies FeedbackPersonalOutput),
  },

  unauthorizedTopicInvalid: {
    inputs: { referenceDate: IE4D_FIXED_DATE },
    rawInvalid: JSON.stringify({
      hasHistory: true,
      dataSufficiency: "sufficient",
      observedResults: [
        {
          studyId: "study-inexistente-99",
          topic: "Física Quântica Não Autorizada",
          metricSummary: "Tópico fora do contexto.",
        },
      ],
      strengths: [{ point: "Boa base", evidence: "Evidência inventada" }],
      difficulties: [],
      pedagogicalInterpretation: "Avaliação sobre tópico fora do snapshot autorizado.",
      recommendations: [
        {
          action: "Revisar tópico não autorizado",
          rationale: "Sem vínculo com os estudos do aluno.",
          proportionalToLevel: "foundational",
        },
      ],
      nextSteps: ["Estudar tópico inventado."],
    } satisfies FeedbackPersonalOutput),
  },
};

export const REVIEW_FROM_ERRORS_FIXTURES = {
  noErrorsValid: {
    inputs: { referenceDate: IE4D_FIXED_DATE },
    simulatedOutput: JSON.stringify({
      hasErrors: false,
      reviewItems: [],
      overallGuidance:
        "Não há erros pendentes registrados no caderno de erros. Continue estudando e registre novas tentativas para habilitar revisões dirigidas.",
    } satisfies ReviewFromErrorsOutput),
  },

  fabricatedErrorIdInvalid: {
    inputs: { referenceDate: IE4D_FIXED_DATE },
    rawInvalid: JSON.stringify({
      hasErrors: true,
      reviewItems: [
        {
          errorId: "err-inventado-999",
          studyId: "study-ed",
          topic: "Listas Ligadas",
          observedError: "Erro inexistente.",
          relatedConcept: "Ponteiros",
          pedagogicalHypothesis: "Hipótese sobre erro inexistente.",
          correctionExplanation: "Explicação.",
          reinforcementExercises: [
            {
              prompt: "Pergunta de reforço.",
              expectedAnswer: "Resposta.",
              revealAnswerBeforeAttempt: false,
            },
          ],
          reviewRecommendation: "Revisar hoje.",
          urgencyLabel: "Alta",
        },
      ],
      overallGuidance: "Revise o erro inventado.",
    } satisfies ReviewFromErrorsOutput),
  },
};

export const EXPLAIN_MULTIMODAL_FIXTURES = {
  mermaidValid: {
    inputs: { topic: "Árvore Binária de Busca", preferredModality: "mermaid" },
    simulatedOutput: JSON.stringify({
      topic: "Árvore Binária de Busca",
      textualExplanation:
        "Em uma Árvore Binária de Busca (ABB), cada nó mantém chaves menores na subárvore esquerda e chaves maiores na subárvore direita, permitindo buscas eficientes quando balanceada.",
      complementaryRepresentation: {
        modality: "mermaid",
        status: "specification_only",
        content: "flowchart TD\n  A[\"Raiz (10)\"] --> B[\"Esquerda (5)\"]\n  A --> C[\"Direita (15)\"]",
        notes: "Especificação Mermaid declarativa pronta para renderização futura; nenhuma imagem binária foi gerada.",
      },
      examples: [
        {
          title: "Busca pela chave 5",
          description: "Começa na raiz 10, compara 5 < 10 e desce para a subárvore esquerda encontrando 5.",
        },
      ],
      sourceRefs: ["Estruturas de Dados · p. 34"],
      declarativeCapabilitiesOnly: true,
    } satisfies ExplainMultimodalOutput),
  },

  textFallbackValid: {
    inputs: { topic: "Árvore Binária de Busca" },
    simulatedOutput: JSON.stringify({
      topic: "Árvore Binária de Busca",
      textualExplanation:
        "Em uma Árvore Binária de Busca (ABB), chaves menores ficam à esquerda e maiores à direita.",
      complementaryRepresentation: {
        modality: "text_fallback",
        status: "textual_fallback",
        content: "Raiz (10) -> Esquerda (5) | Direita (15). Para buscar 5, compare com 10 e siga à esquerda.",
        notes: "Fallback textual adotado por ausência de recurso multimodal ativo.",
      },
      examples: [
        {
          title: "Inserção da chave 12",
          description: "Compara com 10 (vai à direita), compara com 15 (vai à esquerda).",
        },
      ],
      sourceRefs: ["Estruturas de Dados · p. 34"],
      declarativeCapabilitiesOnly: true,
    } satisfies ExplainMultimodalOutput),
  },

  maliciousHtmlAndFakeRefInvalid: {
    inputs: { topic: "Árvore Binária de Busca", preferredModality: "mermaid" },
    rawInvalid: JSON.stringify({
      topic: "Árvore Binária de Busca",
      textualExplanation: "Explicação com <script>alert(1)</script> e ![img](https://evil.example/x.png).",
      complementaryRepresentation: {
        modality: "mermaid",
        status: "specification_only",
        content: "flowchart TD\n  A --> B\n  click A \"javascript:alert(1)\"",
      },
      examples: [{ title: "Ex", description: "Desc" }],
      sourceRefs: ["Livro Inexistente · p. 999"],
      declarativeCapabilitiesOnly: true,
    } satisfies ExplainMultimodalOutput),
  },
};
