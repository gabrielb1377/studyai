import { expect, test } from "@playwright/test";
import { SessionOperationManager } from "../src/features/account/SessionOperationManager";
import { AnalyticsEngine } from "../src/features/analytics/AnalyticsEngine";
import {
  computeBreakdownChartLayout,
  computePeriodChartLayout,
  computeRetentionChartLayout,
  formatMinutesExact,
  formatMinutesShort,
  formatPercent,
} from "../src/features/analytics/charts/chartScale";
import { KnowledgeEngine } from "../src/features/learning/KnowledgeEngine";
import { createEmptyLearningProfile } from "../src/features/learning/LearningStorage";
import type { LearningProfile } from "../src/features/learning/types";
import { STORAGE_DATABASE_VERSION } from "../src/lib/storage/StorageVersion";
import type { Flashcard } from "../src/types/flashcard";
import type { QuizResult } from "../src/types/quiz";
import type { StudyRecord } from "../src/types/study-engine";
import { createRealStudy } from "./helpers/real-study";

const FIXED_NOW = new Date("2026-11-26T15:00:00.000Z");

function assertAllNumbersFinite(obj: unknown, path = "root"): void {
  if (typeof obj === "number") {
    expect(Number.isFinite(obj), `Número não finito em ${path}: ${String(obj)}`).toBe(true);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => assertAllNumbersFinite(item, `${path}[${idx}]`));
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      assertAllNumbersFinite(v, `${path}.${k}`);
    }
  }
}

