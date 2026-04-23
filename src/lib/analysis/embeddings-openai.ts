/**
 * Batch OpenAI embeddings for semantic relevance + topic boundaries.
 * Uses text-embedding-3-small (no extra npm; fetch only).
 */
const EMBED_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 64;

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) + 1e-12;
  return dot / denom;
}

export async function embedTextsOpenAI(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const out: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
    const chunk = texts.slice(offset, offset + BATCH_SIZE);
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: chunk,
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`OpenAI embeddings: ${res.status} ${raw.slice(0, 500)}`);
    }
    const json = JSON.parse(raw) as {
      data: Array<{ embedding: number[]; index: number }>;
    };
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    for (const row of sorted) {
      out.push(row.embedding);
    }
  }
  return out;
}
