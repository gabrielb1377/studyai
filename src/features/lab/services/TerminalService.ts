import type { VirtualTerminalState } from "../types";

function normalize(path: string) {
  const segments = path.split("/");
  const result: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") result.pop();
    else result.push(segment.replace(/[^a-zA-Z0-9._-]/g, ""));
  }
  return `/${result.join("/")}` || "/";
}

function resolve(cwd: string, target = "") {
  return normalize(target.startsWith("/") ? target : `${cwd}/${target}`);
}

export const TerminalService = {
  initial(): VirtualTerminalState {
    return { cwd: "/workspace", directories: ["/", "/workspace"], files: { "/workspace/README.md": "# StudyAI Lab\nAmbiente virtual seguro." }, history: [] };
  },

  execute(state: VirtualTerminalState, raw: string): VirtualTerminalState {
    const command = raw.trim();
    if (!command) return state;
    const [name, ...args] = command.split(/\s+/);
    const next = { ...state, directories: [...state.directories], files: { ...state.files } };
    let output = "";
    if (name === "pwd") output = state.cwd;
    else if (name === "ls") {
      const target = resolve(state.cwd, args[0]);
      const prefix = target === "/" ? "/" : `${target}/`;
      const names = new Set<string>();
      state.directories.forEach((path) => { if (path.startsWith(prefix)) { const part = path.slice(prefix.length).split("/")[0]; if (part) names.add(`${part}/`); } });
      Object.keys(state.files).forEach((path) => { if (path.startsWith(prefix)) { const part = path.slice(prefix.length).split("/")[0]; if (part) names.add(part); } });
      output = [...names].sort().join("  ");
    } else if (name === "cd") {
      const target = resolve(state.cwd, args[0] ?? "/workspace");
      if (!state.directories.includes(target)) output = `cd: diretório não encontrado: ${args[0] ?? ""}`;
      else next.cwd = target;
    } else if (name === "mkdir") {
      if (!args[0]) output = "mkdir: informe um nome";
      else { const target = resolve(state.cwd, args[0]); next.directories = Array.from(new Set([...next.directories, target])); }
    } else if (name === "touch") {
      if (!args[0]) output = "touch: informe um arquivo";
      else next.files[resolve(state.cwd, args[0])] ??= "";
    } else if (name === "cat") {
      if (!args[0]) output = "cat: informe um arquivo";
      else { const target = resolve(state.cwd, args[0]); output = state.files[target] ?? `cat: arquivo não encontrado: ${args[0]}`; }
    } else if (name === "clear") {
      next.history = [];
      return next;
    } else output = `${name}: comando indisponível no terminal simulado`;
    next.history = [...next.history, { id: `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, command, output, createdAt: new Date().toISOString() }].slice(-100);
    return next;
  },
};
