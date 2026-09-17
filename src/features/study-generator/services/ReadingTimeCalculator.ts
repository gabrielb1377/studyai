const WORDS_PER_MINUTE = 200;

export function wordsFrom(text: string) {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? [];
}

export const ReadingTimeCalculator = {
  calculate(text: string) {
    const wordCount = wordsFrom(text).length;
    return {
      wordCount,
      readingTimeMinutes: wordCount > 0 ? Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)) : 0,
    };
  },
};

