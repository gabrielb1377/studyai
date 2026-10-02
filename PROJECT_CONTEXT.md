# Contexto do Projeto — StudyAI

Atualizado em 2 de outubro de 2026.

## Deploy online 24h

A configuração de produção foi preparada para hospedagem independente do computador local. Railway é o caminho recomendado para a Beta; Vercel/Supabase e VPS/Docker Compose permanecem documentados como alternativas em `docs/DEPLOY_ONLINE.md`.

Produção exige PostgreSQL persistente e Object Storage S3 compatível. O fallback em memória/BYTEA permanece exclusivo do desenvolvimento; `/api/health` verifica conexão, schema e bucket e responde `503` quando a release não está pronta. O container aplica `npm run db:migrate` antes de iniciar, e `railway.toml` usa o mesmo endpoint como health check.

`APP_URL` define a origem HTTPS de emails, convites e compartilhamentos. Providers continuam server-side; Gemini, OpenRouter e Groq são adequados à cloud, enquanto Ollama só é ativado em produção com `OLLAMA_URL` explícita e alcançável pelo servidor. A PWA usa a URL pública e IndexedDB/OPFS apenas como cache offline por dispositivo.

Documentos operacionais: `docs/DEPLOY_ONLINE.md` e `docs/DEPLOY_CHECKLIST.md`.

## Beta Readiness — Sprint 36.5

A fase de estabilização manteve as funcionalidades existentes e fechou dois riscos verificáveis. O backup estruturado avançou para o formato v2: além dos stores IndexedDB, preserva preferências allowlisted e o layout do Workspace; restaurações são validadas integralmente e aplicadas em uma única transação. Backups v1 continuam aceitos. Sessões, identificadores de autenticação e credenciais não entram no arquivo.

A Central de Ajuda oferece feedback da Beta e relato de problema. O Route Handler limita tamanho/frequência, valida campos e envia por SMTP server-only para `FEEDBACK_EMAIL`. Diagnósticos são opt-in e incluem apenas rota, navegador, dispositivo e horário. A telemetria registra somente a contagem do evento, nunca o texto enviado.

O runtime local de ML foi atualizado de forma controlada para `@huggingface/transformers 4.3.0`; a regressão cobriu OCR, transcrição, embeddings e importação. `npm audit --omit=dev` passou a reportar zero vulnerabilidades. A navegação “Continuar estudando” também foi estabilizada com navegação nativa no CTA crítico.

Documentos operacionais: `docs/BETA_TESTING.md`, `docs/BETA_BACKLOG.md` e `docs/RELEASE_NOTES_BETA.md`.

## Integração Academy + Lab — Sprint 36.1E

Academy, exportações e Laboratório formam agora um fluxo único. A navegação principal e mobile expõe `/academy` e `/lab`; a Biblioteca distingue estudo livre, trilha, projeto prático, PDF/apostila/apresentação gerados e exercício de Laboratório, com filtros dedicados. A pesquisa global indexa tanto o conteúdo estruturado da Academy quanto enunciado, código, dicas, solução e resultado esperado do Lab, mantendo links para a origem correta.

O Workspace oferece composições nativas para Academy, prática no Lab, revisão de material gerado e trilha guiada. O Dashboard consulta os stores oficiais para retomar estudo livre e prática, listar conteúdos recentes, exercícios pendentes e próxima revisão. Abrir conteúdo Academy marca o Study como em andamento e registra o tempo real de leitura no Learning Engine.

```text
Academy → conteúdo estruturado → Biblioteca / Knowledge Graph / Learning Engine
                              ↓
                    PDF/PPTX / Lab / Professor
                              ↓
                 Workspace / busca / Dashboard
```

Os geradores de PDF/PPTX, SQL/WASM e demais módulos pesados continuam atrás de `import()` dinâmico. O preview HTML usa `sandbox` sem permissões e a execução do Lab bloqueia rede, workers, imports externos e acesso ao sistema. Consulte `docs/RELEASE_NOTES_SPRINT_36_1.md`.

