import { expect, test } from "@playwright/test";
import { webSpeechProvider } from "../src/features/voice/providers/web-speech";
import { createVoiceService } from "../src/features/voice/services";
import {
  disableVoiceInput,
  enableVoiceInput,
  getVoiceConsentState,
  grantVoiceConsent,
} from "../src/features/voice/voice-consent";

test.describe("Sprint 57B — TTS Lifecycle & Consent Unit", () => {
  test("webSpeechProvider e createVoiceService anexam handlers na instância utterance, aguardam onend e tratam cancel/error sem estado preso", async () => {
    const originalWindow = (globalThis as Record<string, unknown>).window;
    const originalSpeechSynthesis = (globalThis as Record<string, unknown>).speechSynthesis;
    const originalUtterance = (globalThis as Record<string, unknown>).SpeechSynthesisUtterance;
    const windowListeners: string[] = [];

    let cancelCount = 0;
    const spokenUtterances: Array<{
      text: string;
      onstart: null | (() => void);
      onend: null | (() => void);
      onerror: null | ((e: { error?: string }) => void);
      onpause: null | (() => void);
      onresume: null | (() => void);
    }> = [];

    class FakeUtterance {
      text: string;
      rate = 1;
      volume = 1;
      voice: unknown = null;
      onstart: null | (() => void) = null;
      onend: null | (() => void) = null;
      onerror: null | ((e: { error?: string }) => void) = null;
      onpause: null | (() => void) = null;
      onresume: null | (() => void) = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    const fakeSynthesis = {
      getVoices: () => [{ name: "Português Teste", default: true }],
      speak: (utterance: FakeUtterance) => {
        spokenUtterances.push(utterance);
      },
      cancel: () => {
        cancelCount += 1;
      },
      pause: () => {},
      resume: () => {},
      addEventListener: () => {},
    };

    (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
    (globalThis as Record<string, unknown>).speechSynthesis = fakeSynthesis;
    (globalThis as Record<string, unknown>).addEventListener = (type: string) => {
      windowListeners.push(type);
    };

    try {
      // 1. webSpeechProvider.speak resolves only when utterance.onend fires, never attaches window "onend"
      let resolved1 = false;
      const p1 = webSpeechProvider.speak("Primeira resposta").then(() => {
        resolved1 = true;
      });
      await Promise.resolve();
      expect(windowListeners).toEqual([]);
      expect(spokenUtterances).toHaveLength(1);
      expect(typeof spokenUtterances[0].onend).toBe("function");
      expect(resolved1).toBe(false);

      spokenUtterances[0].onstart?.();
      spokenUtterances[0].onend?.();
      await p1;
      expect(resolved1).toBe(true);
      expect(spokenUtterances[0].onend).toBeNull();

      // 2. Error handling on utterance.onerror
      const pErr = webSpeechProvider.speak("Falha simulada");
      await Promise.resolve();
      spokenUtterances[1].onerror?.({ error: "synthesis-failed" });
      await expect(pErr).rejects.toThrow(/synthesis-failed/i);

      // 3. createVoiceService waits for onend and cancels prior playback cleanly
      const service = createVoiceService();
      let serviceDone = false;
      const pSvc1 = service.speak("Texto longo").then(() => {
        serviceDone = true;
      });
      await Promise.resolve();
      expect(serviceDone).toBe(false);
      const prevCancel = cancelCount;
      const pSvc2 = service.speak("Nova resposta");
      await pSvc1; // prior utterance settled cleanly on interruption
      expect(serviceDone).toBe(true);
      expect(cancelCount).toBeGreaterThan(prevCancel);
      spokenUtterances.at(-1)!.onend?.();
      await pSvc2;
    } finally {
      (globalThis as Record<string, unknown>).window = originalWindow;
      (globalThis as Record<string, unknown>).speechSynthesis = originalSpeechSynthesis;
      (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = originalUtterance;
    }
  });

  test("armazena consentimento de voz isolado por escopo de usuário", () => {
    const store = new Map<string, string>();
    const originalWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    };

    try {
      expect(getVoiceConsentState("user-alpha")).toEqual({ accepted: false, enabled: false });
      const granted = grantVoiceConsent("user-alpha");
      expect(granted.accepted).toBe(true);
      expect(granted.enabled).toBe(true);
      expect(getVoiceConsentState("user-beta")).toEqual({ accepted: false, enabled: false });

      const disabled = disableVoiceInput("user-alpha");
      expect(disabled.accepted).toBe(true);
      expect(disabled.enabled).toBe(false);

      const reenabled = enableVoiceInput("user-alpha");
      expect(reenabled.enabled).toBe(true);
    } finally {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
  });
});

test.describe("Sprint 57B — Tutor por Voz E2E", () => {
  test("exige consentimento explícito, transcreve para edição manual sem envio automático, permite cancelamento e gerencia TTS", async ({ page }) => {
    await page.addInitScript(() => {
      const storageKey = "__voiceTestCalls";
      const readCalls = (): Array<{ action: string; text?: string }> => {
        try {
          const raw = window.sessionStorage.getItem(storageKey);
          return raw ? (JSON.parse(raw) as Array<{ action: string; text?: string }>) : [];
        } catch {
          return [];
        }
      };
      const voiceCalls: Array<{ action: string; text?: string }> = readCalls();
      const recordCall = (entry: { action: string; text?: string }) => {
        voiceCalls.push(entry);
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(voiceCalls));
        } catch {
          // ignore storage errors in restricted environments
        }
      };
      let recognitionInstances = 0;
      let latestRecognition: MockSpeechRecognition | null = null;
      let currentUtterance: MockUtterance | null = null;

      class MockUtterance {
        text: string;
        rate = 1;
        volume = 1;
        voice: unknown = null;
        onstart: null | (() => void) = null;
        onpause: null | (() => void) = null;
        onresume: null | (() => void) = null;
        onend: null | (() => void) = null;
        onerror: null | ((e: { error?: string }) => void) = null;
        constructor(text: string) {
          this.text = text;
        }
      }

      class MockSpeechRecognition {
        lang = "pt-BR";
        continuous = false;
        interimResults = true;
        maxAlternatives = 1;
        onstart: null | (() => void) = null;
        onresult: null | ((event: unknown) => void) = null;
        onerror: null | ((event: unknown) => void) = null;
        onend: null | (() => void) = null;
        constructor() {
          recognitionInstances += 1;
          const register = (instance: MockSpeechRecognition) => {
            latestRecognition = instance;
          };
          register(this);
        }
        start() {
          recordCall({ action: "stt:start" });
          this.onstart?.();
        }
        stop() {
          recordCall({ action: "stt:stop" });
          this.onend?.();
        }
        abort() {
          recordCall({ action: "stt:abort" });
          this.onerror?.({ error: "aborted" });
          this.onend?.();
        }
      }

      Object.defineProperty(window, "SpeechRecognition", {
        configurable: true,
        writable: true,
        value: MockSpeechRecognition,
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        writable: true,
        value: MockUtterance,
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        writable: true,
        value: {
          getVoices: () => [{ name: "Português Mock", lang: "pt-BR", default: true }],
          speak: (utterance: MockUtterance) => {
            currentUtterance = utterance;
            recordCall({ action: "tts:speak", text: utterance.text });
            setTimeout(() => utterance.onstart?.(), 10);
          },
          pause: () => {
            recordCall({ action: "tts:pause" });
            currentUtterance?.onpause?.();
          },
          resume: () => {
            recordCall({ action: "tts:resume" });
            currentUtterance?.onresume?.();
          },
          cancel: () => {
            recordCall({ action: "tts:cancel" });
            currentUtterance?.onend?.();
            currentUtterance = null;
          },
          addEventListener: () => {},
        },
      });

      (window as unknown as Record<string, unknown>).__voiceTest = {
        getCalls: () => voiceCalls,
        getRecognitionCount: () => recognitionInstances,
        emitTranscript: (text: string, isFinal = true) => {
          latestRecognition?.onresult?.({
            resultIndex: 0,
            results: [{ isFinal, 0: { transcript: text } }],
          });
        },
        finishTts: () => {
          currentUtterance?.onend?.();
          currentUtterance = null;
        },
      };
    });

    const apiRequests: Array<{ message: string }> = [];
    await page.route("**/api/tutor", async (route) => {
      const body = route.request().postDataJSON() as { message: string };
      apiRequests.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          model: "gemini-3.7-flash",
          text: "Uma função linear tem taxa de variação constante.",
        }),
      });
    });

    await page.goto("/tutor");
    await page.getByRole("button", { name: "Nova conversa" }).first().click();

    // 1. Clicking microphone before consent opens disclosure and does NOT start recording
    await page.getByRole("button", { name: "Usar entrada por voz" }).click();
    const consentRegion = page.getByRole("region", { name: "Consentimento de entrada por voz" });
    await expect(consentRegion).toBeVisible();
    await expect(consentRegion).toContainText("não funciona offline");
    await expect(consentRegion).toContainText("não armazena áudio bruto");
    expect(await page.evaluate(() => (window as unknown as { __voiceTest: { getRecognitionCount: () => number } }).__voiceTest.getRecognitionCount())).toBe(0);

    // 2. Grant consent -> starts recording, emits transcript into editable textarea without auto-send
    await page.getByRole("button", { name: "Permitir e ativar microfone" }).click();
    await expect(page.getByText(/Ouvindo\.\.\./)).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __voiceTest: { emitTranscript: (t: string, f?: boolean) => void } }).__voiceTest.emitTranscript("O que é função linear", true);
    });
    const composer = page.getByLabel("Mensagem para o Tutor IA");
    await expect(composer).toHaveValue("O que é função linear");
    expect(apiRequests).toHaveLength(0); // Never auto-sends!

    // 3. Stop recording, edit text, send manually
    await page.getByRole("button", { name: "Parar", exact: true }).click();
    await composer.fill("O que é função linear com exemplo");
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Uma função linear tem taxa de variação constante.")).toBeVisible();
    expect(apiRequests).toHaveLength(1);
    expect(apiRequests[0].message).toBe("O que é função linear com exemplo");

    // 4. Test cancel restores draft without sending
    await composer.fill("Rascunho original");
    await page.getByRole("button", { name: "Usar entrada por voz" }).click();
    await page.evaluate(() => {
      (window as unknown as { __voiceTest: { emitTranscript: (t: string, f?: boolean) => void } }).__voiceTest.emitTranscript("texto descartado", true);
    });
    await page.getByRole("button", { name: "Cancelar gravação" }).click();
    await expect(composer).toHaveValue("Rascunho original");

    // 5. Test TTS playback: start -> pause -> resume -> finish (no stuck speaking state)
    await page.getByRole("button", { name: "Ouvir resposta" }).click();
    await expect(page.getByText("Lendo resposta...")).toBeVisible();
    await page.getByRole("button", { name: "Pausar narração" }).click();
    await expect(page.getByText("Narração pausada")).toBeVisible();
    await page.getByRole("button", { name: "Retomar narração" }).click();
    await expect(page.getByText("Lendo resposta...")).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __voiceTest: { finishTts: () => void } }).__voiceTest.finishTts();
    });
    await expect(page.getByText("Lendo resposta...")).toHaveCount(0);

    // 6. Test TTS interruption on navigation
    await page.getByRole("button", { name: "Ouvir resposta" }).click();
    await expect(page.getByText("Lendo resposta...")).toBeVisible();
    await page.goto("/biblioteca");
    const callsAfterNav = await page.evaluate(() => (window as unknown as { __voiceTest: { getCalls: () => Array<{ action: string }> } }).__voiceTest.getCalls());
    expect(callsAfterNav.some((c) => c.action === "tts:cancel")).toBe(true);

    // 7. Disable voice button works cleanly
    await page.goto("/tutor");
    await page.getByRole("button", { name: "Desativar voz" }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Entrada por voz desativada");
  });

  test("trata permissão negada, navegador sem suporte, isolamento por conta e layout mobile", async ({ page }) => {
    // Part A: Denied microphone permission preserves text chat
    await page.addInitScript(() => {
      class DeniedSpeechRecognition {
        onerror: null | ((e: { error: string }) => void) = null;
        onend: null | (() => void) = null;
        start() {
          setTimeout(() => {
            this.onerror?.({ error: "not-allowed" });
            this.onend?.();
          }, 10);
        }
        stop() {}
        abort() {}
      }
      Object.defineProperty(window, "SpeechRecognition", {
        configurable: true,
        writable: true,
        value: DeniedSpeechRecognition,
      });
    });

    await page.route("**/api/tutor", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ model: "gemini-3.7-flash", text: "Chat por texto ativo." }),
      });
    });

    await page.goto("/tutor");
    await page.getByRole("button", { name: "Nova conversa" }).first().click();
    await page.getByRole("button", { name: "Usar entrada por voz" }).click();
    await page.getByRole("button", { name: "Permitir e ativar microfone" }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Permissão do microfone negada");

    // Text chat continues working
    await page.getByLabel("Mensagem para o Tutor IA").fill("Pergunta digitada após erro");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Chat por texto ativo.")).toBeVisible();

    // Part B: Account isolation for voice consent + Mobile viewport check
    const emailA = `voice-a-${Date.now()}@example.com`;
    const emailB = `voice-b-${Date.now()}@example.com`;
    const password = "StudyAI2026secure";

    await page.goto("/conta");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByLabel("Nome")).toBeVisible();
    await page.getByLabel("Nome").fill("Conta Voice A");
    await page.getByLabel("Email").fill(emailA);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    await page.goto("/tutor");
    await page.getByRole("button", { name: "Nova conversa" }).first().click();
    await page.getByRole("button", { name: "Usar entrada por voz" }).click();
    await page.getByRole("button", { name: "Permitir e ativar microfone" }).click();
    await expect(page.getByRole("button", { name: "Desativar voz" })).toBeVisible();

    await page.goto("/conta");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByLabel("Nome").fill("Conta Voice B");
    await page.getByLabel("Email").fill(emailB);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    await page.setViewportSize({ width: 360, height: 844 });
    await page.goto("/tutor");
    await page.getByRole("button", { name: "Nova conversa" }).first().click();
    await expect(page.getByRole("button", { name: "Desativar voz" })).toHaveCount(0);
    await page.getByRole("button", { name: "Usar entrada por voz" }).click();
    await expect(page.getByRole("region", { name: "Consentimento de entrada por voz" })).toBeVisible();

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);
  });

  test("exibe fallback claro em navegador sem suporte a reconhecimento ou síntese de voz", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
      Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
    });

    await page.route("**/api/tutor", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ model: "gemini-3.7-flash", text: "Resposta sem áudio disponível." }),
      });
    });

    await page.goto("/tutor");
    await page.getByRole("button", { name: "Nova conversa" }).first().click();
    await page.getByRole("button", { name: "Usar entrada por voz" }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Reconhecimento de fala não suportado neste navegador");

    await page.getByLabel("Mensagem para o Tutor IA").fill("Pergunta sem voz");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta sem áudio disponível.")).toBeVisible();

    await page.getByRole("button", { name: "Voz indisponível" }).click();
    await expect(
      page.locator('[role="alert"]:not(#__next-route-announcer__)').filter({ hasText: "Síntese de voz indisponível" }),
    ).toBeVisible();
  });
});
