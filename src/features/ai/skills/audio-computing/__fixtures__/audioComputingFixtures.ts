/**
 * StudyAI — Intelligence Engine (IE-4E)
 * Fixtures sintéticas e determinísticas para:
 * - audio.learning (0.1.0)
 * - code.teaching (0.1.0)
 * - cs.algorithms (0.1.0)
 */

import type { AudioLearningOutput } from "../audioLearning";
import type { CodeTeachingOutput } from "../codeTeaching";
import type { CsAlgorithmsOutput } from "../csAlgorithms";

export const AUDIO_LEARNING_FIXTURES = {
  readyValid: {
    inputs: { topic: "Busca Binária", level: "intermediate", targetDurationMinutes: 4 },
    simulatedOutput: JSON.stringify({
      topic: "Busca Binária",
      level: "intermediate",
      status: "ready",
      steps: [
        {
          title: "Introdução",
          kind: "introduction",
          spoken: "Hoje vamos revisar busca binária em vetores ordenados em cerca de quatro minutos.",
          original: "Revisão de busca binária em vetores ordenados.",
        },
        {
          title: "Ideia central",
          kind: "explanation",
          spoken: "A cada comparação com o elemento do meio, descartamos metade do vetor restante.",
          original: "Cada iteração compara o alvo com o elemento central e reduz o intervalo pela metade.",
        },
        {
          title: "Exemplo prático",
          kind: "example",
          spoken: "No vetor dois, quatro, seis, oito, dez, ao procurar oito, comparamos com seis e seguimos para a metade direita.",
          original: "Exemplo em [2, 4, 6, 8, 10] buscando 8.",
        },
        {
          title: "Checagem rápida",
          kind: "summary",
          spoken: "Lembre-se: a pré-condição obrigatória da busca binária é o vetor estar ordenado.",
          original: "Pré-condição obrigatória: vetor ordenado.",
        },
      ],
      comprehensionQuestions: [
        {
          question: "Por que a busca binária exige que o vetor esteja ordenado?",
          expectedKeyPoints: ["Para garantir que descartar metade do intervalo não elimine o alvo."],
        },
      ],
      estimatedDurationMinutes: 4,
      durationBasis: "estimated_from_script",
      audioSynthesized: false,
      sourceRefs: ["Algoritmos · p. 18"],
    } satisfies AudioLearningOutput),
  },

  fakeSynthesisAndRefInvalid: {
    inputs: { topic: "Busca Binária", level: "intermediate" },
    rawInvalid: JSON.stringify({
      topic: "Busca Binária",
      level: "intermediate",
      status: "ready",
      steps: [
        {
          title: "Única etapa",
          kind: "introduction",
          spoken: "Áudio MP3 sintetizado pronto para download com duração medida no player.",
          original: "Áudio gerado.",
        },
      ],
      comprehensionQuestions: [{ question: "Entendeu?", expectedKeyPoints: ["Sim"] }],
      estimatedDurationMinutes: 3,
      durationBasis: "estimated_from_script",
      audioSynthesized: true, // violação!
      sourceRefs: ["Livro Inventado · p. 999"],
    }),
  },
};

export const CODE_TEACHING_FIXTURES = {
  buggyJsValidResponse: {
    inputs: {
      language: "javascript",
      sourceCode: "function somarPares(nums) {\n  let total = 0;\n  for (let i = 0; i <= nums.length; i++) {\n    if (nums[i] % 2 === 0) total += nums[i];\n  }\n  return total;\n}",
    },
    simulatedOutput: JSON.stringify({
      language: "javascript",
      codeExplanation:
        "A função percorre um array numérico para somar apenas os elementos pares, mas o laço ultrapassa o último índice válido.",
      identifiedErrors: [
        {
          description: "Condição de parada 'i <= nums.length' acessa nums[nums.length] (undefined) na última iteração (off-by-one).",
          certainty: "confirmed",
          locationHint: "linha 3 (for)",
        },
        {
          description: "Se algum elemento do array não for número, o operador % pode produzir NaN.",
          certainty: "hypothesis",
          locationHint: "linha 4 (if)",
        },
      ],
      suggestedFix:
        "function somarPares(nums) {\n  let total = 0;\n  for (let i = 0; i < nums.length; i++) {\n    if (nums[i] % 2 === 0) total += nums[i];\n  }\n  return total;\n}",
      minimalExample: "const exemplo = [2, 3, 4];\n// somarPares(exemplo) -> 6",
      changesExplanation: "Alterada a condição do laço de 'i <= nums.length' para 'i < nums.length' para evitar acesso fora dos limites.",
      expectedResult: "Resultado esperado (análise estática, não executado): somarPares([2, 3, 4]) retorna 6.",
      executionStatus: "not_executed",
      wasExecuted: false,
    } satisfies CodeTeachingOutput),
  },

  fakeExecutionAndEvalInvalid: {
    inputs: {
      language: "javascript",
      sourceCode: "function f(x) { return x + 1; }",
    },
    rawInvalid: JSON.stringify({
      language: "javascript",
      codeExplanation: "Executei o código no terminal e o código foi compilado com sucesso.",
      identifiedErrors: [],
      suggestedFix: "eval('x + 1')",
      minimalExample: "new Function('return 1')()",
      changesExplanation: "Terminal retornou 2.",
      expectedResult: "Saída real do compilador: 2.",
      executionStatus: "not_executed",
      wasExecuted: true, // violação!
    }),
  },
};

