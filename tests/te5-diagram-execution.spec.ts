import { expect, test } from "@playwright/test";
import { GET as getJsWorkerRoute } from "../src/app/api/lab/js-worker/route";
import { SessionOperationManager } from "../src/features/account/SessionOperationManager";
import { isSkillsEnabled, SkillRegistry } from "../src/features/ai/skills";
import {
  DIAGRAM_TOOL_MAX_NODES,
  DIAGRAM_TOOL_MAX_SOURCE_CHARS,
  JS_EXECUTION_MAX_CODE_CHARS,
  ToolConfirmationService,
  ToolGateway,
  ToolRegistry,
  ToolTurnManager,
  defaultToolGateway,
  isToolsEnabled,
  setJsExecutionRunnerForTesting,
  setToolsEnabledForTesting,
  type DiagramToolOutput,
  type JsExecutionToolOutput,
  type ToolAuditEvent,
  type ToolTrustedContext,
} from "../src/features/ai/tools";
import {
  HARDENED_JS_WORKER_CSP,
  buildHardenedWorkerBootstrapScript,
} from "../src/features/lab/services/SafeExecutionService";

function makeCtx(overrides: Partial<ToolTrustedContext> = {}): ToolTrustedContext {
  return {
    userId: "account-te5-a",
    sessionId: "sess-te5-a",
    turnId: "turn-te5-1",
    skillId: "cs.algorithms", // allowedTools: ["js_execution", "diagram"]
    grantedScopes: ["account", "study"],
    grantedPermissions: ["read", "transform", "execution"],
    ...overrides,
  };
}

test.afterEach(() => {
  setToolsEnabledForTesting(null);
  setJsExecutionRunnerForTesting(null);
  SessionOperationManager.beginTransition();
});

test.describe("TE-5: Catálogo Final da Onda 3, Flags e Revisão Diferencial TE-4", () => {
  test("registra exatamente 10 ferramentas canônicas, preserva 33 skills, mantém flags desligadas e limpa confirmações expiradas sem permitir reuso", async () => {
    expect(isToolsEnabled()).toBe(false);
    expect(isSkillsEnabled()).toBe(false);
    expect(SkillRegistry.list().length).toBe(33);
    expect(ToolRegistry.size()).toBe(10);
    expect(ToolRegistry.list().map((t) => t.id)).toEqual([
      "calculator",
      "library",
      "performance",
      "errors",
      "doc_reader",
      "flashcards",
      "quiz",
      "plan",
      "diagram",
      "js_execution",
    ]);
    expect(ToolRegistry.has("audio")).toBe(false);

    // Flags desligadas bloqueiam diagram e js_execution
    SessionOperationManager.activate("account-te5-a");
    for (const tool of ["diagram", "js_execution"] as const) {
      const denied = await defaultToolGateway.execute(
        JSON.stringify({
          tool,
          args: tool === "diagram" ? { format: "mermaid", source: "flowchart TD\nA-->B" } : { code: "return 1+1;" },
        }),
        makeCtx({ turnId: `t-off-${tool}` }),
      );
      expect(denied.ok).toBe(false);
      expect(denied.denialReason).toBe("tools_disabled");
    }

    // Revisão TE-4: limpeza de confirmações expiradas e sessões encerradas sem permitir replay
    const tm = new ToolTurnManager();
    const t0 = Date.parse("2026-11-26T12:00:00.000Z");
    tm.markConfirmationUsed("u1", "s1", "t1", "conf-exp-1", t0 + 60_000);
    expect(tm.isConfirmationUsed("u1", "s1", "t1", "conf-exp-1", t0 + 30_000)).toBe(true);
    expect(tm.pruneExpiredConfirmations(t0 + 120_000)).toBe(1);
    tm.retireAndResetSession("s1");

    const confSvc = new ToolConfirmationService({ nowMs: () => t0 });
    const prop = confSvc.createProposal({
      toolId: "flashcards",
      toolVersion: "0.1.0",
      userId: "account-te5-a",
      sessionId: "sess-te5-a",
      turnId: "t-prune",
      destination: "flashcards:s1",
      canonicalArgs: { mode: "prepare" },
      preview: { count: 1 },
      payload: { cards: [] },
      ttlMs: 10_000,
      nowMs: t0,
    });
    expect(confSvc.pruneExpiredProposals(t0 + 20_000)).toBe(1);
    expect(confSvc.getPreview(prop.proposalId, { userId: "account-te5-a", sessionId: "sess-te5-a", nowMs: t0 })).toBeNull();
  });
});

