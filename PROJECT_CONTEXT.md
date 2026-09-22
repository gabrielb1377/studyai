# Contexto do Projeto — StudyAI

Atualizado em 22 de setembro de 2026.

## Propósito

StudyAI é um workspace pessoal de estudos. A versão atual oferece extração com OCR e transcrição local, recuperação híbrida dos materiais, experiências para organizar uma rotina de estudo e integrações funcionais com Gemini e Ollama.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Aplicação | Next.js 15 com App Router |
| Interface | React 19, TypeScript e Tailwind CSS 4 |
| Componentes base | shadcn/ui, Radix UI e Lucide |
| Estado de layout | Zustand |
| Tema | next-themes |
| Visualização de PDF importado | react-pdf |
| Respostas formatadas | react-markdown, remark-gfm, remark-math e KaTeX |
| Documentos OOXML | JSZip |
| OCR local | Tesseract.js com dados em português e inglês |
| Transcrição local | Transformers.js com Whisper Tiny |
| Testes de interface | Playwright |
| Persistência local | IndexedDB nativo, banco `studyai-db` v2 |
| Binários originais | Origin Private File System (OPFS), com fallback de re-seleção |
| Backend cloud | Route Handlers Next.js e serviços `server-only` |
| Banco cloud | PostgreSQL via `pg` |
| Email transacional | Nodemailer/SMTP |
| Autenticação | JWT curto, refresh token rotativo e cookies `HttpOnly` |

## Estrutura de módulos

| Local | Responsabilidade |
| --- | --- |
| `src/app` | Páginas, estados de rota e endpoints internos. |
| `src/components/layout` | Shell, Header, Sidebar, busca global de páginas e tema. |
| `src/components/ui` | Primitivos visuais reutilizáveis. |
| `src/features/dashboard` | Painel inicial e indicadores. |
| `src/features/study` | Workspace de um tema e Study Engine. |
| `src/features/study-generator` | Análise estrutural local e criação automática de matérias, temas, subtemas e metadados de estudo. |
| `src/features/ai` | AIService, contrato de providers, seleção, prompts, contexto, retrieval e erros. |
| `src/features/tutor` | Conversas, persistência e interface do Tutor. |
| `src/features/{flashcards,quiz,notes,summaries}` | Recursos persistidos por tema. |
| `src/features/learning` | Perfil de aprendizagem, Knowledge Score, prioridade, SM-2, plano diário, estatísticas e adaptação do Tutor. |
| `src/features/semantic` | Parser semântico, conceitos, relações, grafo de conhecimento, busca conceitual, chunking semântico e integração com aprendizagem. |
| `src/features/workspace` | Canvas multipainel, layouts, persistência leve, virtualização e sessões de estudo. |
| `src/features/mentor` | Sessões guiadas, método socrático, metas, correção, recomendações adaptativas e memória do Mentor. |
| `src/features/search` | Pesquisa global unificada sobre os registros estruturados do IndexedDB. |
| `src/features/{library,import,organization}` | Registro, consulta e organização dos materiais importados. |
| `src/features/account` | Sessão, perfil, tela Conta e cliente de autenticação. |
| `src/features/sync` | Fila incremental, manifesto, conflitos, arquivos e sincronização em background. |
| `src/server/auth` | Regras de conta, sessões e email, exclusivas do servidor. |
| `src/server/cloud` | Persistência cloud, resolução de conflitos, backups e compartilhamentos. |
| `src/server/database` | Pool PostgreSQL, transações e schema versionável. |
| `src/server/security` | Senhas, JWT, hashes, comparações constantes e rate limit. |
| `src/services/material-service.ts` | Fonte persistida dos metadados reais de materiais. |
| `src/services/material-runtime-store.ts` | Referências efêmeras aos arquivos físicos durante a sessão. |
| `src/features/extraction` | Extração de documentos e mídia, OCR, transcrição, pipeline, persistência e status. |
| `src/features/retrieval` | Chunking, embeddings locais, buscas semântica e lexical, ranking híbrido e montagem do contexto. |
| `src/lib/storage` | Banco IndexedDB, migrações, transações, paginação, erros e diagnóstico. |
| `src/types` | Tipos de domínio compartilhados. |

