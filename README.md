# StudyAI

Workspace pessoal de estudos construído com Next.js 15, React, TypeScript e Tailwind CSS. O projeto reúne importação, extração e recuperação lexical local de materiais, um ambiente de estudo, recursos de revisão e um Tutor IA integrado ao Gemini.

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

## Configuração do Gemini

Copie o conteúdo de `.env.example` para `.env.local` e informe uma chave válida:

```env
GEMINI_API_KEY=
```

Sem a chave, o Tutor, a geração de resumos, flashcards e quizzes exibem um erro tratável. Nenhuma chave é exposta ao cliente: as chamadas ao Gemini ocorrem somente em Route Handlers.

## Módulos atuais

| Módulo | Estado atual |
| --- | --- |
| Dashboard | Progresso, temas recentes e indicadores locais de estudo. |
| Biblioteca | Pesquisa e filtros sobre materiais mockados. |
| Importar | Seleção local, drag and drop e extração de PDF, DOCX, PPTX, TXT, MP3 e MP4; não envia arquivos. |
| Organizar | Árvore mockada com ações locais de renomear, mover e excluir. |
| Estudo | Material mockado, PDF de demonstração, players HTML5, progresso, notas, flashcards, quizzes e resumos. |
| Tutor IA | Conversas persistidas e respostas com contexto do tema e trechos relevantes dos materiais. |
| RAG local | Chunking determinístico, ranking lexical e contexto limitado, sem embeddings ou banco vetorial. |
| Configurações | Tema claro, escuro ou do sistema. |

## Arquitetura

```text
src/
├── app/                 # Rotas App Router e Route Handlers
├── components/          # Layout compartilhado e componentes UI
├── features/            # Módulos de domínio e suas interfaces
├── hooks/               # Estado transversal de layout
├── lib/                 # Utilitários, mocks e persistência local compartilhada
├── styles/              # Tokens e estilos globais
└── types/               # Contratos TypeScript compartilhados
```

Os dados pessoais são locais por enquanto. Serviços de browser validam o conteúdo salvo no `localStorage` antes de utilizá-lo. Consulte [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) para os fluxos e limites atuais e [CURRENT_HANDOFF.md](./CURRENT_HANDOFF.md) para o próximo ponto de implementação.

## Limites deliberados

Esta versão não tem embeddings, banco vetorial, banco de dados, autenticação, sincronização ou Ollama. O RAG é lexical e local: a IA recebe somente os melhores trechos extraídos e o contexto estruturado do estudo atual; nunca recebe arquivos físicos nem todo o acervo.

## Referências

- [Next.js App Router](https://nextjs.org/docs/app)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
