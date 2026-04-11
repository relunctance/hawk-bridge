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

// ─── Reliability / Verification ────────────────────────────────────────────────

/**
 * Initial reliability score for newly captured memories (0-1).
 * New memories start neutral until verified by the user.
 * Range: 0.0-1.0. Default 0.5.
 */
export const INITIAL_RELIABILITY = parseFloat(process.env.HAWK_INITIAL_RELIABILITY || '0.5');

/**
 * Reliability boost when a memory is confirmed correct (user doesn't correct it).
 * Each successful recall where the user doesn't correct the agent adds this.
 * Range: 0.0-0.3. Default 0.1.
 */
export const RELIABILITY_BOOST_CONFIRM = parseFloat(process.env.HAWK_RELIABILITY_BOOST_CONFIRM || '0.1');

/**
 * Reliability penalty when a memory is corrected by the user.
 * The corrected text replaces the old text and reliability resets accordingly.
 * Range: 0.0-0.5. Default 0.3.
 */
export const RELIABILITY_PENALTY_CORRECT = parseFloat(process.env.HAWK_RELIABILITY_PENALTY_CORRECT || '0.3');

/**
 * Reliability score threshold for "high confidence" (✅) label.
 * Memories at or above this are shown with ✅.
 * Range: 0.0-1.0. Default 0.7.
 */
export const RELIABILITY_THRESHOLD_HIGH = parseFloat(process.env.HAWK_RELIABILITY_THRESHOLD_HIGH || '0.7');

/**
 * Reliability score threshold for "medium confidence" (⚠️) label.
 * Memories below HIGH but at or above this are shown with ⚠️.
 * Below this → ❌.
 * Range: 0.0-1.0. Default 0.4.
 */
export const RELIABILITY_THRESHOLD_MEDIUM = parseFloat(process.env.HAWK_RELIABILITY_THRESHOLD_MEDIUM || '0.4');

/**
 * Grace period in days before soft-deleted (forgotten) memories are permanently purged.
 * Range: 1-365. Default 30 days.
 */
export const FORGET_GRACE_DAYS = parseInt(process.env.HAWK_FORGET_GRACE_DAYS || '30', 10);

/**
 * Days since last verification before a memory is flagged as potentially stale (drift).
 * Only applies to memories with reliability >= 0.5 (trust but verify).
 * Range: 1-365. Default 7 days.
 */
export const DRIFT_THRESHOLD_DAYS = parseInt(process.env.HAWK_DRIFT_THRESHOLD_DAYS || '7', 10);

/**
 * Days since drift was detected before requiring re-verification.
 * After DRIFT_THRESHOLD_DAYS * 2, memories with drift are queued for forced re-verify.
 * Range: 1-365. Default 14 days.
 */
export const DRIFT_REVERIFY_DAYS = parseInt(process.env.HAWK_DRIFT_REVERIFY_DAYS || '14', 10);

// ─── Evolution Source Importance ────────────────────────────────────────────────

/**
 * Importance score boost for memories from successful evolution fixes.
 * These memories are automatically boosted to top results during recall.
 * Range: 0.0-1.0. Default 0.95.
 */
export const EVOLUTION_SUCCESS = parseFloat(process.env.HAWK_EVOLUTION_SUCCESS || '0.95');

/**
 * Importance score penalty for memories from failed evolution attempts.
 * These memories are demoted and require explicit trigger to appear in recall.
 * Range: 0.0-1.0. Default 0.25.
 */
export const EVOLUTION_FAILURE = parseFloat(process.env.HAWK_EVOLUTION_FAILURE || '0.25');

// ─── Reliability: Time Decay ────────────────────────────────────────────────────

/**
 * Days within which a verification is considered fully fresh (recency_factor = 1.0).
 * Beyond this, reliability decays.
 * Range: 1-365. Default 30 days.
 */
export const RECENCY_GRACE_DAYS = parseInt(process.env.HAWK_RECENCY_GRACE_DAYS || '30', 10);

/**
 * Decay rate for reliability beyond RECENCY_GRACE_DAYS (exponential).
 * Lower = faster decay. Range: 0.1-0.99. Default 0.95.
 */
export const RECENCY_DECAY_RATE = parseFloat(process.env.HAWK_RECENCY_DECAY_RATE || '0.95');

/**
 * Maximum recency factor floor (reliability won't drop below this even for very old verifications).
 * Range: 0.0-0.5. Default 0.3.
 */
export const RECENCY_FACTOR_FLOOR = parseFloat(process.env.HAWK_RECENCY_FACTOR_FLOOR || '0.3');

// ─── Reliability: Consistency Factor ──────────────────────────────────────────

/**
 * Multiplier applied to reliability when a memory has been verified multiple times.
 * consistency_factor = min(1 + verificationCount * 0.05, CONSISTENCY_MAX).
 * Range: 1.0-2.0. Default 1.0 (disabled).
 */
export const CONSISTENCY_MAX = parseFloat(process.env.HAWK_CONSISTENCY_MAX || '1.5');

/**
 * Penalty multiplier when a memory has been corrected multiple times.
 * consistency_factor is multiplied by this for each correction.
 * Range: 0.1-1.0. Default 0.7 per correction.
 */
