# StudyAI — Intelligence Engine (arquitetura proposta)

> Documento de planejamento (não aprovado para implementação). Data-base: 22/11/2026. Nada foi implementado. Sobrepõe-se parcialmente a `docs/AI_TEACHER.md` e a `docs/ARQUITETURA_E_FLUXOS.md`; este documento **estende** o que existe, não o substitui.

## 1. Estado real (verificado)
| Tema | Situação | Evidência |
|---|---|---|
| Montagem do prompt | Um único bloco de instruções, enviado **no turno do usuário** | `features/ai/PromptBuilder.ts:36-81` |
| System prompt | Só o Ollama tem; Gemini e provedores compatíveis com OpenAI não | `OllamaProvider.ts:70`; busca por `systemInstruction` e `role: "system"` nos demais, sem resultado |
| Modos de ensino | Tabelas de strings: 13 ações, 5 níveis, 7 métodos (inclui socrático e passo a passo). Sem id, versão, esquema nem teste por modo | `features/teacher/TeacherPromptBuilder.ts:10-42` |
| Roteamento | Classificação determinística em 8 categorias por regex e tamanho; modo manual ou automático; fallback com consentimento | `features/ai/AIRouter.ts`, `server/ai/AIRoutingService.ts` |
| Contexto | Compressão (6 mensagens, 3 chunks, 2.000 tokens para histórico e 2.000 para chunks) e recuperação lexical + grafo | `ContextCompressor.ts`, `ContextBuilder.ts`, `RetrievalService.ts` |
| Saída estruturada | Pedida no texto ("apenas JSON") e lida com `JSON.parse`; sem esquema do provedor, sem nova tentativa (502 em falha) | `app/api/tutor/flashcards/route.ts:40`, `quiz/route.ts:42` |
| Tool calling | **Não existe** | busca por `tools`, `function_call`, `tool_choice` |
| Contagem de tokens | Estimativa `max(chars/4, palavras×1,3)`; uso real dos provedores é devolvido na resposta, mas **não é gravado na quota** (todos os chamadores omitem `tokens`) | `TokenCounter.ts:5-9`; `QuotaService.ts:136-149`; `QuotaMiddleware.ts:49,58,126` |
| Cache | Em memória, 100 entradas, 30 min, isolado por usuário e credencial; não compartilhado entre instâncias | `AIResponseCache.ts` |
| Qualidade de IA | Existe base de fixtures, executor e juiz LLM | `features/ai-quality/*`, `app/api/ai-quality/judge` |
| Prompt injection | Delimitador `<UNTRUSTED_MATERIAL_DATA>` só em PromptBuilder, AcademyPromptBuilder e LabChallengeService | grep |

## 2. Lacunas de segurança de prompt (corrigir antes de qualquer skill nova)

Estado em 22/11/2026. O **PS-1a** foi aprovado como parte do fechamento da V1.2 e está commitado localmente em `7e7a157` (sem push). Ele reduz dois riscos estruturais; **não** é uma proteção absoluta contra injeção de prompt: a obediência do modelo a texto hostil é probabilística e não foi testada com provedor real.

