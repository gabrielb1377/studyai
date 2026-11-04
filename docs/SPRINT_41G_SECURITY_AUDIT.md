# Sprint 41G — auditoria de isolamento e prova

## Sprint 41G.1B — encerrada localmente

**O que foi implementado.** `SessionOperationManager` centraliza a identidade da sessão ativa: cada operação assíncrona recebe o `userId` e a geração vigentes, escuta um `AbortSignal` e precisa passar em `assertCurrent()` antes de gravar qualquer resultado. A troca de conta chama `beginTransition()` (incrementa a geração, suspende novas operações e aborta as existentes) e `activate(userId)` ao final. `AuthProvider` serializa as transições, publica a troca para outras abas via `localStorage` e só libera a interface depois de suspender os dados privados. `SessionLocalData` retira de `localStorage` as chaves privadas da conta anterior, guarda-as no escopo daquela conta e as restaura somente quando o dono coincide; sem dono correspondente o conteúdo fica em recuperação, sem ser atribuído à nova conta.

**Rejeição de respostas atrasadas e cancelamento.** `CloudSyncManager` vincula cada ciclo à identidade que o iniciou, abandona o ciclo anterior quando a geração muda e descarta resultados tardios com `SessionChangedError`. `CloudFileService` e `MaterialBinaryStor

## Sprint 41G.2B — Modo Prova protegido (encerrado localmente)

**O que foi implementado.** `POST /api/exam/attempt` exige `x-studyai-session-user` igual ao usuário do JWT (`requireSessionOwner`, 409) mais CSRF e autenticação, rejeita `questions` enviado pelo cliente e cria questões exclusivamente no servidor a partir de `{studyId, title, subject, chunks, count, difficulty}`. O gabarito/explicações nunca são devolvidos antes da entrega; o cliente recebe somente questões sanitizadas. `GET /api/exam/attempt?id=` retorna a tentativa sem gabarito e, somente após conclusão, o resultado autorizado. `POST /api/exam/grade` usa `SELECT ... FOR UPDATE`, impõe `status <> 'completed'` na atualização e retorna o mesmo resultado para duplicatas/concorrência, rejeitando tentativas de outros usuários (404). Não há fallback em memória; `DATABASE_URL` ausente ou PostgreSQL indisponível falha com 503 antes da geração de IA.

**Limites da evidência.** Testes usam módulos transpilados em VM com PostgreSQL simulado; não testam banco real nem migração em produção. Migração `migrations/0001_exam_attempts.sql` existe mas não foi aplicada em produção.

## Sprint 41G.2C — Validação real do Modo Prova protegido (VALIDADA COM POSTGRESQL)

**O que foi feito.** Testes reais de integração contra PostgreSQL local descartável (`studyai_41g2c_test`, porta 5432, PostgreSQL 18) executados com sucesso (`tests/exam-attempt-integration.spec.ts`): criação, retomada, correção, idempotência, concorrência, isolamento cross-user e ausência de `correctAnswer`/`explicação` antes da entrega. Adicionado teste simulado de "falha de IA não persiste tentativa". Confirmado que `ProviderManager.generate` usa apenas o provedor preferido do usuário (`candidates = [preferred]`), sem fallback silencioso entre provedores; a rota retorna 503 antes da IA quando PostgreSQL está indisponível e não persiste tentativa em falha de IA.

**Banco utilizado.** PostgreSQL 18 local, banco `studyai_41g2c_test`, descartável/de teste, sem credenciais de produção.

**Resultado.** 7/7 testes de integração real aprovados contra PostgreSQL real; 21/21 testes simulados aprovados. Migration `migrations/0001_exam_attempts.sql` confirmada idempotente e compatível com o schema existente (`users(id)`).age` recebem o mesmo guarda, de modo que uploads em voo são cancelados e não confirmam resultado após a troca. No servidor, `/sync` e `/api/files/[id]` (GET, PUT e DELETE) exigem que o cabeçalho `x-studyai-session-user` coincida com o usuário do JWT por meio de `requireSessionOwner`, devolvendo `409 SESSION_CHANGED` em caso de divergência.

**Validação.** `tests/sprint41g1b-session.spec.ts` — **6/6 aprovados**: A → B → A com aborto de geração, preferências escopadas por conta, rejeição de identidade divergente na API, upload abortado na troca sem confirmação, resposta atrasada bloqueada e sincronização após logout sem gravação. `npm run typecheck` e `npm run build` aprovados; `npm run lint` com 0 erros e 69 avisos. Commits locais `9553c72` e `861bd0b`.

**Limitações da evidência.** Os testes carregam os módulos transpilados em memória com `fetch` simulado; **não** houve duas contas reais em navegador nem inspeção das respostas reais da API. Não há prova de isolamento dos dados já persistidos contra scripts da mesma origem, de janelas com múltiplas abas efetivamente concorrentes, de OPFS/Cache Storage legados ou de sincronizações simultâneas entre dispositivos. Não houve testes com serviços reais. O build com fontes KaTeX não foi reproduzido nesta execução (o erro é sensível ao caminho do projeto e não reapareceu).

**Status: 41G.1B encerrada localmente; isolamento completo NÃO comprovado.** Não considerar esta versão segura para avaliações sigilosas nem afirmar isolamento entre contas sem testes negativos com duas contas reais. Esta auditoria e os testes locais não acessam produção.

## Inventário e achados