test.describe("TE-5: Ferramenta diagram (Estrutural, Segurança Mermaid e Fallback)", () => {
  test("renderiza diagramas Mermaid e estruturados seguros, bloqueia ataques ativos/diretivas/URLs/complexidade e respeita sessão e autorização", async () => {
    setToolsEnabledForTesting(true);
    const auditEvents: ToolAuditEvent[] = [];
    const gateway = new ToolGateway({
      registry: ToolRegistry,
      turnManager: new ToolTurnManager(),
      auditSink: (e) => auditEvents.push(e),
    });

    SessionOperationManager.activate("account-te5-a");

    // 1. Diagrama Mermaid válido (via explain.multimodal)
    const validMermaid = await gateway.execute(
      JSON.stringify({
        tool: "diagram",
        args: {
          format: "mermaid",
          title: "Busca Binária",
          source: "flowchart TD\nA[Início] --> B{Meio == Alvo?}\nB -->|Sim| C((Encontrado))\nB -->|Não| D[Dividir intervalo]",
        },
      }),
      makeCtx({ skillId: "explain.multimodal", grantedPermissions: ["transform"], turnId: "t-diag-1" }),
    );
    expect(validMermaid.ok).toBe(true);
    const mOut = validMermaid.output as unknown as DiagramToolOutput;
    expect(mOut.status).toBe("rendered_svg");
    expect(mOut.svgValidated).toBe(true);
    expect(mOut.nodeCount).toBe(4);
    expect(mOut.edgeCount).toBe(3);
    expect(mOut.svg).toContain("<svg");
    expect(mOut.svg).toContain("</svg>");
    expect(mOut.textualFallback).toContain("Busca Binária");
    expect(validMermaid.wrappedOutput).toContain("<UNTRUSTED_MATERIAL_DATA>");

    // 2. Diagrama estruturado válido (tipo mindmap)
    const validStructured = await gateway.execute(
      JSON.stringify({
        tool: "diagram",
        args: {
          format: "structured",
          type: "mindmap",
          direction: "LR",
          title: "Estruturas de Dados",
          nodes: [
            { id: "root", label: "Estruturas", shape: "rounded" },
            { id: "tree", label: "Árvores AVL", shape: "box" },
            { id: "hash", label: "Tabela Hash", shape: "box" },
          ],
          edges: [
            { from: "root", to: "tree", label: "ordenado" },
            { from: "root", to: "hash", label: "O(1)" },
          ],
        },
      }),
      makeCtx({ skillId: "cs.algorithms", grantedPermissions: ["transform"], turnId: "t-diag-2" }),
    );
    expect(validStructured.ok).toBe(true);
    expect((validStructured.output as unknown as DiagramToolOutput).status).toBe("rendered_svg");

    // 3. Tipo não suportado -> fallback textual seguro
    const unsupportedType = await gateway.execute(
      JSON.stringify({
        tool: "diagram",
        args: {
          format: "structured",
          type: "gantt_arbitrary",
          title: "Tipo Inválido",
          nodes: [{ id: "a", label: "A" }],
          edges: [],
        },
      }),
      makeCtx({ turnId: "t-diag-type" }),
    );
    expect(unsupportedType.ok).toBe(true);
    expect((unsupportedType.output as unknown as DiagramToolOutput).status).toBe("fallback_text");

    // 4. Ataques bloqueados com fallback textual (diretivas Mermaid init, click/callback, HTML/script, URL externa, handler inline)
    const maliciousSources = [
      '%%{init: {"securityLevel": "loose"}}%%\nflowchart TD\nA-->B',
      'flowchart TD\nA[Início]-->B[Fim]\nclick A "javascript:alert(1)"',
      "flowchart TD\nA[<script>alert(1)</script>]-->B[Fim]",
      "flowchart TD\nA[<img src=x onerror=alert(1)>]-->B[Fim]",
      "flowchart TD\nA[Veja https://evil.test/payload.js]-->B[Fim]",
      "flowchart TD\nA[Ok]-->B[Fim]\nclassDef x fill:url(https://evil.test/a.svg)",
    ];
    for (let i = 0; i < maliciousSources.length; i += 1) {
      const res = await gateway.execute(
        JSON.stringify({
          tool: "diagram",
          args: { format: "mermaid", title: "Teste Segurança", source: maliciousSources[i] },
        }),
        makeCtx({ turnId: `t-diag-mal-${i}` }),
      );
      expect(res.ok).toBe(true);
      const out = res.output as unknown as DiagramToolOutput;
      expect(out.status).toBe("fallback_text");
      expect(out.svgValidated).toBe(false);
      expect(out.svg).toBeUndefined();
      expect(out.issues.length).toBeGreaterThan(0);
    }

    // 5. Excesso de complexidade (>25 nós) e entrada excessiva bloqueados
    const tooManyNodes = Array.from({ length: DIAGRAM_TOOL_MAX_NODES + 3 }, (_, idx) => `N${idx}[No ${idx}]`).join("\n");
    const complexRes = await gateway.execute(
      JSON.stringify({
        tool: "diagram",
        args: { format: "mermaid", title: "Complexo", source: `flowchart TD\n${tooManyNodes}` },
      }),
      makeCtx({ turnId: "t-diag-complex" }),
    );
    expect(complexRes.ok).toBe(true);
    expect((complexRes.output as unknown as DiagramToolOutput).status).toBe("fallback_text");

    const hugeSource = await gateway.execute(
      JSON.stringify({
        tool: "diagram",
        args: { format: "mermaid", source: `flowchart TD\nA[${"x".repeat(DIAGRAM_TOOL_MAX_SOURCE_CHARS + 50)}]` },
      }),
      makeCtx({ turnId: "t-diag-huge" }),
    );
    expect(hugeSource.ok).toBe(false);
    expect(hugeSource.denialReason).toBe("invalid_arguments");

    // 6. Skill sem autorização ('tutor.beginner') recusada
    const unauthSkill = await gateway.execute(
      JSON.stringify({ tool: "diagram", args: { format: "mermaid", source: "flowchart TD\nA-->B" } }),
      makeCtx({ skillId: "tutor.beginner", turnId: "t-diag-unauth" }),
    );
    expect(unauthSkill.ok).toBe(false);
    expect(unauthSkill.denialReason).toBe("tool_not_authorized_for_skill");

    // 7. Sessão suspensa/trocada -> session_changed
    SessionOperationManager.beginTransition();
    const suspended = await gateway.execute(
      JSON.stringify({ tool: "diagram", args: { format: "mermaid", source: "flowchart TD\nA-->B" } }),
      makeCtx({ turnId: "t-diag-susp" }),
    );
    expect(suspended.ok).toBe(false);
    expect(suspended.denialReason).toBe("session_changed");

    // 8. Auditoria sanitizada sem conteúdo bruto do aluno
    const auditJson = JSON.stringify(auditEvents);
    expect(auditJson).not.toContain("Busca Binária");
    expect(auditJson).not.toContain("alert(1)");
  });
});