## Persistência local

O Storage V2 usa um único banco IndexedDB chamado `studyai-db`, versão 2. Nenhuma feature acessa o IndexedDB diretamente; todos os acessos passam por `StorageManager`.

| Object Store | Conteúdo |
| --- | --- |
| `documents` | Arquivos importados, status, progresso e organização. |
| `contents` | Texto, seções, metadados e logs de extração. |
| `chunks` | Trechos normalizados com proveniência. |
| `embeddings` | Vetores Int8/Base64 relacionados pelo `chunkId`. |
| `studies` | Estudos e progresso do Study Engine. |
| `notes`, `summaries`, `flashcards` | Recursos relacionados ao `studyId`. |
| `quizzes` | Questões e resultados identificados pelo campo `kind`. |
| `transcriptions`, `ocr` | Resultados pesados separados por arquivo e estudo. |
| `knowledge` | Um grafo versionado por arquivo, com conceitos, relações, blocos e chunks semânticos. |
| `metadata` | Estado de migração, índice semântico e conversas do Tutor. |

O perfil local do Learning Engine também utiliza `metadata`, sob a chave versionada `learning-profile:v1`. Ele mantém somente métricas e até mil eventos recentes; materiais e conteúdo extraído continuam em seus stores próprios.

O Mentor utiliza a chave versionada `mentor:v1` no mesmo store `metadata`. Nela ficam apenas sessões guiadas, metas e recomendações derivadas; materiais, conceitos, flashcards e resultados continuam em seus stores oficiais e são consultados novamente antes de cada interação.

`StorageManager` oferece get, getAll, upsert, escrita em lote, substituição atômica, transações, paginação e diagnóstico. Falhas de quota e indisponibilidade são normalizadas em mensagens amigáveis. Transações abortadas executam rollback nativo.

## Cloud Sync e contas

O IndexedDB permanece como cache offline e garante que nenhuma feature dependa de conectividade. Quando existe uma sessão autenticada, `CloudSyncProvider` observa mudanças persistentes, agrupa eventos, executa sincronização inicial, periódica e ao recuperar a conexão. `CloudSyncManager` calcula hashes canônicos, compara um manifesto local, envia somente deltas e tombstones, avança um cursor incremental e aplica alterações remotas pelos mesmos stores oficiais.

```text
Feature → StorageManager → IndexedDB
                         ↓ evento
                   CloudSyncManager
                         ↓
                    /sync + /api/files/:id
                         ↓
              SyncService / PostgreSQL
```

O banco PostgreSQL possui usuários, perfis, refresh tokens, tokens de verificação/recuperação, registros versionados, log incremental, backups, compartilhamentos e arquivos. As tabelas de domínio solicitadas (`materials`, `studies`, `workspace`, `mentor`, `learning`, `knowledge`, `flashcards`, `quizzes`, `summaries` e `notes`) espelham os registros oficiais sem acoplar as features ao banco. `CloudDatabase` é a única fachada de persistência no servidor. Em desenvolvimento, a fachada usa memória quando `DATABASE_URL` não existe; a página Conta deixa essa limitação visível.

O sync limita payloads, aceita compressão gzip, envia binários em paralelo e só repete upload quando o hash muda. Materiais cloud são baixados sob demanda pelo `MaterialViewer`. Conflitos usam versão-base: edições concorrentes não são sobrescritas silenciosamente e podem ser resolvidas na interface. Backups são criados diariamente ou manualmente; links públicos são revogáveis; o histórico registra entidade, operação, dispositivo e horário.