Auditoria de dependências em 29 de setembro de 2026: `npm audit --omit=dev` reportou quatro vulnerabilidades HIGH transitivas em `adm-zip` e `sharp` pela cadeia de `@huggingface/transformers`. A correção automática não foi aplicada para evitar uma alteração de dependências fora do escopo; a atualização controlada deve entrar no backlog da Beta Readiness.

## Academy Base — Sprint 36.1A

O módulo `src/features/academy` permite criar um estudo livre a partir de tema e matéria, sem arquivo físico. A rota `/academy` coleta nível, objetivo, duração, idioma, profundidade e estilo. A criação gera atomicamente um `AcademyStudy`, um material leve identificado como `Material Gerado por IA` e um `StudyRecord`; em seguida registra objetivo, progresso inicial e tempo estimado no Learning Engine.

O conteúdo didático ainda não é gerado nesta fase. `modules` permanece vazio e o contrato `AcademyWorkspaceContract` reserva a futura abertura no Workspace sem acoplar a tela atual. Os registros usam o object store `academy` do IndexedDB e participam do Cloud Sync incremental pelos mesmos contratos das demais entidades.

Validação da Sprint 36.1A: ESLint, TypeScript e build de produção aprovados; 39 páginas geradas; suíte Playwright encerrada com sucesso (108 cenários diretos e 1 recuperado pelo retry, depois aprovado isoladamente sem retry).

## Propósito

StudyAI é um workspace pessoal de estudos. A versão atual oferece extração com OCR e transcrição local, recuperação híbrida dos materiais, experiências para organizar uma rotina de estudo e integrações funcionais com Gemini e Ollama.

## V1 Release Candidate — Sprint 36

O primeiro acesso passa por uma Splash curta e por uma Landing interna. Uma sessão autenticada abre o Dashboard; sem sessão, o usuário escolhe entrar, criar conta ou continuar offline. O cadastro inicial conduz a um onboarding com curso, instituição, semestre, objetivo, idioma, tema, provider e Modo Simples/Avançado. Preferências permanecem locais e também são copiadas para o perfil sincronizado quando existe conta.

Na importação, o conteúdo é percorrido incrementalmente para produzir uma impressão digital sem carregar o arquivo inteiro na memória. Duplicados por identidade ou conteúdo mostram uma decisão explícita: substituir, ignorar ou criar cópia. O pipeline continua sendo a única fonte do progresso real de extração, OCR, criação do Study, Knowledge Graph e indexação.

A Biblioteca ganhou filtros por uso, revisão, data, OCR, transcrição e ausência de resumo, quiz ou flashcards. Metadados locais incluem instituição e professor quando identificáveis; o contexto do onboarding completa curso e semestre quando o caminho importado não contém essa hierarquia. A pesquisa universal consulta também texto extraído, OCR, transcrições, capítulos, subtópicos, salas e comentários.

O Dashboard abre ou recria o Workspace por tema/layout e mostra importações e atividade recentes. A Conta exporta/importa o arquivo estruturado, revoga todas as sessões e oferece exclusão permanente confirmada. O modo Avançado inclui um checklist Beta Ready para acesso, IndexedDB, PostgreSQL, Object Storage, IA, HTTPS, PWA e restauração do Workspace.

Validação da Sprint 36: ESLint, TypeScript e build de produção aprovados; 107/107 testes Playwright aprovados. O runtime de transcrição possui timeout explícito de carregamento do modelo e converte indisponibilidade em erro persistido, sem deixar o pipeline preso em processamento.

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
| Persistência local | IndexedDB nativo, banco `studyai-db` v4 |
| Binários originais | Origin Private File System (OPFS), com fallback de re-seleção |
| Backend cloud | Route Handlers Next.js e serviços `server-only` |
| Banco cloud | PostgreSQL via `pg` |
| Email transacional | Nodemailer/SMTP |
| Autenticação | JWT curto, refresh token rotativo e cookies `HttpOnly` |
| Desktop | Electron 44 e electron-builder/NSIS |
| Mobile | Capacitor 8 para Android e iOS |
| PWA | Web App Manifest, Service Worker e Cache Storage nativos |
| Object Storage | API S3 compatível via AWS SDK, com MinIO no ambiente local |
| Observabilidade | Web Vitals com consentimento, métricas server-side e health check protegido |