test.describe("TE-5: Ferramenta js_execution (Gateway, Contratos, Sessão e Auditoria)", () => {
  test("diferencia ambiente sem Worker (wasExecuted=false), aplica validação estática, limites de turno, cancelamento A->B e auditoria sanitizada", async () => {
    setToolsEnabledForTesting(true);
    const auditEvents: ToolAuditEvent[] = [];
    const gateway = new ToolGateway({
      registry: ToolRegistry,
      turnManager: new ToolTurnManager(),
      auditSink: (e) => auditEvents.push(e),
    });

    SessionOperationManager.activate("account-te5-a");

    // 1. No servidor/Node (sem Web Worker), NUNCA alega wasExecuted=true
    const noWorkerEnv = await gateway.execute(
      JSON.stringify({ tool: "js_execution", args: { code: "return 2 + 2;" } }),
      makeCtx({ skillId: "code.teaching", grantedPermissions: ["execution"], turnId: "t-js-env" }),
    );
    expect(noWorkerEnv.ok).toBe(true);
    const envOut = noWorkerEnv.output as unknown as JsExecutionToolOutput;
    expect(envOut.executionState).toBe("unavailable_in_environment");
    expect(envOut.wasExecuted).toBe(false);
    expect(envOut.deterministicResult).toBe(false);

    // 2. Código com API proibida (fetch / indexedDB / Worker) rejeitado estaticamente com wasExecuted=false
    const staticBlocked = await gateway.execute(
      JSON.stringify({ tool: "js_execution", args: { code: "return fetch('https://evil.test');" } }),
      makeCtx({ skillId: "code.teaching", grantedPermissions: ["execution"], turnId: "t-js-static" }),
    );
    expect(staticBlocked.ok).toBe(true);
    const statOut = staticBlocked.output as unknown as JsExecutionToolOutput;
    expect(statOut.executionState).toBe("static_rejected");
    expect(statOut.wasExecuted).toBe(false);

    // 3. Código excessivamente longo bloqueado no esquema
    const tooLong = await gateway.execute(
      JSON.stringify({ tool: "js_execution", args: { code: "a".repeat(JS_EXECUTION_MAX_CODE_CHARS + 20) } }),
      makeCtx({ skillId: "code.teaching", grantedPermissions: ["execution"], turnId: "t-js-long" }),
    );
    expect(tooLong.ok).toBe(false);
    expect(tooLong.denialReason).toBe("invalid_arguments");

    // 4. Skill sem autorização ('tutor.beginner') e falta de permissão 'execution' bloqueadas
    const wrongSkill = await gateway.execute(
      JSON.stringify({ tool: "js_execution", args: { code: "return 1;" } }),
      makeCtx({ skillId: "tutor.beginner", grantedPermissions: ["execution"], turnId: "t-js-sk" }),
    );
    expect(wrongSkill.denialReason).toBe("tool_not_authorized_for_skill");

    const noExecPerm = await gateway.execute(
      JSON.stringify({ tool: "js_execution", args: { code: "return 1;" } }),
      makeCtx({ skillId: "code.teaching", grantedPermissions: ["read", "transform"], turnId: "t-js-perm" }),
    );
    expect(noExecPerm.denialReason).toBe("permission_denied");

    // 5. Runner controlado verificando propagação de AbortSignal em troca A->B e limite de 2 chamadas/turno
    let abortObserved = false;
    setJsExecutionRunnerForTesting(async (code, options) => {
      if (code.includes("SWITCH_SESSION")) {
        await new Promise<void>((resolve) => {
          options.signal?.addEventListener(
            "abort",
            () => {
              abortObserved = true;
              resolve();
            },
            { once: true },
          );
          setTimeout(() => {
            SessionOperationManager.activate("account-te5-b");
          }, 10);
        });
      }
      return {
        status: "success",
        wasExecuted: true,
        staticRejected: false,
        unavailableInEnvironment: false,
        workerTerminated: true,
        timedOut: false,
        cancelled: abortObserved,
        truncated: false,
        output: ["ok"],
        durationMs: 5,
        createdAt: new Date().toISOString(),
      };
    });

    const switched = await gateway.execute(
      JSON.stringify({ tool: "js_execution", args: { code: "/* SWITCH_SESSION */ return 1;" } }),
      makeCtx({ skillId: "code.teaching", grantedPermissions: ["execution"], turnId: "t-js-switch" }),
    );
    expect(abortObserved).toBe(true);
    expect(switched.ok).toBe(false);
    expect(switched.denialReason).toBe("session_changed");
    expect(switched.output).toBeUndefined();

    // Limite maxCallsPerTurn=2 para js_execution
    SessionOperationManager.activate("account-te5-a");
    const c1 = await gateway.execute(
      JSON.stringify({ tool: "js_execution", args: { code: "return 10;" } }),
      makeCtx({ skillId: "code.teaching", grantedPermissions: ["execution"], turnId: "t-js-cap" }),
    );
    const c2 = await gateway.execute(
      JSON.stringify({ tool: "js_execution", args: { code: "return 20;" } }),
      makeCtx({ skillId: "code.teaching", grantedPermissions: ["execution"], turnId: "t-js-cap" }),
    );
    const c3 = await gateway.execute(
      JSON.stringify({ tool: "js_execution", args: { code: "return 30;" } }),
      makeCtx({ skillId: "code.teaching", grantedPermissions: ["execution"], turnId: "t-js-cap" }),
    );
    expect(c1.ok && c2.ok).toBe(true);
    expect(c3.ok).toBe(false);
    expect(c3.denialReason).toBe("turn_limit_exceeded");

    // Auditoria sanitizada: nunca contém o código do estudante
    const auditJson = JSON.stringify(auditEvents);
    expect(auditJson).not.toContain("SWITCH_SESSION");
    expect(auditJson).not.toContain("evil.test");
  });
});

