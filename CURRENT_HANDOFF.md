# Handoff Atual — Sprint 17

Atualizado em 10 de setembro de 2026.

## Estado entregue

A importação agora processa arquivos reais no navegador e persiste um registro normalizado com texto, metadados e status.

```text
ImportWorkspace
  → useImport
  → ExtractionPipeline
  → ContentExtractionService
  → ContentStorage
  → ExtractionSummary no Dashboard
```

## Formatos

| Formato | Extração atual |
| --- | --- |
| PDF | Texto por página e quantidade de páginas com PDF.js. |
| DOCX | Texto dos documentos, cabeçalhos, rodapés e notas OOXML. |
| PPTX | Texto dos slides e notas; quantidade de slides. |
| TXT | Texto integral pela API `File`. |
| MP3 | Duração e metadados básicos pelo elemento HTML5. Sem transcrição. |
| MP4 | Duração, largura, altura e metadados básicos pelo elemento HTML5. Sem transcrição. |

## Persistência

`studyai:extracted-content` guarda um objeto versionado:

```text
{
  version: 1,
  records: ExtractedContent[]
}
```

Cada registro possui `id`, `studyId`, `fileId`, `fileType`, `extractedText`, `metadata`, `status` e `createdAt`. Arquivos ainda não organizados usam `studyId: "unassigned"`. Somente o resultado é persistido; o arquivo físico continua temporário e nunca é enviado ao servidor.

## Estados

- `processing`: extração em andamento.
- `extracted`: texto ou metadados extraídos e persistidos.
- `error`: arquivo inválido, corrompido ou mídia sem metadados legíveis.
- O Dashboard deriva “Não iniciado” quando não existe nenhum registro.

## Próximo passo seguro

Antes de implementar RAG, criar uma etapa explícita de associação entre registros `unassigned` e um `studyId`, além de segmentação determinística do `extractedText` com proveniência por página ou slide.

## Limites obrigatórios

- Não há RAG, embeddings, busca semântica, Ollama ou banco.
- Não transcrever áudio ou vídeo nesta camada.
- Não enviar arquivos físicos ao Tutor ou ao Gemini.
- Manter a extração independente de qualquer provedor de IA.
- Validar com `npm run lint`, `npm run typecheck`, `npm run test:e2e` e `npm run build`.
