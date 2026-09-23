# Handoff Atual — Sprint 32: Product Polish + UX + Escalabilidade

Atualizado em 23 de setembro de 2026.

## Estado entregue na Sprint 32

O StudyAI possui agora duas camadas de experiência sobre as mesmas features: o modo Simples, padrão, expõe somente as jornadas de estudo; o modo Avançado revela grafo, diagnóstico, pipeline, métricas e controles técnicos. A alternância é imediata, persistida e sincronizada. Sidebar compactável no desktop, navegação inferior mobile, Header adaptativo, componentes mais densos e tokens de foco/hover reduzem ruído sem remover funcionalidades.

```text
ExperienceProvider
  → modo + densidade + consentimento
  → AppShell adaptativo
      ├─ Sidebar desktop
      ├─ navegação mobile
      ├─ busca universal / Ctrl+K
      ├─ Central de Ajuda
      └─ onboarding e guias contextuais
```

A Central de Ajuda é pesquisável e possui tutoriais para importação, Workspace, Tutor, Mentor, Flashcards, Quiz, pesquisa e Cloud. O onboarding opcional conduz o primeiro material e registra conclusão; guias contextuais aparecem somente na primeira visita. Configurações virou um hub por categorias e centraliza Interface, IA, Workspace, Notificações, Downloads, Armazenamento, Conta, Cloud e Segurança.

### Isolamento e arquivos grandes

Cada identidade abre um banco IndexedDB próprio (`studyai-db:user-{id}`); convidados usam `studyai-db:guest`. A troca acontece no `AuthProvider`, impedindo mistura local entre contas. No servidor, arquivos grandes são enviados ao Object Storage S3 compatível e o PostgreSQL guarda somente metadados e a chave. MinIO é usado no Compose local. Substituição e exclusão removem os objetos associados; o fallback em `BYTEA` permanece apenas para desenvolvimento sem S3.

### Produção

- `Dockerfile` standalone e usuário não-root.
- `docker-compose.yml` com aplicação, PostgreSQL, MinIO e Caddy.
- Caddy com HTTPS automático, compressão e HSTS.
- CI com lint, typecheck, build e Playwright; publicação opcional no GHCR.
- `/api/health` protegido para diagnóstico detalhado e `/api/telemetry` allowlisted.
- Web Vitals e long tasks somente após consentimento explícito.

O repositório está preparado para produção, mas domínio/DNS, certificados públicos, bucket/credenciais, SMTP, secrets e webhook de deploy precisam ser provisionados no ambiente. Docker não estava instalado no host desta Sprint; por isso a composição foi validada por contrato automatizado, não iniciada localmente. Consulte `PRODUCTION.md`.

### Validação da Sprint 32

Foram adicionados seis cenários Playwright, totalizando 86: modos, Ajuda/atalho, onboarding, viewport mobile, isolamento por usuário e contratos de produção. Lint, TypeScript, build e todos os testes devem permanecer verdes antes do handoff final. A inspeção visual foi feita em 360 px e 1440 px, em tema claro/escuro e nas rotas principais.

## Estado preservado da Sprint 31

## Estado entregue na Sprint 31

O StudyAI agora possui uma camada multiplataforma isolada das features de estudo. O navegador pode instalar uma PWA com shell offline, cache segmentado, atualização automática, atalhos e recepção de materiais pelo menu Compartilhar. O Windows possui aplicativo Electron que inclui o servidor standalone do Next.js, portanto mantém Route Handlers, IndexedDB, OPFS, OCR, RAG, Workspace e Mentor sem depender de hospedagem externa.

```text
Web / PWA / Electron / Android / iOS
  → DeviceManager
  → PlatformProvider
  → Cache + notificações + updates + entrada de arquivos
  → aplicação existente
  → IndexedDB / OPFS
  → Cloud Sync incremental quando online
```