test.describe("TE-5: Evidência Real em Navegador Chromium (Worker Real + CSP HTTP + Renderizador SVG Real)", () => {
  test("valida cabeçalho CSP real de /api/lab/js-worker, isolamento real de rede/storages/timeout/flood/cancelamento no Worker e renderização SVG segura no DOM", async ({
    page,
  }) => {
    // 1. Confirma que a rota real `/api/lab/js-worker` serve o CSP estrito sem rede e sem workers aninhados
    const routeRes = await getJsWorkerRoute();
    expect(routeRes.status).toBe(200);
    const cspHeader = routeRes.headers.get("content-security-policy") ?? "";
    expect(cspHeader).toBe(HARDENED_JS_WORKER_CSP);
    expect(cspHeader).toContain("default-src 'none'");
    expect(cspHeader).toContain("connect-src 'none'");
    expect(cspHeader).toContain("worker-src 'none'");
    expect(cspHeader).toContain("child-src 'none'");
    const workerScriptBody = await routeRes.text();
    expect(workerScriptBody).toBe(buildHardenedWorkerBootstrapScript());

    // 2. Gera SVG real pela ferramenta `diagram` para validar no DOM real do Chromium
    setToolsEnabledForTesting(true);
    SessionOperationManager.activate("account-browser-a");
    const gateway = new ToolGateway({ registry: ToolRegistry, turnManager: new ToolTurnManager() });
    const diagRes = await gateway.execute(
      JSON.stringify({
        tool: "diagram",
        args: {
          format: "mermaid",
          title: "Fluxo Seguro TE-5",
          source: "flowchart TD\nA[Entrada] --> B[Validação] --> C[Saída Segura]",
        },
      }),
      makeCtx({ userId: "account-browser-a", skillId: "explain.multimodal", grantedPermissions: ["transform"], turnId: "t-dom-1" }),
    );
    expect(diagRes.ok).toBe(true);
    const safeSvg = (diagRes.output as unknown as DiagramToolOutput).svg!;

    // 3. Intercepta TODAS as requisições de rede no Chromium para comprovar zero vazamento de rede
    const observedNetworkUrls: string[] = [];
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url === "http://studyai-sandbox.local/") {
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><html><body><div id="svg-host"></div><script>window.__xssTriggered = false;</script></body></html>`,
        });
        return;
      }
      if (url === "http://studyai-sandbox.local/api/lab/js-worker") {
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Content-Security-Policy": cspHeader,
            "X-Content-Type-Options": "nosniff",
          },
          body: workerScriptBody,
        });
        return;
      }
      observedNetworkUrls.push(url);
      await route.abort("blockedbyclient");
    });

    await page.goto("http://studyai-sandbox.local/");

    // 4. Renderização real do SVG no DOM do Chromium: zero scripts, zero elementos ativos, zero rede externa
    const svgAudit = await page.evaluate((svgMarkup) => {
      const host = document.getElementById("svg-host")!;
      host.innerHTML = svgMarkup;
      const svgEl = host.querySelector("svg");
      const forbiddenEls = host.querySelectorAll("script, foreignObject, iframe, object, embed, image, a, link, style");
      const allEls = Array.from(host.querySelectorAll("*"));
      const hasEventAttr = allEls.some((el) =>
        Array.from(el.attributes).some((attr) => /^on/i.test(attr.name) || /javascript:/i.test(attr.value)),
      );
      return {
        hasSvg: Boolean(svgEl),
        forbiddenCount: forbiddenEls.length,
        hasEventAttr,
        xssTriggered: Boolean((window as unknown as { __xssTriggered?: boolean }).__xssTriggered),
      };
    }, safeSvg);
    expect(svgAudit).toEqual({
      hasSvg: true,
      forbiddenCount: 0,
      hasEventAttr: false,
      xssTriggered: false,
    });

    // 5. Execução no Web Worker REAL do Chromium (/api/lab/js-worker com CSP HTTP real!)
    const workerResults = await page.evaluate(async () => {
      const runInRealWorker = (
        code: string,
        timeoutMs = 1500,
        abortAfterMs?: number,
      ): Promise<{
        ok: boolean;
        output: string[];
        truncated: boolean;
        error?: string;
        timedOut: boolean;
        cancelled: boolean;
        messagesReceived: number;
        elapsedMs: number;
      }> =>
        new Promise((resolve) => {
          const started = performance.now();
          const worker = new Worker("http://studyai-sandbox.local/api/lab/js-worker");
          let settled = false;
          let messagesReceived = 0;

          const done = (res: {
            ok: boolean;
            output: string[];
            truncated: boolean;
            error?: string;
            timedOut: boolean;
            cancelled: boolean;
          }) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (abortTimer) clearTimeout(abortTimer);
            worker.terminate();
            resolve({
              ...res,
              messagesReceived,
              elapsedMs: Math.round(performance.now() - started),
            });
          };

          const timer = setTimeout(() => {
            done({ ok: false, output: [], truncated: false, error: "timeout", timedOut: true, cancelled: false });
          }, timeoutMs);

          const abortTimer =
            abortAfterMs !== undefined
              ? setTimeout(() => {
                  done({ ok: false, output: [], truncated: false, error: "cancelled", timedOut: false, cancelled: true });
                }, abortAfterMs)
              : undefined;

          worker.onmessage = (ev) => {
            messagesReceived += 1;
            const d = ev.data || {};
            done({
              ok: d.ok === true,
              output: Array.isArray(d.output) ? d.output : [],
              truncated: Boolean(d.truncated),
              error: d.error,
              timedOut: false,
              cancelled: false,
            });
          };
          worker.onerror = (ev) => {
            done({
              ok: false,
              output: [],
              truncated: false,
              error: ev.message || "worker_error",
              timedOut: false,
              cancelled: false,
            });
          };
          worker.postMessage({ code, maxOutputLines: 40, maxLineChars: 400, maxOutputBytes: 4096 });
        });

      const legit = await runInRealWorker("const nums = [1, 2, 3, 4]; console.log('soma=', nums.reduce((a,b)=>a+b, 0)); return nums.length * 10;");
      const syntaxErr = await runInRealWorker("function broken( {");
      const runtimeErr = await runInRealWorker("throw new Error('falha controlada');");
      const infiniteLoop = await runInRealWorker("while (true) {}", 350);
      const afterTimeout = await runInRealWorker("return 7 * 6;");
      const cancelledMidFlight = await runInRealWorker("while (true) {}", 2000, 120);
      const excessiveOutput = await runInRealWorker("for (let i = 0; i < 120; i++) console.log('linha-' + i + '-' + 'x'.repeat(120));");
      const floodPostMessage = await runInRealWorker(`
        const g = Function('return this')();
        const pmType = typeof g.postMessage;
        let threw = false;
        try { for (let i = 0; i < 50; i++) g.postMessage({ ok: true, output: ['spoof'] }); } catch { threw = true; }
        return JSON.stringify({ pmType, threw });
      `);

      // Acesso direto E indireto (via cadeia de protótipos + Function('return this')()) a rede, storages e workers
      const sandboxProbe = await runInRealWorker(`
        const g = Function('return this')();
        const proto1 = Object.getPrototypeOf(g);
        const proto2 = proto1 ? Object.getPrototypeOf(proto1) : null;
        const nav = g.navigator;
        const navProto = nav ? Object.getPrototypeOf(nav) : null;
        const results = {
          fetchDirect: typeof g['fe' + 'tch'],
          fetchProto1: proto1 ? typeof proto1['fe' + 'tch'] : 'none',
          fetchProto2: proto2 ? typeof proto2['fe' + 'tch'] : 'none',
          xhr: typeof g['XMLHttp' + 'Request'],
          ws: typeof g['Web' + 'Socket'],
          es: typeof g['Event' + 'Source'],
          importScripts: typeof g['import' + 'Scripts'],
          indexedDB: typeof g['indexed' + 'DB'],
          indexedDBProto: proto2 ? typeof proto2['indexed' + 'DB'] : 'none',
          caches: typeof g['cac' + 'hes'],
          worker: typeof g['Wor' + 'ker'],
          broadcast: typeof g['Broadcast' + 'Channel'],
          cookieStore: typeof g['cookie' + 'Store'],
          navStorage: nav ? typeof nav['stor' + 'age'] : 'none',
          navStorageProto: navProto ? typeof navProto['stor' + 'age'] : 'none',
          navBeacon: nav ? typeof nav['send' + 'Beacon'] : 'none',
          navLocks: nav ? typeof nav['lo' + 'cks'] : 'none',
        };
        for (const [k, v] of Object.entries(results)) {
          console.log(k + '=' + v);
        }
      `);

      // Tentativa de dynamic import() externo/mesma-origem bloqueada pelo CSP (script-src 'unsafe-eval' sem 'self' nem https:)
      const dynamicImportBlocked = await runInRealWorker(`
        try {
          const p = import('http://studyai-sandbox.local/api/secret-data');
          return 'import_started';
        } catch (e) {
          return 'sync_blocked';
        }
      `);

      // Isolamento de estado entre execuções (Conta A define variável -> Conta B não enxerga)
      await runInRealWorker("var leakedSecret = 'SEGREDO_CONTA_A';");
      const crossRunState = await runInRealWorker("return typeof leakedSecret;");

      return {
        legit,
        syntaxErr,
        runtimeErr,
        infiniteLoop,
        afterTimeout,
        cancelledMidFlight,
        excessiveOutput,
        floodPostMessage,
        sandboxProbe,
        dynamicImportBlocked,
        crossRunState,
      };
    });

    // Verificações rigorosas do Worker real
    expect(workerResults.legit.ok).toBe(true);
    expect(workerResults.legit.output).toEqual(["soma= 10", "40"]);
    expect(workerResults.legit.messagesReceived).toBe(1);

    expect(workerResults.syntaxErr.ok).toBe(false);
    expect(workerResults.runtimeErr.ok).toBe(false);
    expect(workerResults.runtimeErr.error).toContain("falha controlada");

    // Timeout encerra o Worker real e a execução seguinte responde normalmente
    expect(workerResults.infiniteLoop.timedOut).toBe(true);
    expect(workerResults.afterTimeout.ok).toBe(true);
    expect(workerResults.afterTimeout.output).toEqual(["42"]);

    // Cancelamento interrompe bem antes do timeout de 2000ms
    expect(workerResults.cancelledMidFlight.cancelled).toBe(true);
    expect(workerResults.cancelledMidFlight.elapsedMs).toBeLessThan(1200);

    // Saída excessiva truncada dentro dos limites
    expect(workerResults.excessiveOutput.ok).toBe(true);
    expect(workerResults.excessiveOutput.truncated).toBe(true);
    expect(workerResults.excessiveOutput.output.length).toBeLessThanOrEqual(40);
    expect(workerResults.excessiveOutput.output.join("").length).toBeLessThanOrEqual(4096);

    // Flood / spoofing de postMessage bloqueado (apenas 1 mensagem privada recebida)
    expect(workerResults.floodPostMessage.ok).toBe(true);
    expect(workerResults.floodPostMessage.messagesReceived).toBe(1);
    expect(JSON.parse(workerResults.floodPostMessage.output[0]!)).toEqual({
      pmType: "undefined",
      threw: true,
    });

    // TODAS as APIs de rede, storages, credenciais e workers são `undefined` (acesso direto E via cadeia de protótipos!)
    expect(workerResults.sandboxProbe.ok).toBe(true);
    expect(workerResults.sandboxProbe.output.length).toBe(17);
    for (const entry of workerResults.sandboxProbe.output) {
      const [key, val] = entry.split("=");
      expect(val, `API proibida exposta no Worker real: ${key}=${String(val)}`).toBe("undefined");
    }

    // Isolamento de estado entre execuções (A -> B)
    expect(workerResults.crossRunState.ok).toBe(true);
    expect(workerResults.crossRunState.output).toEqual(["undefined"]);

    // ZERO requisições de rede externas ou para /api/secret-data chegaram à camada de rede do Chromium!
    expect(observedNetworkUrls).toEqual([]);
  });
});
