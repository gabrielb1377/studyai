# StudyAI — Roadmap futuro (pós-fechamento da V1.2)

> Documento de planejamento (não aprovado para implementação). Data-base: 22/11/2026. **Não substitui** `docs/ROADMAP_V1_2.md` nem o fechamento da V1.2 em andamento. Nada aqui está autorizado para implementação (AGENTS.md §3: não avançar para sprints futuras sem autorização).

## 1. Reconciliação com o roadmap vigente

| Tema | Vigente | Este plano | Conflito e decisão |
|---|---|---|---|
| Fechamento V1.2 | Pendências 1–5 do handoff (CI, staging, quotas, atomicidade, índices) e NO-GO | Pré-requisito, inalterado | Nenhum. As ondas abaixo só começam após GO ou autorização explícita |
| Cinco lotes de encerramento | **Não estão definidos em nenhum arquivo do repositório** (busca por "Lote" sem resultado). A mensagem citou "Lote 1" e "Lote 3" | Usei as cinco pendências do handoff como proxy | **Confirmar o mapeamento.** Não alterei nada que pareça pertencer a esses lotes |
| Decisões de produto do Lote 3 (e-mail verificado para IA compartilhada, 1.024 MB de arquivos, 200 MB de backups) | Citadas apenas na mensagem do usuário; o handoff descreve só "projetar reserva e orçamento" | Respeitadas; nenhuma implementada aqui | O motor e as ferramentas assumem essas regras na fronteira da quota |
| Correções de segurança de prompt | Não constam | Itens PS-1 e PS-2 abaixo | **Conflito:** o fechamento da V1.2 proíbe funcionalidade nova, mas isto é correção. Recomendo o dono decidir se entram no fechamento |
| Sugestões de V1.3 da auditoria de 19/11 (SRS unificado, painel de uso de IA, acessibilidade auditada, vínculo prova↔tentativa) | Propostas, não aprovadas | Absorvidas: acessibilidade em QU; painel de uso após contabilização real; vínculo prova↔tentativa continua adiado | Nenhum |
| Numeração | Sprints 41–58 usadas | Novas a partir de 59, com prefixos de trilha | Nenhum |
| Skills do AI-RULES | `studyai-workflow` em duas cópias (biblioteca e `.agents/skills/`) | Definir a fonte única antes de ampliar | Pendente de decisão |

## 2. Ondas e dependências

```text
V1.2 fechamento (GO)  ──►  Onda 1: Segurança de prompt + Quality Upgrade
                              │
                              ▼
                         Onda 2: Intelligence Engine  (depende de tokens reais, item 3 do fechamento)
                              │
                              ▼
                         Onda 3: Tool Engine
                              │
                              ▼
                         Onda 4: Multimodal e Adaptive Learning
                              │
                              ▼
                         Onda 5: Ecossistema extensível (somente após modelo de segurança aprovado)
```
Quality Upgrade e Segurança de prompt podem andar em paralelo (arquivos diferentes). As demais são sequenciais.

## 3. Sprints (pequenas e verificáveis)

Convenção de esforço e modelo: **BALANCED** com Sonnet para sprints de interface; **DEEP** com Opus para qualquer sprint que toque quota, auth, prompt de segurança ou ferramentas (AGENTS.md §7). Tokens: estimativa de contexto de skills por sessão (12–21 mil em DEEP, heurística do roteador), sem contar leitura de código. Os valores por sprint abaixo são estimativas de planejamento, não medições.

### Onda 1
**PS-1 — Delimitador único e system prompt por provedor**
- Objetivo: fechar as lacunas de injeção. Escopo: montador único de dados não confiáveis; cobrir `teaching.selection.text`, Lab, Studio assist, Diagram assist, áudio e juiz; `systemInstruction` (Gemini) e mensagem `system` (compatíveis OpenAI).
- AI-RULES: `security-and-hardening`, `fp-check`, `differential-review`. Reuso: `PromptBuilder`, `TeacherPromptBuilder`. Arquivos prováveis: `features/ai/PromptBuilder.ts`, `teacher/TeacherPromptBuilder.ts`, `lab/services/LabPromptBuilder.ts`, `academy/studio/StudioAssistService.ts`, `diagrams/DiagramAssistService.ts`, `ai/providers/*`.
- Aceite: nenhuma entrada do aluno/material fora do bloco delimitado (teste por builder); teste de injeção no trecho selecionado e no Lab não altera a nota. Testes: specs de `ai-core`, `teacher`, `lab` + novos casos. Riscos: mudar o comportamento de respostas; mitigar com paridade. Modelo: Opus/DEEP. Tokens: ≈15 mil. Rollback: reverter o commit; sem dados.

**PS-2 — Unificar o caminho de quota e CSRF**
- Objetivo: eliminar a rota morta e o CSRF condicional. Escopo: remover ou fundir `withQuotaEnforcement`; exigir CSRF em `diagrams/generate`. Arquivos: `server/ai/QuotaMiddleware.ts`, `app/api/diagrams/generate/route.ts`. Aceite: um único caminho; testes de quota existentes passam. Riscos: coincide com o item 3 do fechamento; **fazer junto ou depois dele**. Modelo: Opus/DEEP. Rollback: reverter.