| # | Lacuna | Estado |
|---|---|---|
| 1 | `teaching.selection.text` (trecho do PDF) entrava nas "Diretrizes pedagógicas" **fora** do delimitador, e `sourceName`/`chapter` não tinham limite | **Tratada no PS-1a** (`7e7a157`): o trecho vai dentro de `<UNTRUSTED_MATERIAL_DATA>`, rótulos em linha única com até 200 caracteres, validação com limite de 500 |
| 1b | Imagens Markdown remotas na resposta eram carregadas pelo navegador sem clique, o que permitia levar dados do contexto na URL (`MarkdownRenderer.tsx`; Tutor, Lab e Mentor) | **Tratada no PS-1a**: imagem remota vira texto alternativo; validada no navegador (nenhuma requisição ao host externo). O `react-markdown` 10.1.0 já descarta `data:` e `blob:` por padrão (comportamento preexistente), então a lista permitida de `data:image` e `blob:` é uma segunda camada |
| 2 | `LabPromptBuilder` (`:20,23,24`), `StudioAssistService` (`:50-58`), `DiagramAssistService` (`:63-67`), `TeacherAudioLessonService` (`:68`) e `llm-judge` (`:32-39`) não usam o delimitador. Confirmado por leitura dos cinco arquivos. No Lab a saída é uma nota em JSON, então uma injeção pode manipular o resultado do próprio aluno | **Pendente (PS-1b)**; melhoria preventiva, pois nesses fluxos o autor do texto é em geral o próprio aluno |
| 3 | A regra de segurança está na mensagem do usuário, sem system prompt, em Gemini e provedores OpenAI-compatíveis (só o Ollama tem) | **Pendente (PS-1b)** |
| 4 | Duas rotas de quota coexistem: `withAIQuota` (usada) e `withQuotaEnforcement` (sem chamadores; verificado). Risco de divergência futura | **Pendente (PS-2)**, junto do item de quotas do fechamento |
| 5 | ~~`diagrams/generate` exige CSRF só quando há cookie~~ | **Falso positivo, refutado.** A rota só exporta `POST` e retorna `withAIQuota(...)`, que chama `requireCsrf` incondicionalmente (`QuotaMiddleware.ts:224`) antes de executar o handler (`:279`); o teste `sprint42-security-quota.spec.ts:116` fixa a ordem `["csrf","user"]`. O `if` com `studyai_csrf=` dentro do handler (`route.ts:16`) é redundante, sem efeito de segurança; removê-lo é limpeza opcional |

Limitações remanescentes do PS-1a: links Markdown com dados na URL continuam possíveis (exigem clique); a CSP mantém `img-src https:` (o sanitizador do Studio aceita imagens `https`); blocos Mermaid não foram auditados; o conteúdo da seleção dentro do bloco delimitado continua sem filtragem. Os testes do PS-1a são estruturais (delimitação e bloqueio do canal de imagem) e não medem resistência de modelo.

Os itens 2 a 4 são **correções**, não funcionalidades, e **não** fazem parte do fechamento da V1.2.

## 3. Arquitetura proposta

```text
pergunta ──► Intent Router (determinístico, sem chamada de IA)
                │ escolhe 1 skill (e, se preciso, 1 skill auxiliar)
                ▼
         Skill Registry  ──► SkillSpec (id, versão, contrato)
                ▼
         Context Planner ──► recuperação seletiva + orçamento de tokens da skill
                ▼
         Prompt Assembler ──► system (regras fixas) + dados não confiáveis delimitados
                ▼
         AIService (existente: quota, roteamento, fallback consentido, BYOK)
                ▼
         Output Validator ──► esquema da skill; 1 tentativa de reparo; fallback
                ▼
         Persistência (existente) + Telemetria de skill (sem conteúdo)
```

### 3.1 Princípios
- **Estender, não duplicar.** O `TeacherPromptBuilder` vira a primeira implementação do registro: ações, níveis e métodos atuais são migrados para `SkillSpec`, preservando o texto. Nada de segundo motor paralelo.
- **Instruções de agentes de programação não entram no tutor.** As skills do AI-RULES inspiram a *forma* (frontmatter, gatilhos, referências sob demanda), mas o conteúdo pedagógico é próprio e revisado.
- **Roteamento determinístico primeiro.** Intenção por regras e metadados (ação escolhida na UI, tipo de pergunta, presença de seleção, categoria do `AIRouter`). Sem segunda chamada de IA apenas para escolher skill, em linha com a decisão da Sprint 43.
- **Contexto progressivo.** A skill declara quais blocos aceita (estudo, chunks, perfil, memória, erros). O planejador só busca o que ela permite.
- **Tudo que vem do aluno ou do material é dado.** Sempre dentro do delimitador, sempre por um único montador. Tool results também (ver `STUDYAI_TOOL_ENGINE.md`).
- **Provedor primeiro, skill depois.** O registro não escolhe provedor; usa `AIRouter` e a quota existentes. BYOK e fallback consentido ficam intactos.

