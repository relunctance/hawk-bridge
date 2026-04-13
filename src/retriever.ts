/**
 * Hybrid Retriever — Vector + FTS (LanceDB) + RRF Fusion + Rerank + Noise Filter
 *
 * Pipeline: query → vector_search + fts → RRF_fusion → noise_filter → rerank → results
 *
 * FTS uses LanceDB's native full-text search (no external BM25 library needed).
 */

import { HawkDB } from './lancedb.js';
import { Embedder } from './embeddings.js';
import { hasEmbeddingProvider } from './config.js';
import {
  RRF_K, RRF_VECTOR_WEIGHT,
  NOISE_SIMILARITY_THRESHOLD,
  VECTOR_SEARCH_MULTIPLIER,
  RERANK_CANDIDATE_MULTIPLIER,
} from './constants.js';
import type { RetrievedMemory, SourceType } from './types.js';

export class HybridRetriever {
  private db: HawkDB;
  private embedder: Embedder;
  private noisePrototypes: number[][] = [];

  constructor(db: HawkDB, embedder: Embedder) {
    this.db = db;
    this.embedder = embedder;
  }

  // ---------- Noise Prototype Setup ----------

  async buildNoisePrototypes(): Promise<void> {
    if (!hasEmbeddingProvider()) {
      console.log('[hawk-bridge] No embedding provider, skipping noise prototypes');
      return;
    }

    const noiseTexts = [
      '好的，明白了', '收到，谢谢', 'ok', '好的', '了解', '没问题',
      '对', '是的', '哈哈', '嗯嗯', '好的好的', '收到收到',
      'OK', '👍', '✅', '好的，辛苦了',
    ];

    try {
      if (!this.noisePrototypes.length) {
        this.noisePrototypes = await this.embedder.embed(noiseTexts);
      }
    } catch (e) {
      console.warn('[hawk-bridge] Noise prototype embedding failed, noise filter disabled:', (e as Error).message);
    }
  }

  private isNoise(embedding: number[]): boolean {
    for (const prototype of this.noisePrototypes) {
      const sim = cosineSimilarity(embedding, prototype);
      if (sim >= NOISE_SIMILARITY_THRESHOLD) return true;
    }
    return false;
  }

  // ---------- RRF Fusion ----------

  private rrfFusion(
    vectorResults: Array<{ id: string; score: number }>,
    ftsResults: Array<{ id: string; score: number }>,
  ): Array<{ id: string; rrfScore: number; vectorScore: number; ftsScore: number }> {
    const rrfMap = new Map<string, { rrfScore: number; vectorScore: number; ftsScore: number }>();

    for (let rank = 0; rank < vectorResults.length; rank++) {
      const item = vectorResults[rank];
      const score = 1 / (RRF_K + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, ftsScore: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * RRF_VECTOR_WEIGHT,
        vectorScore: item.score,
        ftsScore: existing.ftsScore,
      });
    }

