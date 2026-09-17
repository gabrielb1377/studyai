# Handoff Atual — Sprint 25: Smart Study Generator

Atualizado em 16 de setembro de 2026.

## Estado entregue

Após cada extração bem-sucedida, o StudyAI agora analisa o conteúdo normalizado e cria ou enriquece automaticamente toda a estrutura de estudo. Disciplina, tema, subtemas, capítulos, palavras-chave, idioma, número de páginas, quantidade de palavras, prévia e tempo de leitura são persistidos no mesmo fluxo, sem IA externa e sem exigir organização manual.

Todo conteúdo pesado continua no IndexedDB `studyai-db` v1 por meio da fachada assíncrona `StorageManager`. A Sprint 25 não alterou o modelo de armazenamento nem criou novas dependências.

```text
Feature / Hook
  → Service de domínio
  → StorageManager
  → transação IndexedDB
  → object store
```

Na inicialização, `StorageBootstrap` executa a migração legada. Todos os registros são gravados atomicamente e as chaves antigas só são removidas depois do commit. Em erro, o IndexedDB realiza rollback, o legado permanece intacto e a interface apresenta um aviso recuperável.

O StudyAI utiliza exclusivamente dados criados pelo usuário. A importação cria o registro oficial, infere matéria e tema, cria ou reutiliza um Study, executa a extração e atualiza Biblioteca, Organização e Dashboard sem depender de uma organização manual posterior.

A camada de IA agora é centralizada em `src/features/ai`. Tutor, resumo, flashcards e quiz não conhecem Gemini nem acessam o Retrieval Service diretamente.

A ingestão agora processa cada documento por etapas observáveis. PDF.js é sempre consultado primeiro e o OCR é executado somente quando nenhuma camada de texto foi encontrada. Todo texto passa por normalização antes de chunks e embeddings. DOCX preserva títulos, parágrafos, listas, tabelas, cabeçalhos, rodapés e notas; PPTX preserva slides e notas; TXT detecta encoding; áudio e vídeo registram transcrição, timestamps e capítulos quando o runtime local consegue decodificá-los.

```text
Documento
  → Extração / OCR ou Whisper quando necessário
  → Normalização
  → StudyAnalyzer
  → SubjectDetector / TopicDetector / KeywordExtractor / ReadingTimeCalculator
  → StudyGeneratorService
  → Material e Study enriquecidos
  → Chunks do texto normalizado
  → Embeddings compactados
  → Índice local
```

Cada registro de conteúdo possui status por etapa e logs. Falhas incluem motivo, arquivo, etapa, stack simplificada e ação sugerida. Dashboard, Biblioteca e Tutor consomem os metadados analisados; a organização manual continua sendo a fonte oficial quando diverge da detecção.

## Smart Study Generator

- `StudyAnalyzer.ts`: coordena a análise determinística sobre texto e seções normalizados.
- `SubjectDetector.ts`: classifica disciplinas por vocabulário e aplica fallback explícito.
- `TopicDetector.ts`: identifica título, tema, subtemas e capítulos/seções estruturais.
- `KeywordExtractor.ts`: calcula palavras-chave por frequência com normalização e stop words.
- `ReadingTimeCalculator.ts`: calcula palavras e leitura estimada a 200 palavras por minuto.
- `StudyGeneratorService.ts`: atualiza material e Study Engine e produz os logs da geração.

Para materiais avulsos, a análise substitui a classificação provisória criada antes da extração. Para caminhos organizados com matéria e tema, a estrutura de pastas é preservada. Se o usuário mover o arquivo depois, a organização escolhida permanece oficial e os metadados da análise são transportados ao novo Study.

PDFs da Estácio reconhecem `OBJETIVOS`, `INTRODUÇÃO`, `UNIDADE`, `CAPÍTULO`, `SEÇÃO`, `ATIVIDADES`, `EXERCÍCIOS`, `CONCLUSÃO` e `REFERÊNCIAS`. PDFs comuns, resultados de OCR, DOCX, PPTX e TXT usam o mesmo contrato de saída. Falta de título, disciplina ou capítulos gera um Study básico em vez de interromper a importação.

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

- `documents` persiste metadados, caminho relativo, progresso, status e organização no IndexedDB.
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
4. cria ou atualiza o registro no object store `studies`;
5. preserva notas, resumos, flashcards e quizzes se o estudo anterior deixar de existir.

