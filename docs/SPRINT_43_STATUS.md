# Sprint 43 — AI Smart Routing

Data: 10 de novembro de 2026  
Branch: `v1.1-development`  
HEAD base: `de698e46d0b42d5e3cf1e67d92e5d61e055e6abc`  
Status: **implementada e validada localmente; sem commit e sem homologação externa**.

## Arquitetura e política

`AIRouter` contém a política pura e determinística. Ele recebe uma tarefa tipada, candidatos conhecidos e o estado da quota; não usa uma segunda chamada de IA para classificar. `AIRoutingService` consulta o health já existente, transforma modelos conhecidos em candidatos e aplica a decisão antes do consumo da quota. `QuotaMiddleware` então contabiliza somente o provider efetivamente selecionado. O `ProviderManager` continua responsável pela execução, cache, telemetria e fallback consentido.

Ordem de decisão:

1. modo manual preserva provider e modelo explícitos;
2. modo automático elimina provider/modelo indisponível, incapaz, com contexto/saída insuficientes ou quota compartilhada esgotada/desconhecida;
3. entre elegíveis, prioriza impacto verificável da credencial: local, BYOK e quota compartilhada;
4. preferência salva e ordem estável dos providers resolvem empates;
5. ausência de candidato produz erro explicável, sem troca silenciosa.

Não existe ranking inventado de qualidade nem tabela de preço volátil. A seleção não promete economia percentual. Janela de contexto desconhecida usa limite conservador de 8.192 tokens; materiais não são truncados pelo roteador. A compressão já existente seleciona histórico/chunks relevantes e agora informa ao usuário quando removeu contexto.

## Integração do Tutor

O Tutor classifica deterministicamente conversa simples, explicação educacional, raciocínio matemático ou análise de material longo. Cada categoria recebe limite de saída entre 700 e 2.600 tokens. O modo automático pode ser habilitado em Configurações; nesse modo o modelo salvo do provider preferido não é fixado silenciosamente antes da decisão.

A resposta exibe provider e modelo efetivos, escolha manual/automática, motivo, limite de saída, tokens registrados/estimados e eventual redução de contexto. Respostas idênticas podem usar cache mesmo com modelo explícito. A chave do cache inclui conta, provider, modelo e fingerprint da credencial.

Integração gradual: Academy, Quiz, Flashcards, resumo, Lab, diagramas e áudio permanecem no comportamento anterior. Nenhum contrato público ou schema foi ampliado para esses fluxos.

## Fallback e segurança

O roteamento inicial só ocorre quando o usuário ativa o modo automático. Falha posterior continua sob as regras da 41H/42:

- nenhuma alternativa é chamada sem consentimento;
- conteúdo privado não é reenviado antes da autorização;
- a alternativa autorizada passa novamente pela quota;
- somente uma alternativa é tentada;
- falha da alternativa não chama um terceiro provider;
- resposta parcial é preservada e não reenviada;
- credenciais continuam resolvidas no servidor;
- autenticação e CSRF permanecem no middleware.

Quota desconhecida é inelegível para credencial compartilhada. Ollama e BYOK podem continuar elegíveis sem confundir ausência de informação com uso ilimitado.

## Validação executada

- `tests/sprint43-ai-routing.spec.ts`: **13 aprovados, 0 falhos, 0 ignorados**.
- Matriz consolidada com AI Core, providers, fallback, quotas e Tutor: **58 aprovados, 0 falhos, 0 ignorados**.
- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado com **0 erros e 50 avisos preexistentes**.
- `npm run build`: aprovado; **48 páginas** geradas.
- `git diff --check`: aprovado após a documentação.

Todos os providers foram simulados. Não houve IA paga, credencial real, PostgreSQL/S3 externo, migration, deploy ou acesso a produção.

## Arquivos da Sprint 43

- `src/features/ai/AIRouter.ts`
- `src/server/ai/AIRoutingService.ts`
- `src/features/ai/AIProvider.ts`
- `src/features/ai/AIClient.ts`
- `src/features/ai/AIResponseCache.ts`
- `src/features/ai/ProviderManager.ts`
- `src/server/ai/QuotaMiddleware.ts`
- `src/app/api/tutor/route.ts`
- `src/features/settings/ai-settings-panel.tsx`
- `src/features/tutor/services/TutorService.ts`
- `src/features/tutor/TutorMessage.tsx`
- `src/types/tutor.ts`
- `tests/sprint43-ai-routing.spec.ts`
- `tests/ai-core.spec.ts`
- `CURRENT_HANDOFF.md`
- `docs/NEXT_SESSION_PROMPT.md`
- `docs/SPRINT_43_STATUS.md`

## Limitações e próximo passo

- Catálogos, health, latência e respostas de providers reais não foram homologados.
- A idempotência do fallback continua em memória por instância serverless.
- Comparação de preço exato não existe por ausência de dados confiáveis e estáveis.
- Multimodal permanece inelegível no transporte atual; Sprint 43B não foi iniciada.
- A matriz Playwright completa do produto não foi repetida; somente regressões relacionadas foram executadas.
- Próximo passo recomendado: revisão seletiva e checkpoint local da Sprint 43, mantendo experimentos S3 fora do staging.