O Electron inclui splash screen, bandeja, menu nativo, atalhos, inicialização opcional, minimizar para bandeja, seleção de pasta, associação de materiais e canal IPC isolado por preload. O instalador NSIS `StudyAI-Setup-0.4.0.exe` foi gerado localmente em `dist-desktop/`, que permanece ignorado pelo Git. Atualizações estão conectadas ao `electron-updater`, mas exigem um feed assinado antes da publicação.

Os projetos Capacitor foram criados em `android/` e `ios/`. Android recebe arquivos por `SEND`, `SEND_MULTIPLE` e `VIEW`; iOS registra os tipos de documentos e abertura no próprio local. Ambos reutilizam a aplicação implantada definida por `CAPACITOR_SERVER_URL`, o cache local, IndexedDB e o Cloud Sync. Notificações locais funcionam por Capacitor; notificações de revisão também são monitoradas na PWA/Desktop enquanto a aplicação está ativa.

### Serviços de plataforma

- `DeviceManager`: identifica plataforma, sistema e fator de forma usados também na lista de dispositivos cloud.
- `PWAService`: instalação, service worker, atualização e consumo de arquivos compartilhados.
- `DesktopManager`: fachada do preload Electron para preferências nativas.
- `MobileBridge`: URLs, compartilhamento e leitura de arquivos Capacitor.
- `CacheManager`: diagnóstico, persistência e limpeza segura dos caches temporários.
- `NotificationService`: notificações Web, Electron e Capacitor e lembretes de revisão.
- `UpdateManager`: verificação uniforme de atualização PWA/Desktop.

### Validação específica

ESLint, TypeScript e build de produção foram aprovados. A suíte possui 80 cenários Playwright; os cinco novos validam manifest/share target, service worker, preferências persistidas, empacotamento Electron e contratos Android/iOS. A PWA foi validada em produção: Biblioteca abriu offline com status 200 e service worker controlador. O servidor incluído no pacote Desktop respondeu HTTP 200 e o instalador Windows foi gerado. O projeto Android compilou com o JBR 21 do Android Studio e produziu `android/app/build/outputs/apk/debug/app-debug.apk`. O projeto iOS está sincronizado, mas sua compilação e assinatura exigem macOS/Xcode e uma conta Apple.

O `npm audit --omit=dev` ainda informa quatro vulnerabilidades altas transitivas em `adm-zip` e `sharp`, trazidas pela cadeia `@huggingface/transformers`/`onnxruntime-node`. Elas não foram corrigidas automaticamente nesta Sprint para evitar uma atualização destrutiva do pipeline local de embeddings; devem ser tratadas em uma atualização isolada com regressão completa de OCR/RAG.

## Estado entregue na Sprint 30

O StudyAI agora possui conta e sincronização cloud sem substituir a arquitetura offline-first. IndexedDB e OPFS continuam atendendo todas as features imediatamente; após autenticação, um sincronizador em background replica somente registros alterados, tombstones e binários cujo hash mudou.

```text
IndexedDB / OPFS
  → manifesto + fila offline
  → Route Handlers protegidos
  → SyncService / ConflictResolver
  → PostgreSQL
  → cursor incremental
  → IndexedDB / OPFS sob demanda
```

Cadastro, login, logout, verificação, recuperação, alteração de senha/email, sessão persistente e renovação automática estão disponíveis. O perfil sincroniza nome, foto, idioma, tema e preferências; Workspace, Mentor, Learning Engine, Knowledge Graph, estudos, notas, resumos, flashcards, quizzes e histórico percorrem o mesmo contrato de sync. A página `/conta` centraliza dispositivos, último sync, espaço enviado, backups, conflitos, compartilhamentos, segurança e histórico.

### Serviços cloud

