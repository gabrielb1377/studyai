# Sprint 37E.5 Phase 8 — BYOK Crypto v2 Migration Strategy

**Data:** 2026-10-23  
**Branch:** `v1.1-development`  
**Commit Base:** `2ca9a94` (Sprint 37E.4) + Phases 1-7

---

## 1. Visão Geral

Esta documentação descreve a estratégia de migração segura para o novo formato de criptografia `enc:v2:` usando a variável de ambiente `API_KEYS_ENCRYPTION_KEY`, mantendo compatibilidade total com registros legados `enc:v1:`.

---

## 2. Estado Atual (Pós-Phase 7)

### Implementado em `src/server/security/Crypto.ts`:

| Função | Status | Descrição |
|--------|--------|-----------|
| `encryptSecret()` | ✅ | Usa v2 se `API_KEYS_ENCRYPTION_KEY` configurada, senão v1 |
| `decryptSecret()` | ✅ | Suporta tanto `enc:v1:` quanto `enc:v2:` |
| `getEncryptionVersion()` | ✅ | Detecta versão do ciphertext |
| `isV1Encryption()` / `isV2Encryption()` | ✅ | Helpers para verificação |

### Variáveis de Ambiente:

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `AUTH_SECRET` | ✅ | Chave mestra para JWT + fallback v1 |
| `API_KEYS_ENCRYPTION_KEY` | ❌ (opcional) | Chave independente para criptografia v2 |

---

## 3. Estratégia de Migração Gradual

### Fase 1: Preparação (Atual - Não Requer Deploy)
- ✅ Código pronto para suportar ambos formatos
- ✅ Leitura de ambos `enc:v1:` e `enc:v2:` funcionando
- ✅ Escrita condicional: v2 apenas se `API_KEYS_ENCRYPTION_KEY` configurada
- ✅ Fallback para v1 se v2 falhar (durante transição)

### Fase 2: Configuração da Nova Chave (Quando Autorizado)
```bash
# No Railway / Produção
API_KEYS_ENCRYPTION_KEY="chave-aleatoria-32-chars-minimo"
# Gerar com: openssl rand -base64 32
```

**Efeito:** Novas chaves API salvas usarão `enc:v2:`. Registros existentes `enc:v1:` continuam legíveis.

### Fase 3: Migração Controlada de Registros Antigos (Opcional, Futuro)
- Executar script de migração apenas quando autorizado
- Re-criptografar registros `enc:v1:` para `enc:v2:` usando nova chave
- Manter backup antes da migração
- Validar descriptografia após migração

### Fase 4: Descontinuação do v1 (Futuro, Longo Prazo)
- Após confirmação de que todos registros migrados
- Remover fallback v1 no código (após ciclo de release completo)
- **NÃO** remover antes de confirmar migração completa

---

## 4. Compatibilidade e Rollback

### Matriz de Compatibilidade

| Cenário | `API_KEYS_ENCRYPTION_KEY` | Escrita | Leitura v1 | Leitura v2 |
|---------|---------------------------|---------|------------|------------|
| Desenvolvimento (sem chave) | ❌ | v1 | ✅ | ✅ |
| Produção (chave configurada) | ✅ | v2 | ✅ | ✅ |
| Rollback para código antigo | ❌/✅ | v1/v2 | ✅ | ❌/⚠️ |

### Rollback Seguro
Se houver problema com v2 em produção:
1. Remover `API_KEYS_ENCRYPTION_KEY` do ambiente
2. Deploy do código (já suporta leitura v1 sem a chave)
3. Novas chaves voltarão a ser `enc:v1:`
4. Registros `enc:v2:` existentes permanecem legíveis (código lê ambos)

**⚠️ Importante:** Não remover suporte a leitura `enc:v1:` até confirmar migração 100% completa.

---

## 5. Ferramenta de Diagnóstico

