import { inflateSync } from "node:zlib";

/**
 * Extrai o texto bruto dos fluxos de conteúdo de um PDF.
 *
 * Serve para validar estruturalmente os artefatos gerados pelo Academy
 * Studio (título, acentos, tabelas e blocos de código) sem depender de
 * renderização gráfica nem de programas externos.
 *
 * O pdf-lib grava o texto em hexadecimal na codificação WinAnsi (um byte por
 * caractere), portanto cada par de dígitos hexadecimais corresponde a um
 * caractere.
 */

function decodeHex(value: string): string {
  const hex = value.replace(/\s+/g, "");
  let decoded = "";
  for (let index = 0; index + 1 < hex.length; index += 2) {
    const byte = parseInt(hex.slice(index, index + 2), 16);
    decoded += Number.isNaN(byte) ? "?" : String.fromCharCode(byte);
  }
  return decoded;
}

function decodeStream(dictionary: string, data: Buffer): string {
  if (!dictionary.includes("FlateDecode")) return data.toString("latin1");
  try {
    return inflateSync(data).toString("latin1");
  } catch {
    return data.toString("latin1");
  }
}

function contentStreams(buffer: Buffer): string[] {
  const raw = buffer.toString("latin1");
  const streams: string[] = [];
  const objectPattern = /(\d+) 0 obj/g;
  let match = objectPattern.exec(raw);
  while (match) {
    const start = match.index;
    const slice = raw.slice(start, start + 1_200);
    const streamIndex = slice.indexOf("stream");
    if (streamIndex !== -1) {
      const dictionary = slice.slice(0, streamIndex);
      let dataStart = start + streamIndex + 6;
      if (buffer[dataStart] === 0x0d) dataStart += 1;
      if (buffer[dataStart] === 0x0a) dataStart += 1;
      const end = buffer.indexOf(Buffer.from("endstream"), dataStart);
      if (end !== -1) {
        const decoded = decodeStream(dictionary, buffer.slice(dataStart, end));
        if (decoded.includes("Tj") || decoded.includes("TJ")) streams.push(decoded);
      }
    }
    match = objectPattern.exec(raw);
  }
  return streams;
}

function decodeTextOperators(content: string): string {
  const pieces: string[] = [];
  const hexPattern = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  const literalPattern = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  const arrayPattern = /\[((?:[^\][]|\\.)*)\]\s*TJ/g;

  let match = hexPattern.exec(content);
  while (match) {
    pieces.push(decodeHex(match[1]));
    match = hexPattern.exec(content);
  }

  match = literalPattern.exec(content);
  while (match) {
    pieces.push(match[1].replace(/\\([()\\])/g, "$1"));
    match = literalPattern.exec(content);
  }

  match = arrayPattern.exec(content);
  while (match) {
    const innerHex = /<([0-9A-Fa-f\s]+)>/g;
    let innerMatch = innerHex.exec(match[1]);
    while (innerMatch) {
      pieces.push(decodeHex(innerMatch[1]));
      innerMatch = innerHex.exec(match[1]);
    }
    match = arrayPattern.exec(content);
  }

  return pieces.join("\n");
}

/** Texto concatenado de um PDF, em codificação WinAnsi. */
export function extractPdfText(bytes: Buffer): string {
  return contentStreams(bytes)
    .map((stream) => decodeTextOperators(stream))
    .filter(Boolean)
    .join("\n");
}
