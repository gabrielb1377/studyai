# Smoke Test V1.1 — StudyAI

**Versão:** V1.1  
**Data:** 2026-10-24  
**Branch:** `v1.1-development`  
**Commit:** `b6610da`

---

## Objetivo

Roteiro de verificação rápida pós-deploy para confirmar que o StudyAI V1.1 está operacional em produção. Deve ser executado em até 15 minutos após o deploy.

---

## Checklist de Execução

| Item | Descrição | Comando/Verificação | Critério de Sucesso | Status |
|------|-----------|---------------------|---------------------|--------|
| **1. Liveness** | Processo HTTP responde sem depender de DB/S3 | `curl -f https://studyai.example.com/api/health/live` | HTTP 200, `status: "ok"`, `check: "liveness"` | ☐ |
| **2. Readiness + Health Detalhado** | Verificar DB, Storage, URL pública | `curl -f https://studyai.example.com/api/health` e, com `HEALTH_SECRET`, o mesmo endpoint | `status: "ok"`, `database.available: true`, `objectStorage.available: true` | ☐ |
| **3. Página Inicial** | Carrega sem erros | Abrir `https://studyai.example.com/` no navegador | Renderiza sem erros 5xx, JS carrega | ☐ |
| **4. Cadastro** | Novo usuário consegue se registrar | UI → `/auth/register` → preencher formulário | Redireciona para dashboard, cria usuário no DB | ☐ |
| **5. Login/Logout** | Sessão funciona | Login → `/auth/login` → dashboard → Logout | Redireciona corretamente, cookie de sessão válido | ☐ |
| **6. BYOK - Configuração** | Salvar chave API | Settings → IA → Gerenciador → Inserir chave Gemini/Groq | Chave salva, aparece "BYOK Ativo" no dashboard de quotas | ☐ |
| **7. BYOK - Teste de Conexão** | Testar provider configurado | Settings → IA → Testar conexão | Retorna "Online" com latência | ☐ |
| **8. Tutor - Chat Básico** | Enviar mensagem | `/tutor` → Nova conversa → "Explique X" | Resposta streaming renderizada | ☐ |
| **9. Tutor - Streaming** | Verificar NDJSON | Abrir DevTools → Network → filtrar `/api/tutor` | Resposta `text/event-stream`, chunks chegando | ☐ |
| **10. Professor - Áudio** | Iniciar aula narrada | `/professor` → "Iniciar aula" | Áudio reproduz, controles funcionam | ☐ |
| **11. Academy - Criação** | Criar estudo | `/academy` → "Novo estudo" → Preencher | Estudo criado, aparece na lista | ☐ |
| **12. Academy Studio - Edição** | Editar documento | Abrir estudo no Studio → Editar seção | Autosave funciona, preview atualiza | ☐ |
| **13. Exportação PDF** | Exportar estudo | Studio → Exportar → PDF | Download inicia, PDF válido abre | ☐ |
| **14. Exportação PPTX** | Exportar apresentação | Studio → Exportar → PPTX | Download inicia, PPTX válido abre | ☐ |
| **15. Diagram Studio** | Criar diagrama | `/diagramas` → Novo → Adicionar nó/conexão | Canvas renderiza, drag-and-drop funciona | ☐ |
| **16. OCR Pro** | Processar imagem | `/importar` → Upload imagem → OCR | Texto extraído aparece no preview | ☐ |
| **17. Biblioteca** | Listar materiais | `/biblioteca` | Lista carrega, filtros funcionam | ☐ |
| **18. Workspace** | Abrir estudo | `/estudo` → Selecionar estudo | Carrega chunks, grafo, flashcards | ☐ |
| **19. Cloud Sync** | Sincronizar | Settings → Cloud Sync → "Sincronizar agora" | Status "Sincronizado", sem conflitos | ☐ |
| **20. Quotas** | Verificar consumo | Settings → IA → Consumo | Mostra modo, usados/restantes, reset | ☐ |
| **21. AI Quality Lab** | Executar avaliação | `/lab` → Quality Lab → "Executar" | Relatório gerado sem erros | ☐ |

---

## Script de Automação (Opcional)

