/**
 * Hybrid Retriever — Vector + BM25 + RRF Fusion + Rerank + Noise Filter
 *
 * Pipeline: query → vector_search + bm25 → RRF_fusion → noise_filter → rerank → results
 */

import { HawkDB } from './lancedb.js';
import { Embedder } from './embeddings.js';
import { getConfig, hasEmbeddingProvider } from './config.js';
import {
  BM25_K1, BM25_B, RRF_K, RRF_VECTOR_WEIGHT,
  NOISE_SIMILARITY_THRESHOLD,
  VECTOR_SEARCH_MULTIPLIER, BM25_SEARCH_MULTIPLIER,
  RERANK_CANDIDATE_MULTIPLIER,
} from './constants.js';
import type { RetrievedMemory, SourceType } from './types.js';

export class HybridRetriever {
  private db: HawkDB;
  private embedder: Embedder;
  private bm25: any = null; // rank_bm25.BM25Okapi
  private corpus: string[] = [];
  private corpusIds: string[] = [];
  private noisePrototypes: number[][] = [];
  private bm25Dirty: boolean = false;   // set true when new memories are stored
  private bm25BuildPromise: Promise<void> | null = null;  // prevents concurrent rebuilds
  private lastIndexedMemoryCount: number = 0;  // for incremental tracking
  private pendingTexts: string[] = [];  // texts added since last full rebuild
  private pendingIds: string[] = [];

  constructor(db: HawkDB, embedder: Embedder) {
    this.db = db;
    this.embedder = embedder;
  }

  /** Call this after store() to invalidate the BM25 index — next search() will rebuild incrementally */
  markDirty(): void {
    this.bm25Dirty = true;
  }

  // ---------- BM25 Setup ----------

  /** Rebuild threshold: only full-rebuild if more than 10 new memories since last build */
  private static readonly BM25_REBUILD_THRESHOLD = 10;

  private async _ensureBm25Index(): Promise<void> {
    if (!this.bm25Dirty && this.bm25) return;
    if (this.bm25BuildPromise) return this.bm25BuildPromise;

    this.bm25BuildPromise = this._buildBm25Index();
    await this.bm25BuildPromise;
    this.bm25BuildPromise = null;
    this.bm25Dirty = false;
  }

  /**
   * Incremental BM25: only full-rebuild if new memories exceed threshold.
   * Otherwise just add to pending corpus and merge at search time.
   */
  private async _ensureBm25IndexIncremental(): Promise<void> {
    if (!this.bm25Dirty && this.bm25) return;
    if (this.bm25BuildPromise) return this.bm25BuildPromise;

    this.bm25BuildPromise = this._buildBm25IndexIncremental();
    await this.bm25BuildPromise;
    this.bm25BuildPromise = null;
    this.bm25Dirty = false;
  }

  private async _buildBm25Index(): Promise<void> {
    try {
      const { BM25Okapi } = await import('rank_bm25');
      const allMemories = await this.db.getAllTexts();

      if (!allMemories.length) return;

      this.corpusIds = allMemories.map(m => m.id);
      this.corpus = allMemories.map(m => m.text.toLowerCase());
      this.lastIndexedMemoryCount = allMemories.length;
      this.pendingTexts = [];
      this.pendingIds = [];
      this.bm25 = new BM25Okapi(this.corpus);
    } catch {
      console.warn('[hawk-bridge] rank_bm25 not available, BM25 disabled');
    }
  }