- `AuthService`: credenciais, sessões curtas, refresh rotativo, verificação e recuperação.
- `CloudDatabase`: fachada única para PostgreSQL e fallback em memória de desenvolvimento.
- `SyncService`: push/pull incremental e restauração de snapshots.
- `ConflictResolver`: valida versão-base e impede sobrescrita silenciosa.
- `CloudSyncManager`: hashes, manifesto, fila offline, compressão, pull, aplicação e uploads.
- `CloudFileService`: upload por hash e download sob demanda para OPFS.
- `EmailService`: envio SMTP de verificação e recuperação.

### Segurança

Senhas usam `scrypt`; refresh tokens e tokens de conta ficam somente como hash; JWTs expiram rapidamente e são renovados em cookies `HttpOnly`, `SameSite=Strict`. Mutações exigem CSRF, endpoints sensíveis possuem rate limit, uploads e sync possuem limites, e o middleware aplica CSP com nonce, HSTS em produção, `nosniff`, bloqueio de framing e políticas de navegador. Nenhuma credencial do banco ou token de sessão é exposta às features.

### Operação

Produção exige `DATABASE_URL` e `AUTH_SECRET`. SMTP é obrigatório em produção para os fluxos de verificação e recuperação. Sem PostgreSQL, o modo de desenvolvimento usa memória e informa claramente que os dados cloud são voláteis. O schema está em `src/server/database/schema.sql` e é inicializado idempotentemente pela conexão server-only.

### Validação específica

Os cenários da Sprint 30 cobrem conta e recuperação, persistência da sessão, fila offline, sincronização incremental, backup, compartilhamento, arquivo binário e conflito entre dois contextos de navegador. ESLint e TypeScript passaram sem erros, o build de produção foi aprovado e os 75 testes Playwright passaram.

## Estado entregue na Sprint 29

O Workspace possui um novo modo `Mentor`, sem substituir o Tutor. O Tutor continua atendendo perguntas livres por meio do AI Core; o Mentor coordena sessões guiadas com base em evidências do Learning Engine, Knowledge Graph, flashcards, quizzes e histórico real do tema.

```text
Study selecionado
  → MentorService
  → Learning Engine + Knowledge Graph + Flashcards + Quiz
  → SessionEngine
  → SocraticEngine + RecommendationEngine + GoalManager
  → MentorStorage / StorageManager / IndexedDB
  → painel Mentor no Workspace
```

Cada sessão cria um plano adaptativo com leitura, explicação, revisão e prática conforme a necessidade. O nível Iniciante, Intermediário ou Avançado altera a formulação das perguntas. Respostas recebem resultado, justificativa, orientação de melhoria e localização para revisão; uma resposta insuficiente interrompe a progressão e gera uma pergunta de acompanhamento antes de avançar. A explicação adicional reutiliza o `TutorService` e o `RetrievalPipeline`, mantendo o mesmo AI Core, provider selecionado e isolamento de arquivos físicos.

Metas de prova, trabalho, revisão e tempo de estudo são persistidas. Recomendações e próximas revisões são calculadas em `requestIdleCallback`, com fallback assíncrono, sem bloquear a interface. A memória mostra sessões concluídas por tema e a motivação só usa resultados reais da sessão.

### Serviços do Mentor

- `MentorService`: fachada que recarrega todas as evidências antes de coordenar a ação.
- `SessionEngine`: plano, estado e progressão da sessão guiada.
- `SocraticEngine`: perguntas adaptativas e avaliação explicável.
- `RecommendationEngine`: revisões e próximos passos em background.
- `GoalManager`: criação, atualização, conclusão e exclusão de metas.
- `MentorStorage`: persistência versionada exclusivamente via `StorageManager`.

### Validação

ESLint e TypeScript aprovados, build de produção aprovado e 72 testes Playwright aprovados. Os novos cenários cobrem sessão socrática, erro e nova explicação, memória, metas, recomendações e persistência após refresh.

## Contexto preservado da Sprint 28

