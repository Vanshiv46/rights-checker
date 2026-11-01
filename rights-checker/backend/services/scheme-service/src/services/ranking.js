/** Cosine similarity of two equal-length vectors; 0 when either has no magnitude. */
export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  a.forEach((value, i) => {
    const other = b[i] ?? 0;
    dot += value * other;
    normA += value * value;
    normB += other * other;
  });
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

/**
 * Re-ranks FULLTEXT hits by cosine similarity when the query and chunks have embeddings.
 * Hits without a comparable embedding keep their FULLTEXT order after the scored ones.
 */
export function rerankByEmbedding(hits, queryEmbedding) {
  if (!queryEmbedding) return hits;
  const comparable = (hit) => hit.embedding?.length === queryEmbedding.length;
  const scored = hits
    .filter(comparable)
    .map((hit) => ({ ...hit, score: cosineSimilarity(queryEmbedding, hit.embedding ?? []) }))
    .sort((x, y) => y.score - x.score);
  return [...scored, ...hits.filter((hit) => !comparable(hit))];
}
