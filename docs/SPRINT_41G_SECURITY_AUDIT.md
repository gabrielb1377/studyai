# Sprint 41G — auditoria de isolamento e Modo Prova

Atualizada em **7 de novembro de 2026**. Esta versão substitui as conclusões contraditórias anteriores.

## Conclusão atual

- Modo Prova protegido: **CONCLUÍDO LOCALMENTE**, com validação histórica em PostgreSQL descartável.
- Isolamento entre contas: **VALIDADO LOCALMENTE NO ESCOPO DA 41G.3D**, com duas contas sintéticas, duas abas, reload, inspeção de `localStorage`, sync/OPFS, Cache Storage, desktop, mobile simulado e rejeição cross-user na API. Continua limitado contra scripts executados na mesma origem.
- Sprint 41G.3D: **CONCLUÍDA LOCALMENTE E NÃO COMMITADA**; PostgreSQL descartável, Cache Storage, desktop/mobile simulado, typecheck, lint e build passaram.
- Sprint 41G como um todo: **NÃO CONCLUÍDA**.

## Controles existentes

### Sessão e operações assíncronas

`SessionOperationManager` mantém `userId`, geração, suspensão e `AbortSignal`. `AuthProvider` inicia uma transição, invalida operações antigas, troca o escopo local, restaura somente o novo usuário e reativa a interface. `CloudSyncManager` e `CloudFileService` verificam a operação antes de aplicar resultados.

As APIs `/sync`, `/api/files/[id]` e `/api/exam/*` autorizam pelo JWT e usam `x-studyai-session-user` apenas para detectar uma requisição iniciada por outra geração. O cabeçalho não concede acesso por si próprio.

### Armazenamento local

- IndexedDB muda de nome por escopo de conta.
- OPFS de materiais usa subdiretório por usuário.
- `ExamService`, `ExperiencePreferences`, `WorkspacePersistence`, portabilidade e caches privados usam ou validam o usuário ativo.
- Dados legados sem dono não são atribuídos automaticamente a uma conta autenticada.
- `SessionLocalData` limpa chaves privadas antes de tentar persistir a cópia da conta anterior.

Esses namespaces evitam leitura acidental pela aplicação. Eles não impedem que um script executado na mesma origem enumere bancos, OPFS, caches ou `localStorage`; a fronteira de segurança continua sendo a autorização do servidor e a prevenção de execução de script não confiável.

### Modo Prova protegido

`POST /api/exam/attempt` exige autenticação, CSRF e proprietário da sessão, rejeita questões enviadas pelo cliente e gera as questões no servidor. O navegador recebe somente `id`, enunciado, alternativas e dificuldade opcional. O gabarito e as explicações ficam em `exam_attempts`.

`POST /api/exam/grade` corrige com transação e bloqueio de linha, associa a tentativa ao usuário, rejeita acesso cruzado e é idempotente para reenvios. `GET /api/exam/attempt` retoma a tentativa sem gabarito e devolve o resultado somente após conclusão.

O modo prática permanece local e recebe `correctAnswer`; por isso não oferece sigilo de avaliação. A UI deve continuar distinguindo os dois modos.

## Evidências por etapa

| Etapa | Evidência | Status |
| --- | --- | --- |
| 41G.1B | `9553c72`, `861bd0b`; 6/6 testes específicos novamente aprovados | CONCLUÍDA LOCALMENTE |
| 41G.2B | `e156dd1`, `9678bed`; navegador protegido aprovado com mocks | CONCLUÍDA LOCALMENTE |
| 41G.2C | `8dd7a75`; PostgreSQL real descartável em 4/11 e 6/6 repetidos com gate seguro em 6–7/11 | CONCLUÍDA LOCALMENTE |
| 41G.3A | `3c1dbe1`; typecheck e teste incompatível corrigidos na 41G.3D | VALIDADA LOCALMENTE |
| 41G.3B | `971bee5`; casos focados aprovados | CONCLUÍDA LOCALMENTE |
| 41G.3C | `5eb5637`; casos focados aprovados | CONCLUÍDA LOCALMENTE |
| 41G.3D | arquivos modificados/não rastreados; PostgreSQL, Cache Storage, desktop/mobile simulado e gates de qualidade verdes | CONCLUÍDA LOCALMENTE, NÃO COMMITADA |

## Evidência 41G.3D-FINAL