O ambiente de Estudo deixou de ser uma sequência de ferramentas isoladas e passou a ser um Workspace multipainel. Material, Tutor, resumos, flashcards, quiz, notas, mapa de conhecimento e estatísticas podem permanecer abertos simultaneamente, com redimensionamento por ponteiro ou teclado, minimizar, maximizar, fechar, criar instâncias adicionais e restaurar o estado após reabrir o navegador.

```text
StudyWorkspace
  → WorkspaceCanvas
  → WorkspaceManager
  → LayoutManager + PanelManager
  → WorkspaceStorage (estado leve versionado)
  → painéis lazy / ferramentas existentes
  → SessionTracker / Learning Engine
```

Layouts nativos (`Leitura`, `Revisão`, `Exercícios`, `Tutor` e `Planejamento`) convivem com layouts personalizados. A navegação lateral usa a hierarquia Curso → Semestre → Matéria → Tema → Arquivo. O Tutor mantém a conversa ativa por instância de painel; notas mantêm a seleção por painel; listas extensas de materiais são virtualizadas; componentes ocultos não são montados.

O PDF Pro mantém zoom, página, capítulo e favoritos e adiciona marca-texto colorido, comentários, desenhos, links internos e histórico de páginas. As notas usam links Wiki para notas, materiais, capítulos e conceitos. O Mapa de Conhecimento expõe progresso e dificuldade do Learning Engine. A Pesquisa Global 2.0 busca, em uma única interface, materiais, notas, resumos, flashcards, quizzes, conceitos e relações, usando snapshot curto em cache.

Sessões do Workspace registram início, fim, foco, pausas, arquivos e ferramentas utilizadas no IndexedDB; ao concluir, o tempo é enviado ao Learning Engine. Apenas preferências leves de layout, dimensões, scroll, abas abertas e anotações de visualização ficam no `localStorage`, conforme o contrato do Storage V2.

### Serviços do Workspace

- `WorkspaceManager`: fachada para carregar, salvar, abrir ferramentas e aplicar layouts.
- `LayoutManager`: layouts padrão e personalizados.
- `PanelManager`: criação, remoção, redimensionamento, minimizar e maximizar.
- `WorkspaceStorage`: persistência versionada do estado leve por estudo.
- `WorkspaceState`: fábrica e contratos iniciais.
- `SessionTracker`: sessões persistentes e integração com o Learning Engine.

## Contexto preservado da Sprint 27

O StudyAI passa a transformar cada conteúdo extraído em uma estrutura de conhecimento persistente. O novo módulo `src/features/semantic` identifica conceitos, definições, entidades, palavras-chave, termos técnicos, siglas, fórmulas, tecnologias, pessoas, organizações, exemplos e observações. Relações explícitas e por coocorrência formam um grafo navegável por documento e Study.

O pipeline agora executa `semantic` entre `study` e `chunks`. Os chunks deixam de usar apenas janelas arbitrárias e preservam definições, listas, tabelas, fórmulas, exemplos e blocos relacionados. O grafo é armazenado no object store `knowledge` do IndexedDB v2. `sourceHash` e `parserVersion` permitem reutilizar resultados inalterados e reprocessar somente o material modificado.

```text
Documento normalizado
  → SemanticParser
  → ConceptExtractor + RelationExtractor
  → KnowledgeGraphBuilder
  → KnowledgeStorage / IndexedDB
  → SemanticChunkService
  → embeddings + RAG
  → Tutor / Biblioteca / Dashboard / Busca / Learning Engine
```

O Tutor expande a pergunta com aliases, sinônimos, siglas e conceitos relacionados antes do ranking híbrido, e recebe um bloco explícito de conhecimento no PromptBuilder. A Biblioteca mostra conceitos, relações e grau de estrutura; o Dashboard resume conceitos aprendidos, dominados, esquecidos e relações; o Learning Engine recomenda pré-requisitos; e o Workspace possui a aba clicável `Mapa de Conhecimento`.

### Serviços semânticos