A autenticação usa senha com `scrypt`, JWT de acesso com duração curta, refresh token rotativo armazenado apenas como hash, cookie `HttpOnly`, CSRF por double-submit, rate limit e expiração de sessão. O middleware aplica CSP com nonce, HSTS em produção, `nosniff`, bloqueio de frame e políticas restritivas. Email de produção depende de SMTP; em desenvolvimento, tokens de verificação e recuperação são mostrados apenas para facilitar testes locais.

Preferências de navegação permanecem no `localStorage`, por serem pequenas e específicas do dispositivo. `WorkspaceStorage` mantém o layout versionado, dimensões, posição lógica, painéis, recursos abertos, scroll e filtros por `studyId`. `WorkspacePersistence` preserva o contrato legado e o estado específico do PDF, incluindo zoom, página, capítulo, favoritos, anotações e histórico. Conversas, sessões e a conversa ativa do Tutor permanecem no store `metadata` do IndexedDB. `MaterialBinaryStorage` grava o arquivo original no OPFS usando o id estável do material; ausência de suporte degrada para a re-seleção local.

## Workspace 2.0

O `WorkspaceCanvas` compõe as features existentes sem duplicar regras de negócio. Painéis são instâncias independentes, renderizados sob demanda e limitados para preservar desempenho. Layouts nativos e personalizados são reconstruídos por fábricas tipadas. Materiais extensos usam virtualização; buscas globais reutilizam um snapshot curto em cache; painéis minimizados não montam suas ferramentas.

O `SessionTracker` persiste sessões no IndexedDB e registra foco no Learning Engine. A Sidebar reflete Curso → Semestre → Matéria → Tema → Arquivo. O PDF Pro e as notas Wiki persistem somente estado derivado e nunca duplicam o arquivo físico. A pesquisa global consulta `documents`, `notes`, `summaries`, `flashcards`, `quizzes` e `knowledge` exclusivamente por `StorageManager`.

Na primeira abertura, `Migration` verifica as chaves legadas, grava tudo em uma única transação e remove o legado somente depois do commit. Assim, uma falha nunca apaga a fonte anterior. O `localStorage` permanece somente para preferências leves: tema, provider/configurações de IA, idioma, sidebar, workspace e última tela. A rota interna `/storage` mostra versão, contagens, espaço estimado e data da migração.

## Fluxo de extração

```text
File selecionado
  → MaterialService / MaterialRuntimeStore
  → StorageManager / documents
  → inferência de matéria e tema pelo caminho relativo
  → StudyEngine
  → ExtractionPipeline
  → MediaExtractionPipeline
  → ContentExtractionService
  → OCRService, quando imagem ou PDF sem camada de texto
  → MediaTranscriptionService, quando áudio ou vídeo
  → TextNormalizationService
  → StudyAnalyzer
  → SubjectDetector + TopicDetector + KeywordExtractor + ReadingTimeCalculator
  → StudyGeneratorService
  → matéria + tema + subtemas + capítulos + prévia + metadados
  → ContentStorage / contents / transcriptions / ocr
  → SemanticParser + ConceptExtractor + RelationExtractor
  → KnowledgeGraphBuilder / knowledge
  → SemanticChunkService / ChunkStorage / chunks
  → EmbeddingService / EmbeddingStorage / embeddings
  → Biblioteca / Organização / Dashboard / Workspace / Tutor
```

PDF usa PDF.js; DOCX e PPTX são lidos como pacotes OOXML com JSZip; TXT detecta UTF-8, UTF-16LE, UTF-16BE e Latin1/Windows-1252; mídia usa as APIs HTML5 e Web Audio. PNG, JPG, JPEG e WEBP passam pelo Tesseract.js. PDFs com qualquer camada de texto ignoram OCR; somente PDFs sem texto são renderizados página a página e enviados ao OCR. MP3, WAV, M4A e MP4 são convertidos para áudio mono de 16 kHz e transcritos pelo modelo `onnx-community/whisper-tiny` no navegador. A transcrição é persistida em segmentos com timestamps e capítulos de até cinco minutos.