- `localStorage` inclui planos (`studyai:exams`), configurações de IA, perfil acadêmico e preferências de experiência, workspace/posição/respostas, notas por painel, opções do Professor e aulas, seleção de biblioteca, áudio, laboratório de qualidade e editor Studio. Essas chaves são compartilhadas na origem e não são uma fronteira de segurança por usuário. A sincronização coleta prefixos de preferências para `workspace:preferences`.
- Nenhuma utilização direta de `sessionStorage` foi encontrada na busca por código de aplicação. Isso não prova ausência em dependências ou no navegador.
- O IndexedDB tem nomes por escopo de usuário e guarda documentos, estudos, notas, resumos, flashcards, quizzes, histórico e metadados. Nomes por conta impedem uso acidental por componentes, mas scripts na mesma origem podem acessá-los; não equivalem a autorização ou criptografia.
- O OPFS mantém binários em `studyai-materials`, diretório compartilhado entre contas. Os IDs não são controle de acesso. A recuperação, migração e isolamento de binários existentes ainda precisam ser desenhados sem perda de dados.
- `MaterialRuntimeStore` mantinha arquivos e URLs de objeto em memória entre trocas de escopo. Agora limpa e revoga esses URLs quando `StorageManager.setUserScope` efetivamente altera o escopo; outros caches, componentes e tarefas em andamento precisam de auditoria e invalidação abrangentes.
- Cache Storage inclui `studyai-shared-v1` para compartilhamento de arquivos, além dos caches gerenciados por `CacheManager` e service worker. Avaliar retenção, arquivos pendentes, escopo de conta e limpeza sem perda; não presumir que todos são públicos ou que logout os limpa.
- `CloudSyncManager` tem fila, manifesto e estado em IndexedDB e processos assíncronos em variáveis de módulo. Ao trocar de conta, operações pendentes podem continuar após a sessão/cookies ou banco ativo mudar. A separação dos registros no backend por `user.sub` não elimina essa corrida no cliente. A aplicação agora restringe chaves de preferências recebidas aos prefixos previstos e a valores texto, mas isso **não** isola contas nem cancela sincronizações.
- As rotas `/sync` e `/api/files/[id]` usam a identidade autenticada; esse fato, isoladamente, não comprova todos os cenários de autorização, nem foi verificado contra produção.

## Migração e dados existentes

`Migration.run()` anteriormente lia chaves legadas sem dono e as importava para o banco ativo, inclusive de usuário autenticado; então removia as chaves. Agora bancos autenticados registram a versão de migração sem importar ou remover esse conteúdo. O banco de visitante pode recuperar os registros legados existentes; a migração só remove as chaves após a transação local. Se o nome do banco mudar durante a leitura inicial, a migração falha antes de gravar. Isso é uma contenção parcial: a recuperação de dados sem dono ainda não tem fluxo explícito de identificação/consentimento e não deve ser atribuída automaticamente à próxima conta. Uma verificação isolada não cobre todas as corridas de transações e abas.

## Gabarito e necessidade de backend

`/api/tutor/quiz` devolve `correctAnswer` e `explanation` em cada questão. `QuizService` persiste esses campos localmente e `QuizWorkspace` corrige a prova no navegador. Logo, ocultar a explicação na interface não protege o gabarito. O modo existente foi identificado na interface como local e sem sigilo; a proteção por tentativa vinculada ao usuário, armazenamento seguro no servidor, correção transacional, idempotência e limite de tentativas **ainda não foi implementada**. Não usar o modo local como avaliação protegida.

Para concluir, projetar armazenamento no servidor que não fique disponível por `/sync`, migração explícita e separada, associação à identidade autenticada, verificações de autorização, expiração, limites, submissão atômica e testes de concorrência/idempotência. Preservar o modo prática e documentar a opção offline sem garantia de sigilo. Não criar tabelas em requisições ou migrar produção automaticamente.

## Riscos abertos e próximos testes

1. Reproduzir e corrigir A → B → A sem expor `localStorage`, sem perda e sem atribuição automática dos dados legados. Prefixos por usuário não protegem contra scripts da mesma origem; definir quais dados podem permanecer no dispositivo.
2. Impedir que qualquer envio, resposta, arquivo ou evento de sincronização iniciados por A sejam aplicados sob B, inclusive mudança de cookie, reload e múltiplas abas. Validar identidade também no backend.
3. Limpar e invalidar estados React, caches e handles em logout/troca; resolver OPFS e Cache Storage sem apagar dados irrecuperáveis.
4. Implementar e testar tentativas protegidas: payload inicial sem gabarito, acesso cruzado negado, submissão concorrente/duplicada, correção no servidor e desktop/celular.
5. Confirmar comportamento offline e plano de migração/recuperação com dados sintéticos, incluindo falha, interrupção e rollback.

As alterações parciais e resultados efetivos ficam também no handoff e nos commits locais; não são autorização para push ou deploy.

## Validação local

- `npm run typecheck`: aprovado; `npm run lint`: 0 erros, 69 avisos; `npm run build` aprovado na cópia isolada. A validação ocorreu sem conexão com bancos ou credenciais de produção.
- Playwright em cópia isolada: rodada de armazenamento/sincronização com 10 aprovados e 1 falha (painel de conflito não apareceu); o caso de conflito passou em repetição. Outra rodada focada teve 6 aprovados: três testes de migração, um de cache, um de filtragem de preferências e a repetição de conflito. Os testes de migração e cache usam dependências simuladas.
- Rodada de Workspace e auditoria A → B: 3 aprovados (incluindo desktop e celular simulados) e 1 falha; `studyai:exams` de A permaneceu acessível após login em B. Esse harness exploratório com contas sintéticas fica em `work/sprint41/tests/sprint41f-two-accounts-audit.spec.ts` na cópia isolada, não no repositório.
- Não foi executado um teste completo de A → B → A, corridas de sincronização na troca de identidade ou avaliação protegida no servidor. Não houve testes com serviços reais. Repetição bem-sucedida do caso de conflito não elimina possível intermitência.
