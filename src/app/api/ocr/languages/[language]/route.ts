import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const languagePackages = {
  eng: "@tesseract.js-data/eng",
  por: "@tesseract.js-data/por",
} as const;

type Language = keyof typeof languagePackages;

function isLanguage(value: string): value is Language {
  return value in languagePackages;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ language: string }> },
) {
  const { language: fileName } = await context.params;
  const language = fileName.replace(/\.traineddata\.gz$/, "");
  if (!isLanguage(language)) {
    return NextResponse.json({ error: "Idioma de OCR não suportado." }, { status: 404 });
  }

  try {
    const dataPath = join(
      process.cwd(),
      "node_modules",
      languagePackages[language],
      "4.0.0_best_int",
      `${language}.traineddata.gz`,
    );
    const data = await readFile(dataPath);
    return new Response(data, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Encoding": "gzip",
        "Content-Type": "application/octet-stream",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Dados de idioma do OCR indisponíveis." },
      { status: 500 },
    );
  }
}
