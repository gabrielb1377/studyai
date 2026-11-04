# Handoff atual — StudyAI V1.1 / Sprint 41

## Atualização Sprint 41G.1B

**Encerrada localmente.** A troca de conta agora invalida operações pendentes: `SessionOperationManager` marca cada tarefa assíncrona com usuário e geração, aborta requisições em voo e rejeita resultados atrasados com `SessionChangedError`; `SessionLocalData` descarta e restaura os dados privados por conta; `/sync` e `/api/files/[id]` passam a exigir `x-studyai-session-user` igual ao usuário do JWT (`requireSessionOwner`, `409 SESSION_CHANGED`).

**Commits locais:** `9553c72` (guarda de sessão no código) e `861bd0b` (testes e configuração do runner). **Testes:** `tests/sprint41g1b-session.spec.ts` **6/6 aprovados**; `npm run typecheck` e `npm run build` aprovados; `npm run lint` com 0 erros e 69 avisos.

**Limites da evidência:** os testes usam módulos transpilados em memória com `fetch` simulado, não duas contas reais de navegador. Isolamento completo entre contas **não foi demonstrado** (dados já persistidos, múltiplas abas, OPFS/Cache Storage legados e sincronizações simultâneas seguem sem prova). Riscos e próximos testes em [docs/SPRINT_41G_SECURITY_AUDIT.md](docs/SPRINT_41G_SECURITY_AUDIT.md).

## Atualização Sprint 41G.2B — encerrada localmente

**O que foi implementado.** Modo Prova protegido concluído: `POST /api/exam/attempt` exige autenticação, CSRF e proprietário da sessão, rejeita `questions` enviado pelo cliente e gera/valida questões no servidor usando `PromptBuilder.examQuiz`, `AIService` + `withAIQuota`. O gabarito completo fica apenas no PostgreSQL (`exam_attempts`, migration `0001_exam_attempts`); o cliente recebe somente questões sanitizadas (`id`, `question`, `alternativas`, dificuldade opcional). `GET /api/exam/attempt?id=` devolve a tentativa em andamento sem gabarito e, após a conclusão, o resultado autorizado. `POST /api/exam/grade` corrige transacionalmente com `FOR UPDATE`, idempotente, impede sobrescrita de tentativa concluída e rejeita tentativas de outros usuários. Sem fallback em memória; PostgreSQL indisponível devolve 503 antes da chamada de IA.

**Integração UI.** `QuizWorkspace` alterna entre Modo Prática (local, `QuizService`/`/api/tutor/quiz`, inalterado) e Modo Prova protegido (`SecureExamPanel` via `SecureExamClient`), com geração por quantidade/dificuldade, seleção A/B/C/D/E, navegação, respostas marcadas, progresso, entrega, resultado pós-entrega e retomada por `WorkspacePersistence` (`attemptId`, `secureAnswers`, `secureFinished`).

**Testes.** `tests/exam-attempt-server.spec.ts` — 16 testes simulados/focados (criação, validação, correção, idempotência, concorrência, acesso cross-user, retomada, PG indisponível, autenticação, rejeição de gabarito, geração sanitizada). `tests/sprint41-workspace.spec.ts` — fluxos protegido (desktop/mobile com `GET /auth/session`, `POST/GET /api/exam/attempt`, `POST /api/exam/grade`) e regressão prática. `npm run typecheck`, `npm run lint` e `npm run build` aprovados (apenas avisos pré-existentes).

**Restrições respeitadas.** Sem push, merge, deploy, migrations em produção, alteração no Railway/PostgreSQL/S3/credenciais nem PR #1 remoto. Não comitar `package.json`, `package-lock.json`, `CloudFileService.ts`, `CloudDatabase.ts`, `ObjectStorage.ts`, `src/app/api/files/[id]/direct/`, `tests/deploy-security.spec.ts`, `tests/direct-upload.spec.ts` e `scripts/generate-vercel-secret.ps1`.

**Sprint 41G.2B (Modo Prova protegido): encerrada localmente.** `ExamAttemptServer`, `SecureQuestion`, `POST /api/exam/attempt` e `POST /api/exam/grade` existem e estão commitados localmente (e156dd1, 9678bed, 5e65e58). O Modo Prática continua local e inalterado.

