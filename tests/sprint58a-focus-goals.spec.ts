import { expect, test, type Page } from "@playwright/test";
import {
  clampWeeklyGoalTarget,
  computeWeeklyGoalProgress,
  getLocalWeekBounds,
  sanitizeWeeklyGoal,
  type WeeklyGoalConfig,
} from "../src/features/planning/WeeklyGoals";
import {
  computeSessionTimings,
  sanitizeStudySession,
} from "../src/features/workspace/services/SessionTracker";
import type { WorkspaceStudySession } from "../src/features/workspace/types";
import { STORAGE_DATABASE_VERSION } from "../src/lib/storage/StorageVersion";
import { readIndexedDBStore } from "./helpers/indexed-db";
import { createRealStudy } from "./helpers/real-study";

async function installControllableClock(page: Page, initialIso = "2026-11-18T10:00:00.000Z") {
  await page.addInitScript((startIso: string) => {
    const RealDate = Date;
    const baseMs = RealDate.parse(startIso);
    const STORAGE_KEY = "__studyai_test_clock_offset_ms";
    const startRealMs = RealDate.now();
    const START_KEY = "__studyai_test_clock_real_start";
    if (!sessionStorage.getItem(START_KEY)) {
      sessionStorage.setItem(START_KEY, String(startRealMs));
    }
    const anchorRealMs = Number(sessionStorage.getItem(START_KEY) || startRealMs);

    const readOffset = () => Number(sessionStorage.getItem(STORAGE_KEY) || "0");
    const currentNow = () => baseMs + (RealDate.now() - anchorRealMs) + readOffset();

    const MockDate = function (this: Date, ...args: unknown[]) {
      if (!(this instanceof MockDate)) {
        return new RealDate(currentNow()).toString();
      }
      if (args.length === 0) {
        return new RealDate(currentNow());
      }
      if (args.length === 1) {
        return new RealDate(args[0] as string | number | Date);
      }
      return new RealDate(
        args[0] as number,
        args[1] as number,
        (args[2] as number | undefined) ?? 1,
        (args[3] as number | undefined) ?? 0,
        (args[4] as number | undefined) ?? 0,
        (args[5] as number | undefined) ?? 0,
        (args[6] as number | undefined) ?? 0,
      );
    } as unknown as DateConstructor;

    Object.defineProperty(MockDate, "prototype", { value: RealDate.prototype });
    MockDate.now = () => currentNow();
    MockDate.parse = RealDate.parse.bind(RealDate);
    MockDate.UTC = RealDate.UTC.bind(RealDate);

    Object.defineProperty(window, "Date", {
      configurable: true,
      writable: true,
      value: MockDate,
    });

    (window as unknown as Record<string, unknown>).__advanceTestClock = (ms: number) => {
      const next = readOffset() + ms;
      sessionStorage.setItem(STORAGE_KEY, String(next));
      return currentNow();
    };
  }, initialIso);
}

async function advanceClock(page: Page, ms: number) {
  await page.evaluate((delta) => {
    const fn = (window as unknown as { __advanceTestClock?: (m: number) => number }).__advanceTestClock;
    fn?.(delta);
  }, ms);
}

