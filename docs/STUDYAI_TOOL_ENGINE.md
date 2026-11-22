# StudyAI — Tool Engine (ferramentas controladas para o tutor)

> Documento de planejamento (não aprovado para implementação). Data-base: 22/11/2026. Nada foi implementado. Depende de `STUDYAI_INTELLIGENCE_ENGINE.md`.

## 1. Fatos que moldam o desenho
1. **Não há tool calling hoje.** Nenhum provedor do projeto usa `tools`, `function_call` ou `tool_choice`. As "ações" do Teacher são só texto de prompt.
2. **Os dados pedagógicos vivem no cliente** (IndexedDB/OPFS/localStorage com escopo por conta): estudos, notas, memória, caderno de erros, flashcards, materiais. O servidor não tem tabela por usuário para eles; recebe chunks e contexto que o cliente envia.
3. O único "sandbox" é um **Worker no navegador** (`SafeExecutionService.ts`, timeout de 2 s, rede desativada). Python e TypeScript estão como "unsupported". **Não existe sandbox de servidor.**
4. As rotas de IA já passam por CSRF, sessão ativa, quota e validação de corpo (`withAIQuota`).

Consequência: o desenho natural é de **ferramentas executadas no cliente**. O modelo pede uma ferramenta por uma intenção estruturada, o cliente valida e executa localmente, e devolve o resultado ao servidor como dado. Nenhuma ferramenta nova dá ao modelo acesso a terminal, sistema de arquivos, banco administrativo ou rede arbitrária.

## 2. Protocolo
- **Fase inicial:** protocolo de intenção em saída estruturada (`{"tool":"<id>","args":{...}}`), validado por esquema. É independente de suporte nativo de cada provedor e reutiliza o fluxo atual.
- **Avaliar depois:** tool calling nativo por provedor (Gemini e compatíveis com OpenAI), medindo ganho de confiabilidade e custo. **Não verificado nesta auditoria**: exige consulta à documentação oficial (Context7 requer autorização via `/mcp`).

```text
modelo ──(intenção estruturada)──► Tool Gateway (cliente)
   ▲                                   │ valida esquema, escopo, limites; pede confirmação se escrita
   │                                   ▼
   └──(resultado como DADO delimitado)── Executor da ferramenta ──► serviço existente
```

## 3. Contrato de ferramenta
`id`, `class` (leitura | transformação | escrita | execução), `inputSchema`, `outputSchema`, `scope` (dados que pode tocar), `limits` (tempo, bytes, itens, chamadas por turno), `requiresConfirmation`, `audit` (campos registrados, **sem conteúdo do aluno**), `tests`.

## 4. Catálogo candidato (reuso máximo)
| Ferramenta | Classe | Serviço existente | Onde roda | Fase |
|---|---|---|---|---|
| Calculadora / expressões | leitura | `lab/services/MathLabService.ts` (parser com limite de 40 mil caracteres) | cliente | 1 |
| Consulta à biblioteca | leitura | `retrieval/RetrievalService.ts`, `RankingService.ts` | cliente | 1 |
| Consulta de desempenho | leitura | `analytics/AnalyticsEngine.ts` | cliente | 1 |
| Caderno de erros e memória (leitura) | leitura | `learning/errors/*`, `learning/memory/*` | cliente | 1 |
| Leitura de documento (trecho por página) | leitura | `study/*`, extração já armazenada | cliente | 2 |
| Gerar flashcards | transformação | `app/api/tutor/flashcards` + `FlashcardService` | cliente + servidor | 2 |
| Gerar exercícios/quiz | transformação | `app/api/tutor/quiz`, `AdaptiveAssessmentEngine` | cliente + servidor | 2 |
| Correção de resposta | transformação | `app/api/lab/review`, `Teacher` (correção) | servidor | 2 |
| Plano de estudos | transformação | `planning/PlanningEngine.ts` (determinístico) | cliente | 2 |
| Gráficos e mapas mentais | transformação | `diagrams/*`, Mermaid do Teacher | cliente | 3 |
| Salvar flashcards/notas/plano | escrita | storages existentes | cliente, **com pré-visualização e confirmação** | 3 |
| Aula em áudio | transformação | `teacher/services/TeacherAudioLessonService.ts` | cliente + servidor | 3 |
| Execução de código JS | execução | `SafeExecutionService.ts` (Worker) | cliente | 3, restrita |
| Animações educacionais | transformação | **não existe** | — | pós-V1.5; ativos estáticos pré-renderizados, sem render no servidor |