test.describe("MM-1: Escalas SVG, Paridade com AnalyticsEngine e Isolamento A→B", () => {
  test.afterEach(() => {
    AnalyticsEngine.clearCache();
    SessionOperationManager.beginTransition();
  });

  test("garante escalas matemáticas válidas para séries vazias, zeros, valores iguais, extremos e entradas NaN/Infinity", () => {
    // 1. Série vazia -> no_data
    const emptyPeriod = computePeriodChartLayout([], "Evolução semanal");
    expect(emptyPeriod.dataStatus).toBe("no_data");
    expect(emptyPeriod.bars).toHaveLength(0);
    assertAllNumbersFinite(emptyPeriod);

    const emptyBreakdown = computeBreakdownChartLayout([], "Tempo por matéria");
    expect(emptyBreakdown.dataStatus).toBe("no_data");
    assertAllNumbersFinite(emptyBreakdown);

    const emptyRetention = computeRetentionChartLayout([], "Por matéria");
    expect(emptyRetention.dataStatus).toBe("no_data");
    assertAllNumbersFinite(emptyRetention);

    // 2. Série com todos os valores zero -> zero_values (diferente de no_data!)
    const zeroPeriod = computePeriodChartLayout(
      [
        { key: "2026-11-10", label: "10/11", minutes: 0, activities: 0 },
        { key: "2026-11-17", label: "17/11", minutes: 0, activities: 0 },
      ],
      "Evolução semanal",
    );
    expect(zeroPeriod.dataStatus).toBe("zero_values");
    expect(zeroPeriod.bars.every((b) => b.isZero && b.height === 0)).toBe(true);
    expect(zeroPeriod.peakKey).toBeNull();
    assertAllNumbersFinite(zeroPeriod);

    // 3. Valores iguais não nulos -> escala válida sem divisão por zero
    const equalPeriod = computePeriodChartLayout(
      [
        { key: "2026-11-10", label: "10/11", minutes: 45, activities: 2 },
        { key: "2026-11-17", label: "17/11", minutes: 45, activities: 2 },
        { key: "2026-11-24", label: "24/11", minutes: 45, activities: 2 },
      ],
      "Evolução semanal",
    );
    expect(equalPeriod.dataStatus).toBe("has_data");
    expect(equalPeriod.domainMax).toBeGreaterThan(45);
    expect(equalPeriod.bars.every((b) => b.height > 10)).toBe(true);
    assertAllNumbersFinite(equalPeriod);

    // 4. Valores extremos e entrada corrompida (NaN / Infinity / negativo) -> zero NaN/Infinity
    const extremePeriod = computePeriodChartLayout(
      [
        { key: "k1", label: "S1", minutes: 0, activities: 0 },
        { key: "k2", label: "S2", minutes: 1, activities: 1 },
        { key: "k3", label: "S3", minutes: 1_000_000, activities: 500 },
        { key: "k4", label: "S4", minutes: Number.NaN, activities: Number.POSITIVE_INFINITY },
        { key: "k5", label: "S5", minutes: -50, activities: -3 },
      ],
      "Evolução extrema",
    );
    expect(extremePeriod.dataStatus).toBe("has_data");
    expect(extremePeriod.bars[1]!.height).toBeGreaterThanOrEqual(4); // barra pequena permanece visível
    expect(extremePeriod.bars[3]!.minutes).toBe(0);
    expect(extremePeriod.bars[4]!.minutes).toBe(0);
    assertAllNumbersFinite(extremePeriod);

    // 5. Formatação pt-BR determinística
    expect(formatMinutesExact(0)).toBe("0 min");
    expect(formatMinutesExact(45)).toBe("45 min");
    expect(formatMinutesShort(90)).toBe("1,5 h");
    expect(formatPercent(120)).toBe("100%");
    expect(formatPercent(Number.NaN)).toBe("0%");
  });

  test("mantém paridade exata entre AnalyticsEngine, layouts SVG e isolamento A→B", () => {
    const studyA: StudyRecord = {
      studyId: "study-mm1-a",
      title: "Algoritmos Avançados",
      subject: "Computação A",
      materialIds: ["mat-a"],
      status: "in_progress",
      progress: 60,
      readingTimeMinutes: 100,
      createdAt: "2026-11-01T10:00:00.000Z",
      updatedAt: FIXED_NOW.toISOString(),
      lastAccessedAt: FIXED_NOW.toISOString(),
    };
    const profileA: LearningProfile = {
      ...createEmptyLearningProfile("2026-11-01T10:00:00.000Z"),
      totalStudyMinutes: 120,
      timeBySubject: { "Computação A": 120 },
      topics: {
        [studyA.studyId]: {
          studyId: studyA.studyId,
          subject: "Computação A",
          topic: "Algoritmos Avançados",
          timeMinutes: 120,
          flashcardsAnswered: 6,
          quizzesCompleted: 1,
          correctAnswers: 5,
          wrongAnswers: 1,
          accessDates: ["2026-11-26"],
          lastAccessedAt: FIXED_NOW.toISOString(),
        },
      },
      activities: [
        {
          id: "act-a-1",
          type: "reading",
          studyId: studyA.studyId,
          subject: "Computação A",
          topic: "Algoritmos Avançados",
          occurredAt: FIXED_NOW.toISOString(),
          durationMinutes: 120,
          correctAnswers: 0,
          wrongAnswers: 0,
        },
      ],
      updatedAt: FIXED_NOW.toISOString(),
    };
    const cardA: Flashcard = {
      id: "fc-a",
      studyId: studyA.studyId,
      question: "Complexidade de merge sort?",
      answer: "O(n log n)",
      difficulty: "medium",
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      correctAnswers: 5,
      wrongAnswers: 1,
    };
    const quizA: QuizResult = {
      id: "qz-a",
      studyId: studyA.studyId,
      questionIds: ["q1"],
      correctAnswers: 4,
      wrongAnswers: 1,
      score: 80,
      createdAt: FIXED_NOW.toISOString(),
      completedAt: FIXED_NOW.toISOString(),
    };

    SessionOperationManager.activate("account-mm1-a");
    const knowledgeA = [KnowledgeEngine.calculate(studyA, profileA, [cardA], [quizA], FIXED_NOW)];
    const snapA = AnalyticsEngine.build({
      accountId: "account-mm1-a",
      studies: [studyA],
      profile: profileA,
      knowledge: knowledgeA,
      flashcards: [cardA],
      quizzes: [quizA],
      graphs: [],
      now: FIXED_NOW,
    });

    const periodLayoutA = computePeriodChartLayout(snapA.weekly, "Evolução semanal");
    const breakdownLayoutA = computeBreakdownChartLayout(snapA.timeBySubject, "Tempo por matéria");
    const retentionLayoutA = computeRetentionChartLayout(
      snapA.retention.filter((r) => r.scope === "subject"),
      "Por matéria",
    );

    expect(periodLayoutA.totalMinutes).toBe(120);
    expect(periodLayoutA.bars.at(-1)?.minutes).toBe(snapA.weekly.at(-1)?.minutes);
    expect(breakdownLayoutA.rows[0]?.label).toBe("Computação A");
    expect(breakdownLayoutA.rows[0]?.minutes).toBe(120);
    expect(retentionLayoutA.rows[0]?.label).toBe("Computação A");
    expect(retentionLayoutA.rows[0]?.natureLabel).toBe("Indicador observado");

    // Troca A -> B: nenhum dado de A vaza para B
    SessionOperationManager.activate("account-mm1-b");
    const studyB: StudyRecord = { ...studyA, studyId: "study-mm1-b", title: "Genética B", subject: "Biologia B" };
    const profileB: LearningProfile = {
      ...createEmptyLearningProfile("2026-11-01T10:00:00.000Z"),
      totalStudyMinutes: 30,
      timeBySubject: { "Biologia B": 30 },
      topics: {
        [studyB.studyId]: {
          studyId: studyB.studyId,
          subject: "Biologia B",
          topic: "Genética B",
          timeMinutes: 30,
          flashcardsAnswered: 0,
          quizzesCompleted: 0,
          correctAnswers: 0,
          wrongAnswers: 0,
          accessDates: ["2026-11-26"],
          lastAccessedAt: FIXED_NOW.toISOString(),
        },
      },
      activities: [
        {
          id: "act-b-1",
          type: "reading",
          studyId: studyB.studyId,
          subject: "Biologia B",
          topic: "Genética B",
          occurredAt: FIXED_NOW.toISOString(),
          durationMinutes: 30,
          correctAnswers: 0,
          wrongAnswers: 0,
        },
      ],
      updatedAt: FIXED_NOW.toISOString(),
    };
    const snapB = AnalyticsEngine.build({
      accountId: "account-mm1-b",
      studies: [studyB],
      profile: profileB,
      knowledge: [KnowledgeEngine.calculate(studyB, profileB, [], [], FIXED_NOW)],
      flashcards: [],
      quizzes: [],
      graphs: [],
      now: FIXED_NOW,
    });
    const breakdownLayoutB = computeBreakdownChartLayout(snapB.timeBySubject, "Tempo por matéria");
    expect(breakdownLayoutB.rows.map((r) => r.label)).toEqual(["Biologia B"]);
    expect(JSON.stringify(breakdownLayoutB)).not.toContain("Computação A");
  });
});