**QU-1 a QU-5** — ver `STUDYAI_QUALITY_UPGRADE.md` (estados e erros; tipografia e escala; acessibilidade verificável; navegação mobile; telas grandes). Modelo: Sonnet/BALANCED. Tokens: ≈8–12 mil por sprint. Rollback: commits pequenos por tela.

### Onda 2 — Intelligence Engine
**IE-1 — Registro e contrato (sem comportamento novo)**: `SkillSpec`, validador de saída, migração do Teacher por paridade. Aceite: specs de Tutor e Teacher inalteradas e verdes. Rollback: flag `skills.enabled`.
**IE-2 — Skills piloto**: `technique.feynman`, `technique.socratic`, `technique.active-recall` com fixtures. Aceite: fixtures por skill na CI com provedor simulado; saída válida em 100% dos casos de teste.
**IE-3 — Contabilização e orçamento por skill**: gravar `usage` real; orçamento no `ContextCompressor`. **Depende** do item 3 do fechamento. Aceite: `tokens_count` > 0 após chamada simulada; teste de estouro de orçamento.
**IE-4 — Migrar as demais skills por paridade** (lotes de 3). Aceite: cada skill com fixtures e versão.
Recursos AI-RULES: `context-engineering`, `prompt-engineering-master`, `skill-engineering`, `domain-modeling`, `writing-plans` (nativa). Reuso: `AIRouter`, `ai-quality`. Modelo: Opus/DEEP em IE-1 e IE-3, Sonnet/BALANCED nas migrações.

### Onda 3 — Tool Engine
**TE-1 a TE-5** — ver `STUDYAI_TOOL_ENGINE.md`. Pré-requisitos: IE-1 e IE-3, PS-2. Modelo: Opus/DEEP.

### Onda 4 — Multimodal e Adaptive Learning
**MM-1 — Gráficos de desempenho** em SVG (sem nova dependência), com texto alternativo. Recursos: `dashboard-design`, `data-visualization`, `accessibility-and-inclusive-visualization`, `statistical-and-uncertainty-visualization`. Reuso: `analytics/AnalyticsEngine.ts`. Aceite: gráfico acessível por teclado e com tabela equivalente.
**MM-2 — Explicações visuais curadas**: poucos módulos pré-renderizados como ativos estáticos (princípios de `educational-animation`). Sem render no servidor, sem Remotion. Sprint opcional, só com demanda.
**AL-1 — Seleção de skill por perfil do aluno**: usar `learning/memory` e o mapa de dificuldades para escolher nível e método. Aceite: escolha explicável ao aluno e desativável.
**AL-2 — Painel de uso e orçamento de IA para o aluno**, após IE-3.

### Onda 5 — Ecossistema extensível
Sem sprints detalhadas. Pré-condições: modelo de permissões de ferramentas, revisão de licença e privacidade por pacote, assinatura e sandbox reais (hoje inexistente no servidor). Reavaliar depois da Onda 3.

## 4. Matriz consolidada de prioridade

| Item | Valor | Risco | Custo | Prioridade |
|---|---|---|---|---|
| PS-1 (injeção e system prompt) | Alto (segurança) | Baixo | Baixo | **1** |
| QU-1, QU-3 (estados, acessibilidade verificável) | Alto | Baixo | Médio | 2 |
| IE-1/IE-2 (registro e pilotos) | Alto | Médio | Médio | 3 |
| IE-3 (tokens reais) | Alto (controle de custo) | Médio | Médio | 3, depende do fechamento |
| QU-2, QU-4 | Médio | Baixo | Médio | 4 |
| TE-1/TE-2/TE-3 | Médio-alto | Médio | Médio | 5 |
| MM-1, AL-1 | Médio | Baixo | Médio | 6 |
| MM-2, Onda 5 | Baixo agora | Alto | Alto | 7 |

## 5. Critérios de saída de cada onda
Typecheck, lint e specs relevantes verdes sem retries; CI verde nas quatro partições; handoff reescrito (AGENTS.md §6); nenhum aumento de custo por turno sem medição; revisão de segurança (`differential-review`) nas ondas 1, 2 e 3.

## 6. Riscos transversais
- **Custo de IA:** skills e ferramentas aumentam tokens por turno; sem contabilização real não há teto verificável.
- **Estabilidade dos testes:** a CI mostrou intermitência com `retries: 0` (execução do push em `ecff7fa` falhou na partição 4 enquanto o PR passou); novas specs devem ser determinísticas.
- **Dados no cliente:** ferramentas e skills operam sobre dados locais; qualquer evolução para servidor exige decisão de produto e de privacidade.
- **Escopo:** manter pequenas as sprints; proibido misturar com o fechamento da V1.2.
