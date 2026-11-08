# Sprint 41 — estado real em 8/11/2026

**Status geral: PARCIALMENTE IMPLEMENTADA.** A Sprint 41 não está encerrada. A 41G.3D foi commitada em `03f163b`; as 41H/41H.1 estão validadas localmente, mas ainda não foram commitadas nem homologadas com provedores reais.

## Sprint 41H.1 — regressões resolvidas

- Persistência: a sessão offline não possuía proprietário explícito; preferências eram colocadas em quarentena no reload e não podiam ser restauradas legitimamente.
- Health do Ollama: o mock e o contrato estavam corretos; o painel técnico não era renderizado porque o modo avançado não encontrava identidade offline ativa.
- Dashboard: o timeout era do teste aguardando um controle avançado ausente, não timeout real de provider ou timer do dashboard.
- Correção: identidade local `offline-session`, separada das contas; preferências offline são restauradas somente nesse contexto. Dados legados sem proprietário continuam sem atribuição automática.
- Evidência: AI Core 3/3; lógica/mock 55/55; Tutor/fallback 8/8; isolamento desktop/mobile 2/2; typecheck, lint e build aprovados.

## Sprint 41H — estado local

- O provedor primário continua sendo a única chamada inicial.
- Falhas recuperáveis podem oferecer alternativas disponíveis, com provedor, modelo e aviso de consumo; nenhuma alternativa é chamada antes do consentimento.
- O consentimento autoriza exatamente um provedor/modelo. Cancelar mantém prompt e conversa; falha da alternativa não inicia uma terceira tentativa.
- Quota é verificada para a tentativa autorizada. Duplicatas são coalescidas por conta/requisição em memória por cinco minutos.
- Streaming parcial é preservado e não pode gerar fallback.
- O modelo efetivo e o marcador `fallback autorizado` aparecem na resposta do Tutor.
- Escopo concluído localmente: gerenciador central e Tutor. Demais fluxos continuam sem fallback automático e sem interface de consentimento.
- Limite: a idempotência em memória não atravessa instâncias serverless; serviços reais não foram usados.

## Fechamento 41G.3D-FINAL

- PostgreSQL 18 local descartável `studyai_41g2c_test`, em `127.0.0.1:5432`: 6/6 integrações aprovadas, sem migração, criação ou exclusão de banco. Antes e depois havia duas contas sintéticas conhecidas, nenhuma conta não sintética e zero tentativas persistidas.
- Cache Storage em Chromium: 1/1 aprovado para A → B, conteúdo público, caches privados, exclusão de respostas autenticadas e limpeza escopada. Cache local não é fronteira contra script da mesma origem.
- Desktop: Storage 4/4, A → B → A com duas abas 1/1, cloud sync 4/4 e Workspace/Modo Prova 4/4.
- Mobile: 1/1 em Chromium com viewport simulado 390 × 844. Não equivale a dispositivo físico.
- Qualidade: typecheck aprovado; lint com 0 erros e 68 avisos; build aprovado com 48 páginas.
- Contagem única do fechamento: 90 aprovados, 0 casos obrigatórios definitivamente falhos e 0 ignorados. Rodadas combinadas tiveram três falhas intermitentes, todas aprovadas isoladamente; o harness cloud ainda requer estabilização.

## Evidência Git

- Branch: `v1.1-development`.
- HEAD: `03f163b`.
- Referência remota conhecida: `origin/v1.1-development` em `331bc15`, sem `fetch` nesta auditoria.
- Alterações experimentais de upload direto e a 41H permanecem fora de commit.

## Reconstrução das etapas

