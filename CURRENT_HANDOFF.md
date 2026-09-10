# Handoff Atual — Sprint 18

Atualizado em 10 de setembro de 2026.

## Estado entregue

O conteúdo extraído agora é segmentado e recuperado localmente antes de cada pergunta ao Tutor. A busca é lexical, determinística e não depende de serviços externos.

```text
ImportWorkspace
  → useImport
  → ExtractionPipeline
  → ContentExtractionService
  → ContentStorage
  → ChunkService
  → ChunkStorage
  → RetrievalService
  → SearchService
  → TutorService
  → PromptBuilder / ContextAssembler
  → GeminiService
```

## Chunking e busca

- Cada bloco usa até 160 palavras com sobreposição de 30 palavras.
- Cada chunk preserva `studyId`, `fileId`, índice, texto e metadados da origem.
- A busca normaliza caixa e acentos, remove palavras muito comuns e pontua frequência, cobertura, nome do arquivo e frase exata.
- Apenas os cinco melhores resultados são enviados por padrão.
- Quando existe tema ativo, a busca considera o mesmo `studyId` e materiais ainda `unassigned`.
- Conteúdos extraídos antes desta Sprint são indexados de forma incremental na primeira busca.

## Persistência

`studyai:content-chunks` guarda um objeto versionado:

```text
{
  version: 1,
  chunks: ContentChunk[]
}
```

O índice é substituído por origem quando o arquivo é reprocessado, evitando contexto obsoleto. `studyai:extracted-content` continua sendo a fonte normalizada do conteúdo e permite reconstruir o índice local.

## Fallback

- Com chunks relevantes: contexto limitado + contexto do estudo + histórico + pergunta.
- Sem chunks, mas com tema ativo: contexto do estudo + histórico + pergunta.
- Sem qualquer contexto: histórico + pergunta original, como antes da Sprint 18.

## Próximo passo seguro

Criar uma etapa explícita de associação entre registros `unassigned` e um `studyId`. Uma evolução posterior pode adicionar proveniência por página/slide e trocar o ranking lexical por um índice vetorial sem alterar o contrato `ContentChunk`.

## Limites obrigatórios

- Não há embeddings, busca vetorial, Ollama ou banco.
- Não transcrever áudio ou vídeo nesta camada.
- Não enviar arquivos físicos ao Tutor ou ao Gemini.
- Não enviar todo o conteúdo extraído ao Gemini; somente os resultados ranqueados.
- Manter extração e recuperação independentes de qualquer provedor de IA.
- Validar com `npm run lint`, `npm run typecheck`, `npm run test:e2e` e `npm run build`.