```bash
#!/bin/bash
# smoke-test.sh - Execução rápida dos checks críticos

BASE_URL="https://studyai.example.com"
HEALTH_SECRET="${HEALTH_SECRET}"

echo "=== Smoke Test V1.1 ==="
echo "Target: $BASE_URL"
echo ""

# 1a. Liveness (não consulta DB/S3)
echo "1a. Liveness..."
curl -sf "$BASE_URL/api/health/live" | jq -e '.status == "ok" and .check == "liveness"' && echo "✅ Liveness OK" || { echo "❌ Liveness FAILED"; exit 1; }

# 1b. Readiness (DB, schema, S3, URL pública)
echo "1b. Readiness..."
curl -sf "$BASE_URL/api/health" | jq -e '.status == "ok"' && echo "✅ Readiness OK" || { echo "❌ Readiness FAILED"; exit 1; }

# 2. Health Detalhado (com secret)
if [ -n "$HEALTH_SECRET" ]; then
    echo "2. Health Detalhado..."
    curl -sf -H "x-health-secret: $HEALTH_SECRET" "$BASE_URL/api/health" | \
      jq -e '.checks.database.available == true and .checks.objectStorage.available == true' \
      && echo "✅ DB + Storage OK" || { echo "❌ DB/Storage FAILED"; exit 1; }
fi

# 3. Página Inicial
echo "3. Página Inicial..."
curl -sf "$BASE_URL" | grep -q "StudyAI" && echo "✅ Home OK" || { echo "❌ Home FAILED"; exit 1; }

# 4. Login Page
echo "4. Login Page..."
curl -sf "$BASE_URL/auth/login" | grep -q "Entrar" && echo "✅ Login Page OK" || { echo "❌ Login Page FAILED"; exit 1; }

# 5. Auth API (rota real: /auth/session, sem prefixo /api)
echo "5. Auth Check..."
curl -sf "$BASE_URL/auth/session" | jq -e '.user' >/dev/null && echo "✅ Session OK" || echo "⚠️ No session (expected if not logged in)"

echo ""
echo "=== Smoke Test Concluído ==="
```

---

## Classificação dos Checks (Sprint 37E.7B)

| Classe | Itens | Observação |
|--------|-------|------------|
| **A. Automatizáveis antes do deploy** | 1, 2, 3, 4, 5, 6, 17, 20 | Cobertos por `npm run test:e2e` (com mocks/fixtures) ou pelo script acima contra um ambiente local |
| **B. Manuais após o deploy** | 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 21 | Dependem de UI, áudio, download de arquivos ou storage real |
| **C. Dependem de serviço externo** | 7 (provider), 8 (provider), 10 (TTS/navegador), 16 (OCR), 19 (S3) | Podem falhar por indisponibilidade externa; registrar como WARNING, não como falha do deploy |

**Sequência curta (primeiros 5 min após publicar):** 1 → 2 → 4 → 5 → 6 → 8.
Se qualquer um falhar, interromper e avaliar rollback antes de continuar.

---

## Critérios de Aprovação

| Critério | Mínimo |
|----------|--------|
| Itens Obrigatórios (1-5, 8, 19, 20) | 100% PASS |
| Itens Secundários (6, 7, 9-18, 21) | ≥ 80% PASS |
| Zero erros 5xx em qualquer endpoint | Sim |
| Tempo total | ≤ 15 min |

---

## Rollback Imediato Se

- Health check retorna `degraded` ou 503
- Health check falha por > 2 minutos
- Login/cadastro quebrado
- Quotas bloqueiam usuários legítimos
- Exportação PDF/PPTX falha consistentemente

---

## Checklist Pós-Deploy (Equipe)

- [ ] Health check OK
- [ ] Cadastro/Login funcionando
- [ ] BYOK configurável e testável
- [ ] Tutor respondendo
- [ ] Professor com voz funcionando
- [ ] Academy/Studio/Exportação OK
- [ ] Diagram Studio funcional
- [ ] OCR processando
- [ ] Cloud Sync sincronizando
- [ ] Quotas exibindo corretamente
- [ ] Logs sem secrets
- [ ] Métricas de erro 5xx < 1%

---

**Assinatura:** _________________ **Data/Hora:** _________________