test.describe("MM-1: Navegador Real — SVG Acessível, Teclado, Tabela Equivalente, Temas, Responsividade e A→B", () => {
  test("renderiza gráficos SVG sem NaN/Infinity, navega por teclado, alterna tabela equivalente, suporta dark mode, mobile sem overflow e isolamento A→B", async ({
    page,
    baseURL,
  }) => {
    test.skip(!baseURL, "Requer servidor da aplicação (playwright.config.ts).");

    const studyId = await createRealStudy(page);
    await page.evaluate(
      async ({ id, version }) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("studyai-db", version);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        const timestamp = new Date().toISOString();
        const value = {
          id: "local-user",
          totalStudyMinutes: 75,
          timeBySubject: { Algoritmos: 75 },
          topics: {
            [id]: {
              studyId: id,
              subject: "Algoritmos",
              topic: "Estruturas de dados",
              timeMinutes: 75,
              flashcardsAnswered: 4,
              quizzesCompleted: 1,
              correctAnswers: 4,
              wrongAnswers: 1,
              accessDates: [timestamp.slice(0, 10)],
              lastAccessedAt: timestamp,
            },
          },
          flashcardsAnswered: 4,
          quizzesCompleted: 1,
          correctAnswers: 4,
          wrongAnswers: 1,
          averageScore: 80,
          activeDates: [timestamp.slice(0, 10)],
          lastAccessedAt: timestamp,
          streak: 1,
          activities: [
            {
              id: "mm1-reading-1",
              type: "reading",
              studyId: id,
              subject: "Algoritmos",
              topic: "Estruturas de dados",
              occurredAt: timestamp,
              durationMinutes: 75,
              correctAnswers: 0,
              wrongAnswers: 0,
            },
          ],
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction("metadata", "readwrite");
          tx.objectStore("metadata").put({
            key: "learning-profile:v1",
            value,
            updatedAt: timestamp,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        database.close();
      },
      { id: studyId, version: STORAGE_DATABASE_VERSION },
    );

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Analytics de aprendizagem" })).toBeVisible();

    // 1. Verifica SVGs reais com role="img", <title>, <desc> e ZERO NaN/Infinity em atributos
    const weeklySvg = page.locator('svg[role="img"]').filter({ has: page.locator("title", { hasText: "Gráfico: Evolução semanal" }) });
    await expect(weeklySvg).toBeVisible();
    await expect(weeklySvg.locator("desc")).toContainText("75 min");

    const svgHealth = await page.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll('section[aria-labelledby="analytics-title"] svg[role="img"]'));
      const invalidAttrs: string[] = [];
      let decorativeFocusable = 0;
      for (const svg of svgs) {
        const all = [svg, ...Array.from(svg.querySelectorAll("*"))];
        for (const el of all) {
          for (const attr of Array.from(el.attributes)) {
            if (/\b(?:NaN|Infinity)\b/.test(attr.value)) {
              invalidAttrs.push(`${el.tagName}@${attr.name}=${attr.value}`);
            }
          }
          if (el.getAttribute("aria-hidden") === "true" && el.getAttribute("tabindex") === "0") {
            decorativeFocusable += 1;
          }
        }
      }
      return { svgCount: svgs.length, invalidAttrs, decorativeFocusable };
    });
    expect(svgHealth.svgCount).toBeGreaterThanOrEqual(3);
    expect(svgHealth.invalidAttrs).toEqual([]);
    expect(svgHealth.decorativeFocusable).toBe(0);

    // 2. Navegação por teclado nos pontos do gráfico SVG (ArrowLeft / Home / End)
    const activeBar = weeklySvg.locator('g[role="button"][tabindex="0"]').first();
    await activeBar.focus();
    await expect(activeBar).toBeFocused();
    const initialLabel = await activeBar.getAttribute("aria-label");
    await page.keyboard.press("ArrowLeft");
    const nextActiveBar = weeklySvg.locator('g[role="button"][tabindex="0"]').first();
    await expect(nextActiveBar).toBeFocused();
    const movedLabel = await nextActiveBar.getAttribute("aria-label");
    expect(movedLabel).not.toBe(initialLabel);

    // 3. Tabela equivalente acessível e visível ao acionar botão por teclado
    const toggleBtn = page
      .locator("section[aria-labelledby='analytics-title'] button", { hasText: "Ver tabela" })
      .first();
    const controlsId = await toggleBtn.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    const stableToggleBtn = page.locator(`button[aria-controls="${controlsId}"]`);
    await stableToggleBtn.focus();
    await page.keyboard.press("Enter");
    await expect(stableToggleBtn).toHaveAttribute("aria-expanded", "true");
    await expect(stableToggleBtn).toContainText("Ocultar tabela");

    const equivTable = page.getByRole("table", { name: "Tabela equivalente: Evolução semanal" });
    await expect(equivTable).toBeVisible();
    await expect(equivTable).toContainText("75 min");
    await expect(equivTable).toContainText("Observado");

    // 4. Aba Retenção: gráfico SVG + tabela equivalente + marcador de confiança
    await page.getByRole("tab", { name: "Retenção" }).click();
    const retentionSvg = page.locator('svg[role="img"]').filter({ has: page.locator("title", { hasText: "Retenção Por matéria" }) });
    await expect(retentionSvg).toBeVisible();
    await expect(page.getByText("Barra = Retenção (%) · Losango (◆) = Confiança (%)").first()).toBeVisible();

    // 5. Tema escuro (dark mode) e reduced-motion mantêm SVGs legíveis sem quebrar layout
    await page.getByRole("tab", { name: "Visão geral" }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const darkColors = await weeklySvg.evaluate((svg) => {
      const style = window.getComputedStyle(svg);
      return { color: style.color };
    });
    expect(darkColors.color).toMatch(/^rgba?\(|^oklch\(/);

    // 6. Responsividade em 320, 360, 390, 768 e 1280px (tabela fechada E aberta) — zero overflow global
    for (const width of [320, 360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 780 });
      const overflowClosed = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(
        overflowClosed.scrollWidth,
        `Overflow horizontal detectado com tabela fechada em ${width}px`,
      ).toBeLessThanOrEqual(overflowClosed.innerWidth + 1);
    }

    // Abre a tabela equivalente na aba Visão geral (remount pós-troca de aba gera novo aria-controls)
    await page.setViewportSize({ width: 360, height: 780 });
    const freshToggleBtn = page
      .locator("section[aria-labelledby='analytics-title'] button", { hasText: "Ver tabela" })
      .first();
    const freshControlsId = await freshToggleBtn.getAttribute("aria-controls");
    expect(freshControlsId).toBeTruthy();
    const openToggleBtn = page.locator(`button[aria-controls="${freshControlsId}"]`);
    await openToggleBtn.click();
    await expect(openToggleBtn).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("table", { name: "Tabela equivalente: Evolução semanal" })).toBeVisible();

    for (const width of [320, 360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 780 });
      const overflowOpen = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(
        overflowOpen.scrollWidth,
        `Overflow horizontal detectado com tabela aberta em ${width}px`,
      ).toBeLessThanOrEqual(overflowOpen.innerWidth + 1);
    }

    // Fecha a tabela em 360px e confirma retorno limpo ao estado recolhido
    await page.setViewportSize({ width: 360, height: 780 });
    await openToggleBtn.click();
    await expect(openToggleBtn).toHaveAttribute("aria-expanded", "false");

    // Restaura tema claro e desktop para validar isolamento real na UI (Conta A -> Conta B)
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.setViewportSize({ width: 1280, height: 800 });

    // 7. Isolamento real na UI: substitui escopo local por dados exclusivos da Conta B e dispara scopeChanged
    await page.evaluate(
      async ({ version }) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("studyai-db", version);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        const ts = new Date().toISOString();
        const studyB = {
          studyId: "study-mm1-ui-b",
          title: "Genética Molecular B",
          subject: "Biologia B",
          materialIds: ["mat-b-1"],
          status: "in_progress",
          progress: 50,
          readingTimeMinutes: 60,
          createdAt: ts,
          updatedAt: ts,
          lastAccessedAt: ts,
        };
        const profileB = {
          id: "local-user",
          totalStudyMinutes: 30,
          timeBySubject: { "Biologia B": 30 },
          topics: {
            [studyB.studyId]: {
              studyId: studyB.studyId,
              subject: "Biologia B",
              topic: "Genética Molecular B",
              timeMinutes: 30,
              flashcardsAnswered: 0,
              quizzesCompleted: 0,
              correctAnswers: 0,
              wrongAnswers: 0,
              accessDates: [ts.slice(0, 10)],
              lastAccessedAt: ts,
            },
          },
          flashcardsAnswered: 0,
          quizzesCompleted: 0,
          correctAnswers: 0,
          wrongAnswers: 0,
          averageScore: 0,
          activeDates: [ts.slice(0, 10)],
          lastAccessedAt: ts,
          streak: 1,
          activities: [
            {
              id: "mm1-reading-b",
              type: "reading",
              studyId: studyB.studyId,
              subject: "Biologia B",
              topic: "Genética Molecular B",
              occurredAt: ts,
              durationMinutes: 30,
              correctAnswers: 0,
              wrongAnswers: 0,
            },
          ],
          createdAt: ts,
          updatedAt: ts,
        };
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction(["studies", "metadata"], "readwrite");
          tx.objectStore("studies").clear();
          tx.objectStore("studies").put(studyB);
          tx.objectStore("metadata").put({
            key: "learning-profile:v1",
            value: profileB,
            updatedAt: ts,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        database.close();
        window.dispatchEvent(
          new CustomEvent("studyai:storage-updated", { detail: { scopeChanged: true } }),
        );
      },
      { version: STORAGE_DATABASE_VERSION },
    );

    await page.reload();
    await expect(page.getByRole("heading", { name: "Analytics de aprendizagem" })).toBeVisible();
    const subjectTableAfterSwitch = page.getByRole("table", {
      name: "Tabela equivalente: Tempo por matéria",
    });
    await expect(subjectTableAfterSwitch).toContainText("Biologia B");
    await expect(subjectTableAfterSwitch).toContainText("30 min");
    await expect(subjectTableAfterSwitch).not.toContainText("Algoritmos");
  });
});
