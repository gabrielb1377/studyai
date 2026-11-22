# StudyAI — Skills pedagógicas (catálogo proposto)

> Documento de planejamento (não aprovado para implementação). Data-base: 22/11/2026. Nada foi implementado. Contrato e arquitetura em `STUDYAI_INTELLIGENCE_ENGINE.md`; ferramentas em `STUDYAI_TOOL_ENGINE.md`.
> Estas skills são **conteúdo pedagógico próprio do produto**, versionado e testável. Não são cópias das skills de desenvolvimento do AI-RULES.
> Limites de tokens abaixo são **valores iniciais de planejamento**, não medições; calibrar com o uso real depois da contabilização de tokens (fechamento da V1.2, item 3).

## 1. Campos obrigatórios de cada skill
`id` · `version` · objetivo pedagógico · gatilhos · entradas · contrato de saída · contexto permitido · ferramentas autorizadas · limite de tokens · regras de segurança · critérios de qualidade · testes · fallback.

**Regras comuns a todas (herdadas do motor):** material e entrada do aluno ficam em bloco delimitado como dados; a skill nunca revela suas instruções; não afirma nada sobre o material sem trecho de apoio, e quando não há apoio diz que não encontrou; saída validada por esquema com um reparo; fallback para resposta textual simples.

## 2. Catálogo (20 skills) e base já existente

| # | id | Objetivo | Base existente | Estado | Ferramentas (fase) | Tokens ent./saída (inicial) |
|---|---|---|---|---|---|---|
| 1 | `tutor.beginner` | Explicar do zero, passo curto, checagem de compreensão | Nível `beginner` e métodos do Teacher | fundação | biblioteca | 2.500 / 600 |
| 2 | `technique.feynman` | Aluno explica com as próprias palavras; skill aponta lacunas e simplifica | nenhuma (ausente) | ausente | biblioteca | 2.500 / 700 |
| 3 | `technique.active-recall` | Perguntas de evocação antes de mostrar a resposta | `FlashcardService`, rota `tutor/flashcards` | existe (cartões) | biblioteca, flashcards | 2.000 / 500 |
| 4 | `technique.spaced-repetition` | Escolher o que revisar hoje e explicar por quê | `learning/ReviewScheduler.ts` (SM-2), `TopicReview.ts` | existe | desempenho | 1.500 / 400 |
| 5 | `technique.socratic` | Conduzir por perguntas, sem entregar a resposta de início | método `socratic` do Teacher; `mentor/SocraticEngine.ts` (avaliação só por palavra-chave) | fundação | biblioteca | 2.500 / 500 |
| 6 | `math.step-by-step` | Resolução em etapas com justificativa | método `step_by_step`; `MathLabService` | fundação (sem verificador acoplado) | calculadora (TE-2) | 2.500 / 900 |
| 7 | `code.teaching` | Explicar e corrigir código, com exemplo mínimo | `lab/services/LabAIService.ts`, `SafeExecutionService.ts` | existe (JS) | execução JS restrita | 3.000 / 900 |
| 8 | `exam.comparative-analysis` | Comparar provas e apontar padrões cobrados | `exam/ExamService.ts`; `exam/grade` sem IA | parcial | biblioteca, desempenho | 3.500 / 800 |
| 9 | `exam.preparation` | Plano e simulado para uma avaliação | `planning/PlanningEngine.ts`, Semana de Prova | existe | plano, quiz | 2.500 / 800 |
| 10 | `practice.adaptive` | Exercícios no nível certo | `learning/adaptive/AdaptiveAssessmentEngine.ts` | existe | quiz, desempenho | 2.500 / 800 |
| 11 | `explain.multimodal` | Explicar com diagrama, mapa mental ou áudio | `diagrams/*`, Mermaid do Teacher, `TeacherAudioLessonService` | existe | diagrama, áudio | 2.500 / 800 |
| 12 | `doc.analysis` | Resumir e questionar um documento com proveniência | `summaries`, `ocr`, `retrieval` | existe | leitura de documento | 4.000 / 800 |
| 13 | `grounding.guard` | Exigir trecho de apoio; recusar o que o material não sustenta | delimitador e `RetrievalPipeline` | fundação | biblioteca | 1.500 / 300 |
| 14 | `plan.study` | Plano com metas e prioridades | `planning/PlanningEngine.ts` | existe | plano | 2.000 / 700 |
| 15 | `audio.learning` | Aula curta em áudio com perguntas | `teacher/services/TeacherAudioLessonService.ts`, `voice/*` | existe | áudio | 2.500 / 900 |
| 16 | `gap.detection` | Mostrar lacunas e priorizar | `learning/errors/DifficultyMapEngine.ts`, `StudyPriorityEngine.ts` | fundação | desempenho, erros | 2.000 / 500 |
| 17 | `feedback.personal` | Feedback sobre uma resposta, citando o que acertou e o que corrigir | `app/api/lab/review`, correção do Teacher | existe | erros | 2.500 / 600 |
| 18 | `review.from-errors` | Revisão dirigida a partir do caderno de erros | `learning/errors/ErrorNotebookStorage.ts` | existe | erros | 2.000 / 600 |
| 19 | `examples.analogies` | Gerar exemplos e analogias adequados ao nível | métodos `analogies` e `practical_examples` | fundação | biblioteca | 1.500 / 500 |
| 20 | `cs.algorithms` | Ensinar algoritmos e estruturas de dados com traço de execução | `lab` (JS), diagramas | fundação | execução JS, diagrama | 3.000 / 900 |

