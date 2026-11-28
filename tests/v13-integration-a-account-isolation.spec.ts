import { expect, test, type Page } from "@playwright/test";
import { SessionChangedError, SessionOperationManager } from "../src/features/account/SessionOperationManager";
import { isSkillsEnabled, selectAdaptiveSkill, SkillRegistry } from "../src/features/ai/skills";
import { isToolsEnabled, ToolRegistry } from "../src/features/ai/tools";
import { MemoryRetrievalEngine } from "../src/features/learning/memory/MemoryRetrievalEngine";
import type { LongTermMemoryStoreState } from "../src/features/learning/memory/types";
import {
  WorkspacePersistence,
  workspaceCurrentStudyKey,
  workspaceStateKey,
} from "../src/features/study/services/WorkspacePersistence";
import {
  WorkspaceStorage,
  workspaceLayoutsKey,
  workspaceV2Key,
} from "../src/features/workspace/services/WorkspaceStorage";
import { WorkspaceState } from "../src/features/workspace/services/WorkspaceState";
import { createRealStudy } from "./helpers/real-study";
import { readIndexedDBStore } from "./helpers/indexed-db";

const PASSWORD = "StudyAI2026secure!";
const uniqueEmail = (label: string) =>
  `lotea-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function enableAdvancedModeForUser(page: Page, userId: string) {
  await page.evaluate((uid) => {
    const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "_");
    localStorage.setItem(
      `studyai:experience-settings:${safeId}`,
      JSON.stringify({
        mode: "advanced",
        compactDensity: false,
        telemetryConsent: false,
        onboardingCompleted: true,
        dismissedGuides: [],
      }),
    );
    window.dispatchEvent(new Event("studyai:experience-settings-changed"));
  }, userId);
}

function createFakeBrowserStorage(): Storage {
  const store = new Map<string, string>();
  const target: Record<string, string> = {};
  return new Proxy(target, {
    get(_t, prop: string) {
      if (prop === "getItem") return (key: string) => store.get(key) ?? null;
      if (prop === "setItem") return (key: string, value: string) => { store.set(key, value); target[key] = value; };
      if (prop === "removeItem") return (key: string) => { store.delete(key); delete target[key]; };
      if (prop === "clear") return () => { store.clear(); Object.keys(target).forEach((k) => delete target[k]); };
      if (prop === "length") return store.size;
      if (prop === "key") return (index: number) => [...store.keys()][index] ?? null;
      return target[prop];
    },
    ownKeys() {
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  }) as unknown as Storage;
}

async function registerAccount(page: Page, email: string, name: string) {
  await page.goto("/conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();
}

async function loginAccount(page: Page, email: string) {
  await page.goto("/conta");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();
}

async function logoutAccount(page: Page) {
  await page.goto("/conta");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible();
}

async function currentUserId(page: Page): Promise<string> {
  const response = await page.request.get("/auth/session");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { user: { id: string } };
  return body.user.id;
}

test.describe("V1.3 Lote A — Contratos de Isolamento, Legado, Sessão Revogada e Opt-out", () => {
  test("preserva catálogo oficial (33 skills + 10 tools) e flags desligadas", () => {
    expect(isSkillsEnabled()).toBe(false);
    expect(isToolsEnabled()).toBe(false);
    expect(SkillRegistry.list().length).toBe(33);
    expect(ToolRegistry.list().length).toBe(10);
  });

  test("WorkspacePersistence e WorkspaceStorage isolam contas com mesmo studyId, ignoram legado sem dono e bloqueiam gravação tardia/revogada", () => {
    const fakeStorage = createFakeBrowserStorage();
    const dispatched: string[] = [];
    const fakeWindow = {
      localStorage: fakeStorage,
      dispatchEvent: (event: Event) => {
        dispatched.push(event.type);
        return true;
      },
    };
    const prevWindow = (globalThis as { window?: unknown }).window;
    const prevLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { window?: unknown }).window = fakeWindow;
    (globalThis as { localStorage?: unknown }).localStorage = fakeStorage;

    try {
      const sameStudyId = "study-collision-42";
      // Dados globais legados sem proprietário (não devem ser atribuídos a nenhuma conta nem apagados)
      fakeStorage.setItem(`studyai:workspace:${sameStudyId}`, JSON.stringify({ activeTab: "lab", noteId: "legacy-note" }));
      fakeStorage.setItem(`studyai:workspace-v2:${sameStudyId}`, JSON.stringify({ version: 2, studyId: sameStudyId, layoutId: "legacy", panels: [] }));
      fakeStorage.setItem("studyai:workspace-current", "legacy-study-id");
      fakeStorage.setItem("studyai:workspace-layouts:v2", JSON.stringify([{ id: "custom-legacy", name: "Layout Legado", builtIn: false, panels: [] }]));

      const layoutBase = { createdAt: "2026-11-27T00:00:00.000Z", updatedAt: "2026-11-27T00:00:00.000Z" };
      // 1. Sem sessão ativa (revogada/suspensa) -> fail-closed
      SessionOperationManager.beginTransition();
      expect(WorkspacePersistence.load(sameStudyId).activeTab).toBe("material");
      expect(WorkspacePersistence.loadLastStudyId()).toBeNull();
      WorkspacePersistence.save(sameStudyId, { activeTab: "quiz", noteId: "blocked" });
      WorkspaceStorage.save({ ...WorkspaceState.create(sameStudyId), layoutId: "blocked" });
      WorkspaceStorage.saveCustomLayout({ id: "custom-blocked", name: "Bloqueado", builtIn: false, panels: [], ...layoutBase });
      expect(WorkspaceStorage.loadLayouts().some((l) => l.id === "custom-blocked" || l.id === "custom-legacy")).toBe(false);

      // 2. Conta A ativa: não herda dados legados, grava em suas chaves próprias
      const genA = SessionOperationManager.activate("user-a");
      expect(WorkspacePersistence.load(sameStudyId).activeTab).toBe("material");
      expect(WorkspacePersistence.loadLastStudyId()).toBeNull();
      expect(WorkspaceStorage.loadLayouts().some((l) => l.id === "custom-legacy")).toBe(false);

      const sessionA = { userId: "user-a", generation: genA };
      WorkspacePersistence.save(sameStudyId, { activeTab: "notes", noteId: "note-A" }, sessionA);
      const stateA = { ...WorkspaceState.create(sameStudyId), layoutId: "review", activePanelId: "panel-A" };
      WorkspaceStorage.save(stateA, sessionA);
      WorkspaceStorage.saveCustomLayout({ id: "custom-a", name: "Layout A", builtIn: false, panels: [], ...layoutBase }, sessionA);

      expect(fakeStorage.getItem(workspaceStateKey("user-a", sameStudyId))).toContain("note-A");
      expect(fakeStorage.getItem(workspaceV2Key("user-a", sameStudyId))).toContain("panel-A");
      expect(fakeStorage.getItem(workspaceCurrentStudyKey("user-a"))).toBe(sameStudyId);
      expect(fakeStorage.getItem(workspaceLayoutsKey("user-a"))).toContain("Layout A");

      // 3. Troca de sessão A -> B: gravação tardia iniciada com contexto de A é bloqueada!
      const opA = SessionOperationManager.start("user-a");
      SessionOperationManager.beginTransition();
      expect(() => opA.assertCurrent()).toThrow(SessionChangedError);
      const genB = SessionOperationManager.activate("user-b");
      const sessionB = { userId: "user-b", generation: genB };

      // Tentativa de gravação tardia de A após B entrar não atinge destino de B nem de A
      WorkspacePersistence.save(sameStudyId, { activeTab: "lab", noteId: "late-from-A" }, sessionA);
      WorkspaceStorage.save({ ...WorkspaceState.create(sameStudyId), layoutId: "late-A" }, sessionA);
      WorkspaceStorage.saveCustomLayout({ id: "custom-late-a", name: "Tardio A", builtIn: false, panels: [], ...layoutBase }, sessionA);

      // Conta B vê estado limpo mesmo para o MESMO studyId
      expect(WorkspacePersistence.load(sameStudyId, sessionB).activeTab).toBe("material");
      expect(WorkspacePersistence.load(sameStudyId, sessionB).noteId).toBeUndefined();
      expect(WorkspacePersistence.loadLastStudyId(sessionB)).toBeNull();
      expect(WorkspaceStorage.load(sameStudyId, sessionB).activePanelId).not.toBe("panel-A");
      expect(WorkspaceStorage.loadLayouts(sessionB).some((l) => l.id === "custom-a" || l.id === "custom-late-a")).toBe(false);

      // Conta B grava seus próprios dados no mesmo studyId
      WorkspacePersistence.save(sameStudyId, { activeTab: "quiz", noteId: "note-B" }, sessionB);
      WorkspaceStorage.saveCustomLayout({ id: "custom-b", name: "Layout B", builtIn: false, panels: [], ...layoutBase }, sessionB);

      // Retorno para Conta A recupera exclusivamente os dados de A
      const genA2 = SessionOperationManager.activate("user-a");
      const sessionA2 = { userId: "user-a", generation: genA2 };
      expect(WorkspacePersistence.load(sameStudyId, sessionA2)).toMatchObject({ activeTab: "notes", noteId: "note-A" });
      expect(WorkspaceStorage.load(sameStudyId, sessionA2).activePanelId).toBe("panel-A");
      expect(WorkspaceStorage.loadLayouts(sessionA2).some((l) => l.id === "custom-a")).toBe(true);
      expect(WorkspaceStorage.loadLayouts(sessionA2).some((l) => l.id === "custom-b")).toBe(false);

      // Dados globais legados sem proprietário permaneceram intactos (não apagados nem migrados)
      expect(fakeStorage.getItem(`studyai:workspace:${sameStudyId}`)).toContain("legacy-note");
      expect(fakeStorage.getItem("studyai:workspace-current")).toBe("legacy-study-id");
      expect(dispatched.length).toBeGreaterThan(0);
      opA.release();
    } finally {
      SessionOperationManager.beginTransition();
      (globalThis as { window?: unknown }).window = prevWindow;
      (globalThis as { localStorage?: unknown }).localStorage = prevLocalStorage;
    }
  });

  test("opt-out de memória e personalização não usa histórico pessoal, não apaga dados e preserva preferências manuais", () => {
    const memoryStateDisabled: LongTermMemoryStoreState = {
      settings: {
        enabled: false,
        adaptivePersonalizationEnabled: false,
        explanationLevel: "advanced",
      },
      entries: [
        {
          id: "mem-1",
          category: "difficulty",
          source: "explicit",
          title: "Dificuldade em ponteiros",
          content: "Erra aritmética de ponteiros em C.",
          studyId: "study-1",
          subject: "Algoritmos",
          createdAt: "2026-11-20T10:00:00.000Z",
          updatedAt: "2026-11-25T10:00:00.000Z",
        },
      ],
    };

    // Memória desativada não entra no contexto do Tutor
    const selectedForTutor = MemoryRetrievalEngine.selectForTutor({
      state: memoryStateDisabled,
      studyId: "study-1",
      subject: "Algoritmos",
      query: "ponteiros",
    });
    expect(selectedForTutor).toBeUndefined();
    // Dados existentes preservados (opt-out não apaga entries automaticamente)
    expect(memoryStateDisabled.entries).toHaveLength(1);

    // Personalização desativada não usa histórico/memória e respeita preferências manuais explícitas do Professor
    const adaptive = selectAdaptiveSkill({
      goal: "learn",
      personalizationEnabled: false,
      memorySettings: memoryStateDisabled.settings,
      manualPreference: {
        level: "technical",
        method: "socratic",
      },
      knowledge: {
        studyId: "study-1",
        subject: "Algoritmos",
        topic: "Ponteiros",
        knowledge: 20,
        mastery: "Iniciante",
        classification: "difficult",
        confidence: 80,
        components: { quiz: 20, flashcards: 10, time: 30, frequency: 40, recency: 50 },
      },
    });
    expect(adaptive.mode).toBe("manual_disabled");
    expect(adaptive.suggestedLevel).toBe("technical");
    expect(adaptive.suggestedMethod).toBe("socratic");
    expect(adaptive.authorizedSignalsUsed.some((s) => s.category === "memory_preference")).toBe(false);
  });
});

test.describe("V1.3 Lote A — Navegador Real (Chromium): A → B → A, Legado, Assíncrono, Refresh/Reabertura e Strict Mode", () => {
  test("isolamento completo A → B → A em preferências do Professor, sessão de áudio, workspace, nota, layout, legado e resposta tardia", async ({
    page,
    baseURL,
  }) => {
    test.skip(!baseURL, "Requer servidor da aplicação (playwright.config.ts).");
    test.setTimeout(180_000);

    const emailA = uniqueEmail("conta-a");
    const emailB = uniqueEmail("conta-b");

    // 1. Registra Conta A e injeta dados globais legados sem proprietário (devem permanecer inacessíveis)
    await registerAccount(page, emailA, "Estudante A");
    const userA = await currentUserId(page);
    await enableAdvancedModeForUser(page, userA);

    await page.evaluate(() => {
      localStorage.setItem(
        "studyai:teacher-preferences:v1",
        JSON.stringify({ level: "brief", method: "quick_review", summaryStyle: "short" }),
      );
      localStorage.setItem(
        "studyai:teacher-audio-lesson-preferences:v1",
        JSON.stringify({ level: "brief", method: "quick_review", summaryStyle: "short", voice: "legacy-voice", rate: 1.5, autoplay: false }),
      );
      localStorage.setItem(
        "studyai:teacher-audio-lesson-session:v1",
        JSON.stringify({ sessionId: "legacy-audio", topic: "Tópico Legado Sem Dono", plan: ["Etapa 1"], currentStep: 0, completedSteps: [], exercises: [] }),
      );
      localStorage.setItem("studyai:workspace-current", "legacy-unowned-study");
      localStorage.setItem(
        "studyai:workspace-layouts:v2",
        JSON.stringify([{ id: "custom-legacy-unowned", name: "Layout Legado Sem Dono", builtIn: false, panels: [] }]),
      );
    });

    // 2. Conta A configura preferências pedagógicas e de áudio no /tutor (não herda legado "brief"/"quick_review")
    await page.goto("/tutor");
    await page.getByRole("button", { name: "Nova conversa" }).first().click();
    await page.getByRole("button", { name: "Professor" }).click();
    await expect(page.getByLabel("Nível da explicação")).toHaveValue("intermediate");
    await expect(page.getByLabel("Método de ensino")).toHaveValue("step_by_step");

    await page.getByLabel("Nível da explicação").selectOption("advanced");
    await page.getByLabel("Método de ensino").selectOption("analogies");

    // Verifica gravação na chave escopada v2 de A (e legado v1 intocado)
    const prefsStorageA = await page.evaluate((uid) => ({
      scoped: localStorage.getItem(`studyai:teacher-preferences:v2:${uid}`),
      legacy: localStorage.getItem("studyai:teacher-preferences:v1"),
    }), userA);
    expect(prefsStorageA.scoped).toContain('"advanced"');
    expect(prefsStorageA.scoped).toContain('"analogies"');
    expect(prefsStorageA.legacy).toContain('"brief"');

    // Valida React Strict Mode após reload: montagem inicial não sobrescreve preferências persistidas com defaults
    await page.reload();
    await page.getByRole("button", { name: "Professor" }).click();
    await expect(page.getByLabel("Nível da explicação")).toHaveValue("advanced");
    await expect(page.getByLabel("Método de ensino")).toHaveValue("analogies");

    // Simula persistência de sessão de áudio escopada da Conta A e confirma restauração na UI após reload
    await page.evaluate((uid) => {
      localStorage.setItem(
        `studyai:teacher-audio-lesson-session:v2:${uid}`,
        JSON.stringify({
          sessionId: "audio-session-a",
          ownerId: uid,
          topic: "Aula de Áudio Privada A",
          plan: ["Introdução A", "Prática A"],
          currentStep: 0,
          completedSteps: [],
          exercises: [],
          audioPreferences: { level: "advanced", method: "analogies", summaryStyle: "medium", voice: "voz-a", rate: 1.25, autoplay: true },
          pedagogicalState: {},
        }),
      );
    }, userA);

    await page.reload();
    await page.getByRole("button", { name: "Professor" }).click();
    await expect(page.getByText("Introdução A", { exact: true })).toBeVisible();

    // 3. Conta A cria estudo real, abre aba Notas, salva nota e cria layout customizado
    const studyA = await createRealStudy(page, "Conteúdo exclusivo da Conta A sobre grafos.");
    await page.goto(`/estudo?tema=${studyA}`);
    await page.getByRole("tab", { name: "Notas" }).click();
    await page.getByRole("region", { name: "Notas" }).getByRole("button", { name: "Nova nota" }).click();
    await page.getByLabel("Título da nota").fill("Nota Privada A");
    await page.getByLabel("Conteúdo da nota").fill("Segredo de estudo da Conta A.");
    await expect(page.getByText("Salvo automaticamente", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Salvar layout" }).click();
    await page.getByLabel("Nome do layout").fill("Layout Exclusivo A");
    await page.getByRole("dialog").getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByLabel("Layout do Workspace")).toHaveValue(/custom-/);

    // 4. Refresh e reabertura do workspace da Conta A em nova aba (valida restauração determinística)
    await page.reload();
    await expect(page.getByRole("tab", { name: "Notas" })).toHaveAttribute("data-state", "active");
    await expect(page.getByLabel("Título da nota")).toHaveValue("Nota Privada A");

    const reopenedA = await page.context().newPage();
    await reopenedA.goto(`/estudo?tema=${studyA}`);
    await expect(reopenedA.getByRole("tab", { name: "Notas" })).toHaveAttribute("data-state", "active");
    await expect(reopenedA.getByLabel("Conteúdo da nota")).toHaveValue("Segredo de estudo da Conta A.");
    await reopenedA.close();

    // 5. Resposta assíncrona lenta iniciada por Conta A em /tutor que completa HTTP 200 após troca para Conta B via segunda aba
    const slowReplyHolder: { release?: () => void } = {};
    await page.route("**/api/tutor", async (route) => {
      await new Promise<void>((resolve) => {
        slowReplyHolder.release = resolve;
      });
      await route
        .fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ model: "mock", text: "RESPOSTA_TARDIA_CONTA_A_PROIBIDA" }),
        })
        .catch(() => undefined);
    });

    await page.goto("/tutor");
    await page.getByLabel("Mensagem para o Tutor IA").fill("Pergunta lenta da Conta A");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect.poll(() => Boolean(slowReplyHolder.release)).toBe(true);

    // 6. Em segunda aba, faz logout da Conta A e cadastro da Conta B enquanto a requisição da Conta A continua em voo em `page`
    const authTab = await page.context().newPage();
    await logoutAccount(authTab);
    await registerAccount(authTab, emailB, "Estudante B");
    const userB = await currentUserId(authTab);
    expect(userB).not.toBe(userA);
    await enableAdvancedModeForUser(authTab, userB);
    await authTab.close();

    // Aguarda `page` processar a transição de sessão recebida via storage event e então libera a resposta HTTP 200 tardia de A
    await expect(page.getByText("Introdução A", { exact: true })).toHaveCount(0);
    slowReplyHolder.release?.();
    await page.unroute("**/api/tutor");

    // 7. Conta B não herda NENHUM dado de A (preferências, áudio, conversas, layouts, notas) nem recebe a resposta tardia
    await page.goto("/tutor");
    await page.getByRole("button", { name: "Professor" }).click();
    await expect(page.getByLabel("Nível da explicação")).toHaveValue("intermediate");
    await expect(page.getByLabel("Método de ensino")).toHaveValue("step_by_step");
    await expect(page.getByText("RESPOSTA_TARDIA_CONTA_A_PROIBIDA")).toHaveCount(0);
    await expect(page.getByText("Introdução A", { exact: true })).toHaveCount(0);

    const storageBCheck = await page.evaluate((uidA) => {
      const all = Object.entries(localStorage);
      return {
        hasUserAKeys: all.some(([k]) => k.includes(uidA)),
        hasSecretA: all.some(([, v]) => v.includes("Nota Privada A") || v.includes("Layout Exclusivo A") || v.includes("Aula de Áudio Privada A")),
      };
    }, userA);
    expect(storageBCheck.hasUserAKeys).toBe(false);
    expect(storageBCheck.hasSecretA).toBe(false);

    // 8. Conta B cria seus próprios dados (preferências, estudo, nota e layout)
    await page.getByLabel("Nível da explicação").selectOption("beginner");
    await page.getByLabel("Método de ensino").selectOption("socratic");
    const studyB = await createRealStudy(page, "Conteúdo exclusivo da Conta B sobre bancos.");
    await page.goto(`/estudo?tema=${studyB}`);
    await page.getByRole("tab", { name: "Notas" }).click();
    await page.getByRole("region", { name: "Notas" }).getByRole("button", { name: "Nova nota" }).click();
    await page.getByLabel("Título da nota").fill("Nota Privada B");
    await page.getByLabel("Conteúdo da nota").fill("Segredo de estudo da Conta B.");
    await expect(page.getByText("Salvo automaticamente", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Layout do Workspace")).not.toContainText("Layout Exclusivo A");

    // 9. Retorno à Conta A (B → A) recupera exclusivamente os dados originais de A (sessão de áudio + preferências)
    await logoutAccount(page);
    await loginAccount(page, emailA);
    expect(await currentUserId(page)).toBe(userA);

    await page.goto("/tutor");
    await page.getByRole("button", { name: "Professor" }).click();
    await expect(page.getByText("Introdução A", { exact: true })).toBeVisible();
    const restoredPrefsA = await page.evaluate((uid) => localStorage.getItem(`studyai:teacher-preferences:v2:${uid}`), userA);
    expect(restoredPrefsA).toContain('"advanced"');
    expect(restoredPrefsA).toContain('"analogies"');

    await page.goto(`/estudo?tema=${studyA}`);
    await expect(page.getByRole("tab", { name: "Notas" })).toHaveAttribute("data-state", "active");
    await expect(page.getByLabel("Título da nota")).toHaveValue("Nota Privada A");
    await expect(page.getByLabel("Layout do Workspace")).toContainText("Layout Exclusivo A");
    const notesInA = await readIndexedDBStore<{ title: string }>(page, "notes");
    expect(notesInA.some((n) => n.title === "Nota Privada A")).toBe(true);
    expect(notesInA.some((n) => n.title === "Nota Privada B")).toBe(false);
  });
});
