# Handoff Atual — Sprint 23: Provider Manager + Intelligent Ingestion Pipeline

Atualizado em 15 de setembro de 2026.

## Estado entregue

O StudyAI utiliza exclusivamente dados criados pelo usuário. A importação cria o registro oficial, infere matéria e tema, cria ou reutiliza um Study, executa a extração e atualiza Biblioteca, Organização e Dashboard sem depender de uma organização manual posterior.

A camada de IA agora é centralizada em `src/features/ai`. Tutor, resumo, flashcards e quiz não conhecem Gemini nem acessam o Retrieval Service diretamente.

A ingestão agora processa cada documento por etapas observáveis. PDF.js é sempre consultado primeiro e o OCR é executado somente quando nenhuma camada de texto foi encontrada. Todo texto passa por normalização antes de chunks e embeddings. DOCX preserva títulos, parágrafos, listas, tabelas, cabeçalhos, rodapés e notas; PPTX preserva slides e notas; TXT detecta encoding; áudio e vídeo registram transcrição, timestamps e capítulos quando o runtime local consegue decodificá-los.

```text
Documento
  → Extração / OCR ou Whisper quando necessário
  → Normalização
  → DocumentAnalyzer
  → Metadados inteligentes e resumo inicial
  → Chunks do texto normalizado
  → Embeddings compactados
  → Índice local
```

Cada registro de conteúdo possui status por etapa e logs. Falhas incluem motivo, arquivo, etapa, stack simplificada e ação sugerida. Dashboard, Biblioteca e Tutor consomem os metadados analisados; a organização manual continua sendo a fonte oficial quando diverge da detecção.

```text
Feature cliente
  → RetrievalPipeline
  → AIClient
  → Route Handler
  → PromptBuilder / ContextBuilder
  → AIService
  → ProviderManager
  → ProviderRegistry / HealthService / LatencyService
  → AIProvider
  → GeminiProvider | OllamaProvider | OpenRouterProvider (stub) | GroqProvider (stub)
```

## AI Core

- `AIProvider.ts`: contrato compartilhado de requests, responses e providers.
- `AIService.ts`: registro e resolução central no servidor.
- `AIClient.ts`: fronteira única entre features cliente e rotas internas.
- `AISettings.ts`: provider e modelo selecionados, com migração da preferência anterior e persistência no navegador.
- `PromptBuilder.ts`: prompts de Tutor, resumo, flashcards e quiz.
- `ContextBuilder.ts`: contexto do Study e trechos recuperados com limite de tamanho.
- `RetrievalPipeline.ts`: única entrada das features de IA para o RAG local.
- `AIErrors.ts`: erros e normalização HTTP independentes do provider.
- `ProviderRegistry.ts`: catálogo server-only dos providers.
- `HealthService.ts`: health agregado e cacheado para todos os providers.
- `LatencyService.ts`: medição compartilhada de latência.
- `ProviderManager.ts`: seleção manual/automática, fallback, logs e métricas.

Gemini e Ollama são providers funcionais. OpenRouter e Groq são stubs seguros. A página de Configurações lista o health de todos, permite seleção manual ou automática e mostra status, latência, modelo, memória, versão, última verificação e métricas de geração.

No modo manual, o provider preferencial é a primeira tentativa. No modo automático, o Manager seleciona o provider online de menor latência. Qualquer falha inicia a cadeia Ollama → Gemini → Groq → OpenRouter, sem exigir alterações no Tutor, Resumos, Flashcards, Quiz ou RAG. Se todos falharem, a interface recebe um erro normalizado e preserva a pergunta do usuário.

```text
Configurações / Feature
  → AIClient
  → Route Handler interno
  → AIService
  → OllamaProvider
  → GET /api/tags | GET /api/version | POST /api/chat
```

O `OllamaProvider` usa `http://localhost:11434` por padrão ou `OLLAMA_URL` quando configurado. O chat recebe uma mensagem de sistema, o histórico e o prompt contextual já montado pelo AI Core. Respostas completas e streams NDJSON são normalizados no mesmo `AIResponse`.

```text
File selecionado
  → MaterialService
  → OrganizationService.organizeImported
  → StudyEngine
  → ExtractionPipeline
  → ContentStorage
  → ChunkStorage
  → EmbeddingStorage
  → Biblioteca / Dashboard / Workspace / Tutor
```