## Atualização Sprint 41G.2C — Validação real do Modo Prova protegido (em andamento, BLOQUEADA)

**O que foi feito.** Preparados testes reais de integração contra PostgreSQL (`tests/exam-attempt-integration.spec.ts`) cobrindo criação, retomada, correção, idempotência, concorrência, isolamento entre usuários e ausência de `correctAnswer`/`explicação` antes da entrega. Adicionado teste simulado de "falha de IA não persiste tentativa" (`tests/exam-attempt-server.spec.ts`). `typecheck`, `lint` e `build` aprovados; Playwright dirigido: 22 aprovados, 6 pulados (os 6 exigem banco não produtivo).

**BLOQUEIO: validação real com PostgreSQL não executada.** Não há banco PostgreSQL não produtivo disponível neste ambiente (sem `DATABASE_URL`, sem `psql`, sem Docker). Conforme instruído, não foram inventadas credenciais nem usado produção. A migration `migrations/0001_exam_attempts.sql` existe e é idempotente, mas `npm run db:migrate` não pôde ser executada contra um banco real. Os testes de integração estão gados por `DATABASE_URL` (não produtiva) e pulam automaticamente até que um banco esteja disponível.

**Próxima ação.** Quando um PostgreSQL não produtivo estiver disponível, executar `npm run db:migrate` (apenas contra banco não produtivo) e rodar `tests/exam-attempt-integration.spec.ts` para validar a integração real. A sprint 41G.2C **não está concluída** enquanto a integração real com PostgreSQL não for validada.

## Atualização Sprint 41F

Sprint ainda incompleta. A seleção automática que podia trocar silenciosamente de provedor foi temporariamente suspensa no gerenciador e na correção do Lab; a interface apresenta a limitação. Ainda não há fallback autorizado e configurável, consentimento para troca entre provedores, limites de custo ou confirmação do modelo para todos os fluxos. A quota de configurações legadas em modo automático pode continuar conservadora. O tratamento Gemini não repete erro 401 por texto ambíguo; a consulta de modelos OpenRouter preserva seu código HTTP. A Central de Ajuda ganhou categorias pesquisáveis e guia da Academy. O teste exploratório com duas contas sintéticas falhou: após troca de conta, o plano A permaneceu no `localStorage` acessível a B; o isolamento continua crítico. Typecheck/build passaram, lint 0 erros/69 avisos; Playwright dirigido 16/16 e 12/12 em rodadas diferentes, com mocks e sem serviços externos. Consulte `git log` para os commits locais e `docs/SPRINT_41_STATUS.md` para detalhes e pendências. Não presumir alterações do backend de produção ou serviços reais.

Checkpoint de 30 de outubro de 2026. **Sprint 41 incompleta; não pressupor autorização para push, merge, deploy ou acesso a produção.** As seções históricas abaixo registram sprints anteriores e não descrevem necessariamente o estado atual da infraestrutura.

## Git e preservação

- Projeto `D:\studyai`; branch `v1.1-development`; HEAD de implementação observado antes do commit deste checkpoint: `19cb815`.
- Referência remota local observada: `origin/v1.1-development` em `331bc15`; branch local quatro commits à frente, nenhum atrás. Não foi feito fetch: a referência pode estar desatualizada. O hash do commit de documentação é o HEAD a obter com `git log -1` após o checkpoint.
- Commits posteriores a essa referência: `3b54bb8` (seleção de IA e geração), `0215035` (Academy/quota), `f6bcb58` (menu Semana de Prova), `19cb815` (simulado e ferramentas). Estão locais segundo a referência observada.
- A conversa anterior identificou `cc8634b` como commit publicado numa etapa; não há confirmação independente nesta tarefa do commit atualmente implantado ou de que a referência remota coincide com ele. Não rotular `331bc15` como deployment ativo sem verificação autorizada.
- Preservar modificados: `package.json`, `package-lock.json`, `playwright.config.ts`, `src/features/sync/CloudFileService.ts`, `src/server/cloud/CloudDatabase.ts`, `src/server/storage/ObjectStorage.ts`. Preservar não rastreados: `src/app/api/files/[id]/direct/route.ts`, `tests/deploy-security.spec.ts`, `tests/direct-upload.spec.ts`, `scripts/generate-vercel-secret.ps1`. Upload direto é experimental e não foi aprovado para publicação. Não incluí-los em commits não relacionados.