## Estrutura de módulos

| Local | Responsabilidade |
| --- | --- |
| `src/app` | Páginas, estados de rota e endpoints internos. |
| `src/components/layout` | Shell, Header, Sidebar, busca global de páginas e tema. |
| `src/components/ui` | Primitivos visuais reutilizáveis. |
| `src/features/dashboard` | Painel inicial e indicadores. |
| `src/features/academy` | Estudos livres sem arquivo, validação, persistência e contratos de integração. |
| `src/features/study` | Workspace de um tema e Study Engine. |
| `src/features/study-generator` | Análise estrutural local e criação automática de matérias, temas, subtemas e metadados de estudo. |
| `src/features/ai` | AIService, contrato de providers, seleção, prompts, contexto, retrieval e erros. |
| `src/features/tutor` | Conversas, persistência e interface do Tutor. |
| `src/features/teacher` | Modo Professor, níveis, métodos pedagógicos, aula guiada, diagramas e prompts adaptativos sobre o mesmo AI Core. |
| `src/features/{flashcards,quiz,notes,summaries}` | Recursos persistidos por tema. |
| `src/features/learning` | Perfil de aprendizagem, Knowledge Score, prioridade, SM-2, plano diário, estatísticas e adaptação do Tutor. |
| `src/features/semantic` | Parser semântico, conceitos, relações, grafo de conhecimento, busca conceitual, chunking semântico e integração com aprendizagem. |
| `src/features/workspace` | Canvas multipainel, layouts, persistência leve, virtualização e sessões de estudo. |
| `src/features/mentor` | Sessões guiadas, método socrático, metas, correção, recomendações adaptativas e memória do Mentor. |
| `src/features/search` | Pesquisa global unificada sobre os registros estruturados do IndexedDB. |
| `src/features/{library,import,organization}` | Registro, consulta e organização dos materiais importados. |
| `src/features/account` | Sessão, perfil, tela Conta e cliente de autenticação. |
| `src/features/collaboration` | Salas, interface colaborativa, recursos, comentários, presença e progresso por pessoa. |
| `src/features/sync` | Fila incremental, manifesto, conflitos, arquivos e sincronização em background. |
| `src/features/platform` | Detecção de dispositivo, bridges Electron/Capacitor, PWA, cache, notificações e atualizações. |
| `src/features/preferences` | Modo Simples/Avançado, densidade, consentimento e estado dos guias. |
| `src/features/help` | Onboarding, Central de Ajuda e guias contextuais. |
| `src/features/observability` | Coleta anônima e consentida de métricas de experiência. |
| `src/server/auth` | Regras de conta, sessões e email, exclusivas do servidor. |
| `src/server/cloud` | Persistência cloud, resolução de conflitos, backups e compartilhamentos. |
| `src/server/collaboration` | Permissões, salas, convites, presença, comentários, turmas e histórico auditável. |
| `src/server/database` | Pool PostgreSQL, transações e schema versionável. |
| `src/server/storage` | Fachada server-only para Object Storage S3 compatível. |
| `src/server/observability` | Métricas operacionais, erros normalizados e memória do processo. |
| `src/server/security` | Senhas, JWT, hashes, comparações constantes e rate limit. |
| `src/services/material-service.ts` | Fonte persistida dos metadados reais de materiais. |
| `src/services/material-runtime-store.ts` | Referências efêmeras aos arquivos físicos durante a sessão. |
| `src/features/extraction` | Extração de documentos e mídia, OCR, transcrição, pipeline, persistência e status. |
| `src/features/retrieval` | Chunking, embeddings locais, buscas semântica e lexical, ranking híbrido e montagem do contexto. |
| `src/lib/storage` | Banco IndexedDB, migrações, transações, paginação, erros e diagnóstico. |
| `src/types` | Tipos de domínio compartilhados. |