## Fonte oficial dos materiais

- `studyai:materials` persiste metadados, caminho relativo, progresso, status e organização em um payload versionado.
- `MaterialRuntimeStore` mantém o `File` e a URL de objeto apenas durante a sessão atual.
- `ContentStorage`, `ChunkStorage` e `EmbeddingStorage` persistem os dados derivados.
- Não existem seeds de Biblioteca, Organização, Dashboard, Workspace ou Tutor.

## Organização automática e Study Engine

Antes da extração, `OrganizationService.organizeImported`:

1. normaliza o caminho relativo do arquivo;
2. infere matéria e tema pelas pastas ou pelo nome do arquivo;
3. reutiliza o Study de materiais no mesmo destino;
4. cria um Study quando ainda não existe;
5. entrega o `studyId` à extração, aos chunks e aos embeddings.

Ao mover manualmente um material, `OrganizationService`:

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

Os Route Handlers recebem somente objetos estruturados. Nenhum arquivo físico é enviado ao Gemini ou ao Ollama.

## Dashboard e Biblioteca

- A Biblioteca mostra somente arquivos importados, com tipo, tamanho, data, caminho relativo, progresso, status e organização.
- Todos os filtros pesquisam somente o registro persistido dos arquivos importados.
- O Dashboard mostra arquivos, estudos, progresso médio, flashcards, quizzes, extrações, embeddings e atividade semanal a partir das persistências reais.
- Estados vazios orientam a primeira importação sem criar conteúdo artificial.

## Persistência

| Chave | Conteúdo |
| --- | --- |
| `studyai:materials` | Materiais importados e organização. |
| `studyai:study-engine:v2` | Estudos derivados dos materiais. |
| `studyai:tutor-conversations:v2` | Conversas criadas pelo usuário. |
| `studyai:extracted-content` | Texto e metadados extraídos. |
| `studyai:content-chunks` | Chunks por arquivo e estudo. |
| `studyai:embeddings` | Índice semântico local V2, quantizado em Int8 e codificado em Base64. |
| `studyai:summaries` | Resumos por estudo. |
| `studyai:flashcards` | Flashcards por estudo. |
| `studyai:quizzes` | Questões e resultados por estudo. |
| `studyai:notes` | Notas por estudo. |
| `studyai:ai-settings` | Modo de seleção, provider preferencial e modelos selecionados. |

## Limites atuais

- O binário original não é persistido, pois ainda não há banco, IndexedDB ou upload. Depois de recarregar a página, o texto extraído permanece, mas PDF, áudio, vídeo ou imagem precisam ser selecionados novamente para visualização binária.
- A primeira transcrição depende do download do modelo Whisper; indisponibilidade de rede é registrada como erro do arquivo sem interromper os demais.
- O histórico do Tutor é local ao navegador.
- O Ollama depende de um serviço local em execução e de pelo menos um modelo instalado.
- Não há banco, cloud ou sincronização.

## Validação

Os testes de tela partem de arquivos selecionados no input e aguardam a extração. A suíte cobre criação automática de Study, agrupamento por `Matéria/Tema`, associação de conteúdo/chunks/embeddings, fallback de configuração do Gemini e persistência de conversa, resumo, flashcards e quiz após reabrir a aplicação. A inferência de áudio aceita o erro operacional esperado quando o modelo ainda não está disponível no cache e a rede está indisponível.

```text
npm run lint
npm run typecheck
npm run test:e2e
npm run build
```

Na Sprint 23, os 36 cenários E2E validam seleção manual, modo automático por latência, health agregado, persistência V3, OCR, transcrição, PDF com e sem texto, DOCX, PPTX, TXT com múltiplos encodings, mídia inválida, normalização, análise documental, pipeline, Biblioteca, Tutor e indexação. A prova operacional real iniciou pelo Groq indisponível, aplicou fallback para `qwen3:4b` no Ollama e registrou a falha, o fallback, a mensagem e 333 tokens no singleton efêmero do servidor.

## Próximo passo seguro

Implementar OpenRouter ou Groq dentro do contrato `AIProvider`. O novo provider precisa apenas ser registrado em `ProviderRegistry`; seleção, health, logs e fallback permanecem transparentes às features.