`TextNormalizationService` corrige Unicode, hifenização entre linhas, controles inválidos, espaços, listas e parágrafos antes de qualquer chunk ou embedding. `StudyAnalyzer` coordena detectores pequenos e puros para identificar título, disciplina, tema, subtemas, capítulos, palavras-chave, idioma, total de palavras, tempo estimado de leitura e resumo inicial. `DocumentAnalyzer` permanece apenas como fachada compatível para a transcrição existente. O `StudyGeneratorService` persiste o resultado no documento, no material e no Study Engine; uma organização manual posterior mantém o destino escolhido e transporta todos os metadados estruturados para o novo `studyId`.

O `TopicDetector` reconhece a estrutura comum dos PDFs da Estácio pelos marcadores `OBJETIVOS`, `INTRODUÇÃO`, `UNIDADE`, `CAPÍTULO`, `SEÇÃO`, `ATIVIDADES`, `EXERCÍCIOS`, `CONCLUSÃO` e `REFERÊNCIAS`. Cada ocorrência gera um capítulo/seção tipado e ordenado, com página ou slide quando essa proveniência está disponível. Documentos sem identificação confiável recebem `Disciplina desconhecida`, `Tema desconhecido` ou um título derivado do arquivo; mesmo nesses casos, o Study básico é criado e o pipeline continua.

Cada documento mantém os estágios `document`, `extraction`, `ocr`, `normalization`, `analysis`, `study`, `semantic`, `chunks`, `embeddings` e `indexed`, além de um log cronológico. A etapa `study` registra documento analisado, tema criado, capítulos encontrados e Study criado ou atualizado; `semantic` registra conceitos e relações. Erros registram arquivo, etapa, motivo, stack simplificada e ação sugerida. O Dashboard exibe o pipeline dos documentos mais recentes.

Todo material recebe um `studyId` antes da extração. Quando existe caminho relativo, os dois últimos diretórios representam matéria e tema; hierarquias maiores também preservam curso e semestre quando disponíveis. Arquivos avulsos usam o nome real do arquivo como tema. Materiais da mesma matéria e tema compartilham um Study. O mesmo `studyId` acompanha conteúdo, chunks, embeddings, resumos, flashcards, quizzes e notas.

O núcleo, o worker e os idiomas do OCR são servidos por rotas internas a partir das dependências instaladas, com cache imutável. Nenhum material do usuário passa por essas rotas. O modelo de transcrição é obtido do Hugging Face Hub no primeiro uso, armazenado no cache do navegador e executado localmente nas execuções seguintes.

## Fluxo do Tutor IA

```text
TutorWorkspace
  → useTutor / useTutorContext
  → TutorContextService
  → RetrievalPipeline
  → SemanticSearchService + SearchService
  → RankingService
  → TutorService
  → AIClient
  → /api/tutor
  → ContextCompressor / TokenCounter
  → PromptBuilder
  → ContextBuilder
  → AIService
  → ProviderManager
  → AIResponseCache
  → ProviderRegistry / HealthService / LatencyService
  → AIProvider
  → GeminiProvider | OllamaProvider
  → Gemini API | Ollama local
  → stream NDJSON para o cliente
```

O `TutorContextService` seleciona o tema mais recentemente acessado e reúne `studyId`, título, matéria, status, progresso, resumo, notas e o perfil calculado pelo Learning Engine. Conhecimento, confiança, domínio, classificação e prioridade orientam o PromptBuilder a aprofundar, revisar fundamentos ou propor desafios sem alterar os materiais recuperados. O `RetrievalPipeline` é a entrada única do AI Core para o RAG e consulta exclusivamente os chunks vinculados ao estudo quando há contexto. A recuperação combina similaridade vetorial, ranking lexical, afinidade de `studyId`, nome do arquivo e frequência dos termos. O RAG remove duplicações e envia somente os três melhores trechos. `ContextCompressor` resume de forma extrativa o histórico antigo, preserva as mensagens recentes e respeita orçamentos de tokens antes de `PromptBuilder` e `ContextBuilder`. Tutor, resumo, flashcards e quiz usam o mesmo `AIService`.

