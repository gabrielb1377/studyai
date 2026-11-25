import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("feedback preserva conteúdo e anuncia somente quando solicitado", () => {
  const source = `import React from "react"; import {renderToStaticMarkup} from "react-dom/server";
    import {Feedback} from "./src/components/ui/feedback.tsx";
    for (const variant of ["info","success","warning","error"]) {
      console.log(renderToStaticMarkup(React.createElement(Feedback,{variant,title:"Aviso",description:"Detalhes",role:"status"},React.createElement("button",null,"Continuar"))));
    }
    console.log(renderToStaticMarkup(React.createElement(Feedback,{variant:"error"},"Erro")));`;
  const lines = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], { encoding: "utf8" }).trim().split("\n");
  expect(lines).toHaveLength(5);
  for (const line of lines.slice(0, 4)) {
    expect(line).toContain('role="status"');
    expect(line).toContain("Aviso");
    expect(line).toContain("Detalhes");
    expect(line).toContain("Continuar");
    expect(line).toContain('aria-hidden="true"');
  }
  expect(lines[4]).not.toContain('role="alert"');
});
