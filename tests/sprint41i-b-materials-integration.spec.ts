import { test } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

type SessionState = { userId?: string; generation: number; suspended: boolean };
type ExamRecord = {
  id: string;
  studyId?: string;
  title: string;
  materialIds: string[];
  updatedAt: string;
};
type ExamInput = Omit<ExamRecord, "id" | "updatedAt"> & {
  discipline: string;
  examDate: string;
  subjects: Array<{ id: string; name: string; priority: "high" | "medium" | "low"; completed: boolean }>;
  dailyMinutes: number;
};
type Catalog = {
  materialIds: readonly string[];
  isComplete: boolean;
  userId: string;
  generation: number;
};
type ExamServiceApi = {
  load(): ExamRecord[];
  save(exams: readonly ExamRecord[]): void;
  create(data: ExamInput): ExamRecord;
  pruneOrphanMaterials(catalog: Catalog): ExamRecord[] | null;
};

const sharedStore = new Map<string, string>();
let writes = 0;
let events = 0;
const localStorageMock = {
  getItem: (key: string) => sharedStore.get(key) ?? null,
  setItem: (key: string, value: string) => { writes += 1; sharedStore.set(key, value); },
  removeItem: (key: string) => sharedStore.delete(key),
  clear: () => sharedStore.clear(),
  get length() { return sharedStore.size; },
  key: (index: number) => [...sharedStore.keys()][index] ?? null,
} as unknown as Storage;
const windowMock = { dispatchEvent: () => { events += 1; } };