## Learning Engine

```text
Leitura | Tutor | Quiz | Flashcard | Resumo | Nota
  → LearningService
  → fila assíncrona / LearningStorage
  → perfil e métricas por tema
  → KnowledgeEngine + StudyPriorityEngine
  → plano diário + Dashboard + Tutor adaptativo
```

`KnowledgeEngine` combina quiz, retenção dos flashcards, tempo, frequência e recência. O resultado classifica temas difíceis, esquecidos, fortes, nunca estudados ou em desenvolvimento. `StudyPriorityEngine` pondera lacuna de conhecimento, tempo sem revisão, erros e flashcards vencidos, sempre expondo os motivos. `ReviewScheduler` implementa SM-2 e persiste próxima revisão, intervalo, facilidade e repetições em cada flashcard; o campo de algoritmo permite a futura adoção de FSRS sem mudar os consumidores.

O plano diário é determinístico e criado a partir dos estudos, prioridades, revisões pendentes e atividades do dia. Cálculos são pequenos e memoizados; persistência e atualização do perfil ocorrem fora da interação principal por IndexedDB e `requestIdleCallback`.

## AI Mentor

```text
Tema selecionado
  → LearningStorage + Flashcards + Quiz
  → KnowledgeEngine + StudyPriorityEngine
  → Knowledge Graph
  → SessionEngine + SocraticEngine
  → plano, pergunta e correção explicável
  → MentorStorage / IndexedDB metadata
```

O Mentor é uma camada de coordenação e não uma nova fonte de verdade. Antes de iniciar ou continuar uma sessão, `MentorService` consulta os dados persistidos do Study, do Learning Engine, do grafo, dos flashcards e dos quizzes. `SessionEngine` cria a sequência de leitura, explicação, revisão e prática; `SocraticEngine` seleciona conceitos reais, adapta a dificuldade ao nível Iniciante, Intermediário ou Avançado e só avança o plano quando a resposta apresenta evidência suficiente. Em caso de erro, a sessão permanece na etapa, explica o motivo, indica onde revisar e propõe uma pergunta de acompanhamento. Quando o aluno solicita uma nova explicação, o Mentor reutiliza `RetrievalPipeline` e `TutorService`, portanto a chamada continua passando por RAG, Route Handler, AI Core e provider selecionado.

`RecommendationEngine` calcula revisões, prática e avanço durante períodos ociosos da interface. `GoalManager` mantém metas de prova, trabalho, revisão ou tempo de estudo. Sessões concluídas formam a memória local por tema; mensagens motivacionais só aparecem quando existe uma interação real que as sustente.

`AIProvider` define o contrato comum. Gemini, Ollama, OpenRouter e Groq possuem health check e geração server-only; os dois últimos usam o contrato OpenAI-compatible e só ficam online quando suas chaves estão configuradas. `ProviderRegistry` é o único catálogo, `HealthService` mantém verificações recentes em cache e `LatencyService` mede health e geração. No modo manual, o provider escolhido é estrito. No automático, providers online são ordenados pela menor latência antes da cadeia de fallback Ollama → Gemini → Groq → OpenRouter.

O modo, provider preferencial e modelos escolhidos em Configurações são enviados às rotas internas pelo `AIClient`. O Ollama conversa por NDJSON; Gemini usa SSE; OpenRouter e Groq usam SSE OpenAI-compatible. O Route Handler normaliza tudo para NDJSON. Respostas idênticas são reutilizadas por um cache LRU em memória, com TTL de 30 minutos. Logs e métricas ficam em singletons efêmeros do processo servidor. O Dashboard mostra tokens, latência, ingestão, OCR, chunks e embeddings apenas no drawer de diagnóstico.