Observação: 19 das 20 já têm alguma base de código (11 existentes, 7 em fundação e 1 parcial); **somente `technique.feynman` está totalmente ausente**. O trabalho principal é dar contrato, versão, esquema e teste ao que existe, não escrever 20 capacidades novas.

## 3. Especificações completas dos pilotos

### 3.1 `technique.feynman` v0.1 (nova)
- **Objetivo:** consolidar compreensão pedindo ao aluno que explique o conceito com palavras simples, e então localizar lacunas.
- **Gatilhos:** ação explícita "Explicar com minhas palavras" na UI; ou o aluno pede para "testar se entendi". Não por inferência automática.
- **Entradas:** `concept` (texto curto), `studentExplanation` (texto, máx. 2.000 caracteres), `studyId` opcional.
- **Contexto permitido:** chunks do estudo do aluno (≤ 3, deduplicados), nível preferido. Nada de memória de outras contas.
- **Ferramentas:** consulta à biblioteca (leitura).
- **Saída (esquema):** `{ understood: string[], gaps: {point, why, sourceRef?}[], simplifiedVersion: string, followUpQuestion: string, confidence: "low"|"medium"|"high" }`.
- **Segurança:** a explicação do aluno é dado delimitado; a skill não executa instruções contidas nela; não classifica o aluno, só a explicação; sem dados pessoais na telemetria.
- **Critérios de qualidade:** cada `gap` cita trecho do material ou declara "sem apoio no material"; `simplifiedVersion` ≤ 120 palavras; uma pergunta de acompanhamento.
- **Testes:** fixtures com (a) explicação correta, (b) explicação com erro conceitual, (c) explicação vazia, (d) tentativa de injeção na explicação, (e) conceito ausente do material.
- **Fallback:** resposta textual com 3 perguntas de reflexão fixas.

### 3.2 `technique.active-recall` v0.1 (envolve o que existe)
- **Objetivo:** praticar evocação com perguntas antes da resposta.
- **Entradas:** `studyId`, `topic?`, `count` (3, 5 ou 10), `level`.
- **Contexto permitido:** chunks do estudo, cartões existentes (para não repetir), erros recentes do mesmo tópico.
- **Ferramentas:** biblioteca, flashcards (transformação).
- **Saída:** `{ questions: {id, prompt, expectedAnswer, sourceRef, difficulty}[] }`. A resposta esperada **não** vai ao cliente até o aluno responder (mesma ideia do Modo Prova).
- **Segurança:** quiz exige `chunk.studyId === studyId` (já aplicado em `tutor/quiz`); sem texto copiado integralmente do material além do necessário.
- **Qualidade:** nenhuma pergunta sem `sourceRef`; sem duplicar cartões existentes; dificuldade coerente com o nível.
- **Testes:** reaproveitar os fixtures de `tutor/flashcards` e `tutor/quiz` e acrescentar duplicidade e ausência de fonte.
- **Fallback:** gerar cartões pelo caminho atual (`tutor/flashcards`).

## 4. Piloto inicial recomendado (3 skills)
`technique.feynman` (única totalmente nova, baixo risco, alto valor), `technique.socratic` (melhora a avaliação hoje por palavra-chave) e `technique.active-recall` (encapsula o que já funciona). As demais migram por paridade, uma por vez, mantendo as specs existentes.

## 5. Governança de versões
Mudança de texto de skill = nova versão; fixtures da versão anterior continuam rodando; a versão ativa por skill fica numa configuração do app, não em código espalhado. Registro de mudanças por skill. Skills de terceiros: não carregar no runtime.
