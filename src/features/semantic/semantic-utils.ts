export function normalizeSemanticText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

export function semanticHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function semanticId(prefix: string, ...parts: string[]) {
  return `${prefix}-${semanticHash(parts.join("::"))}`;
}

export function uniqueStrings(values: readonly string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeSemanticText(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function tokenizeSemantic(value: string) {
  return uniqueStrings(normalizeSemanticText(value).split(/\s+/).filter((term) => term.length > 2));
}