Sem `GEMINI_API_KEY`, os endpoints retornam uma resposta controlada e a interface exibe: `Configure GEMINI_API_KEY em .env.local para utilizar o Tutor IA.` Nenhuma mensagem artificial é criada para substituir o provedor.

Os embeddings usam o modelo interno `local-feature-hash-v1`, com 192 dimensões. Ele representa termos, raízes linguísticas, n-gramas e pares de palavras em um vetor normalizado. Os vetores são quantizados para Int8 e persistidos em Base64 no formato V2, reduzindo substancialmente a pressão sobre a quota do navegador; dados V1 são migrados em memória na próxima sincronização. Todo o cálculo acontece no navegador, sem download de modelo, API externa ou banco vetorial.

## Endpoints existentes

| Endpoint | Finalidade |
| --- | --- |
| `POST /api/tutor` | Conversa contextual pelo provider selecionado. |
| `POST /api/tutor/summary` | Resumo baseado no contexto e nos chunks reais de um estudo. |
| `POST /api/tutor/flashcards` | Flashcards gerados somente de chunks reais. |
| `POST /api/tutor/quiz` | Questões geradas somente de chunks reais. |
| `GET /api/ai/providers/[provider]` | Disponibilidade, versão, latência e modelos do provider pelo AI Core. |
| `GET /api/ai/manager` | Health agregado, métricas de geração e logs recentes dos providers. |
| `GET /api/ocr/assets/[asset]` | Worker e núcleo WebAssembly locais do Tesseract.js. |
| `GET /api/ocr/languages/[language]` | Dados locais de idioma usados pelo OCR. |

Todos validam o corpo recebido e normalizam erros do AI Core. Eles não recebem nem leem arquivos físicos.

## Limites conhecidos

- A importação e a extração continuam locais. Sem conta, binários ficam apenas no OPFS; com uma sessão autenticada, arquivos novos ou alterados são enviados por hash para permitir abertura sob demanda em outros dispositivos.
- O primeiro uso da transcrição requer download do modelo Whisper; o tamanho e o tempo dependem da conexão e do dispositivo. Depois disso, o cache do navegador é reutilizado.
- A extração de áudio de MP4 e M4A depende dos codecs suportados pelo navegador. Arquivos incompatíveis recebem status de erro sem interromper os demais.
- Os embeddings atuais são linguísticos e determinísticos, não um modelo neural pré-treinado; autenticação e sincronização existem, mas a extração e o processamento de conhecimento continuam locais.
- Sem `DATABASE_URL`, contas e cloud usam memória volátil apenas para desenvolvimento. Produção requer PostgreSQL e `AUTH_SECRET`; verificação e recuperação por email requerem SMTP.
- O Ollama precisa estar em execução no endereço configurado por `OLLAMA_URL` e possuir ao menos um modelo instalado.
- O contexto do Tutor é baseado no tema acessado mais recentemente, e não em um seletor explícito de contexto.
- A detecção de estrutura é heurística e local. Ela reconhece marcadores e vocabulário conhecidos, mas não substitui a edição manual quando o documento usa títulos ambíguos.
- A busca do PDF usa a camada textual do PDF.js; PDFs puramente escaneados dependem do texto OCR e podem não possuir posições exatas para destaque dentro do canvas.

## Qualidade

O projeto usa `strict` no TypeScript, aliases `@/*`, componentes de rota do App Router e testes Playwright para rotas, responsividade e fluxos locais principais.

Na Sprint 30 foram adicionados cenários Playwright para cadastro, sessão persistente, logout/login, recuperação, sync incremental, fila offline, backup, compartilhamento, upload/download por hash e conflito entre dois dispositivos. ESLint, TypeScript e o build de produção foram aprovados; os 75 testes Playwright passaram. O conjunto continua cobrindo Workspace, Mentor, Learning Engine, ingestão, OCR/RAG, Tutor e persistência local.