## Arquitetura e funções existentes

Next.js 15/React 19/TypeScript, App Router e handlers Node.js. A aplicação possui importação e extração/OCR/transcrição, Biblioteca, estudos e Workspace, Tutor/Professor e Mentor, Academy/Studio, Lab, flashcards, quiz, notas, mapas, Semana de Prova, conta, ajuda e sincronização. Existência no código não garante funcionamento integral em produção.

IA segue cliente → rotas internas → `AIService`/`ProviderManager` → providers; há seleção de modelos e chaves por usuário. Dados locais usam IndexedDB/OPFS via `StorageManager`; sincronização usa rotas de conta/cloud, PostgreSQL e armazenamento compatível com S3. O IndexedDB tem escopo por usuário, mas preferências em `localStorage` exigem revisão de isolamento. Ver `README.md` e `docs/ARQUITETURA_E_FLUXOS.md`, observando que descrições históricas de deploy podem estar desatualizadas.

## Infraestrutura conhecida e limites

O usuário informou aplicação online na Vercel e projeto Supabase `studyai-v1` em `sa-east-1`, com 31 tabelas e bucket privado `studyai-files`; PostgreSQL e credenciais S3 foram cadastrados na Vercel. Em diagnóstico anterior, `/api/health` foi relatado como degradado por PostgreSQL enquanto S3 estava disponível. Existem commits posteriores de diagnóstico/TLS (`42c7cbd`, `fa2f1e5`, `331bc15`), mas esta tarefa não consultou serviços, logs ou deployment: estado atual do PostgreSQL, S3, certificados e commit implantado **não verificados**. Não assumir que o problema antigo persiste ou foi resolvido.

Não executar migrações automaticamente: `npm run db:migrate` é comando explícito e requer ambiente adequado. Não modificar Railway ou serviços de produção sem autorização. Não desabilitar TLS, autenticação ou CSRF. Nunca copiar valores de variáveis/segredos para documentação, logs, testes ou Git; `AUTH_SECRET` é a variável de autenticação, não `JWT_SECRET`. Preservar a chave de criptografia e planejar qualquer rotação antes de alterá-la.

## Últimos testes conhecidos

Na sessão Sprint 41: typecheck e build isolado aprovados; lint aprovado com 0 erros/69 avisos. Playwright dirigido teve rodada de 6 aprovados; rodada ampliada de 13 teve 11 aprovados e 2 timeouts, ambos aprovados em repetição com espera maior. Os testes de sincronização usam backend de desenvolvimento; Academy e geração de quiz usam mocks em casos relevantes. Não são validação de PostgreSQL/S3 ou de IA real. Detalhes e limitações em [docs/SPRINT_41_STATUS.md](docs/SPRINT_41_STATUS.md).

## Pendências e próxima ação

1. Continuar Sprint 41: fallback seguro por modelos previamente autorizados, com limite, custo, consentimento explícito entre provedores e sem repetição de falhas de autenticação/validação.
2. Resolver isolamento das preferências entre contas e revisar gabarito: a resposta correta atualmente é enviada ao cliente antes da entrega. Testar troca de usuários, conflitos e preservação de dados.
3. Investigar a queixa original de seleção no Modo Prova e os dois timeouts; validar os três modos Academy e demais fluxos de IA com serviços reais apenas quando autorizados.
4. Integrar Semana de Prova com atividades e resultados, e completar melhorias de ajuda. Não declarar a sprint concluída enquanto pendências críticas permanecerem.

## Comandos e documentos

