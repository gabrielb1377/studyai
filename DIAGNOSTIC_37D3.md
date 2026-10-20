# Diagnóstico Inicial — Sprint 37D.3

**Data:** 20 de outubro de 2026  
**Branch:** v1.1-development  
**Commit:** 29cd58d (feat(diagrams): implement diagram studio sprint 37D.1)

---

## 1. Resumo da Situação Atual

O StudyAI está em estado estável após as sprints 37A–37D.2:
- **BYOK (37A):** Criptografia AES-256-GCM, tabela `user_api_keys`, fallback server env, rate limit 10/min, CSRF.
- **Professor Voice (37B.2):** Aulas narradas, TTS/STT nativo, sessões persistidas.
- **Academy Studio (37C.1/37C.2):** Editor visual, templates, personalização, exportação PDF/PPTX profissional.
- **Diagram Studio (37D.1):** 8 tipos, layout determinístico, SVG/PNG/PDF/PPTX, Mermaid round-trip.
- **OCR Pro (37D.2):** OCR adaptativo por página, tabelas, revisão humana, reindexação, citações de página.
- **Testes:** 180 testes Playwright (179 pass + 1 flaky pre-existente), lint/typecheck/build limpos.
- **Vulnerabilidades:** 7 transitivas pré-existentes (sharp, next, katex, source-map-js).

---

## 2. Problemas Encontrados

### 2.1 AI Core — Qualidade e Observabilidade
| Problema | Localização | Severidade |
|----------|-------------|------------|
| Logs de provider guardados apenas em `globalThis` (memória volátil, perdidos em reload/HMR) | `ProviderManager.ts:22-35` | Médio |
| Sem métricas de uso de tokens por usuário/provider | `ProviderManager.statistics()` | Médio |
| Cache de respostas em memória (`AIResponseCache`) sem TTL nem limpeza por tamanho | `AIResponseCache.ts` | Baixo |
| `OllamaProvider.inspect` recebe `_apiKey` não utilizado (warning ESLint) | `OllamaProvider.ts:120` | Baixo |
| Nenhum rastreamento de custo estimado por request | `ProviderManager.generate/stream` | Médio |
| Fallback automático não expõe qual provider foi usado no erro final ao usuário | `ProviderManager.ts:127-134` | Baixo |

### 2.2 Diagram Studio — UX de Edição
| Problema | Localização | Severidade |
|----------|-------------|------------|
| Editor atual: nós arrastáveis, mas **conexões só via inspetor** (não arraste entre nós) | `StudioDiagramsPanel.tsx` | Alto |
| Sem seleção múltipla (Shift+click, marquee) | `StudioDiagramsPanel.tsx` | Médio |
| Sem alinhamento/distribuição automática de nós selecionados | `StudioDiagramsPanel.tsx` | Médio |
| Zoom/pan: funcional, mas sem reset rápido (fit-to-view) | `StudioDiagramsPanel.tsx` | Baixo |
| Feedback visual de conexão válida/inválida durante arraste ausente | `StudioDiagramsPanel.tsx` | Médio |
| Layout `manual` preserva posições, mas não há snap-to-grid opcional | `layout.ts:485-488` | Baixo |

### 2.3 Segurança BYOK — Quota Compartilhada
| Problema | Localização | Severidade |
|----------|-------------|------------|
| **Sem limite de consumo da chave compartilhada do servidor** (risco de abuso/custo) | `ApiKeyService.resolveForUser` | **Crítico** |
| Rate limit apenas em `set`/`test` (10/min), não em `generate`/`stream` | `ApiKeyService.rateLimitSet` | Alto |
| Contador em memória (`Map` no `RateLimit`) não persiste entre instâncias | `RateLimit.ts` | Médio |
| Sem orçamento aproximado (USD) por usuário/dia | — | Médio |
| Sem alerta de "quota esgotada" amigável para o usuário | — | Médio |

### 2.4 Cloud Sync — Observabilidade
| Problema | Localização | Severidade |
|----------|-------------|------------|
| Erros de sincronização não incluem `entity`/`recordId` no log de usuário | `CloudSyncManager.ts:93` | Baixo |
| Sem métrica de "últimos conflitos por entidade" | `CloudSyncManager.conflicts()` | Baixo |
| Upload de arquivos em paralelo (3) sem backoff em 429/5xx | `CloudSyncManager.uploadFiles` | Médio |

### 2.5 Performance — Bundle e Runtime
| Problema | Localização | Severidade |
|----------|-------------|------------|
| `pdf-lib` + `jszip` carregados dinamicamente na rota Studio (OK, 34 kB) | `StudioExportPanel.tsx` | — |
| `tesseract.js` (7.0.0) + `tesseract.js-data` — pesados mas necessários | `package.json` | — |
| `@huggingface/transformers` 4.3.0 + Whisper Tiny — carregado sob demanda | `MediaTranscriptionService.ts` | — |
| `katex` + `rehype-katex` + `remark-math` no bundle compartilhado (104 kB) | `package.json` | Baixo |
| `radix-ui` importado como namespace completo em vários componentes | `components/ui/*.tsx` | Baixo |

### 2.6 Testes — Cobertura
| Área | Testes Existentes | Lacunas |
|------|------------------|---------|
| AI Quality / Avaliação de resposta | 0 | **Total** |
| Citações de página no Tutor | Parcial (chunks têm `pageStart`) | Validação E2E |
| Diagram Studio — conexões arrastáveis | 0 | **Total** |
| BYOK quota sharing | 0 | **Total** |
| Cloud Sync conflitos/resolução | Parcial | Cenários de merge |
| OCR reprocessamento seletivo | 0 | **Total** |
| Mobile (360/390px) | 7 testes de viewport | Diagram Studio, Academy Studio |

