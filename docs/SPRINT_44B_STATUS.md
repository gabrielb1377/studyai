# Sprint 44B — Revisão por disciplina

Base local `7d437fc6ead7a98f8787f0dff38850aaa40dde18`.

## Fluxo e dados

**Estudo → Revisão por disciplina** reúne temas do Study Engine por curso, semestre e matéria. A tela mostra revisões atrasadas, de hoje e futuras, a média do progresso existente e a proporção de temas revisados. Acertos e erros de flashcards e quizzes são exibidos separadamente da autoavaliação. Dois ou mais erros com pelo menos tantos erros quanto acertos destacam o tema. Sem respostas registradas, a tela informa que ainda falta histórico.

Cada tema lista materiais vinculados ao mesmo estudo, com exercícios e simulados antes dos demais arquivos. Flashcards e quizzes existentes abrem nas ferramentas do estudo. O aluno pode registrar o material utilizado, um acerto ou erro declarado, ou apenas que revisou. A dificuldade declarada fica separada dos resultados. A revisão atualiza seu próprio contador e agenda sem alterar arbitrariamente a porcentagem de estudo.

O registro local usa metadados do IndexedDB no escopo da conta, com atualização transacional. A chave lógica combina disciplina e ID do estudo. O registro guarda o último resultado, origem, tentativas, acertos, erros, sequência de acertos e datas. Se um material mudar de disciplina ou o tema ficar indisponível, a revisão antiga continua associada à disciplina original. Registros anteriores de estudo, quiz e flashcards continuam acessíveis pelas estruturas existentes.

## Intervalos e Tutor

A primeira revisão sugere um dia. Acertos consecutivos avançam por 1, 3, 7, 14 e 30 dias. Erro reinicia a sequência e sugere um dia. Dificuldade declarada limita o intervalo a três dias. Revisar sem corrigir mantém a sequência de acertos e recalcula a data a partir da revisão atual. O cálculo segue o calendário local e aceita revisão antecipada. A data é uma sugestão, sem notificações externas.

**Continuar no Tutor** abre uma conversa da disciplina com o tema e os materiais vinculados. O rascunho fica disponível para edição e só é enviado mediante ação do aluno. A recuperação, as fontes e as regras de provedor e quotas continuam pelo fluxo da 44A. O perfil e os contadores da revisão ficam locais.

## Limites e Sprint 45

Exercícios e simulados importados são arquivos consultáveis. A avaliação usa o gabarito existente apenas nas ferramentas que já o possuem. A revisão registra totais e o último resultado, sem diário completo de respostas nem estimativa de domínio adicional. A organização depende dos temas vinculados pelo aluno. A homologação externa e a integração com Semana de Prova 2.0 e simulados adaptativos permanecem pendentes.

## Arquivos da sprint

- Entrada e tela: `src/app/estudo/page.tsx`, `src/app/estudo/revisao/page.tsx` e `src/features/learning/TopicReviewWorkspace.tsx`.
- Agenda e persistência: `src/features/learning/TopicReview.ts`, `src/features/learning/TopicReviewStorage.ts` e `src/lib/storage/StorageManager.ts`.
- Tutor: `src/features/tutor/TutorWorkspace.tsx` e `src/features/tutor/services/ReviewedTutorDraft.ts`.
- Testes: `tests/sprint44b-topic-review.spec.ts` e `tests/learning.spec.ts`.
- Documentação: `CURRENT_HANDOFF.md`, `docs/NEXT_SESSION_PROMPT.md` e este status.

## Validação local

- A rodada de 41 casos focados teve 40 aprovações e uma falha no localizador do teste de Tutor adaptativo. O texto esperado aparecia na conversa e na prévia lateral. O localizador passou a verificar a mensagem dentro da conversa, mantendo as verificações do perfil enviado. A repetição focada passou em 3/3, incluindo os dois casos da 44B. Ao todo, 41 casos distintos passaram na última execução de cada caso, sem falhas restantes ou ignorados.
- O teste de datas usa relógio controlado e cobre primeira revisão, acertos, erros, dificuldade, revisão sem correção, revisão antecipada, dias vencidos e virada de ano. O navegador validou importação real, persistência, viewport de 360 × 780, histórico antigo intacto, isolamento entre disciplinas após mover, preservação após excluir e Tutor contextual com provider simulado. As regressões incluíram Study Engine, flashcards, quizzes, Biblioteca, Tutor, OCR, quotas e Smart Routing.
- Typecheck, lint, build e `git diff --check` passaram. O lint apresentou 50 avisos preexistentes e zero erros. O build gerou 49 páginas. Os testes usaram o build local e bloquearam Service Worker no contexto do navegador para isolar recarregamentos do PWA. A matriz completa e a homologação externa não foram executadas.
- Checkpoint local seletivo recomendado. HEAD permanece na base da sprint, staging vazio e experimentos S3 preservados.
