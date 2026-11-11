# Sprint 44A — Tutor contextual por disciplina

Base local `9e356ed52f4a66fc409058f34b0808d4a93f1d0c`.

## Fluxo e continuidade

Na Biblioteca, organize os arquivos com **Mover**. A chave da disciplina combina curso, semestre e matéria atribuídos pelo aluno. **Estudar matéria completa** abre o Tutor, onde é possível marcar todos ou apenas alguns materiais e revisar a ordem sugerida antes de confirmar. Apostilas e unidades aparecem antes de exercícios e simulados. A classificação usa o tipo de exercício da Academy ou pistas nos nomes e tags. As etapas concluídas vêm dos estudos existentes. A sequência é uma sugestão baseada nos títulos, sem prazos.

O Tutor salva a seleção junto à conversa no armazenamento existente da conta. O histórico mantém o último tema perguntado e os trechos recuperados para cada resposta. A lista de conversas permite retomar a seleção. Confirmar outra seleção abre uma conversa separada, preservando o histórico anterior. Arquivos removidos ou movidos ficam indisponíveis para novas buscas e são sinalizados no painel. Os binários permanecem na Biblioteca.

## Recuperação

A busca usa texto extraído armazenado localmente. Por pergunta, lê as versões atuais, filtra a seleção por disciplina e prepara no máximo três trechos de 900 caracteres, privilegiando fontes distintas. Numera páginas de PDFs com metadados disponíveis e omite marcadores internos de formatos como TXT. Exclui páginas que ainda precisam de confirmação de OCR. Quando a pergunta ancora apenas um material, o tema atribuído pode buscar correspondências textuais em outros arquivos selecionados. Correspondência é uma evidência lexical, enquanto a relação pedagógica é uma sugestão a conferir. O Tutor recebe instruções para separar fontes de conhecimento geral, explicitar lacunas e citar apenas páginas disponíveis. O progresso enviado ao Tutor é a média dos estudos vinculados à seleção.

Cada referência guarda ID do trecho, arquivo, página quando disponível e excerto. A interface chama essas referências de fontes recuperadas, pois o modelo pode usar somente parte delas. O envio usa o mesmo endpoint, quota, seleção manual ou automática e fallback consentido. Seleção e recuperação local não acionam provider.

No build local, o Chromium confirmou que a política de conteúdo da página bloqueava a compilação WebAssembly do Tesseract dentro do worker Blob. O OCR agora inicia o worker diretamente pela rota local. Somente essa resposta tem uma política com `wasm-unsafe-eval` e dependências da mesma origem.

## Limites e próximos escopos

Simulados nesta seleção são arquivos da Biblioteca. Tentativas protegidas e gabaritos do Modo Prova seguem seu próprio fluxo. A busca é lexical e depende da nomenclatura e dos temas atribuídos. A leitura de trechos não comprova análise integral da disciplina. Pré-requisitos e frequência de assuntos precisam de evidência específica. Revisão espaçada e personalização avançada ficam para 44B. Simulados adaptativos ficam para 45.

## Arquivos da sprint

- Biblioteca e Tutor: `src/features/library/LibraryBrowser.tsx`, `src/features/tutor/DisciplinePanel.tsx`, `src/features/tutor/TutorWorkspace.tsx`, `src/features/tutor/TutorConversation.tsx`, `src/features/tutor/hooks/useTutor.ts`, `src/features/tutor/services/DisciplineContext.ts`, `src/types/tutor.ts`, `src/features/ai/PromptBuilder.ts`.
- Worker de OCR: `src/features/extraction/OCRService.ts`, `src/app/api/ocr/assets/[asset]/route.ts`, `src/middleware.ts`.
- Testes: `tests/sprint44a-discipline.spec.ts`, `tests/sprint44a-retrieval.spec.ts`, `tests/import.spec.ts`, `tests/sprint43-ai-routing.spec.ts`, `tests/sprint43b-exercise-review.spec.ts`.
- Documentação: `CURRENT_HANDOFF.md`, `docs/NEXT_SESSION_PROMPT.md` e este status.

## Validação local

- **47 casos distintos aprovados na última execução de cada caso**, sem falhas restantes ou ignorados entre os selecionados. As rodadas foram separadas: 17/17 para recuperação, segurança, quotas e fallback; 28/29 para Biblioteca, Tutor, Smart Routing, OCR e disciplina; 4/4 na repetição final de OCR real, cancelamento, revisão e disciplina. Dois casos aprovados foram repetidos. O cancelamento que falhou na rodada de 29 passou após a correção do worker.
- O teste no Chromium em 360 × 780 importou e organizou quatro materiais reais, selecionou todos de uma disciplina, excluiu o simulado e enviou ao Tutor somente os trechos de dois arquivos. Validou a ausência de chamadas antes de Enviar, ausência de páginas em TXT, retomada após recarregar e largura da página. O provider foi simulado.
- OCR real passou para PNG, JPEG, PDF escaneado e PDF misto. A primeira página do PDF misto permaneceu nativa. O cancelamento confirmou a preservação do original byte a byte. A repetição final conferiu a política específica do worker e a ausência da permissão WebAssembly na página.
- A primeira rodada concorrente compartilhou `.next` com o build e foi interrompida após falhas do runner. A rodada em build pronto foi repetida com Service Worker bloqueado no contexto de teste para isolar recarregamentos do PWA. Dois testes com texto duplicado passaram após localizar a mensagem dentro da conversa. O teste de disciplina passou depois de localizar o campo por papel acessível e corrigir as referências de TXT.
- `npm run typecheck`, `npm run lint` (zero erros e 50 avisos preexistentes), `npm run build` (48 páginas) e `git diff --check` passaram. A matriz completa e a integração com provider real não foram executadas.

Checkpoint local seletivo recomendado. HEAD e staging permanecem no checkpoint de base, com as alterações da sprint e os experimentos S3 separados no diretório de trabalho.