### Script de Verificação (Para Execução Manual)
```typescript
// Verificar status de criptografia das chaves API
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { getEncryptionVersion, isV1Encryption, isV2Encryption } from "@/server/security/Crypto";

async function checkEncryptionStatus(userId: string) {
  const keys = await CloudDatabase.apiKeys(userId);
  return keys.map(k => ({
    provider: k.provider,
    version: getEncryptionVersion(k.encryptedKey),
    isV1: isV1Encryption(k.encryptedKey),
    isV2: isV2Encryption(k.encryptedKey),
    hint: k.keyHint,
  }));
}
```

### Checklist de Validação Pós-Migração
- [ ] Todas as chaves existentes legíveis (`decryptSecret` não lança erro)
- [ ] Novas chaves salvas com `enc:v2:`
- [ ] `getEncryptionVersion` retorna `v2` para novas chaves
- [ ] `getEncryptionVersion` retorna `v1` para chaves antigas não migradas
- [ ] API Key Service funciona normalmente (set/get/delete/test)

---

## 6. Variáveis de Ambiente Necessárias

### Produção (Railway)
```env
# Existente (não alterar)
AUTH_SECRET="chave-mestra-jwt-32-chars-minimo"

# Nova (adicionar quando autorizado)
API_KEYS_ENCRYPTION_KEY="chave-independente-32-chars-minimo"
# Gerar: openssl rand -base64 32
```

### Desenvolvimento (.env.local)
```env
# Opcional - se não definido, usa v1
# API_KEYS_ENCRYPTION_KEY="dev-key-32-chars-minimum-length"
```

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Chave `API_KEYS_ENCRYPTION_KEY` não configurada em prod | Baixa | Médio | Código usa fallback v1 automaticamente |
| Rollback para código sem suporte v2 | Baixa | Alto | Código lê v1 mesmo sem a chave v2 |
| Perda de `API_KEYS_ENCRYPTION_KEY` | Baixa | Crítico | Backup seguro da chave; documentar procedimento de recuperação |
| Migração parcial falha | Média | Alto | Backup do banco antes; validar amostra antes de prosseguir |
| Downgrade silencioso v2→v1 | Baixa | Médio | Logs de versão no `getEncryptionVersion` |

---

## 8. Procedimento de Recuperação

### Se `API_KEYS_ENCRYPTION_KEY` for perdida:
1. **Não é catastrófico** - registros v2 tornam-se ilegíveis
2. Usuários afetados: aqueles com chaves salvas após configuração da v2
3. Recuperação: usuários re-configuram suas BYOK na UI (Settings → IA)
3. Chaves v1 antigas continuam funcionando

### Se migração falhar parcialmente:
1. Restaurar backup do banco (tabela `user_api_keys`)
3. Investigar causa
4. Tentar novamente com correção

---

## 9. Checklist de Deploy

### Antes de configurar `API_KEYS_ENCRYPTION_KEY`:
- [ ] Backup da tabela `user_api_keys`
- [ ] Testar em staging com a nova variável
- [ ] Verificar que `decryptSecret` lê v1 e v2
- [ ] Verificar que `encryptSecret` produz v2
- [ ] Confirmar rollback funcional (remover variável → v1)

### Após configurar em produção:
- [ ] Monitorar logs por erros de descriptografia
- [ ] Verificar `getEncryptionVersion` retorna `v2` para novas chaves
- [ ] Confirmar usuários conseguem salvar/testar chaves normalmente

---

## 10. Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| Salt fixo por versão (`v1`/`v2`) | Determinístico, permite rotação futura com key ID |
| scrypt para derivação de chave | Resistente a GPU/ASIC, padrão da indústria |
| AES-256-GCM | Autenticado, integrity + confidentiality |
| IV 12 bytes aleatório | Padrão GCM, único por operação |
| Fallback v1→v2 | Transição suave, sem downtime |
| Não gerar chave automaticamente | Segurança: chave deve ser provisionada explicitamente |

---

## 11. Referências

- `src/server/security/Crypto.ts` — Implementação completa
- `src/server/ai/ApiKeyService.ts` — Uso da criptografia
- `docs/SPRINT_37E_5_BASELINE.md` — Baseline da sprint
- `docs/SPRINT_37E_5_PHASE_5_SUMMARY.md` — Resumo da Phase 5 (rate limits)

---

**Próxima Ação:** Phase 9 — Dashboard de Quotas (Settings → IA)