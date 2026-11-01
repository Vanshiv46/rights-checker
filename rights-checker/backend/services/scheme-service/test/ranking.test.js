import { describe, expect, it } from 'vitest';

import { cosineSimilarity, rerankByEmbedding } from '../src/services/ranking.js';

const hit = (id, embedding, score = 1) => ({
  chunkId: id,
  documentTitle: 'doc',
  section: null,
  text: 't',
  score,
  embedding,
});

describe('cosineSimilarity', () => {
  it('scores identical, orthogonal and zero vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('rerankByEmbedding', () => {
  it('keeps FULLTEXT order without a query embedding', () => {
    const hits = [hit('a', [1, 0]), hit('b', [0, 1])];
    expect(rerankByEmbedding(hits)).toBe(hits);
  });

  it('orders comparable hits by cosine and keeps the rest after them', () => {
    const hits = [hit('a', [1, 0]), hit('none', null), hit('b', [0, 1]), hit('short', [1])];
    const ranked = rerankByEmbedding(hits, [0, 1]);
    expect(ranked.map((h) => h.chunkId)).toEqual(['b', 'a', 'none', 'short']);
    expect(ranked[0].score).toBeCloseTo(1);
  });
});