export const CS_ALGORITHMS_FIXTURES = {
  binarySearchValid: {
    inputs: { algorithmName: "Busca Binária", sampleInput: "[2, 4, 6, 8, 10], target=8" },
    simulatedOutput: JSON.stringify({
      algorithmName: "Busca Binária",
      dataStructure: "Vetor Ordenado",
      explanation:
        "A busca binária divide repetidamente o intervalo de busca ao meio comparando o valor central com o alvo.",
      inputSummary: "entrada=[2, 4, 6, 8, 10], alvo=8",
      traceSteps: [
        { step: 1, action: "low=0, high=4 -> mid=2 (valor 6 < 8), move low=3", intermediateState: "subvetor=[8, 10]" },
        { step: 2, action: "low=3, high=4 -> mid=3 (valor 8 == 8), encontrado no índice 3", intermediateState: "resultado=3" },
      ],
      expectedOutput: "3",
      complexity: {
        timeBest: "O(1)",
        timeAverage: "O(log n)",
        timeWorst: "O(log n)",
        space: "O(1)",
      },
      complementaryDiagram: {
        modality: "mermaid",
        status: "specification_only",
        content: "flowchart LR\n  A[\"[2,4,6,8,10] mid=6\"] --> B[\"[8,10] mid=8\"] --> C[\"Índice 3\"]",
      },
      declarativeOnly: true,
      deterministicVerificationScope: "canonical_subset",
    } satisfies CsAlgorithmsOutput),
  },

  emptyArraySearchValid: {
    inputs: { algorithmName: "Busca Binária", sampleInput: "[], target=5" },
    simulatedOutput: JSON.stringify({
      algorithmName: "Busca Binária",
      dataStructure: "Vetor Ordenado",
      explanation: "Com entrada vazia, low=0 > high=-1 imediatamente; o algoritmo encerra retornando -1.",
      inputSummary: "entrada=[], alvo=5",
      traceSteps: [
        { step: 1, action: "Verifica low=0 <= high=-1 (falso), encerra busca.", intermediateState: "vetor=[], resultado=-1" },
      ],
      expectedOutput: "-1",
      complexity: {
        timeBest: "O(1)",
        timeWorst: "O(log n)",
        space: "O(1)",
      },
      complementaryDiagram: {
        modality: "text_fallback",
        status: "textual_fallback",
        content: "Entrada vazia [] -> condição low <= high falsa -> retorna -1.",
      },
      declarativeOnly: true,
      deterministicVerificationScope: "canonical_subset",
    } satisfies CsAlgorithmsOutput),
  },

  wrongOutputAndMaliciousMermaidInvalid: {
    inputs: { algorithmName: "Busca Binária", sampleInput: "[2, 4, 6, 8, 10], target=8" },
    rawInvalid: JSON.stringify({
      algorithmName: "Busca Binária",
      explanation: "Busca binária com resultado errado e link perigoso.",
      inputSummary: "entrada=[2, 4, 6, 8, 10], alvo=8",
      traceSteps: [
        { step: 1, action: "Retorna índice incorreto.", intermediateState: "resultado=0" },
      ],
      expectedOutput: "0", // divergente de 3!
      complexity: { timeWorst: "O(n^2)", space: "O(1)" }, // divergente de O(log n)!
      complementaryDiagram: {
        modality: "mermaid",
        status: "specification_only",
        content: "flowchart TD\n  A --> B\n  click A \"javascript:alert(1)\"",
      },
      declarativeOnly: true,
      deterministicVerificationScope: "canonical_subset",
    } satisfies CsAlgorithmsOutput),
  },
};