### 2.7 Dependências — Vulnerabilidades
| Pacote | Severidade | Tipo | Status |
|--------|------------|------|--------|
| `sharp` | High | Transitive (`@huggingface/transformers`) | Aguardando fix upstream |
| `next` 15.5.25 | Moderate | Cache poisoning SSG/ISR | Fix em 15.5.28 (fora do range) |
| `katex` | High | Prototype pollution | Fix em `rehype-katex@1.2.0` (breaking) |
| `source-map-js` | High | DoS via indexed source-map | Fix disponível |
| `adm-zip` | High | Transitive | — |
| `micromark-extension-math` | High | Depende de `katex` | — |
| `remark-math` | High | Depende de `micromark-extension-math` | — |

---

## 3. Duplicações Identificadas

| Código | Locais | Recomendação |
|--------|--------|--------------|
| `wrapText` / `wrapDiagramText` | `studio/export/pdf.ts:49`, `diagrams/layout.ts:40` | Extrair utilitário compartilhado |
| `safePdfText` / `escapeXml` | `studio/export/pdf.ts:41`, `diagrams/render/svg.ts:34` | Unificar sanitização de saída |
| `measureDiagramText` | `diagrams/layout.ts:35`, `diagrams/render/svg.ts` (inline) | Já centralizado — OK |
| Renderização de nós/edges no SVG | `svg.ts` inline | Já centralizado — OK |

---

## 4. Gargalos de Performance

1. **ProviderManager.automaticOrder** — `HealthService.checkAll` sequencial a cada request no modo automático (pode cachear por 30s).
2. **CloudSyncManager.scan** — varre todos os stores IndexedDB a cada sync; pode ser incremental por `updatedAt`.
3. **OCR Engine** — renderiza página inteira em canvas antes do pré-processamento; poderia recortar região de interesse.
4. **Academy Studio Export** — `pdf-lib` embeda 4 fontes padrão a cada geração; cacheável.

---

## 5. Riscos de Segurança

| Risco | Mitigação Atual | Lacuna |
|-------|-----------------|--------|
| Chave server env consumida ilimitadamente | Apenas fallback | **Implementar quota** |
| `AUTH_SECRET` rotation invalida chaves BYOK | Documentado | Plano de rotação não automatizado |
| `SpeechRecognition` usa servidores do navegador | Aviso na UI | Não controlável |
| CSP bloqueia `data:` URLs (testes usam `atob`+`Blob`) | Workaround em testes | OK |
| Sanitização Studio — allowlist tags | `sanitize.ts` | Revisar periodicamente |

---

## 6. Melhorias Recomendadas (Priorizadas)

### P0 — Crítico (Esta Sprint)
1. **Quota compartilhada BYOK** — limites por usuário/dia/minuto, persistidos no Postgres.
2. **AI Quality Lab** — infraestrutura de avaliação determinística + opcional LLM-as-judge.

### P1 — Alto
3. **Diagram Studio UX** — React Flow para conexões arrastáveis + seleção múltipla (adapter pattern).
4. **Observabilidade local** — logs estruturados, métricas de tokens/custo/erros, painel em Configurações → IA.
5. **Testes E2E novos** — AI quality, Diagram UX, quota, OCR reprocess, mobile.

### P2 — Médio
5. **Performance** — cache `automaticOrder`, `scan` incremental, font cache PDF.
6. **Dependências** — investigar/fixar 7 vulns (sharp, next, katex, source-map-js).
7. **Diagram Studio nativo** — se React Flow inviável: snap-to-grid, multi-select, alinhamento, fit-to-view.

### P3 — Baixo / Próximas Sprints
8. **Sentry (opcional)** — avaliar licença/custo/privacidade; default OFF.
9. **Docling** — avaliar para OCR futuro (substituir Tesseract?).
10. **DeepEval integração** — se stack TS compatível; caso contrário, manter testes determinísticos.

---

## 7. Classificação de Projetos Externos (Fase 2)

| Projeto | Classificação | Justificativa |
|---------|---------------|---------------|
| **DeepEval** | B (Conceitos) | Python-first; adaptar conceitos para TS determinístico + opcional LLM-judge. |
| **React Flow** | A (Integrar agora) | Editor de grafos maduro, MIT, TypeScript nativo, compatível com adapter pattern. |
| **Sentry JS** | C (Planejar) | Requer conta, custo, envio de dados; priorizar observabilidade local primeiro. |
| **Excalidraw** | B (Conceitos) | UX excelente, mas canvas-based; nosso modelo é estruturado (SVG). Aproveitar patterns de UX. |
| **Docling** | C (Planejar) | Python, pesado, GPU; avaliar quando OCR Pro precisar de tabelas/fórmulas melhores. |
| **Agentset** | D (Não utilizar) | Focado em RAG agente; nosso RetrievalPipeline já cobre. |

---

## 8. Próximos Passos Imediatos

1. ✅ Auditoria completa (este documento).
2. 🔄 **Fase 2** — Análise profunda React Flow (licença, bundle, adapter).
3. 🔄 **Fase 3** — Criar `src/features/ai-quality/` com testes determinísticos.
4. 🔄 **Fase 4** — Integrar React Flow no Diagram Studio (nova branch `feat/diagram-reactflow`).
5. 🔄 **Fase 5** — Implementar quota BYOK + observabilidade local.
6. 🔄 **Fase 6-8** — Testes, performance, dependências.
7. 🔄 **Fase 9-11** — Documentação Obsidian + commit final.

---

*Este diagnóstico será salvo em `CURRENT_HANDOFF.md` e atualizado conforme a sprint avança.*