O banco `studyai_41g2c_test` foi validado além do nome: serviço PostgreSQL 18 local, conexão em loopback, apenas as duas contas sintéticas da integração e nenhuma outra conta. O gate exigiu `STUDYAI_ALLOW_LOCAL_DB_TESTS=1`, ambiente de teste, host loopback e nome descartável. `DATABASE_URL` existiu somente no processo. Os 6 casos cobriram payload inicial sem gabarito, retomada, correção no servidor, idempotência, concorrência e acesso cruzado. A tabela de tentativas ficou vazia ao final.

O teste de Cache Storage registrou o Service Worker real no Chromium, manteve um cache público compartilhado e caches privados de A e B. A conta B não recebeu o marcador privado de A pela aplicação; a interface de B removeu apenas seu próprio cache, e A removeu o seu após novo login. Nenhuma resposta de rota autenticada/API apareceu em Cache Storage. A retenção proposital do cache de A após logout simulou falha de limpeza sem exposição pela aplicação.

Limite explícito: qualquer JavaScript que já execute na mesma origem pode chamar `caches.keys()` e abrir esses caches. O controle atual evita mistura acidental entre sessões; proteção contra script não confiável depende de CSP, prevenção de XSS e autorização do servidor. O cache `studyai-shared-v1` é transitório para share target e permaneceu disponível; ele não recebeu respostas autenticadas no teste.

A regressão mobile usou viewport Chromium simulado de 390 × 844, não aparelho físico. Login/logout, A → B → A, tema, navegação, Biblioteca, sync e reload passaram sem marcador cruzado.

## Falhas reproduzidas e correções em 6/11/2026

1. As duas referências ausentes a `SessionOperation` foram corrigidas com importação de tipo, sem `any` ou supressão.
2. O mock 41G.3A passou a expor o membro nomeado `StorageManager`, como o módulo real.
3. Tema, idioma, sidebar e preferências de plataforma foram classificados como preferências do dispositivo. Workspace, IA, experiência e provas continuam privados/sincronizáveis por conta.
4. A sessão de áudio do Professor usa chave por usuário no IndexedDB, valida a geração antes de aplicar resultados e recupera o registro legado no banco já escopado sem apagá-lo.
5. Eventos de outra aba limpam o runtime sem persistir novamente dados que a aba iniciadora já transferiu, evitando atribuição cruzada durante A → B → A.
6. Os testes cloud gravavam OPFS na pasta antiga; o harness foi atualizado para `studyai-materials/<escopo>`. Restore, conflito, upload/download e exclusão passaram em navegador.
7. A integração PostgreSQL foi repetida com o gate seguro: 6/6 aprovados no banco local descartável, sem deixar tentativas persistidas.

## Dados legados e recuperação

Dados sem proprietário ficam em quarentena/escopo guest e não são importados automaticamente para a próxima conta. Isso evita atribuição indevida, mas ainda falta uma experiência explícita de recuperação que mostre origem, conteúdo, destino e consentimento antes de qualquer importação.

Não apagar automaticamente bancos, OPFS ou caches legados. Qualquer limpeza precisa de inventário, exportação/backup local e confirmação. `studyai-theme`, idioma, sidebar e preferências de plataforma são intencionalmente globais ao dispositivo; preferências de estudo e IA permanecem privadas por conta.

## Upload direto experimental

A rota não rastreada `src/app/api/files/[id]/direct/route.ts` vincula tokens temporários ao usuário e material, usa chave S3 com prefixo do usuário, valida tamanho/MIME/hash e confirma ownership pelo JWT. O fluxo também possui cancelamento no cliente. Ainda não está aprovado porque depende de alterações não commitadas, não foi testado contra armazenamento compatível real nesta auditoria e precisa revisão final de CORS, headers assinados, limpeza de objetos pendentes e concorrência.

## Riscos restantes e testes obrigatórios

1. Repetir em aparelho móvel físico; o teste atual usa viewport Chromium simulado.
2. Estabilizar as intermitências do runner combinado de cadastro, sync após restore e renderização de conflito, que passaram quando isoladas.
3. Testes negativos adicionais de API para backup, compartilhamento e colaboração; sync, arquivos e prova já possuem cobertura focada.
4. Experiência explícita de recuperação para dados guest/sem proprietário; a sessão de áudio legada no banco de um usuário já é recuperável.
5. Manter CSP/XSS e autorização do servidor como fronteira; Cache Storage e namespaces locais não protegem contra scripts da mesma origem.

Não usar a conclusão local como homologação de produção. A Sprint 41G.3D pode ser considerada concluída localmente, mas publicação ainda depende da revisão/commit autorizado e dos gates restantes da Sprint 41.
