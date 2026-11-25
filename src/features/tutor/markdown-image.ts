/**
 * Política de imagens em respostas Markdown geradas por IA.
 *
 * Uma imagem remota é carregada pelo navegador sem clique, então uma resposta
 * influenciada por texto hostil de um documento poderia enviar dados do contexto
 * na própria URL. Só são carregadas fontes locais: `data:image/*` (base64) e
 * `blob:`. Caminhos relativos também ficam de fora para impedir requisições
 * autenticadas à própria origem por meio de uma resposta da IA.
 *
 * Observação: o `urlTransform` padrão do react-markdown (10.x) já descarta
 * `data:` e `blob:` antes de chegar ao componente, então hoje nenhuma imagem
 * local é renderizada por este caminho. A política abaixo é uma segunda camada
 * e passa a valer de fato se o `urlTransform` for personalizado no futuro.
 */
// Controles ASCII (0x00-0x1f), espaço (0x20) e DEL (0x7f).
const CONTROL_OR_SPACE = /[\x00-\x20\x7f]/;
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i;
const BLOB_URL = /^blob:/i;

export function isLocalImageSource(source: string | null | undefined): boolean {
  if (typeof source !== "string" || source.length === 0) return false;
  // O navegador ignora espaços e controles ao interpretar URLs; recusar evita ofuscação.
  if (CONTROL_OR_SPACE.test(source)) return false;
  return DATA_IMAGE.test(source) || BLOB_URL.test(source);
}

const ALT_MAX = 120;

/** Texto alternativo seguro para exibição quando a imagem não é carregada. */
export function blockedImageLabel(alt: string | null | undefined): string {
  const text = typeof alt === "string" ? alt.replace(/\s+/g, " ").trim().slice(0, ALT_MAX) : "";
  return text ? `${text} (imagem externa não carregada)` : "Imagem externa não carregada";
}
