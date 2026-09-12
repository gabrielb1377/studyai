# Handoff Atual — Sprint 20.5

Atualizado em 12 de setembro de 2026.

## Estado entregue

O StudyAI deixou de inicializar telas com conteúdos demonstrativos. A importação de um `File` escolhido pelo usuário cria o registro oficial do material, executa a extração e atualiza Biblioteca, Organização e Dashboard. O Study Engine só cria estudos quando um material é organizado.

```text
File selecionado
  → MaterialService
  → ExtractionPipeline
  → ContentStorage
  → ChunkStorage
  → EmbeddingStorage
  → OrganizationService
  → StudyEngine
  → Biblioteca / Dashboard / Workspace / Tutor
```

## Fonte oficial dos materiais

- `studyai:materials` persiste metadados, progresso, status e organização.
- `MaterialRuntimeStore` mantém o `File` e a URL de objeto apenas durante a sessão atual.
- `ContentStorage`, `ChunkStorage` e `EmbeddingStorage` persistem os dados derivados.
- Não existem seeds de Biblioteca, Organização, Dashboard, Workspace ou Tutor.

## Organização e Study Engine

Ao mover um material, `OrganizationService`:

1. define curso, semestre, matéria e tema;
2. reutiliza ou cria um `studyId`;
3. atualiza conteúdo, chunks e embeddings;
4. cria ou atualiza o registro em `studyai:study-engine:v2`;
5. preserva notas, resumos, flashcards e quizzes se o estudo anterior deixar de existir.

Renomear atualiza o nome do material e a proveniência do conteúdo. Excluir remove o material e seus dados derivados.

## Consumo de contexto

- Tutor: estudo atual, notas, resumo, histórico e chunks recuperados.
- Resumos: exigem contexto e chunks do estudo.
- Flashcards: exigem chunks reais vinculados ao `studyId`.
- Quiz: exige chunks reais vinculados ao `studyId`.
- Notas: recebem automaticamente o `studyId` do Workspace aberto.

Os Route Handlers recebem somente objetos estruturados. Nenhum arquivo físico é enviado ao Gemini.

## Dashboard e Biblioteca

- A Biblioteca mostra somente arquivos importados, com tipo, tamanho, data, progresso, status e organização.
- O Dashboard calcula temas recentes, progresso, extrações, embeddings e atividade semanal a partir das persistências reais.
- Estados vazios orientam a primeira importação sem criar conteúdo artificial.

## Persistência

| Chave | Conteúdo |
| --- | --- |
| `studyai:materials` | Materiais importados e organização. |
| `studyai:study-engine:v2` | Estudos derivados dos materiais. |
| `studyai:tutor-conversations:v2` | Conversas criadas pelo usuário. |
| `studyai:extracted-content` | Texto e metadados extraídos. |
| `studyai:content-chunks` | Chunks por arquivo e estudo. |
| `studyai:embeddings` | Índice semântico local. |
| `studyai:summaries` | Resumos por estudo. |
| `studyai:flashcards` | Flashcards por estudo. |
| `studyai:quizzes` | Questões e resultados por estudo. |
| `studyai:notes` | Notas por estudo. |

## Limites atuais

- O binário original não é persistido, pois ainda não há banco, IndexedDB ou upload. Depois de recarregar a página, o texto extraído permanece, mas PDF, áudio, vídeo ou imagem precisam ser selecionados novamente para visualização binária.
- A primeira transcrição depende do download do modelo Whisper; indisponibilidade de rede é registrada como erro do arquivo sem interromper os demais.
- O histórico do Tutor é local ao navegador.
- Não há Ollama, banco, cloud ou sincronização.

## Validação

Os testes de tela partem de arquivos selecionados no input, aguardam a extração e organizam o material antes de validar os consumidores. A inferência de áudio aceita o erro operacional esperado quando o modelo ainda não está disponível no cache e a rede está indisponível.

```text
npm run lint
npm run typecheck
npm run test:e2e
npm run build
```

## Próximo passo seguro

Persistir os binários em IndexedDB com migração versionada e política de quota. Isso permitiria reabrir visualizadores após recarregar sem alterar os contratos atuais de Material, Content, Chunk ou Study.