async function putMetadataRecord(page: Page, record: { key: string; value: unknown; updatedAt: string }) {
  await page.evaluate(
    async ([item, version]) =>
      new Promise<void>((resolve, reject) => {
        const scope = localStorage.getItem("studyai:storage-scope") || "guest";
        const databaseName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
        const request = indexedDB.open(databaseName, version as number);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("metadata", "readwrite");
          transaction.objectStore("metadata").put(item);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    [record, STORAGE_DATABASE_VERSION] as [{ key: string; value: unknown; updatedAt: string }, number],
  );
}

function makeSession(overrides: Partial<WorkspaceStudySession> = {}): WorkspaceStudySession {
  return {
    id: `session-${Math.random().toString(36).slice(2, 8)}`,
    studyId: "study-1",
    userId: "user-a",
    subject: "Matemática",
    studyTitle: "Cálculo I",
    origin: "focus",
    focusMode: false,
    startedAt: "2026-11-18T10:00:00.000Z",
    endedAt: "2026-11-18T10:25:00.000Z",
    status: "completed",
    durationSeconds: 1500,
    focusSeconds: 1500,
    pausedSeconds: 0,
    pausedMs: 0,
    pauseCount: 0,
    fileIds: [],
    tools: ["material", "tutor"],
    updatedAt: "2026-11-18T10:25:00.000Z",
    ...overrides,
  };
}

test.describe("Sprint 58A — Lógica de Cronômetro, Saneamento e Metas Semanais", () => {
  test("calcula tempo efetivo por timestamps excluindo pausas, rejeita corrompidos e deduplica sessões", () => {
    const activeStart = Date.parse("2026-11-18T10:00:00.000Z");
    const session = makeSession({
      status: "paused",
      startedAt: new Date(activeStart).toISOString(),
      endedAt: undefined,
      pausedSeconds: 120,
      pausedMs: 120_000,
      activePauseStartedAt: new Date(activeStart + 720_000).toISOString(), // 10m active + 2m prev pause = 12m elapsed
    });

    // At +17m (720s + 300s paused): total = 1020s, paused = 120 + 300 = 420s, focus = 600s (10 min)
    const pausedTimings = computeSessionTimings(session, activeStart + 1_020_000);
    expect(pausedTimings.durationSeconds).toBe(1020);
    expect(pausedTimings.pausedSeconds).toBe(420);
    expect(pausedTimings.focusSeconds).toBe(600);

    // Corrupted records are safely ignored
    expect(sanitizeStudySession(null)).toBeNull();
    expect(sanitizeStudySession({ id: "", studyId: "x", startedAt: "invalid", status: "active" })).toBeNull();
    expect(sanitizeStudySession({ id: "s1", studyId: "x", startedAt: "2026-11-18T10:00:00Z", status: "hacked" })).toBeNull();
    expect(sanitizeWeeklyGoal({ version: 1, type: "minutes", target: -10 })).toBeNull();
    expect(sanitizeWeeklyGoal({ version: 2, type: "minutes", target: 120 })).toBeNull();
    expect(clampWeeklyGoalTarget("minutes", 99999)).toBe(3600);
    expect(clampWeeklyGoalTarget("sessions", 0)).toBe(1);
  });

  test("contabiliza metas semanais apenas por sessões válidas no fuso local, trata mudança de semana e alteração de meta", () => {
    const wednesday = new Date(2026, 10, 18, 15, 0, 0); // Wed 2026-11-18 local
    const week = getLocalWeekBounds(wednesday);
    expect(week.start.getDay()).toBe(0); // Sunday
    expect(week.endInclusive.getDay()).toBe(6); // Saturday

    const goal: WeeklyGoalConfig = {
      version: 1,
      type: "minutes",
      target: 60,
      userId: "user-a",
      weekKey: week.weekKey,
      createdAt: wednesday.toISOString(),
      updatedAt: wednesday.toISOString(),
    };

    const validSession1 = makeSession({
      id: "s-valid-1",
      userId: "user-a",
      startedAt: new Date(2026, 10, 18, 9, 0, 0).toISOString(),
      endedAt: new Date(2026, 10, 18, 9, 30, 0).toISOString(),
      focusSeconds: 1800, // 30 min
      updatedAt: new Date(2026, 10, 18, 9, 30, 0).toISOString(),
    });
    const duplicateSession1 = { ...validSession1 };
    const cancelledSession = makeSession({
      id: "s-cancelled",
      userId: "user-a",
      status: "cancelled",
      endedAt: new Date(2026, 10, 18, 11, 0, 0).toISOString(),
      focusSeconds: 1800,
    });
    const zeroSession = makeSession({
      id: "s-zero",
      userId: "user-a",
      endedAt: new Date(2026, 10, 18, 12, 0, 0).toISOString(),
      focusSeconds: 2, // < MIN_RECORDED_FOCUS_SECONDS
    });
    const otherUserSession = makeSession({
      id: "s-user-b",
      userId: "user-b",
      endedAt: new Date(2026, 10, 18, 13, 0, 0).toISOString(),
      focusSeconds: 1800,
    });
    const previousWeekSession = makeSession({
      id: "s-prev-week",
      userId: "user-a",
      startedAt: new Date(2026, 10, 14, 10, 0, 0).toISOString(),
      endedAt: new Date(2026, 10, 14, 10, 45, 0).toISOString(), // Saturday before Sunday weekStart
      focusSeconds: 2700,
      updatedAt: new Date(2026, 10, 14, 10, 45, 0).toISOString(),
    });

    const allSessions = [
      validSession1,
      duplicateSession1,
      cancelledSession,
      zeroSession,
      otherUserSession,
      previousWeekSession,
    ];

    const progress = computeWeeklyGoalProgress(goal, allSessions, wednesday, "user-a");
    expect(progress.completedSessions).toBe(1);
    expect(progress.completedMinutes).toBe(30);
    expect(progress.remainingValue).toBe(30);
    expect(progress.percent).toBe(50);

    // Mid-week goal change keeps real progress (30 min) and updates remaining
    const updatedGoal: WeeklyGoalConfig = { ...goal, target: 90 };
    const midWeekProgress = computeWeeklyGoalProgress(updatedGoal, allSessions, wednesday, "user-a");
    expect(midWeekProgress.completedMinutes).toBe(30);
    expect(midWeekProgress.remainingValue).toBe(60);
    expect(midWeekProgress.percent).toBe(33);

    // Switching goal type to sessions counts distinct valid completed sessions
    const sessionsGoal: WeeklyGoalConfig = { ...goal, type: "sessions", target: 3 };
    const sessionsProgress = computeWeeklyGoalProgress(sessionsGoal, allSessions, wednesday, "user-a");
    expect(sessionsProgress.currentValue).toBe(1);
    expect(sessionsProgress.remainingValue).toBe(2);
    expect(sessionsProgress.percent).toBe(33);

    // Next week starts cleanly at 0 progress without deleting historical sessions
    const nextSunday = new Date(2026, 10, 22, 8, 0, 0);
    const nextWeekProgress = computeWeeklyGoalProgress(updatedGoal, allSessions, nextSunday, "user-a");
    expect(nextWeekProgress.completedSessions).toBe(0);
    expect(nextWeekProgress.completedMinutes).toBe(0);
    expect(nextWeekProgress.remainingValue).toBe(90);
  });
});

test.describe("Sprint 58A — Modo Foco e Metas Semanais E2E", () => {
  test("inicia modo foco, pausa sem contar pausa, recupera após reload sem duplicar, finaliza e cancela corretamente", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await installControllableClock(page, "2026-11-18T10:00:00.000Z");
    const studyId = await createRealStudy(page, "Material sobre árvores binárias balanceadas.");
    await page.goto(`/estudo?tema=${studyId}`);

    // 1. Enter focus mode with objective and simplified layout preserving essential tools & navigation
    await page.getByRole("button", { name: "Modo foco" }).click();
    await expect(page.getByText("Modo foco ativo")).toBeVisible();
    await page.getByLabel("Objetivo da sessão de foco").fill("Dominar rotações AVL");
    await page.getByLabel("Objetivo da sessão de foco").press("Enter");
    await expect(page.getByText("Objetivo: Dominar rotações AVL")).toBeVisible();
    // Essential tools & back navigation remain accessible
    await expect(page.getByRole("tab", { name: "Material" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voltar ao Dashboard" })).toBeVisible();

    // 2. Exit focus mode without losing session data, then return to focus mode
    await page.getByRole("button", { name: "Sair do modo foco" }).click();
    await expect(page.getByText("Modo foco ativo")).toHaveCount(0);
    await page.getByRole("button", { name: "Modo foco" }).click();
    await expect(page.getByText("Objetivo: Dominar rotações AVL")).toBeVisible();

    // 3. Advance 10 minutes active -> timer shows 10:00
    await advanceClock(page, 10 * 60_000);
    await expect(page.getByLabel("Tempo de foco")).toHaveText(/10:0[0-5]/, { timeout: 5_000 });

    // 4. Pause -> advance 5 minutes paused -> paused time MUST NOT be counted
    await page.getByRole("button", { name: "Pausar sessão" }).click();
    await expect(page.getByText("Sessão pausada")).toBeVisible();
    await advanceClock(page, 5 * 60_000);
    await expect(page.getByLabel("Tempo de foco")).toHaveText(/10:0[0-5]/);

    // 5. Reload while paused -> restores focus mode, paused state, objective, and NO duplicate sessions
    await page.reload();
    await expect(page.getByText("Sessão pausada")).toBeVisible();
    await expect(page.getByText("Objetivo: Dominar rotações AVL")).toBeVisible();
    await expect(page.getByLabel("Tempo de foco")).toHaveText(/10:0[0-5]/);
    const sessionsAfterReload = await readIndexedDBStore<{ key: string; value: WorkspaceStudySession }>(page, "metadata");
    const studySessions = sessionsAfterReload.filter(
      (entry) => entry.key.startsWith("workspace-session:") && entry.value.studyId === studyId,
    );
    expect(studySessions).toHaveLength(1);

    // 6. Resume -> advance 5 more minutes -> total effective time ~ 15:00
    await page.getByRole("button", { name: "Continuar sessão" }).click();
    await expect(page.getByText("Modo foco ativo")).toBeVisible();
    await advanceClock(page, 5 * 60_000);
    await expect(page.getByLabel("Tempo de foco")).toHaveText(/15:0[0-5]/, { timeout: 5_000 });

    // 7. Finish session -> completed status, recorded in metadata & LearningProfile without duplicates
    await page.getByRole("button", { name: "Encerrar sessão de estudo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sessão concluída" })).toBeVisible();
    await expect(page.getByText(/15:0\d de foco, 1 pausa\(s\)/)).toBeVisible();

    const metadataAfterFinish = await readIndexedDBStore<{ key: string; value: WorkspaceStudySession }>(page, "metadata");
    const completedFocus = metadataAfterFinish.find(
      (entry) => entry.key.startsWith("workspace-session:") && entry.value.studyId === studyId && entry.value.status === "completed",
    );
    expect(completedFocus?.value.origin).toBe("focus");
    expect(completedFocus?.value.focusSeconds).toBeGreaterThanOrEqual(900);
    expect(completedFocus?.value.focusSeconds).toBeLessThan(910);

    // 8. Start second focus session and CANCEL it -> must NOT count toward weekly progress
    await page.getByRole("button", { name: "Iniciar modo foco" }).click();
    await expect(page.getByText("Modo foco ativo")).toBeVisible();
    await advanceClock(page, 10 * 60_000);
    await page.getByRole("button", { name: "Cancelar sessão de foco" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sessão cancelada e não contabilizada" })).toBeVisible();

    // 9. Verify weekly goals integration in /planejamento & /
    await page.goto("/planejamento");
    await expect(page.getByText("Nenhuma meta semanal configurada")).toBeVisible();
    await expect(page.getByText(/Sessões contabilizadas na semana:\s*1\s*\(15 min efetivos\)/)).toBeVisible();

    // Define weekly goal (30 minutes)
    await page.getByRole("button", { name: "Definir meta semanal" }).click();
    await page.getByLabel("Minutos na semana").fill("30");
    await page.getByRole("button", { name: "Salvar meta" }).click();
    await expect(page.getByText("Meta semanal salva.")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Progresso da meta semanal" })).toHaveAttribute("aria-valuenow", "15");
    await expect(page.getByText("50%")).toBeVisible();

    // Open sessions list -> only the 1 completed session is listed, with Modo Foco badge
    await page.getByRole("button", { name: "Ver sessões" }).click();
    await expect(page.getByRole("list", { name: "Sessões contabilizadas nesta semana" }).locator("li")).toHaveCount(1);
    await expect(page.getByText("Dominar rotações AVL")).toBeVisible();

    // 10. Modify goal mid-week -> keeps 15 min real progress, updates remaining & percentage
    await page.getByRole("button", { name: "Alterar meta" }).click();
    await page.getByLabel("Minutos na semana").fill("60");
    await page.getByRole("button", { name: "Salvar meta" }).click();
    await expect(page.getByRole("progressbar", { name: "Progresso da meta semanal" })).toHaveAttribute("aria-valuenow", "15");
    await expect(page.getByText("25%")).toBeVisible();
    await expect(page.getByText("45 min", { exact: true })).toBeVisible();

    // Verify Dashboard also shows compact weekly goal panel
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Meta semanal de estudo" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Progresso da meta semanal" })).toHaveAttribute("aria-valuenow", "15");

    // 11. Advance clock 7 days into next week -> progress resets to 0 while keeping configured 60 min goal
    await advanceClock(page, 7 * 24 * 60 * 60_000);
    await page.reload();
    await expect(page.getByRole("progressbar", { name: "Progresso da meta semanal" })).toHaveAttribute("aria-valuenow", "0");
    await expect(page.getByText("60 min", { exact: true }).first()).toBeVisible();
  });

  test("apresenta escolha segura para recuperação ambígua e trata dados corrompidos", async ({ page }) => {
    const studyId = await createRealStudy(page, "Estudo para validar recuperação ambígua.");
    await page.goto(`/estudo?tema=${studyId}`);
    await expect(page.getByRole("button", { name: "Modo foco" })).toBeVisible();

    // Inject a second unfinished focus session + a corrupted record into IndexedDB
    await putMetadataRecord(page, {
      key: "workspace-session:ambiguous-1",
      value: {
        id: "ambiguous-1",
        studyId,
        origin: "focus",
        focusMode: true,
        studyTitle: "Sessão Pendente Extra",
        subject: "Algoritmos",
        startedAt: "2026-11-18T08:00:00.000Z",
        status: "paused",
        durationSeconds: 300,
        focusSeconds: 300,
        pausedSeconds: 0,
        pausedMs: 0,
        pauseCount: 1,
        activePauseStartedAt: "2026-11-18T08:05:00.000Z",
        fileIds: [],
        tools: ["material"],
        updatedAt: "2026-11-18T08:05:00.000Z",
      },
      updatedAt: "2026-11-18T08:05:00.000Z",
    });
    await putMetadataRecord(page, {
      key: "workspace-session:corrupted-bad",
      value: { id: "corrupted-bad", status: "broken-status", startedAt: "not-a-date" },
      updatedAt: "2026-11-18T08:05:00.000Z",
    });

    await page.reload();
    const recovery = page.getByRole("region", { name: "Recuperação de sessão anterior" });
    await expect(recovery).toBeVisible();
    await expect(recovery.getByText("Múltiplas sessões pendentes encontradas")).toBeVisible();

    await recovery.getByRole("button", { name: "Descartar e iniciar nova" }).click();
    await expect(recovery).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Modo foco" })).toBeVisible();
  });

  test("isola sessões, cronômetro e metas semanais entre contas e mantém responsividade mobile com teclado", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await installControllableClock(page, "2026-11-18T10:00:00.000Z");
    const emailA = `focus-a-${Date.now()}@example.com`;
    const emailB = `focus-b-${Date.now()}@example.com`;
    const password = "StudyAI2026secure";

    // Register Account A
    await page.goto("/conta");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByLabel("Nome").fill("Conta Focus A");
    await page.getByLabel("Email").fill(emailA);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    const studyA = await createRealStudy(page, "Conteúdo privado da Conta A.");
    await page.goto(`/estudo?tema=${studyA}`);
    await page.getByRole("button", { name: "Modo foco" }).click();
    await advanceClock(page, 10 * 60_000);
    await page.getByRole("button", { name: "Encerrar sessão de estudo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sessão concluída" })).toBeVisible();

    await page.goto("/planejamento");
    await page.getByRole("button", { name: "Definir meta semanal" }).click();
    await page.getByLabel("Minutos na semana").fill("120");
    await page.getByRole("button", { name: "Salvar meta" }).click();
    await expect(page.getByRole("progressbar", { name: "Progresso da meta semanal" })).toHaveAttribute("aria-valuenow", "10");

    // Logout Account A & register Account B
    await page.goto("/conta");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByLabel("Nome").fill("Conta Focus B");
    await page.getByLabel("Email").fill(emailB);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    // Account B sees NO goals and NO sessions from Account A
    await page.goto("/planejamento");
    await expect(page.getByText("Nenhuma meta semanal configurada")).toBeVisible();
    await expect(page.getByText(/Sessões contabilizadas na semana:\s*0/)).toBeVisible();

    // Mobile layout + reduced-motion + keyboard check on StudyWorkspace Focus Mode & Planning
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 360, height: 844 });
    await page.goto("/planejamento");
    const planningOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(planningOverflow).toBe(false);

    const studyB = await createRealStudy(page, "Conteúdo da Conta B.");
    await page.goto(`/estudo?tema=${studyB}`);
    const focusButton = page.getByRole("button", { name: "Modo foco" });
    await focusButton.focus();
    await focusButton.press("Enter");
    await expect(page.getByText("Modo foco ativo")).toBeVisible();

    const studyOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(studyOverflow).toBe(false);
  });
});
