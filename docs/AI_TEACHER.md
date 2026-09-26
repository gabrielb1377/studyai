# AI Teacher 2.0

## Objetivo

O modo Professor conduz explicações e atividades adaptadas ao estudo atual sem substituir Tutor, Mentor ou AI Core. Ele reutiliza conversas, recuperação, compressão, cache, providers e persistência existentes.

## Fluxo

```mermaid
flowchart TD
  UI[TutorWorkspace: modo Professor] --> PREF[Nível, método e ação]
  PDF[Texto selecionado no PDF] --> PREF
  PREF --> RET[RetrievalPipeline]
  RET --> API[/api/tutor]
  API --> VALID[teacher-validation]
  VALID --> TP[TeacherPromptBuilder]
  TP --> PB[PromptBuilder + ContextBuilder]
  PB --> AI[AIService]
  AI --> PM[ProviderManager + cache]
  PM --> OUT[Conversa persistida]
```

## Capacidades

- Cinco níveis de explicação e sete métodos de ensino.
- Aula guiada em etapas, aguardando a participação do estudante.
- Plano com objetivo, pré-requisitos, conceitos, exemplos, exercícios, resumo e revisão.
- Fluxograma e mapa mental em fonte Mermaid editável.
- Linha do tempo somente quando o material sustenta uma ordem cronológica ou processual.
- Exercícios variados e correção com justificativa, conceito, fonte e recomendação.
- Comparação de conceitos e seis formatos de resumo adaptativo.
- Explicação de seleção do PDF com proveniência de página e capítulo.

## Integrações e limites

`TutorContextService` reúne o perfil do Learning Engine, capítulos e continuidade do Mentor. `RetrievalPipeline` acrescenta chunks e relações do Knowledge Graph. A aplicação envia ao provider somente esse contexto estruturado; o arquivo físico nunca é transmitido.

As preferências pedagógicas são pequenas e ficam no `localStorage`. Conversas continuam no store `metadata` do IndexedDB. O resultado depende de um provider configurado e pode conter imprecisões, como qualquer resposta generativa.