Confira primeiro `git status --short --branch`, `git log --oneline -n 10` e `git diff --cached --name-only`. Para desenvolvimento e checagens: `npm run dev`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e`. Use ambiente isolado sem credenciais externas; execute Playwright e build em momentos separados ou diretórios distintos para evitar conflito em `.next`. Verifique scripts/configuração atuais antes de rodar; não rodar migrações ou testes com serviços reais por padrão.

- Estado e testes: [docs/SPRINT_41_STATUS.md](docs/SPRINT_41_STATUS.md).
- Plano: [docs/ROADMAP_V1_2.md](docs/ROADMAP_V1_2.md).
- Prompt para continuação: [docs/NEXT_SESSION_PROMPT.md](docs/NEXT_SESSION_PROMPT.md).
- Documentos históricos de infraestrutura/testes permanecem em `docs/`; verificar data e contexto antes de aplicar.

---

# Histórico — Sprint 37E.8B: Railway Configuration & Authorization Gate

Atualizado em 27 de outubro de 2026.

## Estado

- **Branch:** `v1.1-development` (nada enviado/pushed)
- **HEAD base 37E.8B:** `03a61ee4e83d575f71a30485b45eff0e0c6e065b`
- **Commits 37E.8A:** `4e94f1b` pre-deploy; `03a61ee` handoff, ambos locais sem push
- **Commit 37E.8B:** `d669c60` (`chore(release): verify railway config and launch gate 37E.8B`); local, sem push
- **Deploy:** **NÃO executado**. Railway intocado.
- **Decisão:** **CONDITIONAL** — ver `docs/FINAL_RELEASE_DECISION_V1_1.md`

## Resultado Sprint 37E.8B (investigação Railway)

- Railway docs oficiais: `.railway/railway.ts` é interpretado por `railway
  config plan/apply`, não automaticamente no deploy; `railway.toml` é CaC legacy
  para service existente configurado para o ler. Um service não pode ser
  gerenciado pelos dois; sunset CaC anunciado para 2026-12-01.
- CI: `.github/workflows/deploy.yml` em `main` constrói/pusha imagem GHCR e chama
  webhook opcional `DEPLOY_WEBHOOK_URL`; presença/destino não verificados. Não há
  workflow para executar Railway IaC. Trigger e deployment remoto ativo não são
  conhecidos.
- CLI `5.63.1`, `railway whoami` Unauthorized. Sem login/token, sem comando remoto
  adicional. Railway service/config path/deploy/domain/DB/S3/env names/resources/
  restart/logs/alerts ficam **NÃO VERIFICADOS**.
- Nenhum arquivo de configuração de infra foi alterado. Owner deve escolher
  legacy CaC temporário ou migração planejada para IaC após inspeção read-only e
  `config plan` revisado; não executar `apply` sem aprovação explícita.
- Railway healthcheck é apenas gate do startup/deploy, não monitor contínuo. Live
  `/api/health/live` é liveness; `/api/health` é readiness dependente de DB/S3.
- Artefato do container: Dockerfile Node 22 multi-stage; `npm ci`, `npm run
  build`; runtime `db-migrate.mjs && node server.js`, port padrão 3000/0.0.0.0;
  config/PORT/restart remotos desconhecidos.
- Validação 37E.8B: lint 0 erros/75 warnings; typecheck/build PASS; audit 4 low
  transitivos (exit 1); Playwright dirigido 38/38; `db:migrate` repetida 2x na
  cópia sintética isolada; standalone live 200/readiness 503 sem DB/S3.
- Gate **CONDITIONAL**. Ver `docs/SPRINT_37E_8B_REPORT.md`,
  `docs/RAILWAY_CONFIGURATION_DECISION.md` e
  `docs/LAUNCH_AUTHORIZATION_CHECKLIST.md`.

## Entregas Sprint 37E.8A (pré-deploy local)

- `railway whoami` respondeu **Unauthorized**; nenhuma autenticação automática
  foi feita. Railway, deployments, secrets, domínio, DB, S3, volumes, recursos e
  logs remotos estão **NÃO VERIFICADOS**.
- Divergência local pendente: `.railway/railway.ts` aponta branch `main` e
  `/api/health`; `railway.toml` usa Dockerfile e `/api/health/live`. Não alterei
  IaC/configuração remota; owner deve decidir o alvo antes de autorização.
- `pg_dump`/`pg_restore` PostgreSQL 18.4: restore local com registros sintéticos
  de user, placeholder BYOK, quota e rate limit passou; arquivos em pasta Temp
  aprovada fora do Git. Isso **não valida backup de produção**.
- `db:migrate` duas aplicações consecutivas passaram em DB isolado restaurado;
  harness app **8/8**; Playwright direcionado crypto/health/quota **30/30**.
- Health standalone production simulado: live 200; readiness 503 com DB e S3
  indisponíveis; body público sem configuração/segredos/erro detalhado.
- S3 implementa objetos e metadados localmente, mas bucket/versioning/retention/
  restore/custo remotos são desconhecidos. Monitoramento remoto/alertas também.
- **Release Gate CONDITIONAL**: revisar `docs/SPRINT_37E_8A_REPORT.md`,
  `docs/RAILWAY_PRE_DEPLOY_V1_1.md` e
  `docs/PRODUCTION_MIGRATION_PLAN_V1_1.md` antes de qualquer janela.

> Correção: os hashes `f3a2b1c` (37E.7A) e `c1a2b3d` (37E.6) citados em
> documentos anteriores **não existem**. Os reais são `1e56d76` e `5dc68d0`.

---

## Entregas da 37E.7B (baseline)

| Área | Entrega |
|------|---------|
| Reconciliação E2E | 205: 193 diretos + 8 retry, 1 falha ambiental; 3 skipped. Reexecução final: 21 passed/3 skipped; 215 descobertos com `quota-policy` |
| Criptografia | `crypto-core.ts` extraído; 16 testes na implementação real |
| Quota | contagem duplicada corrigida; `ollama` keyless; modo espelha ProviderManager |
| Rate limiting | login/cadastro/recuperação/API keys fail-closed (503); fallback em memória só em não críticos |
| Concorrência | Harness de 2 pools preparado, mas ainda sem execução no baseline |
| Rollback | falso "remover a chave mantém v2" corrigido + `scripts/rekey-byok-v2-to-v1.mjs` |
| Migrações | schema limpo/idempotente em PostgreSQL 18 isolado (single-user) |
| Documentação | `SPRINT_37E_7B_REPORT.md`, `FINAL_RELEASE_DECISION_V1_1.md` |

## Entregas 37E.7C (validação local concluída)

| Área | Estado |
|------|--------|
| PostgreSQL real | Cluster descartável `pg37e7c`, porta 55433, multi-conexão comprovada (duas sessões `pg_sleep(3)` simultâneas) |
| Harness SQL | `scripts/verify-concurrency.mjs`: **7/7 PASS**, inclui cenário A exato (restante=1; contadores 500/501; 1 autorizada) |
| Cenários de aplicação 5–7 / E-F | Standalone em duas instâncias + DB real: **8/8 PASS**, incluindo F2 com quota única e stream truncado |
| Defeito corrigido | Leitura dupla do body em Tutor/Academy/middleware causava `400 INVALID_REQUEST`; handlers agora validam clone do Request |
| Health | `/api/health/live` sem dependências; `/api/health` continua readiness DB/schema/S3; Docker/Railway apontam liveness |
| E2E | 218/218 casos únicos aprovados: 212 diretos + 6 retries; 0 falhas residuais ou skipped |
| Build/lint/typecheck | Build OK; typecheck OK; lint 0 erros e 75 warnings |
| Relatórios | `docs/SPRINT_37E_7C_REPORT.md`, `docs/CONCURRENCY_VALIDATION_V1_1.md`, `docs/E2E_STABILITY_V1_1.md` |

---

## Validação 37E.7C (E2E reconciliado)

| Check | Resultado |
|-------|-----------|
| `npm run lint` | PASS: 0 erros; 75 warnings |
| `npm run typecheck` | limpo |
| `npm run build` | PASS; produção compilada e rotas estáticas geradas |
| `npm run test:e2e` | 218 descobertos; 212 diretos + 6 após retry; 1 falha observada corrigida e aprovada direcionadamente; 0 falhas residuais/skipped |
| Harness SQL | **7/7 PASS** no PostgreSQL 18.4 multi-conexão (`studyai_37e7c`, 55433) |
| Harness app | **8/8 PASS**; duas instâncias standalone + DB de teste; Cenários 5–7, E/F e stream truncado F2 |
| Liveness/readiness | `/api/health/live`=200 sem DB/S3; `/api/health`=503 com DB indisponível |
| Fail-closed | login/register/recover/quota negados com banco indisponível |
| `npm audit --omit=dev` | 4 low transitivos (`katex`), sem high/critical; correção automática requer breaking change |
| `git diff --check` | PASS |

---

## E2E 37E.7C — reconciliação final

| Métrica | Valor |
|---------|-------|
| Descobertos | 218 |
| Aprovados diretamente | 212 |
| Aprovados após retry (flaky) | 6 |
| Falha observada/corrigida | 1 expectativa antiga de `/api/health`; passou após atualização para `/api/health/live` |
| Falhas residuais | 0 |
| Skipped | 0 |
| Interrompidos/não executados | 0; os 82 finais foram retomados e executados |

> Histórico 37E.7B: uma segunda execução completa (215) foi descartada por corrupção do
> `next dev` causada pela remoção de `.next` durante o run; não é evidência de
> produto. Depois de limpar o ambiente, a reexecução direcionada passou.

**Histórico 37E.7B (não é resultado atual):** o "184 passing" vinha da suíte de 189 testes e omitia 2 retries
(186 reais). Com os 13 testes de criptografia que passavam, o total era 199 em
203. Ver §4 do relatório.

---

## Riscos Residuais

| Risco | Sev. | Situação |
|-------|------|----------|
| Rate limit fail-open só em não críticos | Baixa | Login/cadastro/recuperação/API keys fail-closed (503); sync/colaboração/telemetria/feedback em memória |
| Quota conservadora com BYOK parcial | Média | Documentado; corrigir pós-launch |
| "BYOK Ativo" com BYOK parcial | Baixa | Cosmético; documentado |
| Monitoramento não implantado | Média | Health + logs + SQL manuais |
| `katex` 4 low | Baixa | Sem fix não-breaking |
| Readiness exige S3 | Média (op.) | Readiness retorna 503; liveness usado no healthcheck para evitar reinício por falha transitória |

---

## Próximos Passos

1. **Autorização explícita** de deploy (não concedida nesta sprint).
2. **Backup verificado** do PostgreSQL de produção + teste de restore.
3. Configurar variáveis no Railway, incluindo `API_KEYS_ENCRYPTION_KEY` e S3.
4. Deploy e smoke test (`docs/SMOKE_TEST_V1_1.md`) em até 15 min.
5. Se rollback: re-encriptar v2→v1 antes de remover a chave.
6. A suíte E2E de 218 testes está reconciliada; manter o Release Gate CONDITIONAL pelos gates operacionais.
7. Planejar alertas externos e gates operacionais; concorrência 5–7 já foi executada.

---

## Notas Importantes

- **NÃO FAZER DEPLOY** sem autorização.
- **NÃO EXECUTAR GIT PUSH** nesta sprint.
- **NÃO MODIFICAR PRODUÇÃO** (Railway intocado).
- **NÃO USAR `npm audit fix --force`**.
- **NÃO REMOVER `API_KEYS_ENCRYPTION_KEY`** sem re-encriptar v2.
- **NÃO ALTERAR `AUTH_SECRET`**.
- **NÃO ACESSAR `D:\FitIA`**.

---

## Próxima Ação

**Status:** **CONDITIONAL** — tecnicamente verificado, aguardando autorização e
cumprimento das condições obrigatórias de `docs/FINAL_RELEASE_DECISION_V1_1.md`.
# Continuação da Sprint 41G.1

**Não concluída; isolamento de contas ainda comprometido.** A geração do banco local agora rejeita operações que aguardam inicialização ou abertura do IndexedDB quando ocorre troca de escopo, incluindo A → B → A. Isso não protege os registros remanescentes de outros scripts da mesma origem, não cancela transações iniciadas e não resolve corridas de sincronização ou uploads. Não apagar dados existentes, não atribuir conteúdo legado sem dono automaticamente e não publicar esta alteração como solução completa.

Próximos passos: definir proteção dos dados privados persistidos e recuperação offline/legada explícita; criar transição de sessão com bloqueio, cancelamento e invalidação de respostas, incluindo abas; associar cada envio à identidade autenticada no servidor; testar ownership, conflitos e exclusões com duas contas. O Modo Prova no servidor fica para a Sprint 41G.2. Ver `docs/SPRINT_41G_SECURITY_AUDIT.md`.