## Persistência local

O Storage V2 usa bancos IndexedDB isolados por identidade (`studyai-db:user-{id}` e `studyai-db:guest`), versão 4. A sessão troca o escopo antes de expor os dados da conta. Nenhuma feature acessa o IndexedDB diretamente; todos os acessos passam por `StorageManager`.

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
| `academy` | Estudos livres, preferências pedagógicas, módulos e progresso. |
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

O banco PostgreSQL possui usuários, perfis, refresh tokens, tokens de verificação/recuperação, registros versionados, log incremental, backups, compartilhamentos e metadados de arquivos. Binários grandes usam Object Storage S3 compatível, com chaves `users/{userId}/materials/{materialId}/{hash}`; o banco mantém hash, tamanho e chave. Sem configuração S3, existe fallback em `BYTEA` para desenvolvimento. As tabelas de domínio solicitadas (`materials`, `studies`, `workspace`, `mentor`, `learning`, `knowledge`, `flashcards`, `quizzes`, `summaries` e `notes`) espelham os registros oficiais sem acoplar as features ao banco. `CloudDatabase` é a única fachada de persistência no servidor.

## Experiência do produto

`ExperienceProvider` controla o modo Simples/Avançado, densidade, escala de fonte, alto contraste, redução de movimento, consentimento de telemetria e guias já vistos. O modo Simples oculta diagnóstico, pipeline, grafo e métricas técnicas; o Avançado os revela sem desmontar os dados ou exigir reinício. O shell escolhe Sidebar expandida/compacta, navegação inferior mobile e Header adaptativo conforme espaço e ponteiro. Claro, Escuro, AMOLED e Sistema compartilham os mesmos tokens semânticos.

O Design System canônico permanece em `src/components/ui` e `src/styles/globals.css`. Biblioteca oferece Grade, Lista e Compacta sobre o mesmo componente. O Workspace preserva multipainel no desktop e mostra somente a ferramenta ativa no mobile; Tutor mantém contexto recolhível, Markdown/KaTeX e ações de resposta próximas ao conteúdo. Consulte `docs/DESIGN_SYSTEM.md`.

`HelpCenter`, `Onboarding` e `ContextualGuide` compartilham conteúdo real e links internos. A busca universal também indexa comandos e ajuda. Web Vitals e long tasks só são enviados quando o usuário consente; prompts, materiais, respostas e dados pessoais nunca entram no payload de telemetria.

## Produção e observabilidade

O ambiente de referência usa Docker Compose com aplicação standalone, PostgreSQL, MinIO e Caddy. Caddy termina HTTPS, habilita compressão e HSTS. GitHub Actions executa lint, TypeScript, build e Playwright; outro workflow publica a imagem no GHCR e aceita um webhook de deploy opcional.

`Telemetry` mantém buffers limitados de métricas e erros no servidor. `/api/health` informa disponibilidade mínima e só inclui runtime, memória, banco e Object Storage em desenvolvimento ou com `HEALTH_SECRET`. `/api/telemetry` aceita somente nomes e valores allowlisted, possui rate limit e não recebe conteúdo do usuário.

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

O `TutorContextService` seleciona o tema mais recentemente acessado e reúne `studyId`, título, matéria, status, progresso, resumo, notas e o perfil calculado pelo Learning Engine. Conhecimento, confiança, domínio, classificação e prioridade orientam o PromptBuilder a aprofundar, revisar fundamentos ou propor desafios sem alterar os materiais recuperados. O `RetrievalPipeline` é a entrada única do AI Core para o RAG e consulta exclusivamente os chunks vinculados ao estudo quando há contexto. A recuperação combina similaridade vetorial, ranking lexical, afinidade de `studyId`, nome do arquivo e frequência dos termos. O RAG remove duplicações e envia somente os três melhores trechos. `ContextCompressor` resume de forma extrativa o histórico antigo, preserva as mensagens recentes e respeita orçamentos de tokens antes de `PromptBuilder` e `ContextBuilder`. Tutor, Professor, resumo, flashcards e quiz usam o mesmo `AIService`.

