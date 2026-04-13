import { getOpenAI } from "./openai";
import { cacheKey, cacheGet, cacheSet } from "./cache";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function getSimilarity(
  output: string,
  expected: string
): Promise<number> {
  const key = cacheKey("similarity", output, expected);
  const cached = cacheGet<number>(key);
  if (cached !== undefined) return cached;

  const [e1, e2] = await Promise.all([
    getOpenAI().embeddings.create({
      model: "text-embedding-3-small",
      input: output,
    }),
    getOpenAI().embeddings.create({
      model: "text-embedding-3-small",
      input: expected,
    }),
  ]);

  const score = cosineSimilarity(
    e1.data[0].embedding,
    e2.data[0].embedding
  );

  cacheSet(key, score);
  return score;
}