| Etapa | Status real | Evidência e limite |
| --- | --- | --- |
| Sprint 41 inicial | CONCLUÍDA LOCALMENTE | `0215035` corrige contrato Academy/quota; `f6bcb58` inclui Semana de Prova na navegação; `19cb815` preserva estado do simulado e libera abertura de ferramentas. Fluxos externos não foram validados. |
| Sprint 41F | PARCIALMENTE IMPLEMENTADA | `165d351` melhora Ajuda; `b57167b` suspende troca não consentida de provider. Não existe fallback econômico completo com consentimento, limite e modelo efetivo uniforme. |
| Sprint 41G / contenção inicial | PARCIALMENTE IMPLEMENTADA | `fd8e50a`, `fd6dd97`, `a5ed672`, `75c1a02`, `6304b53` e `c821830` contêm migração indevida, limpam cache e documentam que o modo local não protege gabarito. |
| Sprint 41G.1B | CONCLUÍDA LOCALMENTE | `9553c72`, `861bd0b`, `1d08d83`. Geração de sessão, aborto e `x-studyai-session-user`; 6/6 testes específicos passaram novamente. Não demonstra fronteira de segurança na mesma origem. |
| Sprint 41G.2A | NÃO IDENTIFICADA COMO ENTREGA SEPARADA | A auditoria e preparação foram absorvidas pelas etapas de contenção e 41G.2B; não há commit ou documento que sustente uma conclusão independente. |
| Sprint 41G.2B | CONCLUÍDA LOCALMENTE | `e156dd1`, `9678bed`, `5e65e58`. Tentativa protegida, gabarito no servidor, correção transacional e UI. Teste de navegador protegido passou nesta auditoria com mocks. |
| Sprint 41G.2C | CONCLUÍDA LOCALMENTE | `bc909d4` e `8dd7a75`. Em 4/11 foram registrados 7/7 casos contra PostgreSQL 18 descartável e 21/21 simulados. Em 6/11 o gate falhou com segurança; em 6–7/11 o banco foi comprovado como local/descartável e 6/6 casos passaram. |
| Sprint 41G.3A | VALIDADA LOCALMENTE | `3c1dbe1`. A 41G.3D corrigiu a importação de `SessionOperation` e o mock de `StorageManager`; typecheck e casos focados passaram. |
| Sprint 41G.3B | CONCLUÍDA LOCALMENTE | `971bee5`. Limpeza antes de persistir, quarentena de dados sem dono e `clearOwner`; casos focados passaram. |
| Sprint 41G.3C | CONCLUÍDA LOCALMENTE | `5eb5637`. Escopo por usuário para provas, preferências, workspace, portabilidade e cache; casos focados e fluxos de navegador passaram. |
| Sprint 41G.3D | CONCLUÍDA LOCALMENTE, COMMITADA | Commit `03f163b`. PostgreSQL descartável 6/6, Cache Storage, desktop e mobile simulado passaram. Não houve homologação de produção ou aparelho físico. |
| Sprint 41H | IMPLEMENTADA LOCALMENTE, NÃO COMMITADA | Núcleo/Tutor com consentimento, quota por tentativa, timeout e transparência. 54/54 lógicos e 3/3 novos casos de navegador passaram; serviços reais não foram usados. |
| Sprint 41H.1 | VALIDADA LOCALMENTE, NÃO COMMITADA | Identidade offline explícita recupera preferências sem cruzá-las com contas. AI Core 3/3 e isolamento desktop/mobile 2/2. O fallback 41H permaneceu verde. |

## Funcionalidades atuais

### Implementadas e verificadas localmente

- Sessões assíncronas identificadas por usuário e geração, com aborto e descarte de resposta atrasada.
- Rotas `/sync`, `/api/files/[id]` e Modo Prova protegido verificam o usuário autenticado e o proprietário declarado da sessão.
- Modo Prova protegido não envia `correctAnswer` ou explicação no payload inicial; correção fica no servidor.
- Modo Prática continua local e só revela explicação depois da resposta; não deve ser apresentado como avaliação sigilosa.
- Central de Ajuda possui categorias, busca, Academy, rolagem e teclado.
- Semana de Prova possui CRUD local básico, plano por dias e progresso manual.

### Implementadas sem validação externa nesta auditoria