**Fora de escopo, por decisão:** Python/TypeScript no servidor, terminal, sistema de arquivos, banco, rede arbitrária, MCP externo a partir do tutor.

## 5. Segurança
| Controle | Regra |
|---|---|
| Autorização | Vem da sessão (cookies, CSRF e sessão ativa), **nunca** do texto do modelo |
| Isolamento | Ferramentas de leitura só enxergam o escopo da conta ativa (mesmo escopo dos storages) |
| Validação | Esquema estrito; rejeita campos extras; limites de tamanho e de itens |
| Tool result = dado não confiável | Entra sempre no delimitador do Intelligence Engine; nunca eleva privilégio nem altera as regras |
| Escrita | Nunca silenciosa: pré-visualização e confirmação do aluno |
| Limites | Máx. 3 chamadas de ferramenta por turno; sem recursão (ferramenta não chama ferramenta); timeout por ferramenta; orçamento de tokens do turno |
| Prevenção de loop | Repetição da mesma ferramenta com os mesmos argumentos é recusada |
| Auditoria | Registrar ferramenta, duração e resultado (ok/erro), sem conteúdo |
| Execução | Somente o Worker existente; sem rede; sem acesso a storages |
| Resultados vindos do cliente | O servidor trata como **não confiáveis** (o cliente pode ser adulterado); nada de decisão de quota ou nota baseada neles |

## 6. Custo
Cada ferramenta usada pode multiplicar chamadas ao modelo (até 1 + 3 por turno). A quota compartilhada hoje cobra **por requisição, antes do handler**, e `tokens_count` fica em 0. Antes de liberar ferramentas é preciso a **contabilização real por tentativa (item 3 do fechamento da V1.2)** e definir se um turno com ferramentas conta como uma unidade com teto de tokens. Sem isso, o teto de custo não é verificável.

## 7. Plano em sprints pequenas (detalhes no roadmap futuro)
| Sprint | Entrega | Aceite |
|---|---|---|
| TE-1 | Gateway, contrato, esquemas, auditoria e limites; **sem ferramentas** | Testes de validação, de limite e de recusa de loop |
| TE-2 | Calculadora (1ª ferramenta) | Resultado idêntico ao `MathLabService`; entrada maliciosa recusada |
| TE-3 | Leituras: biblioteca, desempenho, erros | Teste A→B: ferramenta nunca devolve dados de outra conta |
| TE-4 | Transformações com confirmação | Nenhuma escrita sem confirmação; fixtures de skills |
| TE-5 | Gráficos e execução restrita de JS | Worker sem rede; limites aplicados |

## 8. Riscos
| Risco | Mitigação |
|---|---|
| Injeção indireta via resultado de ferramenta | Delimitador único, regras no system prompt, sem privilégio por resultado |
| Custo multiplicado | Contabilização real, teto por turno, ferramentas só em skills que declaram |
| Complexidade | Fase inicial só com leitura pura e sem escrita |
| Cliente adulterado | Servidor nunca confia no resultado; validação no uso |
| Divergência de quota | Remover ou fundir `withQuotaEnforcement` (sem chamadores) antes |

## 9. Rollback
Gateway atrás de flag (`tools.enabled`); desligar volta ao fluxo atual. Sem mudança de schema. Ferramentas de escrita têm desfazer local.