    for (let rank = 0; rank < ftsResults.length; rank++) {
      const item = ftsResults[rank];
      const score = 1 / (RRF_K + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, ftsScore: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * (1 - RRF_VECTOR_WEIGHT),
        vectorScore: existing.vectorScore,
        ftsScore: item.score,
      });
    }

    return Array.from(rrfMap.entries()).map(([id, v]) => ({ id, ...v }));
  }

  // ---------- Cross-encoder Rerank ----------

  private async rerank(
    query: string,
    candidates: Array<{ id: string; text: string; score: number }>,
    topN: number
  ): Promise<Array<{ id: string; text: string; rerankScore: number }>> {
    if (candidates.length <= 2) return candidates.map(c => ({ id: c.id, text: c.text, rerankScore: c.score }));

    const providers = [
      async () => {
        const apiKey = process.env.JINA_RERANKER_API_KEY;
        if (!apiKey) return null;
        const resp = await fetch('https://api.jina.ai/v1/rerank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'jina-reranker-v1-base-en',
            query,
            documents: candidates.map(c => c.text),
            top_n: Math.min(topN * 2, candidates.length),
          }),
        });
        if (!resp.ok) return null;
        const data = await resp.json() as any;
        return data.results.map((r: any) => ({
          id: candidates[r.index].id,
          text: candidates[r.index].text,
          rerankScore: r.relevance_score,
        }));
      },

      async () => {
        const apiKey = process.env.COHERE_API_KEY || process.env.COHERE_RERANK_API_KEY;
        if (!apiKey) return null;
        const resp = await fetch('https://api.cohere.ai/v1/rerank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'rerank-english-v3.0',
            query,
            documents: candidates.map(c => c.text),
            top_n: Math.min(topN * 2, candidates.length),
            return_documents: false,
          }),
        });
        if (!resp.ok) return null;
        const data = await resp.json() as any;
        const idMap = new Map(candidates.map((c, i) => [i, c]));
        return data.results.map((r: any) => {
          const mem = idMap.get(r.index)!;
          return { id: mem.id, text: mem.text, rerankScore: r.relevance_score };
        });
      },

      async () => {
        const apiKey = process.env.MIXTBREAD_API_KEY || process.env.MIXEDBREAD_API_KEY;
        if (!apiKey) return null;
        const resp = await fetch('https://api.mixedbread.ai/v1/rerank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'mxbai-rerank-large-v1',
            query,
            input: candidates.map(c => c.text),
            top_k: Math.min(topN * 2, candidates.length),
          }),
        });
        if (!resp.ok) return null;
        const data = await resp.json() as any;
        const idMap = new Map(candidates.map((c, i) => [i, c]));
        return data.data.map((r: any) => {
          const mem = idMap.get(r.index)!;
          return { id: mem.id, text: mem.text, rerankScore: r.relevance_score };
        });
      },
    ];

    for (const tryProvider of providers) {
      try {
        const result = await tryProvider();
        if (result) return result;
      } catch { /* try next */ }
    }

    // No reranker available: return RRF scores unchanged
    return candidates.map(c => ({ id: c.id, text: c.text, rerankScore: c.score }));
  }

  // ---------- Main Search Pipeline ----------

  async search(
    query: string,
    topK: number,
    scope?: string,
    sourceTypes?: SourceType[]
  ): Promise<RetrievedMemory[]> {
    const hasEmbedding = hasEmbeddingProvider();

    if (hasEmbedding) {
      // Full pipeline: vector + FTS + RRF + rerank
      try {
        const queryVector = await this.embedder.embedQuery(query);

        const [vectorResults, ftsResults] = await Promise.all([
          this.db.search(queryVector, topK * VECTOR_SEARCH_MULTIPLIER, 0.0, scope, sourceTypes),
          this.db.ftsSearch(query, topK * VECTOR_SEARCH_MULTIPLIER, scope, sourceTypes),
        ]);

        const vectorRanked = vectorResults
          .map((r, i) => ({ id: r.id, score: 1 - i * 0.01, text: r.text }))
          .sort((a, b) => b.score - a.score);

        const ftsRanked = ftsResults
          .map((r, i) => ({ id: r.id, score: r.score, text: r.text }))
          .sort((a, b) => b.score - a.score)
          .slice(0, topK * VECTOR_SEARCH_MULTIPLIER);

        const fused = this.rrfFusion(vectorRanked, ftsRanked);

        const fusedIds = fused.map(f => f.id);
        const fetched = await this.db.getByIds(fusedIds);

        const noiseFiltered = [];
        for (const item of fused) {
          const memory = fetched.get(item.id);
          if (!memory) continue;
          if (this.isNoise(memory.vector)) continue;
          noiseFiltered.push({ ...item, text: memory.text, vector: memory.vector });
        }

        const candidates = noiseFiltered.slice(0, topK * RERANK_CANDIDATE_MULTIPLIER).map(item => ({
          id: item.id,
          text: item.text,
          score: item.rrfScore,
        }));

        const reranked = await this.rerank(query, candidates, topK);
        const idToRerank = new Map(reranked.map(r => [r.id, r.rerankScore]));
        const results: RetrievedMemory[] = [];

        for (const item of noiseFiltered) {
          const rerankScore = idToRerank.get(item.id);
          if (rerankScore === undefined) continue;
          const memory = fetched.get(item.id);
          if (!memory) continue;
          results.push({
            id: item.id,
            text: memory.text,
            score: rerankScore,
            category: memory.category,
            metadata: memory.metadata,
          });
          if (results.length >= topK) break;
        }

        return results;
      } catch (err) {
        console.warn('[hawk-bridge] Vector search failed, falling back to FTS-only:', err);
      }
    }

    // Fallback: pure FTS search via LanceDB (no embedding needed)
    console.log('[hawk-bridge] Running in FTS-only mode (LanceDB native full-text search)');
    try {
      const ftsResults = await this.db.ftsSearch(query, topK * 3, scope, sourceTypes);
      const idToScore = new Map(ftsResults.map(r => [r.id, r.score]));
      const ftsIds = ftsResults.map(r => r.id);
      const fetched = await this.db.getByIds(ftsIds);

      const results: RetrievedMemory[] = [];
      for (const id of ftsIds) {
        const score = idToScore.get(id);
        if (score === undefined) continue;
        const memory = fetched.get(id);
        if (!memory) continue;
        results.push({
          id,
          text: memory.text,
          score,
          category: memory.category,
          metadata: memory.metadata,
        });
        if (results.length >= topK) break;
      }
      return results;
    } catch (err) {
      console.error('[hawk-bridge] FTS search failed:', err);
      return [];
    }
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}