  /**
   * Incremental BM25: check if new memories exceed threshold.
   * If few: accumulate in pending, merge at search time.
   * If many: full rebuild.
   */
  private async _buildBm25IndexIncremental(): Promise<void> {
    try {
      const { BM25Okapi } = await import('rank_bm25');
      const allMemories = await this.db.getAllTexts();
      if (!allMemories.length) return;

      const total = allMemories.length;
      const newCount = total - this.lastIndexedMemoryCount;

      if (newCount <= 0 || newCount > HybridRetriever.BM25_REBUILD_THRESHOLD) {
        // Many new docs or count reset → full rebuild
        this.corpusIds = allMemories.map(m => m.id);
        this.corpus = allMemories.map(m => m.text.toLowerCase());
        this.lastIndexedMemoryCount = total;
        this.pendingTexts = [];
        this.pendingIds = [];
        this.bm25 = new BM25Okapi(this.corpus);
      } else {
        // Few new docs → accumulate in pending
        const newMemories = allMemories.slice(-newCount);
        for (const m of newMemories) {
          this.pendingIds.push(m.id);
          this.pendingTexts.push(m.text.toLowerCase());
        }
        this.lastIndexedMemoryCount = total;
        // Re-initialize BM25 with full corpus including pending
        // This is the "lazy rebuild" - rebuild with existing + pending combined
        const fullCorpus = [...this.corpus, ...this.pendingTexts];
        const fullIds = [...this.corpusIds, ...this.pendingIds];
        this.corpus = fullCorpus;
        this.corpusIds = fullIds;
        this.pendingTexts = [];
        this.pendingIds = [];
        this.bm25 = new BM25Okapi(fullCorpus);
      }
    } catch {
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
    if (!hasEmbeddingProvider()) {
      console.log('[hawk-bridge] No embedding provider, skipping noise prototypes');
      return;
    }

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
    bm25Results: Array<{ id: string; score: number }>,
  ): Array<{ id: string; rrfScore: number; vectorScore: number; bm25Score: number }> {
    const rrfMap = new Map<string, { rrfScore: number; vectorScore: number; bm25Score: number }>();

    // Vector results
    for (let rank = 0; rank < vectorResults.length; rank++) {
      const item = vectorResults[rank];
      const score = 1 / (RRF_K + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, bm25Score: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * RRF_VECTOR_WEIGHT, // vector weight
        vectorScore: item.score,
        bm25Score: existing.bm25Score,
      });
    }

    // BM25 results
    for (let rank = 0; rank < bm25Results.length; rank++) {
      const item = bm25Results[rank];
      const score = 1 / (RRF_K + rank + 1);
      const existing = rrfMap.get(item.id) || { rrfScore: 0, vectorScore: 0, bm25Score: 0 };
      rrfMap.set(item.id, {
        rrfScore: existing.rrfScore + score * (1 - RRF_VECTOR_WEIGHT), // BM25 weight
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

    // Try each rerank provider in priority order
    const providers = [
      // 1. Jina AI Reranker
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

      // 2. Cohere Rerank
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

      // 3. Mixedbread AI (free tier available)
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

      // 4. Generic OpenAI-compatible rerank endpoint
      async () => {
        const baseURL = process.env.RERANK_BASE_URL;
        const apiKey = process.env.RERANK_API_KEY || process.env.OPENAI_API_KEY;
        const model = process.env.RERANK_MODEL || '';
        if (!baseURL || !apiKey || !model) return null;
        const resp = await fetch(`${baseURL}/rerank`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model, query, documents: candidates.map(c => c.text), top_n: Math.min(topN * 2, candidates.length) }),
        });
        if (!resp.ok) return null;
        const data = await resp.json() as any;
        const idMap = new Map(candidates.map((c, i) => [i, c]));
        return data.results.map((r: any) => {
          const mem = idMap.get(r.index)!;
          return { id: mem.id, text: mem.text, rerankScore: r.relevance_score };
        });
      },
    ];

    // Try providers in order
    for (const providerFn of providers) {
      try {
        const result = await providerFn();
        if (result && result.length > 0) return result;
      } catch { /* try next */ }
    }

    // Ultimate fallback: cosine similarity rerank
    try {
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
    scope?: string,
    sourceTypes?: SourceType[]  // multimodal: filter by source type
  ): Promise<RetrievedMemory[]> {
    // Clamp topK to prevent abuse
    topK = Math.min(Math.max(1, topK), 100);

    // Ensure indexes are built (with dirty-flag rebuild)
    await this._ensureBm25IndexIncremental();
    if (!this.noisePrototypes.length) await this.buildNoisePrototypes();

    const hasEmbedding = hasEmbeddingProvider();

    if (hasEmbedding) {
      // Full pipeline: vector + BM25 + RRF + rerank
      try {
        const queryVector = await this.embedder.embedQuery(query);
        const vectorResults = await this.db.search(queryVector, topK * VECTOR_SEARCH_MULTIPLIER, 0.0, scope, sourceTypes);

        const vectorRanked = vectorResults
          .map((r, i) => ({ id: r.id, score: 1 - i * 0.01, text: r.text }))
          .sort((a, b) => b.score - a.score);

        const bm25Scores = this.bm25Score(query);
        const bm25Ranked = this.corpusIds
          .map((id, i) => ({ id, score: bm25Scores[i], text: this.corpus[i] }))
          .filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, topK * BM25_SEARCH_MULTIPLIER);

        const fused = this.rrfFusion(vectorRanked, bm25Ranked);

        // Batch-fetch all fused IDs at once (N+1 query fix)
        const fusedIds = fused.map(f => f.id);
        const fetched = await this.db.getByIds(fusedIds);
        // fetched is already a MemoryMap

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
        console.warn('[hawk-bridge] Vector search failed, falling back to BM25-only:', err);
      }
    }

    // Degraded mode: pure BM25 score, no embedding needed
    console.log('[hawk-bridge] Running in BM25-only mode (no embedding API)');
    const bm25Scores = this.bm25Score(query);
    const bm25Ranked = this.corpusIds
      .map((id, i) => ({ id, score: bm25Scores[i], text: this.corpus[i] }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK * 3);

    // Batch-fetch BM25 results (N+1 query fix)
    const bm25Ids = bm25Ranked.map(b => b.id);
    const fetchedBm25 = await this.db.getByIds(bm25Ids);
    // fetchedBm25 is already a MemoryMap
    const idToScore = new Map(bm25Ranked.map(item => [item.id, item.score]));

    const results: RetrievedMemory[] = [];
    for (const item of bm25Ranked) {
      const score = idToScore.get(item.id);
      if (score === undefined) continue;
      const memory = fetchedBm25.get(item.id);
      if (!memory) continue;
      results.push({
        id: item.id,
        text: memory.text,
        score,
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
