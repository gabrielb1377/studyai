# StudyAI

Workspace pessoal de estudos construído com Next.js 15, React, TypeScript e Tailwind CSS. O projeto reúne importação, extração e recuperação híbrida local de materiais, um ambiente de estudo, recursos de revisão e um Tutor IA desacoplado por providers.

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

## Configuração de IA

Copie o conteúdo de `.env.example` para `.env.local` e informe uma chave válida:

```env
GEMINI_API_KEY=
OLLAMA_URL=http://localhost:11434
OPENROUTER_API_KEY=
GROQ_API_KEY=
```

Gemini, Ollama, OpenRouter e Groq implementam o mesmo contrato. No modo manual, somente o provider selecionado é utilizado; no automático, o Provider Manager prioriza o provider online mais rápido e aplica fallback. Gemini aplica retry com backoff em alta demanda, e providers OpenAI-compatible respeitam a janela de contexto descoberta para cada modelo. Configurações mostra endpoint, modelo, latência, tempo médio, último erro e teste de conexão individual. Nenhuma credencial ou chamada de provider é exposta ao cliente: toda comunicação passa por Route Handlers, `AIService` e `ProviderManager`.

## Módulos atuais

| Módulo | Estado atual |
| --- | --- |
| Dashboard | Plano diário, streak, revisões, Knowledge Score, dificuldades e estatísticas calculadas somente a partir das atividades reais. |
| Biblioteca | Pesquisa, filtros, seleção múltipla, tags, favoritos, ações rápidas, movimentação e exclusão confirmada sobre arquivos importados. |
| Importar | Seleção local de arquivos ou pastas, drag and drop, extração e geração automática de Studies para PDF, DOCX, PPTX, TXT, MP3 e MP4; não envia arquivos. |
| Organizar | Árvore dos materiais importados; renomear, mover ou excluir atualiza todos os dados derivados. |
| Estudo | Navegação lateral entre matérias/temas/arquivos e abas exclusivas carregadas sob demanda, com estado restaurado. |
| Tutor IA | Streaming NDJSON, Markdown/GFM/KaTeX, conversa com scroll interno, autosave e métricas de tokens. |
| RAG local | Chunking, embeddings locais, busca híbrida, deduplicação e somente os três melhores trechos. |
| AI Core | Registry, health, retry, seleção, fallback, compressão de contexto, cache, tokens, streaming e erros normalizados. |
| Storage V2 | IndexedDB transacional para documentos e dados de estudo, com migração automática do armazenamento legado. |
| Smart Study Generator | Identificação local de disciplina, tema, subtemas, capítulos, palavras-chave, idioma e tempo de leitura após a extração. |
| Learning Engine | Perfil local, tempo por matéria/tema, domínio, prioridade, SM-2, plano diário, retenção e adaptação do Tutor. |
| Configurações | Tema, seleção manual/automática, modelos, health, endpoint, erros, latência, métricas e teste por provider. |

## Arquitetura

```text
src/
├── app/                 # Rotas App Router e Route Handlers
├── components/          # Layout compartilhado e componentes UI
├── features/            # Módulos de domínio, incluindo o AI Core
├── hooks/               # Estado transversal de layout
├── lib/                 # Utilitários e StorageManager sobre IndexedDB
├── services/            # Registro persistido e referências de runtime dos materiais
├── styles/              # Tokens e estilos globais
└── types/               # Contratos TypeScript compartilhados
```

O Smart Study Generator fica em `src/features/study-generator`. Seus detectores são independentes e determinísticos: `StudyAnalyzer` coordena estrutura, disciplina, palavras-chave e leitura; `StudyGeneratorService` é o único responsável por persistir o resultado no material e no Study Engine. PDFs da Estácio reconhecem os marcadores `OBJETIVOS`, `INTRODUÇÃO`, `UNIDADE`, `CAPÍTULO`, `SEÇÃO`, `ATIVIDADES`, `EXERCÍCIOS`, `CONCLUSÃO` e `REFERÊNCIAS`. Quando a identificação não é conclusiva, o fluxo cria um estudo básico com valores explícitos de fallback e nunca bloqueia a importação.

Os dados pessoais são locais por enquanto. Documentos, conteúdos, chunks, embeddings, estudos, notas, resumos, flashcards, quizzes, transcrições, OCR e metadados ficam no IndexedDB `studyai-db`. Quando disponível, o binário original é salvo no Origin Private File System (OPFS); se o navegador não oferecer suporte, a interface permite selecionar o arquivo novamente sem perder página, zoom, capítulo ou marcadores. O `localStorage` é reservado a preferências leves. O diagnóstico interno está disponível em `/storage`, e o Dashboard concentra ingestão e métricas em um drawer lateral.

O estado leve do Workspace também é persistido: estudo e arquivo atuais, aba, página/zoom/capítulo/marcadores do PDF, flashcard, questão e nota aberta. Notas, resumos e organização usam autosave. O Tutor restaura a conversa ativa.

O Learning Engine registra leitura, Tutor, Quiz, Flashcards, Resumos e Notas de forma assíncrona. O perfil fica no store `metadata` do IndexedDB e produz um Knowledge Score por tema a partir de quiz, revisões, tempo, frequência e recência. A prioridade explica seus motivos, o plano diário reutiliza os módulos existentes e o agendamento dos flashcards usa SM-2 com contrato preparado para FSRS.

## Limites deliberados

Esta versão não tem banco vetorial, banco remoto, autenticação ou sincronização. O RAG combina embeddings linguísticos locais com ranking lexical: o provider selecionado recebe somente os melhores trechos extraídos e o contexto estruturado do estudo atual; nunca recebe arquivos físicos nem todo o acervo.

## Referências

- [Next.js App Router](https://nextjs.org/docs/app)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
