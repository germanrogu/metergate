// Whitespace word count — a rough stand-in for a real tokenizer
// (e.g. tiktoken), used only when a provider disconnects mid-stream
// before reporting real usage. Documented as an approximation rather
// than silently billing a cutoff as zero tokens.
export function estimateTokens(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
