import type { AIMessage } from "./AIProvider";

const CHARS_PER_TOKEN = 4;

export const TokenCounter = {
  estimate(text: string) {
    if (!text.trim()) return 0;
    const characters = Array.from(text).length;
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(Math.max(characters / CHARS_PER_TOKEN, words * 1.3)));
  },

  messages(messages: readonly AIMessage[]) {
    return messages.reduce((total, message) => total + this.estimate(message.content) + 4, 0);
  },

  truncate(text: string, maxTokens: number) {
    if (this.estimate(text) <= maxTokens) return text;
    const maximumCharacters = Math.max(0, Math.floor(maxTokens * CHARS_PER_TOKEN));
    return `${text.slice(0, Math.max(0, maximumCharacters - 1)).trimEnd()}…`;
  },
};