- `SemanticParser`: converte seções extraídas em blocos semânticos com proveniência.
- `ConceptExtractor`: extrai e deduplica conceitos com ids estáveis.
- `RelationExtractor`: cria relações tipadas com evidência e peso.
- `KnowledgeGraphBuilder`: monta estatísticas, chunks e o grafo versionado.
- `KnowledgeStorage` / `SemanticStorage`: persistência única via `StorageManager`.
- `SemanticSearchService`: busca por nome, descrição, palavra-chave, sinônimo, sigla e relações.
- `KnowledgeService`: processamento incremental e reaproveitamento por hash.
- `LearningKnowledgeBridge`: recomenda pré-requisitos para temas difíceis ou esquecidos.

## Contexto preservado da Sprint 26

A Sprint 26 adiciona o primeiro Learning Engine do StudyAI sem remover o fluxo existente. Toda leitura, conversa, revisão de flashcard, resultado de quiz, resumo e nota alimenta um perfil local persistido. O Dashboard passa a mostrar plano do dia, revisões, tempo, maior dificuldade, maior progresso, último estudo, streak, calor de estudo, retenção e Knowledge Score por tema.

O conhecimento é calculado com evidências reais de quiz, flashcards, tempo, frequência e recência. O motor de prioridade explica a classificação com erros, dias sem revisão, cartões vencidos e domínio estimado. Flashcards usam SM-2 e persistem próxima revisão, intervalo, facilidade e repetições, mantendo o contrato preparado para FSRS. O Tutor recebe conhecimento, confiança, domínio e prioridade antes de montar o prompt e adapta a didática sem acessar arquivos físicos.

```text
Atividade real
  → LearningService
  → LearningStorage / IndexedDB metadata
  → KnowledgeEngine
  → StudyPriorityEngine
  → Plano diário / Dashboard / Tutor / Revisões
```

### Serviços do Learning Engine

- `LearningService`: entrada única dos eventos e fila serializada em background.
- `LearningStorage`: perfil versionado no IndexedDB.
- `LearningCalculator`: streak, plano diário, calor de estudo e estatísticas.
- `KnowledgeEngine`: Knowledge Score, domínio, dificuldade e insights de quiz.
- `StudyPriorityEngine`: prioridade e motivos por tema.
- `ReviewScheduler`: SM-2 e fronteira futura para FSRS.

A Sprint 25.2 conclui as pendências da 25.1. O AI Core agora possui compressão de histórico, top 3 chunks deduplicados, contagem interna de tokens, cache LRU, retry exponencial do Gemini e proteção da janela de contexto dos providers OpenAI-compatible. Tutor e providers transmitem respostas progressivamente por NDJSON, com SSE/NDJSON normalizados no servidor.

O Tutor renderiza Markdown, GFM, tabelas, checklists, código, links, imagens e matemática KaTeX. A altura é fixa e somente a conversa rola, com acompanhamento automático da última mensagem. PDF.js, Tutor, Flashcards, Quiz, Markdown, OCR e Whisper são carregados somente quando necessários.

Os arquivos originais são persistidos no OPFS quando disponível. O leitor oferece Texto/PDF, restaura o binário após reload, mantém estado quando a re-seleção é necessária e possui miniaturas lazy, índice, marcadores e Ctrl+F com contagem, navegação e destaque.

O pipeline não ocupa mais o Dashboard: status, logs, tempo, OCR, chunks, embeddings e uso de IA ficam no drawer “Detalhes da ingestão”. Resumos e organização usam autosave; soltar um arquivo na área de nova estrutura permite criar curso, semestre, matéria e tema no mesmo fluxo.

O Workspace preserva os atalhos das áreas `Material`, `IA`, `Mapa de Conhecimento`, `Flashcards`, `Quiz` e `Notas`, agora como entradas para painéis independentes. Todo o estado leve continua restaurado após refresh ou reabertura: layout, painéis, arquivo, PDF, capítulo, marcadores, flashcard, quiz e nota.

