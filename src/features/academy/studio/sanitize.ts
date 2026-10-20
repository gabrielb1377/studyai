/**
 * Sanitização de conteúdo do Studio.
 *
 * Conteúdo gerado por IA ou digitado pelo aluno é tratado como dado não
 * confiável: scripts, handlers e URLs perigosas são removidos antes de
 * qualquer renderização.
 */

const SCRIPT_PATTERN = /<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi;
const EVENT_HANDLER_PATTERN = /\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const STYLE_BLOCK_PATTERN = /<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi;
const IFRAME_PATTERN = /<\s*iframe[\s\S]*?<\s*\/\s*iframe\s*>/gi;
const OBJECT_PATTERN = /<\s*(object|embed|applet)[\s\S]*?<\s*\/\s*\1\s*>/gi;
const JAVASCRIPT_URL_PATTERN = /javascript\s*:/gi;
const DATA_URL_PATTERN = /data\s*:(?!image\/(png|jpe?g|gif|webp);)[^\s"')]+/gi;

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "em", "u", "s", "code", "pre", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "a",
  "table", "thead", "tbody", "tr", "th", "td", "span", "div", "hr", "img", "figure", "figcaption",
]);

function readAttribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\s>]+))`, "i").exec(attributes);
  if (!match) return undefined;
  return match[2] ?? match[3] ?? match[4];
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Valida e normaliza uma URL externa. Retorna `undefined` quando insegura. */
export function safeExternalUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^(https?:)\/\//i.test(trimmed)) return trimmed;
  if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return undefined;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  return undefined;
}

/** Fonte de imagem aceita: URL segura ou imagem embutida em base64. */
function safeImageSource(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^data:image\/(png|jpe?g|gif|webp);/i.test(trimmed)) return trimmed;
  return safeExternalUrl(trimmed);
}

/** Remove HTML não permitido, preservando apenas tags seguras. */
export function sanitizeHtml(value: string): string {
  if (!value) return "";
  return value
    .replace(SCRIPT_PATTERN, "")
    .replace(STYLE_BLOCK_PATTERN, "")
    .replace(IFRAME_PATTERN, "")
    .replace(OBJECT_PATTERN, "")
    .replace(EVENT_HANDLER_PATTERN, "")
    .replace(JAVASCRIPT_URL_PATTERN, "")
    .replace(DATA_URL_PATTERN, "")
    .replace(/<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g, (_match, tag: string, attributes: string) => {
      const name = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return "";
      if (name === "a") {
        const href = readAttribute(attributes, "href");
        const safe = href ? safeExternalUrl(href) : undefined;
        return safe ? `<a href="${escapeAttribute(safe)}" rel="noopener noreferrer">` : "<a>";
      }
      if (name === "img") {
        const source = readAttribute(attributes, "src");
        const safe = source ? safeImageSource(source) : undefined;
        return safe ? `<img src="${escapeAttribute(safe)}" alt="">` : "";
      }
      return `<${name}>`;
    })
    .replace(/<\/([a-zA-Z][a-zA-Z0-9-]*)>/g, (_match, tag: string) => {
      const name = tag.toLowerCase();
      return ALLOWED_TAGS.has(name) ? `</${name}>` : "";
    });
}

/** Remove Markdown perigoso, mantendo a estrutura legível. */
export function sanitizeMarkdown(value: string): string {
  if (!value) return "";
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/</g, "&lt;"))
    .replace(/\[([^\]]*)]\(\s*javascript:[^)]*\)/gi, "$1")
    .replace(/\[([^\]]*)]\(\s*data:[^)]*\)/gi, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*on\w+\s*=[^>]*>/gi, "");
}

/** Texto puro, sem marcação, adequado para leitura em voz alta. */
export function toPlainText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[\w-]*\n?/g, "").replace(/```/g, ""))
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\|/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Limita o tamanho de um texto de entrada do usuário. */
export function clampText(value: string, maxLength = 20_000): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/** Converte Markdown em HTML seguro para pré-visualização. */
export function markdownToSafeHtml(markdown: string): string {
  const escaped = sanitizeMarkdown(markdown)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const blocks = escaped.split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((line) => /^[-*] .+/.test(line))) {
        const items = lines.map((line) => `<li>${inline(line.replace(/^[-*] /, ""))}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      if (/^#{1,6} /.test(block) && !block.includes("\n")) {
        const level = block.match(/^#+ /)?.[0].trim().length ?? 1;
        return `<h${Math.min(level, 6)}>${inline(block.replace(/^#+ /, ""))}</h${Math.min(level, 6)}>`;
      }
      if (lines.every((line) => /^\|.*\|$/.test(line))) {
        const rows = lines.map((line) => `<tr>${line.split("|").slice(1, -1).map((cell) => `<td>${inline(cell.trim())}</td>`).join("")}</tr>`).join("");
        return `<table>${rows}</table>`;
      }
      if (block.startsWith("&gt; ")) {
        return `<blockquote>${inline(block.replace(/&gt; /, ""))}</blockquote>`;
      }
      return `<p>${lines.map((line) => inline(line)).join("<br />")}</p>`;
    })
    .join("");

  return sanitizeHtml(html);
}

function inline(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
