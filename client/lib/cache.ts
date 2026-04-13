// Shared in-memory LRU cache for LLM results

const MAX_CACHE = 200;
const llmCache = new Map<string, unknown>();

export function cacheKey(...parts: string[]): string {
  const str = parts.join("\x00");
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36);
}

export function cacheGet<T>(key: string): T | undefined {
  return llmCache.get(key) as T | undefined;
}

export function cacheSet(key: string, value: unknown) {
  if (llmCache.size >= MAX_CACHE) {
    const firstKey = llmCache.keys().next().value;
    if (firstKey !== undefined) llmCache.delete(firstKey);
  }
  llmCache.set(key, value);
}
