import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const assets = {
  "core.js": {
    path: ["tesseract.js-core", "tesseract-core-lstm.wasm.js"],
    type: "text/javascript; charset=utf-8",
  },
  worker: {
    path: ["tesseract.js", "dist", "worker.min.js"],
    type: "text/javascript; charset=utf-8",
  },
} as const;

type Asset = keyof typeof assets;

function isAsset(value: string): value is Asset {
  return value in assets;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ asset: string }> },
) {
  const { asset } = await context.params;
  if (!isAsset(asset)) {
    return NextResponse.json({ error: "Ativo de OCR não encontrado." }, { status: 404 });
  }

  try {
    const definition = assets[asset];
    const data = await readFile(join(process.cwd(), "node_modules", ...definition.path));
    return new Response(data, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": definition.type,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Ativo de OCR indisponível." },
      { status: 500 },
    );
  }
}