- Três modalidades Academy: material, trilha e projeto prático.
- Tutor, Professor, flashcards, quiz, resumos, Lab e IA Quality com providers reais.
- PostgreSQL/S3/Vercel/Supabase com o HEAD atual.
- Sincronização entre dispositivos reais e múltiplas abas concorrentes.
- Upload direto S3, que permanece experimental e parcialmente não rastreado.

### Pendências críticas

1. Revisar a 41H e manter os experimentos de upload direto fora do diff da sprint.
2. Estabilizar as intermitências do runner de cadastro/sync/conflitos e repetir em aparelho móvel físico quando disponível.
3. Validar o fallback do Tutor com provedores/contas de teste autorizados, decidir idempotência durável e só então avaliar extensão aos demais fluxos.
4. Integrar Semana de Prova a estudos, materiais, flashcards, quizzes, simulados e resultados sem duplicação.
5. Validar Academy e IA com serviços reais somente em homologação autorizada.
6. Repetir mobile/desktop; scripts da mesma origem continuam fora da fronteira oferecida por namespaces locais.

## Testes executados nesta auditoria

| Classe | Comando/escopo | Resultado |
| --- | --- | --- |
| Estático | `npm run typecheck` | APROVADO. |
| Estático | `npm run lint` | APROVADO: 0 erros, 68 avisos preexistentes fora do escopo. |
| Build local | `npm run build` | APROVADO: Next.js 15.5.28, 48 páginas; KaTeX não falhou. |
| Unitário/mockado | sessão, prova e isolamento | 69 aprovados, 0 falhos. |
| Integração real local | PostgreSQL descartável | 6 aprovados, 0 falhos, 0 ignorados. |
| Unitário/mockado | IA, quotas, sem DDL, upload e deploy | 27 aprovados. |
| Navegador local | Workspace, Academy e Ajuda | 8 aprovados. |
| Navegador local | Storage | 4 aprovados, 0 falhos. |
| Unitário focado | 41G.3D | 10 aprovados, 0 falhos; conjunto 41G.3A/3D/preferências: 23 aprovados. |
| Navegador local | A → B → A e duas abas | 1 aprovado, 0 falhos. |
| Navegador local | Cloud sync, conflito, restore, arquivo e OPFS | 4 aprovados, 0 falhos. |
| Navegador local | Cache Storage | 1 aprovado, 0 falhos. |
| Navegador local | Mobile simulado 390 × 844 | 1 aprovado, 0 falhos. |
| Sprint 41H/41H.1 | lógica/mock, quota, provider e isolamento | 55 aprovados, 0 falhos. |
| Sprint 41H | Tutor em Chromium desktop/mobile | 3 aprovados, 0 falhos. |
| Regressão existente | Tutor | 5 aprovados, 0 falhos. |
| Regressão existente | AI Core | 3 aprovados, 0 falhos. |
| Regressão de isolamento | desktop e mobile | 2 aprovados, 0 falhos. |

Os casos de Storage foram executados no runner de navegador isolado e passaram. Nenhum teste acessou IA paga ou produção.

## Critérios para encerrar a Sprint 41

- Typecheck, lint e build aprovados no mesmo HEAD.
- Testes 41G.3A–D verdes e alterações revisadas/commitadas mediante autorização.
- Teste negativo com duas contas de navegador e inspeção das respostas da API.
- Política de dados legados e preferências definida sem perda silenciosa.
- Fallback consentido e limites de consumo validados, ou decisão explícita de manter fallback desativado para o release.
- Semana de Prova integrada ao menos ao conjunto mínimo aprovado, ou escopo formalmente movido para a Sprint 45.
- Academy/IA e infraestrutura validadas em homologação autorizada, com os resultados separados dos mocks.

Consulte [PROJECT_AUDIT_2026-11-05.md](PROJECT_AUDIT_2026-11-05.md), [SPRINT_41G_SECURITY_AUDIT.md](SPRINT_41G_SECURITY_AUDIT.md) e [ROADMAP_V1_2.md](ROADMAP_V1_2.md).
