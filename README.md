# StudyAI

Workspace pessoal de estudos construído com Next.js 15, React, TypeScript e Tailwind CSS. O projeto reúne importação, extração e recuperação híbrida local de materiais, um ambiente de estudo, recursos de revisão, Tutor IA e sincronização incremental entre dispositivos.

## Início rápido

Requer Node.js 22 ou superior.

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`. Para validar a aplicação:

```bash
npm run lint
npm run typecheck
npm run test:e2e
npm run build
```

O resultado da auditoria e inventário da Sprint 32.5 estão em [`docs/AUDITORIA_SPRINT_32_5.md`](docs/AUDITORIA_SPRINT_32_5.md), [`docs/INVENTARIO_PROJETO.md`](docs/INVENTARIO_PROJETO.md), [`docs/ARQUITETURA_E_FLUXOS.md`](docs/ARQUITETURA_E_FLUXOS.md) e [`docs/BACKLOG_SPRINT_32_5.md`](docs/BACKLOG_SPRINT_32_5.md).

## Configuração de IA

Copie o conteúdo de `.env.example` para `.env.local` e informe uma chave válida:

```env
GEMINI_API_KEY=
OLLAMA_URL=http://localhost:11434
OPENROUTER_API_KEY=
GROQ_API_KEY=
DATABASE_URL=postgresql://usuario:senha@localhost:5432/studyai
AUTH_SECRET=gere-uma-chave-aleatoria-com-pelo-menos-32-caracteres
SMTP_HOST=
```

Gemini, Ollama, OpenRouter e Groq implementam o mesmo contrato. No modo manual, somente o provider selecionado é utilizado; no automático, o Provider Manager prioriza o provider online mais rápido e aplica fallback. Gemini aplica retry com backoff em alta demanda, e providers OpenAI-compatible respeitam a janela de contexto descoberta para cada modelo. Configurações mostra endpoint, modelo, latência, tempo médio, último erro e teste de conexão individual. Nenhuma credencial ou chamada de provider é exposta ao cliente: toda comunicação passa por Route Handlers, `AIService` e `ProviderManager`.

## Módulos atuais

| Módulo | Estado atual |
| --- | --- |
| Dashboard | Plano diário, streak, revisões, Knowledge Score, dificuldades e estatísticas calculadas somente a partir das atividades reais. |
| Biblioteca | Pesquisa, filtros, seleção múltipla, tags, favoritos, ações rápidas, movimentação e exclusão confirmada sobre arquivos importados. |
| Importar | Seleção local de arquivos ou pastas, drag and drop, extração e geração automática de Studies para PDF, DOCX, PPTX, TXT, MP3 e MP4; não envia arquivos. |
| Organizar | Árvore dos materiais importados; renomear, mover ou excluir atualiza todos os dados derivados. |
| Workspace 2.0 | Canvas com painéis redimensionáveis, layouts persistentes, multitarefa, Tutor contextual, PDF Pro, notas Wiki, mapa e sessões integradas. |
| AI Mentor | Sessões guiadas, perguntas socráticas, correção explicável, metas, plano adaptativo, recomendações e memória local por tema. |
| Tutor IA | Streaming NDJSON, Markdown/GFM/KaTeX, conversa com scroll interno, autosave e métricas de tokens. |
| RAG local | Chunking, embeddings locais, busca híbrida, deduplicação e somente os três melhores trechos. |
| AI Core | Registry, health, retry, seleção, fallback, compressão de contexto, cache, tokens, streaming e erros normalizados. |
| Storage V2 | IndexedDB transacional para documentos e dados de estudo, com migração automática do armazenamento legado. |
| Smart Study Generator | Identificação local de disciplina, tema, subtemas, capítulos, palavras-chave, idioma e tempo de leitura após a extração. |
| Learning Engine | Perfil local, tempo por matéria/tema, domínio, prioridade, SM-2, plano diário, retenção e adaptação do Tutor. |
| Semantic Knowledge Engine | Conceitos, definições, siglas, entidades, relações e chunks semânticos persistidos como grafo local. |
| Pesquisa Global 2.0 | Busca unificada em materiais, notas, resumos, flashcards, quizzes, conceitos e relações. |
| Configurações | Central única por categorias, modo Simples/Avançado, aparência, IA, Workspace, armazenamento, Cloud e segurança. |
| Conta e Cloud Sync | Cadastro, login, recuperação, perfil, sessões, sync incremental, conflitos, backups, compartilhamentos e histórico. |
| Multiplataforma | PWA instalável/offline, aplicativo Electron para Windows, projetos Capacitor Android/iOS, cache, notificações e reconhecimento do dispositivo no Cloud Sync. |
| Ajuda e onboarding | Tour inicial, guias contextuais, busca de tutoriais, atalhos e paleta universal por `Ctrl+K`. |
| Produção | Docker/Compose, PostgreSQL, Object Storage S3/MinIO, Caddy com HTTPS e pipelines CI/CD. |

## Arquitetura

```text
src/
├── app/                 # Rotas App Router e Route Handlers
├── components/          # Layout compartilhado e componentes UI
├── features/            # Módulos de domínio, incluindo o AI Core
├── hooks/               # Estado transversal de layout
├── lib/                 # Utilitários e StorageManager sobre IndexedDB
├── server/              # Auth, segurança, PostgreSQL e serviços cloud server-only
├── services/            # Registro persistido e referências de runtime dos materiais
├── styles/              # Tokens e estilos globais
└── types/               # Contratos TypeScript compartilhados
```

O Smart Study Generator fica em `src/features/study-generator`. Seus detectores são independentes e determinísticos: `StudyAnalyzer` coordena estrutura, disciplina, palavras-chave e leitura; `StudyGeneratorService` é o único responsável por persistir o resultado no material e no Study Engine. PDFs da Estácio reconhecem os marcadores `OBJETIVOS`, `INTRODUÇÃO`, `UNIDADE`, `CAPÍTULO`, `SEÇÃO`, `ATIVIDADES`, `EXERCÍCIOS`, `CONCLUSÃO` e `REFERÊNCIAS`. Quando a identificação não é conclusiva, o fluxo cria um estudo básico com valores explícitos de fallback e nunca bloqueia a importação.

Documentos, conteúdos, grafos de conhecimento, chunks, embeddings, estudos, notas, resumos, flashcards, quizzes, transcrições, OCR e metadados ficam em um IndexedDB isolado por conta (`studyai-db:user-{id}` ou `studyai-db:guest`), usado como cache offline e fonte de trabalho imediata. Quando disponível, o binário original é salvo no Origin Private File System (OPFS). Para usuários autenticados, mudanças são sincronizadas incrementalmente com PostgreSQL e os binários grandes são enviados por hash ao Object Storage S3 compatível. O `localStorage` permanece reservado a preferências leves e cursores de infraestrutura.

## Experiência e modos de interface

O modo **Simples** é o padrão e mantém somente as jornadas de estudo. O modo **Avançado** revela Knowledge Graph, diagnóstico, pipeline, métricas e controles técnicos sem reiniciar a aplicação. A preferência é aplicada imediatamente e sincronizada como configuração leve. A navegação possui Sidebar adaptativa no desktop, barra inferior no celular e busca universal com páginas, materiais, conteúdos e comandos.

O primeiro uso apresenta um tour curto e opcional. Ajuda permanece acessível em qualquer tela, com tutoriais pesquisáveis e guias contextuais que aparecem uma única vez. A coleta de métricas de desempenho é desativada por padrão e só inicia mediante consentimento explícito.

## Produção

A implantação de referência usa `Dockerfile`, `docker-compose.yml`, PostgreSQL, MinIO/S3 e Caddy. Arquivos grandes deixam o banco relacional; o PostgreSQL armazena somente metadados e chaves, enquanto o Object Storage usa caminhos isolados por usuário. O endpoint `/api/health` expõe somente estado mínimo publicamente e exige `HEALTH_SECRET` para detalhes em produção.

Consulte [PRODUCTION.md](./PRODUCTION.md) para variáveis, DNS/HTTPS, observabilidade, backup e checklist de release. A configuração prepara a infraestrutura, mas publicar um domínio e provisionar credenciais continuam sendo ações externas ao repositório.

## Conta, backend e sincronização

O backend fica em `src/server` e só é acessado por Route Handlers. API keys, hashes de senha, refresh tokens e conexão PostgreSQL nunca chegam ao navegador. Senhas usam `scrypt`; refresh tokens e tokens de conta são armazenados apenas como hash; JWTs de acesso expiram em 15 minutos e são renovados por refresh token rotativo em cookie `HttpOnly`. Requisições mutáveis autenticadas usam proteção CSRF, cookies `SameSite=Strict`, rate limit e limites de payload. Em produção, HTTPS é reforçado por HSTS e o middleware aplica CSP, proteção contra framing, MIME sniffing e políticas restritivas do navegador.

```text
IndexedDB / OPFS
  → CloudSyncManager
  → /sync e /api/files/:id
  → SyncService + ConflictResolver
  → PostgreSQL
