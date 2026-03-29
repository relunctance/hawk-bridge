/**
 * Hybrid Retriever — Vector + BM25 + RRF Fusion + Rerank + Noise Filter
 *
 * Pipeline: query → vector_search + bm25 → RRF_fusion → noise_filter → rerank → results
 */

import { HawkDB } from './lancedb.js';
import { Embedder } from './embeddings.js';
import { getConfig } from './config.js';
import type { RetrievedMemory } from './types.js';

export class HybridRetriever {
  private db: HawkDB;
  private embedder: Embedder;
  private bm25: any = null; // rank_bm25.BM25Okapi
  private corpus: string[] = [];
  private corpusIds: string[] = [];
  private noisePrototypes: number[][] = [];

  constructor(db: HawkDB, embedder: Embedder) {
    this.db = db;
    this.embedder = embedder;
  }

  // ---------- BM25 Setup ----------

  async buildBm25Index(): Promise<void> {
    try {
      const { BM25Okapi } = await import('rank_bm25');
      const allMemories = await this.db.getAllTexts();

      if (!allMemories.length) return;

      this.corpusIds = allMemories.map(m => m.id);
      this.corpus = allMemories.map(m => m.text.toLowerCase());
      this.bm25 = new BM25Okapi(this.corpus);
    } catch (e) {
      // rank_bm25 not installed, skip BM25
      console.warn('[hawk-bridge] rank_bm25 not available, BM25 disabled');
    }
  }

  private bm25Score(query: string): number[] {
    if (!this.bm25) return this.corpus.map(() => 0);
    const tokens = query.toLowerCase().split(/\s+/);
    return this.bm25.getScores(tokens);
  }

  // ---------- Noise Prototype Setup ----------

  async buildNoisePrototypes(): Promise<void> {
    // Predefined noise prototype embeddings (jina-embeddings-v5 compatible)
    // These represent typical "noise" patterns: acknowledgements, greetings, etc.
    const noiseTexts = [
      '好的，明白了',
      '收到，谢谢',
      'ok',
      '好的',
      '了解',
      '没问题',
      '对',
      '是的',
      '哈哈',
      '嗯嗯',
      '好的好的',
      '收到收到',
      'OK',
      '👍',
      '✅',
      '好的，辛苦了',
    ];

    if (!this.noisePrototypes.length) {
      this.noisePrototypes = await this.embedder.embed(noiseTexts);
    }
  }

  private isNoise(embedding: number[], threshold = 0.82): boolean {
    if (!this.noisePrototypes.length) return false;

    for (const prototype of this.noisePrototypes) {
      const sim = cosineSimilarity(embedding, prototype);
      if (sim >= threshold) return true;
    }
    return false;
  }

  // ---------- RRF Fusion ----------

  private rrfFusion(
    vectorResults: Array<{ id: string; score: number }>,
    bm25Results: Array<{ id: string; score: number }>,
    k = 60
  ): Array<{ id: string; rrfScore: number; vectorScore: number; bm25Score: number }> {
    const rrfMap = new Map<string, { rrfScore: number; vectorScore: number; bm25Score: number }>();

    // Vector results
    for (let rank = 0; rank < vectorResults.length; rank++) {
      const item = vectorResults[rank];
      const score = 1 / (k + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, bm25Score: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * 0.7, // vector weight
        vectorScore: item.score,
        bm25Score: existing.bm25Score,
      });
    }

    // BM25 results
    for (let rank = 0; rank < bm25Results.length; rank++) {
      const item = bm25Results[rank];
      const score = 1 / (k + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, bm25Score: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * 0.3, // BM25 weight
        vectorScore: existing.vectorScore,
        bm25Score: item.score,
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

    try {
      // Use Jina reranker API (free tier available)
      const apiKey = process.env.JINA_RERANKER_API_KEY || process.env.OPENAI_API_KEY;
      const useJina = !!process.env.JINA_RERANKER_API_KEY;

      if (useJina) {
        const resp = await fetch('https://api.jina.ai/v1/rerank', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'jina-reranker-v1-base-en',
            query,
            documents: candidates.map(c => c.text),
            top_n: Math.min(topN * 2, candidates.length),
          }),
        });

        if (resp.ok) {
          const data = await resp.json() as any;
          return data.results.map((r: any) => ({
            id: candidates[r.index].id,
            text: candidates[r.index].text,
            rerankScore: r.relevance_score,
          }));
        }
      }

      // Fallback: cosine similarity rerank using query embedding
      const queryVec = await this.embedder.embedQuery(query);
      const docVecs = await this.embedder.embed(candidates.map(c => c.text));

      const scored = candidates.map((c, i) => ({
        id: c.id,
        text: c.text,
        rerankScore: cosineSimilarity(queryVec, docVecs[i]),
      }));

      return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topN * 2);

    } catch (e) {
      console.warn('[hawk-bridge] rerank failed, using RRF scores:', e);
      return candidates.slice(0, topN).map(c => ({ id: c.id, text: c.text, rerankScore: c.score }));
    }
  }

  // ---------- Main Search Pipeline ----------

  async search(
    query: string,
    topK: number = 5,
    scope?: string
  ): Promise<RetrievedMemory[]> {
    // Ensure indexes are built
    if (!this.bm25) await this.buildBm25Index();
    if (!this.noisePrototypes.length) await this.buildNoisePrototypes();

    // Step 1: Vector search
    const queryVector = await this.embedder.embedQuery(query);
    const vectorResults = await this.db.search(queryVector, topK * 4, 0.0, scope); // low threshold, filter later

    const vectorRanked = vectorResults
      .map((r, i) => ({ id: r.id, score: 1 - i * 0.01, text: r.text }))
      .sort((a, b) => b.score - a.score);

    // Step 2: BM25 search
    const bm25Scores = this.bm25Score(query);
    const bm25Ranked = this.corpusIds
      .map((id, i) => ({ id, score: bm25Scores[i], text: this.corpus[i] }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK * 4);

    // Step 3: RRF Fusion
    const fused = this.rrfFusion(vectorRanked, bm25Ranked);

    // Step 4: Noise filter
    const noiseFiltered = [];
    for (const item of fused) {
      const memory = await this.db.getById(item.id);
      if (!memory) continue;
      if (this.isNoise(memory.vector)) continue;
      noiseFiltered.push({ ...item, text: memory.text, vector: memory.vector });
    }

    // Step 5: Build candidates for rerank
    const candidates = noiseFiltered.slice(0, topK * 3).map(item => ({
      id: item.id,
      text: item.text,
      score: item.rrfScore,
    }));

    // Step 6: Cross-encoder rerank
    const reranked = await this.rerank(query, candidates, topK);

    // Step 7: Build final results with rerank scores
    const idToRerank = new Map(reranked.map(r => [r.id, r.rerankScore]));
    const results: RetrievedMemory[] = [];

    for (const item of noiseFiltered) {
      const rerankScore = idToRerank.get(item.id);
      if (rerankScore === undefined) continue;
      const memory = await this.db.getById(item.id);
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
  }
}

// ---------- Utility ----------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