A Biblioteca ganhou ações rápidas, seleção múltipla, favoritos, tags, movimentação e exclusão em lote com confirmação. A tela Organizar aceita drag and drop entre temas e também oferece seleção múltipla. Notas são salvas automaticamente, sem botão de salvar.

O diagnóstico de IA mostra status, modelo, endpoint, latência, tempo médio e último erro de Gemini, Ollama, OpenRouter e Groq, com teste de conexão individual. O modo manual agora respeita estritamente o provider escolhido; fallback existe somente no modo automático.

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
  → GeminiProvider | OllamaProvider | OpenRouterProvider | GroqProvider
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

Gemini, Ollama, OpenRouter e Groq são providers funcionais quando suas respectivas configurações estão disponíveis. A página de Configurações lista health, endpoint, último erro, latência, tempo médio, modelo, memória, versão e última verificação, além de testar cada conexão separadamente.

No modo manual, somente o provider selecionado é usado. No modo automático, o Manager seleciona o provider online de menor latência e uma falha inicia a cadeia Ollama → Gemini → Groq → OpenRouter. Se todos falharem, a interface recebe um erro normalizado e preserva a pergunta do usuário.

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

- O binário original é persistido no OPFS quando suportado. Com conta, um binário ausente é baixado sob demanda; sem conta e sem OPFS, a re-seleção continua disponível sem perder dados derivados ou estado do Workspace.
- A primeira transcrição depende do download do modelo Whisper; indisponibilidade de rede é registrada como erro do arquivo sem interromper os demais.
- O histórico do Tutor é local ao navegador.
- O Ollama depende de um serviço local em execução e de pelo menos um modelo instalado.
- O processamento de materiais permanece local; banco remoto e sincronização armazenam dados já estruturados e binários do usuário, sem mover OCR, embeddings ou RAG para o servidor.

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

Validação final da Sprint 25.1: ESLint aprovado, TypeScript aprovado, build de produção aprovado e 47 testes Playwright aprovados. A cobertura adicional valida diagnóstico online/offline por provider, restauração do Workspace, flashcard e quiz atuais, navegação lateral, abertura direta de materiais, ações em lote e drag and drop.

Validação final da Sprint 25.2: ESLint aprovado, TypeScript aprovado, build de produção aprovado e 54 testes Playwright aprovados. Os novos cenários cobrem streaming NDJSON, Markdown/GFM/KaTeX, altura e rolagem do chat, cache de IA, compressão e métricas de tokens, persistência do PDF no OPFS, busca Ctrl+F, drawer de diagnóstico, criação de hierarquia por drag and drop e carregamento lazy do PDF.js.

Validação final da Sprint 26: ESLint aprovado, TypeScript aprovado, build de produção aprovado e 62 testes Playwright aprovados. A cobertura nova valida Knowledge Score, SM-2, prioridade explicável, plano diário, Dashboard inteligente, contexto adaptativo do Tutor, persistência do agendamento dos Flashcards e insights do Quiz.

Validação final da Sprint 27: ESLint aprovado, TypeScript aprovado, build de produção aprovado e 67 testes Playwright aprovados. A cobertura semântica valida extração de conceitos, relações, preservação de definições nos chunks, expansão de busca, pré-requisitos do Learning Engine, persistência do grafo, Biblioteca, Dashboard, Mapa de Conhecimento e contexto enviado ao Tutor.

Validação final da Sprint 28: ESLint aprovado, TypeScript aprovado, build de produção aprovado e 70 testes Playwright aprovados. `tests/workspace-v2.spec.ts` cobre painéis, redimensionamento por teclado, restauração, layouts, lazy rendering, Tutor, notas Wiki, pesquisa global, sessões e PDF Pro.

## Próximo passo seguro

Validar ergonomia dos layouts com acervos reais extensos e diferentes densidades de tela. Uma evolução segura é mover cálculos de grafos muito grandes para Web Worker e permitir edição manual de relações, preservando os contratos do Workspace e do grafo.