export const CORRECTION_PENALTY_MULTIPLIER = parseFloat(process.env.HAWK_CORRECTION_PENALTY_MULTIPLIER || '0.7');

// ─── Decay: Reliability-based Differentiation ────────────────────────────────────

/**
 * Decay rate multiplier for ✅ (high reliability) memories.
 * Lower = slower decay. Range: 0.0-1.0. Default 0.2 (barely decays).
 */
export const DECAY_RATE_HIGH_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_HIGH || '0.2');

/**
 * Decay rate multiplier for ⚠️ (medium reliability) memories.
 * Range: 0.5-1.5. Default 0.8.
 */
export const DECAY_RATE_MEDIUM_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_MEDIUM || '0.8');

/**
 * Decay rate multiplier for ❌ (low reliability) memories.
 * Range: 1.0-2.0. Default 1.5 (fast decay).
 */
export const DECAY_RATE_LOW_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_LOW || '1.5');

// ─── Cold Start Protection ─────────────────────────────────────────────────────

/**
 * Number of days a newly captured memory is protected from decay.
 * Prevents new memories from being wiped before they can be verified.
 * Range: 1-30. Default 7 days.
 */
export const COLD_START_GRACE_DAYS = parseInt(process.env.HAWK_COLD_START_GRACE_DAYS || '7', 10);

/**
 * Cold start protection decay multiplier (applied during grace period).
 * Lower = more protection. Default 0.1 = barely decays.
 */
export const COLD_START_DECAY_MULTIPLIER = parseFloat(process.env.HAWK_COLD_START_DECAY_MULTIPLIER || '0.1');

// ─── Conflict Detection ───────────────────────────────────────────────────────

/**
 * Similarity threshold for conflict detection.
 * When two entity/fact memories exceed this similarity but disagree on content,
 * flag as potential conflict.
 * Range: 0.5-1.0. Default 0.6.
 */
export const CONFLICT_SIMILARITY_THRESHOLD = parseFloat(process.env.HAWK_CONFLICT_THRESHOLD || '0.6');

/**
 * Similarity threshold for entity deduplication during capture.
 * When a new memory has similarity >= this to an existing entity memory,
 * the existing memory is updated rather than creating a new one.
 * Range: 0.5-1.0. Default 0.75.
 */
export const ENTITY_DEDUP_THRESHOLD = parseFloat(process.env.HAWK_ENTITY_DEDUP_THRESHOLD || '0.75');

/**
 * Number of recent sessions to check for entity dedup.
 * Prevents merging memories from very different contexts.
 * Range: 1-50. Default 10.
 */
export const ENTITY_DEDUP_SESSION_WINDOW = parseInt(process.env.HAWK_ENTITY_DEDUP_SESSION_WINDOW || '10', 10);

// ─── Value-Driven Tier System ───────────────────────────────────────────────────

/**
 * Effective importance score >= this AND recall_count >= 3 → TIER_PERMANENT.
 * Range: 0.0-1.0. Default 0.85.
 */
export const TIER_PERMANENT_MIN_SCORE = parseFloat(process.env.HAWK_TIER_PERMANENT_MIN_SCORE || '0.85');

/**
 * Effective importance score >= this → TIER_STABLE.
 * Range: 0.0-1.0. Default 0.6.
 */
export const TIER_STABLE_MIN_SCORE = parseFloat(process.env.HAWK_TIER_STABLE_MIN_SCORE || '0.6');

/**
 * Effective importance score >= this → TIER_DECAY.
 * Below this → TIER_ARCHIVED.
 * Range: 0.0-1.0. Default 0.3.
 */
export const TIER_DECAY_MIN_SCORE = parseFloat(process.env.HAWK_TIER_DECAY_MIN_SCORE || '0.3');

/**
 * Recency half-life in milliseconds for the exponential decay in computeEffectiveImportance.
 * Default 30 days.
 */
export const RECENCY_HALF_LIFE_MS = parseFloat(process.env.HAWK_RECENCY_HALF_LIFE_MS || String(30 * 24 * 60 * 60 * 1000));

/**
 * Weight of base importance in computeEffectiveImportance formula.
 * Range: 0.0-1.0. Default 0.4.
 */
export const WEIGHT_BASE = parseFloat(process.env.HAWK_WEIGHT_BASE || '0.4');

/**
 * Weight of usefulness_score in computeEffectiveImportance formula.
 * Range: 0.0-1.0. Default 0.3.
 */
export const WEIGHT_USEFULNESS = parseFloat(process.env.HAWK_WEIGHT_USEFULNESS || '0.3');

/**
 * Weight of recency in computeEffectiveImportance formula.
 * Range: 0.0-1.0. Default 0.2.
 */
export const WEIGHT_RECENCY = parseFloat(process.env.HAWK_WEIGHT_RECENCY || '0.2');

/**
 * Maximum bonus from recall_count in computeEffectiveImportance (log scale).
 * Range: 0.0-1.0. Default 0.1.
 */
export const ACCESS_BONUS_MAX = parseFloat(process.env.HAWK_ACCESS_BONUS_MAX || '0.1');