## AI Teacher 2.0

O Tutor possui os modos `Tutor` e `Professor`. O Professor não cria outro canal de IA: ele acrescenta um contrato pedagógico tipado à chamada existente. Nível, método, ação e eventual trecho selecionado são validados no Route Handler e transformados em instruções por `TeacherPromptBuilder` antes de passarem por compressão, contexto e provider.

```text
TutorWorkspace / PDF selecionado
  → useTeacher
  → RetrievalPipeline
  → /api/tutor
  → TeacherPromptBuilder + PromptBuilder + ContextBuilder
  → AIService / ProviderManager / cache
  → resposta do Professor na conversa existente
```

As ações incluem aula guiada, plano automático, fluxograma e mapa mental em Mermaid, linha do tempo quando houver evidência, exercícios variados, comparação de conceitos, resumos adaptativos e explicação de trecho. A correção solicita resposta correta, justificativa, conceito, fonte e recomendação de revisão. O contexto reúne Learning Engine, Knowledge Graph, capítulos e continuidade do Mentor; arquivos físicos nunca são enviados. Seleções do PDF publicam somente texto limitado, nome, página e capítulo.

Validação da Sprint 35: ESLint, TypeScript e build de produção aprovados; 104 testes Playwright aprovados.

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

## Plataforma e distribuição

`PlatformProvider` inicializa somente capacidades transversais: service worker, monitor de revisão e bridge mobile. As features continuam dependendo de contratos web e de `StorageManager`; nenhuma regra do Workspace, Mentor, RAG ou Learning Engine conhece Electron ou Capacitor.

```text
Workspace / Learning / Mentor
  → StorageManager + IndexedDB / OPFS
  → Platform services
      ├─ PWAService / CacheManager
      ├─ DesktopManager / preload Electron
      ├─ MobileBridge / Capacitor
      └─ NotificationService / UpdateManager
  → CloudSyncManager quando online
```

O Desktop empacota o output standalone do Next.js e o executa apenas em `127.0.0.1`, preservando Route Handlers e funcionamento offline. A PWA possui precache resiliente, cache por finalidade, atualização automática e recepção de arquivos pelo Web Share Target. Android aceita `SEND`, `SEND_MULTIPLE` e `VIEW`; iOS declara os tipos de documentos. Configurações adapta os controles ao dispositivo e exibe uso/limpeza de cache.

Distribuição mobile requer uma URL HTTPS em `CAPACITOR_SERVER_URL`, Android Studio/SDK para Android e macOS/Xcode para assinar iOS. Push remoto e atualização assinada exigem credenciais externas; o código atual entrega notificações locais e a fronteira de atualização, sem versionar segredos.

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
| `GET /api/health` | Saúde pública mínima; diagnóstico detalhado protegido. |
| `POST /api/telemetry` | Métricas anônimas de UX quando há consentimento. |
| `DELETE /auth/sessions/[id]` | Revoga outro dispositivo pertencente ao usuário atual. |

Todos validam o corpo recebido e normalizam erros do AI Core. Eles não recebem nem leem arquivos físicos.

## Limites conhecidos

