# Guia de testes da Beta

Este documento orienta a validação manual da Beta do StudyAI. Use dados de teste e nunca inclua credenciais ou conteúdo acadêmico privado em relatos públicos.

## Preparação

1. Instale dependências com `npm ci`.
2. Copie `.env.example` para `.env.local` e preencha apenas os serviços usados no teste.
3. Execute `npm run dev` e abra `http://localhost:3000`.
4. Para receber feedback por email, configure SMTP e `FEEDBACK_EMAIL` no servidor.

## Fluxos prioritários

| Fluxo | Validação esperada |
| --- | --- |
| Primeiro acesso | Landing aparece antes do Dashboard; login, cadastro e modo offline são acessíveis. |
| Onboarding | Curso, instituição, semestre, objetivo e preferências persistem após recarregar. |
| Importação | Arquivo aparece na Biblioteca e o progresso reflete extração, OCR/transcrição e indexação reais. |
| Biblioteca | Busca, filtros, favoritos, duplicados e abertura direcionam ao recurso correto. |
| Workspace | Layout, painéis, arquivo, página, zoom e ferramenta atual são restaurados. |
| IA | Tutor, Professor e Mentor usam contexto estruturado; nenhum arquivo físico é enviado ao provider. |
| Academy | Estudo livre, trilha ou projeto é persistido, aparece na Biblioteca e abre no Workspace. |
| Exportação | PDF/apresentação é gerado, baixado e registrado como material derivado. |
| Lab | Preview permanece em sandbox; SQL/Markdown/Mermaid e terminal simulado não acessam sistema ou rede. |
| Conta e sync | Sessões ficam isoladas por usuário; sincronização incremental, conflito e estado offline não perdem dados. |
| Backup | Exportação e restauração preservam stores, preferências e layout do Workspace. |

## Matriz mínima

- Viewports: 360, 390, 768, 1024, 1366, 1440 e ultrawide.
- Entrada: mouse, teclado e toque.
- Temas: Claro, Escuro, AMOLED e Sistema.
- Experiência: Modo Simples e Modo Avançado.
- Providers, quando configurados: Gemini, Ollama, Groq e OpenRouter.
- Estados: online, offline, timeout, provider indisponível, arquivo inválido e armazenamento cheio.

## Automação

```bash
npm run lint
npm run typecheck
npm run test:e2e
npm run build
npm audit --omit=dev
```

O `npm audit` é diagnóstico: não execute correção automática sem uma rodada dedicada de regressão do pipeline local de ML.

## Como enviar feedback

Abra **Ajuda** e escolha **Enviar feedback** ou **Reportar problema**. O diagnóstico opcional inclui apenas rota atual, navegador, dispositivo e horário. Arquivos, conteúdo estudado e credenciais não são anexados.

Um bom relato inclui: tela, ação, resultado obtido, resultado esperado, repetibilidade e impacto. Não cole chaves, tokens, cookies ou documentos privados.

