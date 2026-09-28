import { validateExecutableCode } from "../validators/lab-validation";
import type { LabExecutionResult, LabLanguage } from "../types";

function result(status: LabExecutionResult["status"], started: number, output: string[], error?: string): LabExecutionResult {
  return { status, output, error, durationMs: Math.round(performance.now() - started), createdAt: new Date().toISOString() };
}

export const SafeExecutionService = {
  async run(language: LabLanguage, code: string, timeoutMs = 2_000): Promise<LabExecutionResult> {
    const started = performance.now();
    const invalid = validateExecutableCode(language, code);
    if (invalid) return result("error", started, [], invalid);
    if (language === "typescript") return result("unsupported", started, [], "TypeScript possui editor e preview, mas a execução requer compilação e está desativada nesta versão.");
    if (language === "python") return result("unsupported", started, [], "Python está preparado no contrato do Lab, mas não executa código nesta versão.");
    if (language !== "javascript") return result("unsupported", started, [], "Use o preview ou o executor específico deste modo.");

    return new Promise((resolve) => {
      const workerSource = `
for(const capability of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','indexedDB','caches']){try{Object.defineProperty(self,capability,{value:undefined,writable:false,configurable:false})}catch{self[capability]=undefined}}
try{Object.defineProperty(navigator,'storage',{value:undefined,writable:false,configurable:false})}catch{}
const output=[];
const show=(value)=>{try{return typeof value==='string'?value:JSON.stringify(value)}catch{return String(value)}};
console.log=(...values)=>output.push(values.map(show).join(' '));
console.error=(...values)=>output.push(values.map(show).join(' '));
try {
  const value=(()=>{${code}\n})();
  if(value!==undefined)output.push(show(value));
  self.postMessage({ok:true,output});
} catch(error) {
  self.postMessage({ok:false,output,error:String(error&&error.message||error)});
}`;
      const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
      const worker = new Worker(workerUrl);
      const cleanup = () => { worker.terminate(); URL.revokeObjectURL(workerUrl); clearTimeout(timer); };
      worker.onmessage = (event: MessageEvent<{ ok: boolean; output?: string[]; error?: string }>) => {
        cleanup();
        const data = event.data;
        resolve(result(data.ok ? "success" : "error", started, data.output ?? [], data.error));
      };
      worker.onerror = (event) => {
        cleanup();
        resolve(result("error", started, [], event.message || "Erro de execução."));
      };
      const timer = globalThis.setTimeout(() => { cleanup(); resolve(result("error", started, [], "Execução interrompida após 2 segundos.")); }, timeoutMs);
    });
  },
};
