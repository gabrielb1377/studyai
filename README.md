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
```

Gemini e Ollama são providers funcionais. Sem a chave do Gemini, suas ferramentas exibem um erro tratável. Para usar IA local, inicie o Ollama; o StudyAI detecta a versão e os modelos instalados em Configurações, sem nomes fixos. Nenhuma credencial ou chamada de provider é exposta ao cliente: toda comunicação passa por Route Handlers e pelo `AIService`.

## Módulos atuais

| Módulo | Estado atual |
| --- | --- |
| Dashboard | Progresso, temas recentes e indicadores calculados somente a partir dos dados do usuário. |
| Biblioteca | Pesquisa e filtros sobre arquivos realmente importados. |
| Importar | Seleção local de arquivos ou pastas, drag and drop, criação automática do Study e extração de PDF, DOCX, PPTX, TXT, MP3 e MP4; não envia arquivos. |
| Organizar | Árvore dos materiais importados; renomear, mover ou excluir atualiza todos os dados derivados. |
| Estudo | Materiais do tema, visualizadores, progresso, notas, flashcards, quizzes, resumos e Tutor contextual. |
| Tutor IA | Conversas persistidas e respostas com contexto do tema e trechos relevantes dos materiais. |
| RAG local | Chunking, embeddings locais, busca híbrida e contexto limitado, sem banco vetorial. |
| AI Core | Serviço central, providers, prompts, contexto, retrieval e erros normalizados. |
| Configurações | Tema visual, provider, descoberta de modelos Ollama, teste de conexão e seleção persistida do modelo. |

## Arquitetura

```text
src/
├── app/                 # Rotas App Router e Route Handlers
├── components/          # Layout compartilhado e componentes UI
├── features/            # Módulos de domínio, incluindo o AI Core
├── hooks/               # Estado transversal de layout
├── lib/                 # Utilitários e persistência local compartilhada
├── services/            # Registro persistido e referências de runtime dos materiais
├── styles/              # Tokens e estilos globais
└── types/               # Contratos TypeScript compartilhados
```

Os dados pessoais são locais por enquanto. Serviços de browser validam o conteúdo salvo no `localStorage` antes de utilizá-lo. Consulte [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) para os fluxos e limites atuais e [CURRENT_HANDOFF.md](./CURRENT_HANDOFF.md) para o próximo ponto de implementação.

## Limites deliberados

Esta versão não tem banco vetorial, banco de dados, autenticação, sincronização ou integração funcional com OpenRouter/Groq. O RAG combina embeddings linguísticos locais com ranking lexical: Gemini ou Ollama recebem somente os melhores trechos extraídos e o contexto estruturado do estudo atual; nunca recebem arquivos físicos nem todo o acervo.

## Referências

- [Next.js App Router](https://nextjs.org/docs/app)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
