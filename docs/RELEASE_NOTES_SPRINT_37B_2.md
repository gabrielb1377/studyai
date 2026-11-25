# Release Notes — Sprint 37B.2

**Data**: 19 de outubro de 2026  
**Branch**: `v1.1-development`  
**Escopo**: AI Teacher Voice Lessons (aulas narradas e conversa por voz)

---

## Resumo

O Professor do StudyAI passou a conduzir aulas narradas. O aluno inicia uma aula,
acompanha a explicação ouvida enquanto lê o texto na tela, interrompe para perguntar
pelo microfone, responde exercícios, pede uma explicação diferente e retoma a aula
depois de fechar o navegador — sem perder o progresso.

Nenhum provider de IA novo foi criado. Nenhum sistema paralelo ao AI Teacher. O
Voice Core da Sprint 37B.1 é reutilizado integralmente.

---

## Novas funcionalidades

### Aula narrada em etapas

O Professor gera um plano de etapas pelo AI Core e narra cada uma com o
`VoiceService`. As etapas seguem a ordem: introdução, explicação conceitual,
exemplo prático, exercício e resumo.

Controles disponíveis: reproduzir, pausar, continuar, parar, repetir explicação,
próxima etapa, etapa anterior, desativar narração, fazer pergunta e explicar de
outra forma.

### Interrupção inteligente

O botão "Fazer pergunta" cancela a narração atual, preserva a etapa e o contexto e
abre a entrada de pergunta. A progressão da aula nunca avança sozinha.

### Perguntas por voz

O reconhecimento de fala usa a `SpeechRecognition` nativa do navegador, com
português (Brasil), inglês e espanhol. A transcrição aparece em tempo real, pode ser
editada e precisa ser confirmada antes do envio.

### Exercícios narrados

Cada etapa de exercício traz um enunciado. O aluno responde por texto; o Professor
avalia, narra o veredito e a correção, e recomenda revisão.

### Explicação alternativa

A ação "Explicar de outra forma" gera uma nova abordagem — analogia, exemplo ou
passos — sem repetir a explicação anterior. A aula não reinicia.

### Narração em outras superfícies

| Superfície | Ação |
|-------------|------|
| Tutor / Professor | "Ouvir resposta" em cada mensagem do assistente |
| PDF | "Ouvir página" e "Ouvir texto selecionado" |
| Academy | "Ouvir conteúdo" no visualizador |

---

## Arquitetura

```text
Professor (TutorWorkspace)
  → TeacherControls
    → NarratedLessonPanel
      → useAudioLesson
        ├─ TeacherAudioLessonClient (HTTP)
        │    → POST /api/teacher/audio-lesson
        │      → ApiKeyService (BYOK) → AIService → ProviderManager → provider
        ├─ TeacherNarrationService (texto → fala)
        ├─ TeacherAudioSessionStorage (IndexedDB metadata)
        └─ LearningService (atividade)
```

### Arquivos novos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/features/teacher/services/TeacherNarrationService.ts` | Converte Markdown em segmentos narráveis |
| `src/features/teacher/services/TeacherAudioLessonService.ts` | Geração server-side (plano, alternativa, correção) |
| `src/features/teacher/services/TeacherAudioLessonClient.ts` | Cliente HTTP do navegador |
| `src/features/teacher/services/TeacherAudioSessionStorage.ts` | Persistência da sessão e tempo ativo |
| `src/features/teacher/hooks/useAudioLesson.ts` | Orquestração da aula narrada |
| `src/features/teacher/components/NarratedLessonPanel.tsx` | Interface da aula |
| `src/app/api/teacher/audio-lesson/route.ts` | Route Handler server-only |
| `tests/narrated-lesson.spec.ts` | 5 testes E2E |

### Arquivos modificados

`src/features/teacher/TeacherPromptBuilder.ts`, `src/features/teacher/types.ts`,
`src/features/teacher/components/TeacherControls.tsx`,
`src/features/teacher/components/TeacherAudioPlayer.tsx`,
`src/features/tutor/TutorMessage.tsx`,
`src/features/study/PdfMaterialViewer.tsx`,
`src/features/academy/components/AcademyContentViewer.tsx`,
`src/features/academy/components/AcademyPage.tsx`, módulo `src/features/voice/**`.

---

## Segurança e privacidade

- O microfone **nunca** é ativado automaticamente.
- Indicador visual durante a captura.
- A captura é encerrada ao sair da tela.
- Nenhum áudio bruto é persistido; apenas texto e estado pedagógico.
- Transcrições não entram em logs nem em telemetria.
- O material do aluno (PDF, Academy) **nunca** é enviado a um serviço externo de TTS.
- A rota exige JWT (`requireUser`) e CSRF (`requireCsrf`).
- BYOK aplicado: chave individual do usuário antes do fallback do servidor.

---

## Limitações conhecidas

| Limitação | Impacto |
|-----------|---------|
| `SpeechRecognition` depende do navegador | Chrome/Edge suportam melhor; Firefox/Safari são limitados |
| Algumas implementações usam rede | Reconhecimento não é 100% offline |
| Sem progresso por palavra | Sincronização por etapa, não por parágrafo |
| Vozes variam por SO | Narração pode soar mecânica em alguns sistemas |
| `cancel()` corta o início da fala em alguns navegadores | Pequeno atraso ao trocar de etapa |

---

## Validação

| Verificação | Resultado |
|-------------|-----------|
| `npm run lint` | ✅ 0 erros (1 warning pré-existente) |
| `npm run typecheck` | ✅ Sem erros |
| `npm run test:e2e` | ✅ **126/126** (15.0 min) — 5 novos |
| `npm run build` | ✅ Produção aprovada (44 rotas) |

### Testes novos

1. `preparação de narração remove marcação e preserva o significado`
2. `tempo ativo não conta reprodução pausada`
3. `aluno inicia aula narrada, avança etapas e responde exercício`
4. `aluno pede explicação alternativa e a aula preserva o progresso`
5. `aula narrada permanece utilizável no celular`

---

## Pendências

- **37C.1** — Academy Studio Pro (WIP preservado em `tmp/wip-academy-studio-37C1`)
- **37C.2** — exportação profissional com templates e customização
- Kokoro TTS como serviço separado (avaliado, não iniciado)
