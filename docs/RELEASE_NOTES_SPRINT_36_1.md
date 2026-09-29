# Release Notes — Sprint 36.1

Data: 29 de setembro de 2026.

## Visão geral

A Sprint 36.1 adicionou uma jornada de estudo sem arquivo importado e a conectou às ferramentas já existentes. O usuário pode criar um estudo na Academy, gerar conteúdo estruturado, exportar material e praticar no Laboratório sem perder o contexto do tema.

## Entregas

### Academy

- Criação de estudo livre com tema, matéria, nível, objetivo, duração, idioma, profundidade e estilo.
- Geração por etapas de material de estudo, trilha e projeto prático por meio do AI Core existente.
- Conteúdo estruturado com módulos, capítulos, conceitos, exemplos, exercícios, resumo, revisão, flashcards e quiz.
- Persistência no IndexedDB e integração com Study Engine, Learning Engine e Knowledge Graph.

### Exportação

- PDF de material e apostila com capa, sumário, capítulos, tabelas, código, exercícios e gabarito.
- Apresentação PPTX estruturada e editável.
- Mermaid preservado como fonte editável quando não existe renderização vetorial no exportador.
- Binários persistidos no OPFS, registrados na Biblioteca e reprocessados pelo pipeline de conhecimento.

### Laboratório

- Editor e preview para JavaScript, TypeScript, HTML/CSS, Markdown e Mermaid.
- SQL local via SQLite/WASM carregado sob demanda.
- Terminal simulado sem execução de comandos do sistema.
- Sandbox que bloqueia rede, workers, imports externos, credenciais e arquivos físicos.
- Correção contextual pelo Professor/Mentor e registro de tentativas, acertos, erros e tempo no Learning Engine.

### Integração final

- Academy e Lab na navegação desktop e mobile.
- Filtros específicos e rótulos consistentes na Biblioteca.
- Pesquisa universal sobre materiais gerados e conteúdo dos exercícios do Lab.
- Layouts nativos de Workspace para Academy, prática, revisão gerada e trilha guiada.
- Dashboard com retomada de estudo/prática, conteúdos recentes, pendências e próxima revisão.
- Tempo de leitura da Academy e progresso inicial registrados ao abrir o conteúdo.

## Segurança e performance

- Providers continuam acessíveis somente pelo AI Core e pelas rotas internas.
- Prompts recebem objetos estruturados; arquivos físicos, chaves e tokens não são enviados.
- Preview HTML isolado e execução JavaScript em Worker com validação prévia.
- PDF/PPTX, SQLite/WASM e ferramentas pesadas usam carregamento dinâmico.
- Painéis ocultos do Workspace não montam ferramentas pesadas.

## Limitações conhecidas

- Mermaid é exportado como fonte editável, sem conversão automática para imagem no PDF/PPTX.
- Python permanece disponível como contrato visual, sem runtime Pyodide nesta versão.
- TypeScript é transpilado para execução local limitada; o Laboratório não substitui um ambiente de desenvolvimento completo.
- A correção por IA depende de um provider configurado e disponível.
- `npm audit --omit=dev` reporta quatro vulnerabilidades HIGH transitivas em `adm-zip` e `sharp`, trazidas por `@huggingface/transformers`; nenhuma atualização automática foi aplicada nesta sprint de integração.

## Próximos passos

- Executar a auditoria de Beta Readiness da Sprint 36.5 com acervos reais e dispositivos variados.
- Medir bundle, consumo de memória e tempo de inicialização em hardware de entrada.
- Validar acessibilidade, toque e restauração de sessão nos fluxos Academy/Lab.

## Validação

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado.
- `npm run build`: aprovado, 42 páginas e 104 kB compartilhados.
- Suíte focada Academy/Lab/Biblioteca/Workspace: aprovada.
- Regressão Playwright: 106 cenários diretos e 5 recuperados por retry; os 2 cenários de Cloud Sync que falharam sob carga total foram aprovados isoladamente (2/2).