- A importação e a extração continuam locais. Sem conta, binários ficam apenas no OPFS; com uma sessão autenticada, arquivos novos ou alterados são enviados por hash para permitir abertura sob demanda em outros dispositivos.
- O primeiro uso da transcrição requer download do modelo Whisper; o tamanho e o tempo dependem da conexão e do dispositivo. Depois disso, o cache do navegador é reutilizado.
- A extração de áudio de MP4 e M4A depende dos codecs suportados pelo navegador. Arquivos incompatíveis recebem status de erro sem interromper os demais.
- Os embeddings atuais são linguísticos e determinísticos, não um modelo neural pré-treinado; autenticação e sincronização existem, mas a extração e o processamento de conhecimento continuam locais.
- Sem `DATABASE_URL`, contas e cloud usam memória volátil apenas para desenvolvimento. Produção requer PostgreSQL e `AUTH_SECRET`; verificação e recuperação por email requerem SMTP.
- Object Storage real requer bucket e credenciais S3; sem isso o backend usa o banco apenas para compatibilidade de desenvolvimento.
- Domínio, DNS, certificados públicos, feed assinado do Electron e publicação nas lojas dependem da infraestrutura e das contas do proprietário.
- O Ollama precisa estar em execução no endereço configurado por `OLLAMA_URL` e possuir ao menos um modelo instalado.
- O contexto do Tutor é baseado no tema acessado mais recentemente, e não em um seletor explícito de contexto.
- A detecção de estrutura é heurística e local. Ela reconhece marcadores e vocabulário conhecidos, mas não substitui a edição manual quando o documento usa títulos ambíguos.
- A busca do PDF usa a camada textual do PDF.js; PDFs puramente escaneados dependem do texto OCR e podem não possuir posições exatas para destaque dentro do canvas.

## Qualidade

O projeto usa `strict` no TypeScript, aliases `@/*`, componentes de rota do App Router e testes Playwright para rotas, responsividade e fluxos locais principais.

Na Sprint 30 foram adicionados cenários Playwright para cadastro, sessão persistente, logout/login, recuperação, sync incremental, fila offline, backup, compartilhamento, upload/download por hash e conflito entre dois dispositivos. ESLint, TypeScript e o build de produção foram aprovados; os 75 testes Playwright passaram. O conjunto continua cobrindo Workspace, Mentor, Learning Engine, ingestão, OCR/RAG, Tutor e persistência local.

Na Sprint 31 a suíte passou a possuir 80 cenários, incluindo os contratos PWA, Electron e Capacitor. A PWA foi exercitada offline sob controle do service worker, o servidor standalone do Desktop respondeu localmente e o APK Android de depuração foi compilado com sucesso. A validação binária do iOS permanece obrigatoriamente reservada a macOS/Xcode.

Na Sprint 32 a suíte passou a possuir 86 cenários. Foram adicionadas validações para modos de interface, Central de Ajuda, onboarding, navegação mobile, isolamento do IndexedDB por usuário e contratos de produção/Object Storage. A validação local aprova lint, TypeScript, build e Playwright; a composição Docker permanece sujeita a validação em host com Docker instalado.

Na Sprint 32.5, a suíte chegou a 92 cenários Playwright e passou integralmente nos sete viewports (360, 390, 768, 1024, 1366, 1440 e 2560 px). A auditoria corrigiu a limpeza de binários locais após tombstones de sincronização, a recuperação por reimportação de materiais cujo binário local foi perdido e a validação/rate limiting do endpoint de telemetria. O relatório, inventário, arquitetura/fluxos e backlog priorizado estão em `docs/`. Lint, TypeScript e build foram executados novamente no handoff. Permanecem pendentes a validação da composição em Docker/PostgreSQL/S3 reais e quatro vulnerabilidades HIGH reportadas em dependências transitivas de produção; portanto este resultado não certifica prontidão irrestrita de produção.

Na Sprint 33 foi criado o domínio de colaboração: salas de estudo e turmas, convites, Administrador/Editor/Comentador/Leitor, recursos versionados, restauração, comentários encadeados, presença, progresso individual e trilha de auditoria. A interface está em `/salas`; os serviços ficam em `src/server/collaboration`, e a documentação detalhada está em `docs/COLABORACAO.md`. A consistência de edição utiliza controle otimista e retorna conflito HTTP 409. O modo de desenvolvimento usa memória do processo; produção exige PostgreSQL. A validação final aprovou lint, TypeScript, build e 95 testes Playwright.
