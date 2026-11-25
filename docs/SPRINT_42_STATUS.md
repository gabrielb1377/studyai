# Sprint 42 — status local

Data: 9 de novembro de 2026  
Branch: `v1.1-development`  
HEAD base: `40f351846a600d570a35c6edd8005c00d0ad1874`  
Status: **implementada e validada localmente; pronta para checkpoint seletivo; sem commit e sem homologação externa**.

## Sprint 42.1 — correção mobile do Academy Studio

O overflow foi reproduzido com os dados sintéticos do teste em viewport 360 × 780. O item de conteúdo era simultaneamente um item de grid com `min-width:auto` e um container `flex-wrap`; dentro dele, o wrapper `w-full` do `Select`, o bloco `flex-1`, o botão e os gaps formavam um tamanho mínimo de 437 px. O item ultrapassava o viewport mesmo com o texto truncado.

A correção ficou restrita a `StudioPage.tsx`: o `<li>` recebeu `min-w-0`, e o seletor passou a ocupar uma linha própria abaixo de 640 px (`basis-full`), mantendo a largura de 10 rem e a disposição anterior a partir de `sm`. Não foi usado `overflow-x-hidden`; navegação, controles nativos, labels e layout desktop foram preservados. O teste agora lista os elementos excedentes caso a regressão reapareça.

## Diagnóstico e correções

1. O endpoint `/api/ai-quality/judge` era público, aceitava `apiKey` controlada pelo navegador e chamava o AI Core sem quota. Agora exige sessão e CSRF, valida tamanho/provider/model/tokens, usa apenas credenciais resolvidas no servidor e passa pelo middleware de quota.
2. `/api/academy/studio/assist` permitia modo visitante com credencial compartilhada fora da quota. Agora exige sessão/CSRF e usa `withAIQuota`; não lê credenciais diretamente na rota.
3. `withAIQuota` não exigia CSRF. A verificação agora é central, e `AIClient` envia o token nas requisições e streams.
4. `/api/ai/manager` e `/api/ai/providers/[provider]` permitiam inspeção sem autenticação. Ambos agora exigem sessão e retornam conteúdo privado sem cache.
5. O middleware publicava sempre `499/500`, mesmo após outro consumo, e dizia “cota diária” para todo bloqueio. A decisão retorna os contadores diário e por minuto; cabeçalhos e resposta pública usam os valores reais e informam a causa do bloqueio.
6. Sem PostgreSQL, a quota retornava permissão ilimitada inclusive em produção. O fallback local agora contabiliza desenvolvimento/testes; produção falha fechada quando o armazenamento da quota está ausente.
7. `getUsageStats` interpolava `days` no SQL. O período agora é inteiro limitado a 1–365 e parametrizado.
8. O Tutor preenchia tokens ausentes com estimativas sem identificá-las e repetia os rótulos. A metadata agora diferencia “uso registrado” de “uso estimado”; nenhum custo monetário exato é exibido.
9. LLM Judge e Academy Studio agora rejeitam JSON acima de 32 KiB; o Tutor limita o corpo a 256 KiB. O helper preserva respostas `400` para JSON inválido e `413` para payload excessivo.

O fallback continua consentido: a alternativa não é executada antes da autorização, somente uma alternativa é usada, falha da alternativa não chama um terceiro provider e respostas parciais não são reenviadas. A idempotência permanece em memória e não é durável entre instâncias serverless.

## Dados e Modo Prova

Os quatro cenários selecionados de cloud sync passaram com dados sintéticos e backend local/mockado: sessão/persistência, offline e backup/restore, conflito entre dispositivos e exclusão sincronizada/OPFS. Não foi encontrada perda silenciosa nessa matriz. Nenhum serviço externo foi usado.

Os 17 testes do Modo Prova passaram: tentativa vinculada ao usuário, payload inicial sem `correctAnswer`/explicação, correção no servidor, proteção contra acesso cruzado e submissão duplicada, falhas sem resultado falso e modo Prática separado. O schema não foi alterado; `examId`/`studyId` ainda não são persistidos na tentativa protegida.

## Validação nova

- `tests/sprint42-security-quota.spec.ts`: **4 aprovados, 0 falhos, 0 ignorados**.
- Matriz relacionada (`quota-policy`, fallback/Tutor, Academy Studio, cloud sync e Modo Prova): **57 aprovados, 1 falho, 0 ignorados**.
- O resultado **57/1** acima é a rodada anterior à Sprint 42.1. A falha era `academy-studio.spec.ts` — “o Studio permanece utilizável no celular”.
- Sprint 42.1, teste mobile em 360 × 780 com repetição: **2 aprovados, 0 falhos, 0 ignorados**.
- Suíte completa do Academy Studio após a correção: **12 aprovados, 0 falhos, 0 ignorados**.
- Testes específicos da Sprint 42 repetidos: **4 aprovados, 0 falhos, 0 ignorados**.
- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado com **0 erros e 50 avisos preexistentes**.
- `npm run build`: aprovado; 48 páginas geradas.
- Matriz Playwright completa: não executada por decisão de escopo.
- Providers reais, PostgreSQL/S3 externos e produção: não verificados.

Os 107 testes da Sprint 41I e os 4 testes da 41J são evidência histórica separada e não foram somados aos resultados acima.

## Arquivos da Sprint 42

- `src/app/api/academy/studio/assist/route.ts`
- `src/app/api/ai-quality/judge/route.ts`
- `src/app/api/ai/manager/route.ts`
- `src/app/api/ai/providers/[provider]/route.ts`
- `src/app/api/tutor/route.ts`
- `src/features/academy/studio/StudioAssistService.ts`
- `src/features/academy/studio/StudioPage.tsx`
- `src/features/ai-quality/llm-judge.ts`
- `src/features/ai/AIClient.ts`
- `src/features/tutor/TutorMessage.tsx`
- `src/server/ai/QuotaMiddleware.ts`
- `src/server/ai/QuotaService.ts`
- `src/server/ai/quota-policy.ts`
- `src/server/auth/http.ts`
- `src/types/tutor.ts`
- `tests/sprint42-security-quota.spec.ts`
- `tests/academy-studio.spec.ts`
- `CURRENT_HANDOFF.md`
- `docs/NEXT_SESSION_PROMPT.md`
- `docs/SPRINT_42_STATUS.md`

## Riscos e próximo passo

- A Sprint 42 está pronta para checkpoint local seletivo. A correção mobile e as regressões diretamente relacionadas passaram; a matriz histórica completa não foi repetida.
- A quota e a idempotência de fallback dependem do PostgreSQL/estado compartilhado em produção; não houve homologação externa.
- A contabilização é por tentativa compartilhada. Tokens exibidos podem ser registrados pelo provider ou estimados; custo financeiro não é calculado.
- Fazer checkpoint local somente após revisão seletiva, mantendo todos os experimentos S3 e arquivos não relacionados fora do staging.
- Sprint 43 não foi iniciada.