### 3.2 `SkillSpec` (contrato mínimo)
`id`, `version` (semver), `objective`, `triggers`, `inputs` (esquema), `allowedContext`, `allowedTools`, `output` (esquema + exemplo), `tokenBudget` {entrada, saída}, `safety` (regras e proibições), `qualityCriteria`, `tests` (fixtures), `fallback`. Detalhe e catálogo em `STUDYAI_EDUCATIONAL_SKILLS.md`.

### 3.3 Onde mora o código (proposta)
`src/features/ai/skills/` (registro, especificações, validador) e `src/features/ai/skills/__fixtures__/`. Reaproveita `PromptBuilder`, `ContextBuilder`, `AIRouter` e `ai-quality`. Não altera schema do banco.

## 4. Contexto, custo e tokens
| Mecanismo | Proposta | Dependência |
|---|---|---|
| Orçamento por skill | Limite de entrada e saída por `SkillSpec`, aplicado no `ContextCompressor` | Calibrar com uso real |
| **Contabilização real** | Gravar `usage` do provedor em `usage_quotas.tokens_count` ao fim da chamada; hoje fica 0 | **Item 3 do fechamento da V1.2 (reserva e reconciliação por tentativa).** Não implementar antes dele |
| Cache seguro | Manter o cache atual (chave inclui usuário e credencial); incluir `skillId@versão` na chave | — |
| Deduplicação | Já existe nos chunks (máx. 3); estender a memória e erros | — |
| Respostas estruturadas | Esquema por skill, validação e **um** reparo; depois fallback textual | — |
| Seleção por complexidade | Reaproveitar as 8 categorias do `AIRouter`; skills leves podem exigir saída menor | Decisão de produto sobre modelos |
| Prompt caching do provedor | **Não verificado.** Depende da documentação oficial de cada provedor (Context7 exige autorização via `/mcp`) | Autorização |
| Prevenção de loops | Teto de skills por turno (1 principal + 1 auxiliar) e de chamadas de ferramenta (ver Tool Engine) | — |

Regras de produto do **Lote 3** (IA compartilhada só para e-mail verificado; 1.024 MB de arquivos e 200 MB de backups por conta) **não são implementadas aqui**; o motor apenas precisa ser compatível com elas: a verificação de e-mail ocorre na fronteira de uso da chave compartilhada, antes do `Intent Router` consumir cota.

## 5. Avaliação e qualidade
- Cada skill traz fixtures (entrada → critérios), executados por `features/ai-quality` com provedor simulado na CI, sem chamada paga.
- Critérios verificáveis: conformidade ao esquema, ausência de vazamento de instruções, ancoragem em fonte (citação de trecho do material), comprimento dentro do orçamento.
- Juiz LLM (`llm-judge`) só em execução manual e autorizada, nunca na CI padrão.

## 6. Riscos
| Risco | Mitigação |
|---|---|
| Aumento do tamanho de prompt e custo | Orçamento por skill e métrica por skill antes de expandir |
| Regressão do Tutor atual | Migrar por paridade: mesmo texto, testes existentes (`tutor.spec`, `teacher.spec`) inalterados |
| Saída inválida | Validador, 1 reparo, fallback para resposta textual |
| Complexidade desproporcional | Começar com 3 skills piloto; sem DSL, sem carregamento dinâmico externo |
| Skills de terceiros no runtime | **Proibido** nesta fase |

## 7. Rollback
Registro atrás de uma flag de configuração (`skills.enabled`) com caminho legado intacto; reverter é desligar a flag. Sem migração de dados.

## 8. O que existe, o que melhorar, o que criar
| Existe | Melhorar | Criar |
|---|---|---|
| Teacher (13/5/7), AIRouter, quotas, cache, compressão, ai-quality | System prompt por provedor; delimitador único; contabilização real de tokens | Registro e `SkillSpec`; validador de saída; fixtures por skill; telemetria por skill |