Renomear atualiza o nome do material e a proveniência do conteúdo. Excluir remove o material e seus dados derivados.

## Consumo de contexto

- Tutor: estudo atual, notas, resumo, histórico e chunks recuperados.
- Resumos: exigem contexto e chunks do estudo.
- Flashcards: exigem chunks reais vinculados ao `studyId`.
- Quiz: exige chunks reais vinculados ao `studyId`.
- Notas: recebem automaticamente o `studyId` do Workspace aberto.

Os Route Handlers recebem somente objetos estruturados. Nenhum arquivo físico é enviado ao Gemini ou ao Ollama.

## Dashboard, Biblioteca e Tutor

- A Biblioteca mostra somente arquivos importados, com tipo, tamanho, data, caminho relativo, progresso, status, disciplina, tema, capítulos, palavras-chave e tempo de leitura.
- Todos os filtros pesquisam somente o registro persistido dos arquivos importados.
- O Dashboard mostra arquivos, estudos, progresso médio, flashcards, quizzes, materiais analisados, temas criados, capítulos identificados, tempo total de leitura, extrações, embeddings e atividade semanal a partir das persistências reais.
- O Tutor apresenta tema, disciplina, prévia, palavras-chave, subtemas e quantidade de capítulos antes da primeira pergunta.
- Flashcards e Quiz ficam desabilitados até existir conteúdo textual estruturado; nenhuma geração é disparada automaticamente.
- Estados vazios orientam a primeira importação sem criar conteúdo artificial.

## Persistência

| Banco / store | Conteúdo |
| --- | --- |
| `studyai-db/documents` | Materiais importados e organização. |
| `studyai-db/contents` | Texto, estrutura, metadados e pipeline. |
| `studyai-db/chunks` | Chunks por arquivo e estudo. |
| `studyai-db/embeddings` | Índice semântico local V2 compactado. |
| `studyai-db/studies` | Estudos derivados dos materiais. |
| `studyai-db/notes`, `summaries`, `flashcards` | Recursos por estudo. |
| `studyai-db/quizzes` | Questões e resultados. |
| `studyai-db/transcriptions`, `ocr` | Dados pesados de mídia e OCR. |
| `studyai-db/metadata` | Migração, status do índice e conversas. |
| `localStorage/studyai:ai-settings`, `studyai-theme` | Apenas preferências leves. |

A rota interna `/storage` exibe banco, versão, contagens, espaço estimado e última migração. A API do Storage suporta upserts, lotes, transações e paginação.

## Limites atuais

- O binário original ainda não é persistido. Depois de recarregar a página, o texto extraído permanece no IndexedDB, mas PDF, áudio, vídeo ou imagem precisam ser selecionados novamente para visualização binária.
- A primeira transcrição depende do download do modelo Whisper; indisponibilidade de rede é registrada como erro do arquivo sem interromper os demais.
- O histórico do Tutor é local ao navegador.
- O Ollama depende de um serviço local em execução e de pelo menos um modelo instalado.
- Não há banco remoto, cloud ou sincronização.

## Validação

Os testes de tela partem de arquivos selecionados no input e aguardam a extração. A suíte cobre criação automática de Study, agrupamento por `Matéria/Tema`, associação de conteúdo/chunks/embeddings, fallback de configuração do Gemini e persistência de conversa, resumo, flashcards e quiz após reabrir a aplicação. A inferência de áudio aceita o erro operacional esperado quando o modelo ainda não está disponível no cache e a rede está indisponível.

```text
npm run lint
npm run typecheck
npm run test:e2e
npm run build
```

Além dos cenários de Storage V2, a suíte cobre a geração automática a partir de PDF Estácio, PDF comum, PDF OCR, DOCX e PPTX, incluindo preservação dos metadados quando um material é movido manualmente.

Validação final da Sprint 25: ESLint aprovado, TypeScript aprovado, build de produção aprovado e 41 testes Playwright aprovados.

## Próximo passo seguro

Adicionar uma revisão manual opcional da classificação detectada, mantendo as heurísticas como sugestão e sem acoplar o gerador a um provider de IA. Persistir binários originais deve continuar sendo uma decisão separada, condicionada à experiência offline, quota e migração por versão.
