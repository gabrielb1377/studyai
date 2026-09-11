# Handoff Atual — Sprint 19

Atualizado em 10 de setembro de 2026.

## Estado entregue

O RAG agora combina busca vetorial local com o ranking lexical existente. A indexação é determinística, versionada e não depende de serviços externos.

```text
ImportWorkspace
  → useImport
  → ExtractionPipeline
  → ContentExtractionService
  → ContentStorage
  → ChunkService
  → ChunkStorage
  → EmbeddingService
  → EmbeddingStorage
  → RetrievalService
  → SemanticSearchService + SearchService
  → RankingService
  → TutorService
  → PromptBuilder / ContextAssembler
  → GeminiService
```

## Embeddings locais

- O modelo `local-feature-hash-v1` gera vetores normalizados de 192 dimensões.
- As features incluem termos, raízes em português, trigramas e pares de palavras.
- A comparação usa similaridade de cosseno.
- A indexação ocorre após a extração e também é sincronizada sob demanda.
- Embeddings válidos são reutilizados; registros órfãos são removidos.
- Nenhuma chamada HTTP ou biblioteca de modelo foi adicionada.

## Persistência

`studyai:embeddings` guarda um objeto versionado:

```text
{
  version: 1,
  model: "local-feature-hash-v1",
  dimensions: 192,
  status: "idle" | "indexing" | "ready" | "error",
  embeddings: ChunkEmbedding[],
  lastIndexedAt?: string
}
```

Cada embedding relaciona `chunkId`, `studyId`, vetor e `createdAt`. `studyai:content-chunks` continua sendo a fonte do índice e permite reconstruir todos os vetores.

## Ranking híbrido

O score único combina:

- similaridade semântica: até 55 pontos;
- ranking lexical: até 25 pontos;
- mesmo `studyId`: 8 pontos;
- correspondência no nome do arquivo: até 7 pontos;
- frequência dos termos: até 5 pontos.

## Fallback

- Se a geração, persistência ou comparação de embeddings falhar, o `RetrievalService` utiliza a busca lexical da Sprint 18.
- Sem chunks, mas com tema ativo, seguem contexto do estudo, histórico e pergunta.
- Sem qualquer contexto, seguem histórico e pergunta original.

## Próximo passo seguro

Criar uma etapa explícita de associação entre registros `unassigned` e um `studyId`. Uma evolução posterior pode trocar apenas o `EmbeddingService` por um modelo neural local, mantendo persistência, busca e ranking.

## Limites obrigatórios

- Não há banco vetorial, modelo neural externo, Ollama ou banco de dados.
- Não transcrever áudio ou vídeo nesta camada.
- Não enviar arquivos físicos ao Tutor ou ao Gemini.
- Não enviar todo o conteúdo extraído ao Gemini; somente os resultados ranqueados.
- Manter extração e recuperação independentes de qualquer provedor de IA.
- Validar com `npm run lint`, `npm run typecheck`, `npm run test:e2e` e `npm run build`.