function resetStorage() {
  sharedStore.clear();
  writes = 0;
  events = 0;
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function loadExamService(session: SessionState): ExamServiceApi {
  const source = readFileSync(path.join(process.cwd(), "src/features/exam/ExamService.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(output, {
    module: compiled,
    exports: compiled.exports,
    require: (id: string) => {
      if (id === "@/features/account/SessionOperationManager") {
        return { SessionOperationManager: { current: () => ({ ...session }) } };
      }
      if (id === "@/features/learning/adaptive/AdaptiveAssessmentEngine") {
        return { AdaptiveAssessmentEngine: {} };
      }
      throw new Error(`Dependência inesperada: ${id}`);
    },
    localStorage: localStorageMock,
    window: windowMock,
    Event,
    crypto,
    Date,
    JSON,
    Math,
    Object,
    Set,
  });
  return compiled.exports.ExamService as ExamServiceApi;
}

function examInput(overrides: Partial<ExamInput> = {}): ExamInput {
  return {
    title: "Prova Final",
    discipline: "Cálculo",
    examDate: "2026-12-01",
    subjects: [{ id: "s1", name: "Derivadas", priority: "high", completed: false }],
    materialIds: [],
    studyId: undefined,
    dailyMinutes: 60,
    ...overrides,
  };
}

test.describe("Integração de estudos e materiais — Sprint 41I.B.1", () => {
  test("1. cria prova com materiais e estudo vinculados", () => {
    resetStorage();
    const session = { userId: "user-a", generation: 1, suspended: false };
    const service = loadExamService(session);
    const exam = service.create(examInput({ materialIds: ["mat-1", "mat-2"], studyId: "study-1" }));
    assert.deepEqual(plain(exam.materialIds), ["mat-1", "mat-2"]);
    assert.equal(exam.studyId, "study-1");
  });

  test("2. preserva vínculos após save e reload", () => {
    resetStorage();
    const service = loadExamService({ userId: "user-a", generation: 1, suspended: false });
    service.save([service.create(examInput({ materialIds: ["mat-1"], studyId: "study-x" }))]);
    const reloaded = service.load();
    assert.equal(reloaded.length, 1);
    assert.deepEqual(plain(reloaded[0].materialIds), ["mat-1"]);
    assert.equal(reloaded[0].studyId, "study-x");
  });

  test("3. isola a troca A → B → A", () => {
    resetStorage();
    const session: SessionState = { userId: "user-a", generation: 1, suspended: false };
    const service = loadExamService(session);
    service.save([service.create(examInput({ title: "Prova A", materialIds: ["mat-a"] }))]);
    session.userId = "user-b";
    session.generation = 2;
    service.save([service.create(examInput({ title: "Prova B", materialIds: ["mat-b"] }))]);
    assert.deepEqual(plain(service.load()[0].materialIds), ["mat-b"]);
    session.userId = "user-a";
    session.generation = 3;
    assert.deepEqual(plain(service.load()[0].materialIds), ["mat-a"]);
  });

  test("4. remove referência somente após catálogo completo confirmar exclusão", () => {
    resetStorage();
    const session = { userId: "user-a", generation: 1, suspended: false };
    const service = loadExamService(session);
    service.save([service.create(examInput({ materialIds: ["mat-ok", "mat-removido"] }))]);
    const cleaned = service.pruneOrphanMaterials({
      materialIds: ["mat-ok"], isComplete: true, userId: "user-a", generation: 1,
    });
    assert.ok(cleaned);
    assert.deepEqual(plain(service.load()[0].materialIds), ["mat-ok"]);
  });

  test("5. usa identidade offline-session sem acessar a conta autenticada", () => {
    resetStorage();
    const session: SessionState = { userId: "user-a", generation: 1, suspended: false };
    const service = loadExamService(session);
    service.save([service.create(examInput({ title: "Privada A", materialIds: ["mat-a"] }))]);
    session.userId = "offline-session";
    session.generation = 2;
    assert.deepEqual(plain(service.load()), []);
    service.save([service.create(examInput({ title: "Offline", materialIds: ["mat-offline"] }))]);
    assert.deepEqual(plain(service.load()[0].materialIds), ["mat-offline"]);
    session.userId = "user-a";
    session.generation = 3;
    assert.deepEqual(plain(service.load()[0].materialIds), ["mat-a"]);
  });

  test("6. persiste edição de vínculos", () => {
    resetStorage();
    const service = loadExamService({ userId: "user-a", generation: 1, suspended: false });
    const exam = service.create(examInput({ materialIds: ["mat-1"] }));
    service.save([exam]);
    service.save([{ ...exam, materialIds: ["mat-1", "mat-2"] }]);
    assert.deepEqual(plain(service.load()[0].materialIds), ["mat-1", "mat-2"]);
    service.save([{ ...service.load()[0], materialIds: ["mat-2"] }]);
    assert.deepEqual(plain(service.load()[0].materialIds), ["mat-2"]);
  });

  test("7. preserva vínculos quando a Biblioteca falha ou ainda está carregando", () => {
    resetStorage();
    const service = loadExamService({ userId: "user-a", generation: 1, suspended: false });
    service.save([service.create(examInput({ materialIds: ["mat-1"] }))]);
    const before = sharedStore.get("studyai:exams:user-a");
    assert.equal(service.pruneOrphanMaterials({
      materialIds: [], isComplete: false, userId: "user-a", generation: 1,
    }), null);
    assert.equal(sharedStore.get("studyai:exams:user-a"), before);
    assert.deepEqual(plain(service.load()[0].materialIds), ["mat-1"]);
  });

  test("8. ignora resultado atrasado após troca de conta", () => {
    resetStorage();
    const session: SessionState = { userId: "user-a", generation: 1, suspended: false };
    const service = loadExamService(session);
    service.save([service.create(examInput({ materialIds: ["mat-a"] }))]);
    const staleCatalog: Catalog = { materialIds: [], isComplete: true, userId: "user-a", generation: 1 };
    session.suspended = true;
    session.generation = 2;
    assert.equal(service.pruneOrphanMaterials(staleCatalog), null);
    session.userId = "user-b";
    session.generation = 3;
    session.suspended = false;
    service.save([service.create(examInput({ materialIds: ["mat-b"] }))]);
    assert.equal(service.pruneOrphanMaterials(staleCatalog), null);
    assert.deepEqual(plain(service.load()[0].materialIds), ["mat-b"]);
    session.userId = "user-a";
    session.generation = 4;
    assert.deepEqual(plain(service.load()[0].materialIds), ["mat-a"]);
  });

  test("9. preserva studyId quando o estudo fica excluído ou inacessível", () => {
    resetStorage();
    const service = loadExamService({ userId: "user-a", generation: 1, suspended: false });
    service.save([service.create(examInput({ studyId: "study-excluido", materialIds: ["mat-1"] }))]);
    service.pruneOrphanMaterials({
      materialIds: ["mat-1"], isComplete: true, userId: "user-a", generation: 1,
    });
    assert.equal(service.load()[0].studyId, "study-excluido");
  });

  test("10. normaliza IDs duplicados e evita gravação redundante", () => {
    resetStorage();
    const service = loadExamService({ userId: "user-a", generation: 1, suspended: false });
    const exam = service.create(examInput({ materialIds: ["mat-1", "mat-1", "mat-2"] }));
    assert.deepEqual(plain(exam.materialIds), ["mat-1", "mat-2"]);
    service.save([exam]);
    const writesAfterFirstSave = writes;
    const eventsAfterFirstSave = events;
    service.save(service.load());
    assert.equal(writes, writesAfterFirstSave);
    assert.equal(events, eventsAfterFirstSave);
  });
});
