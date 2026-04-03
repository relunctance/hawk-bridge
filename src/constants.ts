/**
 * constants.ts — All tunable magic numbers in one place with explanations.
 *
 * These can be overridden at runtime via environment variables or
 * openclaw plugin config (openclaw.json). Each constant documents:
 *   - What it controls
 *   - Recommended range
 *   - Tradeoffs involved
 */

// ─── Retrieval ────────────────────────────────────────────────────────────────

/**
 * BM25 k1 parameter — controls term frequency saturation.
 * Higher = term frequency saturates more slowly → rare terms get boosted more.
 * Range: 1.0–2.0. Default 1.5 is standard for short texts.
 */
export const BM25_K1 = parseFloat(process.env.HAWK_BM25_K1 || '1.5');

/**
 * BM25 b parameter — controls length normalization.
 * b=0 disables normalization (long docs not penalized).
 * b=1 fully normalizes by doc length.
 * Range: 0.0–1.0. Default 0.75 is a good balance for mixed-length docs.
 */
export const BM25_B = parseFloat(process.env.HAWK_BM25_B || '0.75');

/**
 * RRF k parameter — rank penalty in Reciprocal Rank Fusion.
 * Higher = later-ranked items get relatively more weight.
 * Range: 10–100. Default 60 is standard.
 */
export const RRF_K = parseFloat(process.env.HAWK_RRF_K || '60');

/**
 * Vector result weight in RRF fusion (BM25 weight = 1 - this).
 * Controls how much vector similarity vs keyword match dominates fused ranking.
 * Range: 0.0–1.0. Default 0.7 means vector results rank ~2.3× more than BM25.
 */
export const RRF_VECTOR_WEIGHT = parseFloat(process.env.HAWK_RRF_VECTOR_WEIGHT || '0.7');

/**
 * Noise cosine-similarity threshold — when a memory is considered "noise".
 * Higher = stricter (fewer false positives, more false negatives).
 * Range: 0.7–0.95. Default 0.82 works well for acknowledgment/greeting patterns.
 * Tune down if legitimate short messages are being filtered; tune up if noise slips through.
 */
export const NOISE_SIMILARITY_THRESHOLD = parseFloat(process.env.HAWK_NOISE_THRESHOLD || '0.82');

/**
 * Multiplier for initial vector search scope.
 * E.g. topK=5, this=4 → first fetch 20 candidates before filtering/reranking.
 * Higher = better recall but more compute. Range: 2–10. Default 4 is a good balance.
 */
export const VECTOR_SEARCH_MULTIPLIER = parseInt(process.env.HAWK_VECTOR_SEARCH_MULTIPLIER || '4', 10);

/**
 * Multiplier for BM25 candidate pool before fusion.
 * E.g. topK=5, this=4 → first fetch top-20 BM25 results.
 * Should be >= VECTOR_SEARCH_MULTIPLIER since BM25 is cheaper. Default 4.
 */
export const BM25_SEARCH_MULTIPLIER = parseInt(process.env.HAWK_BM25_SEARCH_MULTIPLIER || '4', 10);

/**
 * Multiplier for noise-filtered candidates before reranking.
 * E.g. topK=5, this=3 → keep top-15 after noise filter → rerank → return top 5.
 * Higher = better diversity in final results. Range: 2–10. Default 3.
 */
export const RERANK_CANDIDATE_MULTIPLIER = parseInt(process.env.HAWK_RERANK_CANDIDATE_MULTIPLIER || '3', 10);

// ─── Memory storage ──────────────────────────────────────────────────────────

/**
 * Max memories returned per BM25 query (safety limit).
 * Prevents runaway queries on huge databases.
 * Range: 100–50000. Default 10000.
 */
export const BM25_QUERY_LIMIT = parseInt(process.env.HAWK_BM25_QUERY_LIMIT || '10000', 10);

/**
 * Default embedding dimension fallback when LanceDB vector is empty.
 * Must match your embedding model's output dimension.
 * Default 384 (all-MiniLM-L6-v2). Set to 1024 for nomic-embed-text, 1536 for OpenAI ada-002.
 */
export const DEFAULT_EMBEDDING_DIM = parseInt(process.env.HAWK_EMBEDDING_DIM || '384', 10);

// ─── Scoring ────────────────────────────────────────────────────────────────

/**
 * Minimum relevance score (0–1) to be included in results.
 * Higher = fewer but more relevant results. Range: 0.0–1.0.
 * Default 0.6 is aggressive; 0.4 is more permissive.
 * Note: This applies to LanceDB distance-derived scores (not RRF).
 */
export const DEFAULT_MIN_SCORE = parseFloat(process.env.HAWK_MIN_SCORE || '0.6');

// ─── Content Validation ────────────────────────────────────────────────────

/**
 * Maximum character length per memory chunk.
 * Chunks longer than this are truncated before storage.
 * Range: 100–10000. Default 2000.
 */
export const MAX_CHUNK_SIZE = parseInt(process.env.HAWK_MAX_CHUNK_SIZE || '2000', 10);

/**
 * Minimum character length for a valid memory chunk.
 * Shorter chunks are silently discarded during capture.
 * Range: 10–200. Default 20.
 */
export const MIN_CHUNK_SIZE = parseInt(process.env.HAWK_MIN_CHUNK_SIZE || '20', 10);

/**
 * Maximum text length accepted from the extractor (safety limit before truncation).
 * Default 5000.
 */
export const MAX_TEXT_LEN = parseInt(process.env.HAWK_MAX_TEXT_LEN || '5000', 10);

// ─── Deduplication ─────────────────────────────────────────────────────────

/**
 * Similarity threshold for duplicate detection (0–1).
 * Two memories with similarity >= this are considered duplicates.
 * Range: 0.7–1.0. Default 0.95 (near-identical texts only).
 */
export const DEDUP_SIMILARITY = parseFloat(process.env.HAWK_DEDUP_SIMILARITY || '0.95');

// ─── TTL / Expiry ─────────────────────────────────────────────────────────

/**
 * Default Time-To-Live for memories in milliseconds.
 * Memories older than this are filtered out at query time.
 * 0 = no expiry. Default 30 days.
 */
export const MEMORY_TTL_MS = parseInt(process.env.HAWK_MEMORY_TTL_MS || String(30 * 24 * 60 * 60 * 1000), 10);
