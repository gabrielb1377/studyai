import type { RetrievedChunk } from "./RetrievalTypes";

const DEFAULT_MAX_CHARACTERS = 6_000;

export const ContextAssembler = {
  assemble(chunks: readonly RetrievedChunk[], maxCharacters = DEFAULT_MAX_CHARACTERS) {
    const sections: string[] = [];
    let usedCharacters = 0;

    for (const chunk of chunks) {
      const section = [
        `[Fonte: ${chunk.metadata.sourceName} | trecho ${chunk.chunkIndex + 1} | relevância ${chunk.score}]`,
        chunk.text,
      ].join("\n");
      const separatorLength = sections.length > 0 ? 2 : 0;
      const remaining = maxCharacters - usedCharacters - separatorLength;
      if (remaining <= 0) break;

      const boundedSection = section.length > remaining
        ? `${section.slice(0, Math.max(remaining - 1, 0))}…`
        : section;
      if (boundedSection) sections.push(boundedSection);
      usedCharacters += boundedSection.length + separatorLength;
    }

    return sections.join("\n\n");
  },
};