```

Cada registro sincronizado possui entidade, id, versão, timestamp, hash, operação e dispositivo. O cliente mantém manifesto, cursor e fila offline; somente alterações, exclusões e arquivos com hash novo são enviados. O servidor detecta edições concorrentes pela versão-base. Conflitos não mescláveis aparecem em `/conta`, onde é possível manter a versão local, usar a remota ou mesclar objetos compatíveis. O Workspace continua funcionando offline e sincroniza novamente ao recuperar a conexão.

Backups preservam snapshots versionados dos registros cloud e podem ser restaurados pela página Conta. Compartilhamentos usam tokens revogáveis. Downloads de binários são sob demanda: um material ausente no OPFS é solicitado somente quando o visualizador precisa abri-lo. Sem `DATABASE_URL`, o desenvolvimento usa um backend em memória explicitamente sinalizado na interface; esse modo não é persistente e não deve ser usado em produção.

O estado leve do Workspace também é persistido: estudo e arquivo atuais, aba, página/zoom/capítulo/marcadores do PDF, flashcard, questão e nota aberta. Notas, resumos e organização usam autosave. O Tutor restaura a conversa ativa.

O Workspace 2.0 adiciona layouts de Leitura, Revisão, Exercícios, Tutor, Mentor e Planejamento, além de layouts personalizados. Cada estudo restaura painéis, tamanhos, scroll, arquivos e ferramentas abertas. O PDF mantém anotações coloridas, comentários, desenhos, links internos e histórico; notas conectam outras notas, materiais, capítulos e conceitos por links Wiki. Sessões registram foco, pausas, arquivos e ferramentas no IndexedDB e alimentam o Learning Engine.

O AI Mentor coordena o Learning Engine, o grafo semântico, flashcards, quizzes e metas sem duplicar suas regras. Ele cria um plano curto por tema, formula perguntas com base nos conceitos extraídos, avalia a resposta de forma explicável, interrompe o avanço quando a compreensão ainda é insuficiente e mantém sessões, objetivos e recomendações no store `metadata` por meio do `StorageManager`. Os cálculos de recomendação são executados em período ocioso e não bloqueiam a interface.

## Desktop, PWA e mobile

A mesma aplicação possui fronteiras de plataforma em `src/features/platform`. `DeviceManager` identifica Web, PWA, Electron, Android e iOS; `CacheManager`, `NotificationService` e `UpdateManager` mantêm comportamento consistente sem levar APIs nativas às features de estudo. Preferências de plataforma são leves, persistidas localmente e entram no sync do Workspace.

- PWA: manifest completo, ícones `any` e `maskable`, atalhos, file/share target, service worker com app shell, network-first para navegação, stale-while-revalidate para assets e cache separado para materiais.
- Windows: Electron com servidor Next.js standalone restrito ao loopback, splash, bandeja, menu, atalhos, inicialização opcional, associação de arquivos, leitura segura por preload isolado e instalador NSIS.
- Android/iOS: projetos Capacitor, abertura/compartilhamento de documentos, IndexedDB, notificações locais e preferências mobile. O endereço HTTPS implantado é informado por `CAPACITOR_SERVER_URL`.
- Offline: dados de estudo continuam no IndexedDB/OPFS; o PWA restaura rotas visitadas e o Desktop inclui o servidor completo. Ao recuperar a rede, o `CloudSyncProvider` processa a fila incremental.

Os comandos, requisitos de assinatura e limites de distribuição estão em [MULTIPLATFORM.md](./MULTIPLATFORM.md).

O Learning Engine registra leitura, Tutor, Quiz, Flashcards, Resumos e Notas de forma assíncrona. O perfil fica no store `metadata` do IndexedDB e produz um Knowledge Score por tema a partir de quiz, revisões, tempo, frequência e recência. A prioridade explica seus motivos, o plano diário reutiliza os módulos existentes e o agendamento dos flashcards usa SM-2 com contrato preparado para FSRS.

O Semantic Knowledge Engine fica em `src/features/semantic`. Após a normalização e a criação do Study, ele identifica conceitos, definições, termos técnicos, siglas, fórmulas, exemplos e entidades; cria relações auditáveis; preserva blocos semânticos no chunking; e grava um grafo por arquivo no store `knowledge`. O hash da fonte e a versão do parser evitam reprocessamento quando o conteúdo não mudou. Tutor, RAG, busca global, Biblioteca, Dashboard, Learning Engine, Flashcards e Quiz reutilizam a mesma representação estruturada.

## Limites deliberados

Não existe banco vetorial externo nem processamento cloud dos materiais. O RAG continua local e combina embeddings linguísticos com ranking lexical; o provider selecionado recebe somente os melhores trechos extraídos e o contexto estruturado do estudo atual. O modo em memória do backend serve apenas ao desenvolvimento. A persistência cloud real requer PostgreSQL e Object Storage configurados; verificação/recuperação requer SMTP. iOS continua exigindo macOS/Xcode, e HTTPS público exige domínio, DNS e certificados válidos.

## Referências

- [Next.js App Router](https://nextjs.org/docs/app)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
