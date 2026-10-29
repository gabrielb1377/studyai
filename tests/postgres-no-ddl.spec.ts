import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const testRequire = createRequire(__filename);

test("consulta de arquivo pela API não inicializa ou altera o esquema", async () => {
  const statements: string[] = [];
  const pool = {
    query: async (sql: string) => {
      statements.push(sql);
      return { rows: [{ id: "file", name: "file.txt", mime_type: "text/plain", hash: "abc", size_bytes: 3, content: Buffer.from("abc"), updated_at: new Date() }] };
    },
  };
  const load = (file: string, dependencies: Record<string, unknown>) => {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const compiledModule = { exports: {} };
    const fakeRequire = (id: string) => id in dependencies ? dependencies[id] : testRequire(id);
    const context = vm.createContext({ module: compiledModule, exports: compiledModule.exports, require: fakeRequire, Buffer, Date, Response, performance, process: { env: { DATABASE_URL: "postgres://mock.invalid/test", NODE_ENV: "test" } } });
    vm.runInContext(js, context, { filename: file });
    return compiledModule.exports as Record<string, unknown>;
  };
  const postgres = load("src/server/database/Postgres.ts", { "server-only": {}, pg: { Pool: class { constructor() { return pool; } } } });
  const cloud = load("src/server/cloud/CloudDatabase.ts", { "server-only": {}, "@/server/database/Postgres": postgres, "@/server/storage/ObjectStorage": { ObjectStorage: {} } });
  const route = load("src/app/api/files/[id]/route.ts", {
    "@/server/cloud/CloudDatabase": cloud,
    "@/server/auth/http": { requireUser: () => ({ sub: "user" }), apiError: (error: unknown) => { throw error; } },
    "@/server/security/Crypto": {},
    "@/server/security/RateLimit": {},
  });
  const response = await (route.GET as (request: Request, params: unknown) => Promise<Response>)(new Request("http://localhost/api/files/file"), { params: Promise.resolve({ id: "file" }) });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("abc");
  expect(statements).toHaveLength(1);
  expect(statements[0]).toMatch(/^SELECT .* FROM files WHERE user_id=\$1 AND id=\$2/i);
  expect(statements.join(" ")).not.toMatch(/\b(CREATE|ALTER|DROP)\b/i);
});
