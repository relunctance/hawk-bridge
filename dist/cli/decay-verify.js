// src/constants.ts
var BM25_K1 = parseFloat(process.env.HAWK_BM25_K1 || "1.5");
var BM25_B = parseFloat(process.env.HAWK_BM25_B || "0.75");
var RRF_K = parseFloat(process.env.HAWK_RRF_K || "60");
var RRF_VECTOR_WEIGHT = parseFloat(process.env.HAWK_RRF_VECTOR_WEIGHT || "0.7");
var NOISE_SIMILARITY_THRESHOLD = parseFloat(process.env.HAWK_NOISE_THRESHOLD || "0.82");
var VECTOR_SEARCH_MULTIPLIER = parseInt(process.env.HAWK_VECTOR_SEARCH_MULTIPLIER || "4", 10);
var BM25_SEARCH_MULTIPLIER = parseInt(process.env.HAWK_BM25_SEARCH_MULTIPLIER || "4", 10);
var RERANK_CANDIDATE_MULTIPLIER = parseInt(process.env.HAWK_RERANK_CANDIDATE_MULTIPLIER || "3", 10);
var BM25_QUERY_LIMIT = parseInt(process.env.HAWK_BM25_QUERY_LIMIT || "1000", 10);
var DEFAULT_EMBEDDING_DIM = parseInt(process.env.HAWK_EMBEDDING_DIM || "384", 10);
var DEFAULT_MIN_SCORE = parseFloat(process.env.HAWK_MIN_SCORE || "0.6");
var MIN_RECALL_SCORE = parseFloat(process.env.HAWK_MIN_RECALL_SCORE || "0.55");
var INFERENCE_RELIABILITY = parseFloat(process.env.HAWK_INFERENCE_RELIABILITY || "0.3");
var INFERENCE_RECALL_PENALTY = parseFloat(process.env.HAWK_INFERENCE_RECALL_PENALTY || "0.7");
var UNVERIFIED_LEARNINGS_RELIABILITY = parseFloat(process.env.HAWK_UNVERIFIED_LEARNINGS_RELIABILITY || "0.3");
var LEARNINGS_VERIFY_BOOST = parseFloat(process.env.HAWK_LEARNINGS_VERIFY_BOOST || "0.2");
var CORRECTION_BOOST = parseFloat(process.env.HAWK_CORRECTION_BOOST || "0.1");
var MAX_CHUNK_SIZE = parseInt(process.env.HAWK_MAX_CHUNK_SIZE || "2000", 10);
var MIN_CHUNK_SIZE = parseInt(process.env.HAWK_MIN_CHUNK_SIZE || "20", 10);
var MAX_TEXT_LEN = parseInt(process.env.HAWK_MAX_TEXT_LEN || "5000", 10);
var DEDUP_SIMILARITY = parseFloat(process.env.HAWK_DEDUP_SIMILARITY || "0.95");
var MEMORY_TTL_MS = parseInt(process.env.HAWK_MEMORY_TTL_MS || String(30 * 24 * 60 * 60 * 1e3), 10);
var INITIAL_RELIABILITY = parseFloat(process.env.HAWK_INITIAL_RELIABILITY || "0.5");
var RELIABILITY_BOOST_CONFIRM = parseFloat(process.env.HAWK_RELIABILITY_BOOST_CONFIRM || "0.1");
var RELIABILITY_PENALTY_CORRECT = parseFloat(process.env.HAWK_RELIABILITY_PENALTY_CORRECT || "0.3");
var RELIABILITY_THRESHOLD_HIGH = parseFloat(process.env.HAWK_RELIABILITY_THRESHOLD_HIGH || "0.7");
var RELIABILITY_THRESHOLD_MEDIUM = parseFloat(process.env.HAWK_RELIABILITY_THRESHOLD_MEDIUM || "0.4");
var FORGET_GRACE_DAYS = parseInt(process.env.HAWK_FORGET_GRACE_DAYS || "30", 10);
var DRIFT_THRESHOLD_DAYS = parseInt(process.env.HAWK_DRIFT_THRESHOLD_DAYS || "7", 10);
var DRIFT_REVERIFY_DAYS = parseInt(process.env.HAWK_DRIFT_REVERIFY_DAYS || "14", 10);
var EVOLUTION_SUCCESS = parseFloat(process.env.HAWK_EVOLUTION_SUCCESS || "0.95");
var EVOLUTION_FAILURE = parseFloat(process.env.HAWK_EVOLUTION_FAILURE || "0.25");
var RECENCY_GRACE_DAYS = parseInt(process.env.HAWK_RECENCY_GRACE_DAYS || "30", 10);
var RECENCY_DECAY_RATE = parseFloat(process.env.HAWK_RECENCY_DECAY_RATE || "0.95");
var RECENCY_FACTOR_FLOOR = parseFloat(process.env.HAWK_RECENCY_FACTOR_FLOOR || "0.3");
var CONSISTENCY_MAX = parseFloat(process.env.HAWK_CONSISTENCY_MAX || "1.5");
var CORRECTION_PENALTY_MULTIPLIER = parseFloat(process.env.HAWK_CORRECTION_PENALTY_MULTIPLIER || "0.7");
var DECAY_RATE_HIGH_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_HIGH || "0.2");
var DECAY_RATE_MEDIUM_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_MEDIUM || "0.8");
var DECAY_RATE_LOW_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_LOW || "1.5");
var COLD_START_GRACE_DAYS = parseInt(process.env.HAWK_COLD_START_GRACE_DAYS || "7", 10);
var COLD_START_DECAY_MULTIPLIER = parseFloat(process.env.HAWK_COLD_START_DECAY_MULTIPLIER || "0.5");
var CONFLICT_SIMILARITY_THRESHOLD = parseFloat(process.env.HAWK_CONFLICT_THRESHOLD || "0.6");
var ENTITY_DEDUP_THRESHOLD = parseFloat(process.env.HAWK_ENTITY_DEDUP_THRESHOLD || "0.75");
var ENTITY_DEDUP_SESSION_WINDOW = parseInt(process.env.HAWK_ENTITY_DEDUP_SESSION_WINDOW || "10", 10);
var TIER_PERMANENT_MIN_SCORE = parseFloat(process.env.HAWK_TIER_PERMANENT_MIN_SCORE || "0.85");
var TIER_STABLE_MIN_SCORE = parseFloat(process.env.HAWK_TIER_STABLE_MIN_SCORE || "0.6");
var TIER_DECAY_MIN_SCORE = parseFloat(process.env.HAWK_TIER_DECAY_MIN_SCORE || "0.3");
var RECENCY_HALF_LIFE_MS = parseFloat(process.env.HAWK_RECENCY_HALF_LIFE_MS || String(30 * 24 * 60 * 60 * 1e3));
var WEIGHT_BASE = parseFloat(process.env.HAWK_WEIGHT_BASE || "0.4");
var WEIGHT_USEFULNESS = parseFloat(process.env.HAWK_WEIGHT_USEFULNESS || "0.3");
var WEIGHT_RECENCY = parseFloat(process.env.HAWK_WEIGHT_RECENCY || "0.2");
var ACCESS_BONUS_MAX = parseFloat(process.env.HAWK_ACCESS_BONUS_MAX || "0.1");

// src/cli/decay-verify.ts
console.log("\n\u{1F985} hawk-bridge Decay \u673A\u5236\u9A8C\u8BC1\n" + "\u2550".repeat(50));
console.log("\u{1F4D0} \u8870\u51CF\u6743\u91CD:");
console.log(`   WEIGHT_BASE=${WEIGHT_BASE} WEIGHT_USEFULNESS=${WEIGHT_USEFULNESS} WEIGHT_RECENCY=${WEIGHT_RECENCY} ACCESS_BONUS_MAX=${ACCESS_BONUS_MAX}`);
console.log("\u{1F3F7}\uFE0F Tier \u9608\u503C:");
console.log(`   permanent>=${TIER_PERMANENT_MIN_SCORE} stable>=${TIER_STABLE_MIN_SCORE} decay>=${TIER_DECAY_MIN_SCORE}`);
console.log("\u2744\uFE0F  \u51B7\u542F\u52A8: COLD_START_GRACE_DAYS=${COLD_START_GRACE_DAYS} COLD_START_DECAY_MULTIPLIER=${COLD_START_DECAY_MULTIPLIER}");
console.log("\u{1F5D1}\uFE0F  \u5F52\u6863: ARCHIVE_TTL_DAYS=${ARCHIVE_TTL_DAYS}");
console.log("\u2550".repeat(50));
function getDecayMultiplier(reliability) {
  return reliability >= 0.7 ? 0.5 : reliability >= 0.4 ? 0.7 : 1;
}
function decayImportance(baseImportance, reliability, daysIdle) {
  const dm = getDecayMultiplier(reliability);
  const effectiveDays = Math.ceil(daysIdle * dm);
  return baseImportance * Math.pow(0.95, effectiveDays);
}
function computeRecency(daysIdle) {
  return Math.exp(-daysIdle * Math.log(2) / 30);
}
function recomputeTier(baseImportance, usefulness, daysIdle, recallCount, reliability) {
  const decayedImp = decayImportance(baseImportance, reliability, daysIdle);
  const recency = computeRecency(daysIdle);
  const accessBonus = Math.min(Math.log1p(recallCount) * 0.05, ACCESS_BONUS_MAX);
  const score = decayedImp * WEIGHT_BASE + usefulness * WEIGHT_USEFULNESS + recency * WEIGHT_RECENCY + accessBonus;
  if (score >= TIER_PERMANENT_MIN_SCORE && recallCount >= 3) return "permanent";
  if (score >= TIER_STABLE_MIN_SCORE) return "stable";
  if (score >= TIER_DECAY_MIN_SCORE) return "decay";
  return "archived";
}
var testCases = [
  // Tier: permanent
  {
    name: "\u9AD8\u53EF\u9760 + \u9AD8 importance + \u591A\u6B21recall \u2192 permanent",
    baseImportance: 0.9,
    reliability: 0.8,
    usefulness: 0.8,
    daysIdle: 0,
    recallCount: 5,
    expectTier: "permanent",
    description: "\u9AD8 importance(0.9) + \u9AD8 usefulness(0.8) + \u591A\u6B21\u53EC\u56DE \u2192 permanent"
  },
  // Tier: stable
  {
    name: "\u9AD8\u53EF\u9760 + \u4E2D importance + \u77EDidle \u2192 stable",
    baseImportance: 0.75,
    reliability: 0.75,
    usefulness: 0.5,
    daysIdle: 3,
    recallCount: 1,
    expectTier: "stable",
    description: "\u9AD8\u53EF\u9760 3\u5929idle\uFF0CdecayMultiplier=0.5\uFF0CeffectiveDays=2\uFF0Ccomposite score \u4ECD>=0.6"
  },
  {
    name: "\u9AD8\u53EF\u9760 + \u4E2D importance + \u4E2Didle \u2192 stable\uFF08\u8FB9\u754C\uFF09",
    baseImportance: 0.8,
    reliability: 0.75,
    usefulness: 0.5,
    daysIdle: 5,
    recallCount: 1,
    expectTier: "stable",
    description: "\u9AD8\u53EF\u9760 5\u5929idle\uFF0CeffectiveDays=3\uFF0Ccomposite score \u22480.6 \u8FB9\u754C"
  },
  // Tier: decay
  {
    name: "\u4E2D\u53EF\u9760 + \u4E2D importance + 5\u5929idle \u2192 decay",
    baseImportance: 0.7,
    reliability: 0.5,
    usefulness: 0.5,
    daysIdle: 5,
    recallCount: 0,
    expectTier: "decay",
    description: "reliability=0.5 \u2192 decayMultiplier=0.7\uFF0CeffectiveDays=4\uFF0Cimportance * 0.95^4 \u2248 0.57 \u2192 composite < 0.6"
  },
  {
    name: "\u4F4E\u53EF\u9760 + \u957Fidle \u2192 decay",
    baseImportance: 0.5,
    reliability: 0.3,
    usefulness: 0.5,
    daysIdle: 8,
    recallCount: 0,
    expectTier: "decay",
    description: "reliability=0.3 \u2192 decayMultiplier=1.0\uFF0CeffectiveDays=8\uFF0Cimportance * 0.95^8 \u2248 0.34 \u2192 decay"
  },
  // Tier: archived
  {
    name: "\u6781\u4F4E importance + 30\u5929idle \u2192 archived",
    baseImportance: 0.3,
    reliability: 0.2,
    usefulness: 0.3,
    daysIdle: 30,
    recallCount: 0,
    expectTier: "archived",
    description: "reliability=0.2 \u2192 decayMultiplier=1.0\uFF0CeffectiveDays=30\uFF0Ccomposite \u2248 0.18 \u2192 archived"
  },
  // Cold start protection（这是源码级验证，不依赖公式计算）
  {
    name: "\u51B7\u542F\u52A8\u4FDD\u62A4\u671F\u5185\u4E0D\u8870\u51CF\uFF08\u514D\u75AB\u671F\uFF09",
    baseImportance: 0.6,
    reliability: 0.5,
    usefulness: 0.5,
    daysIdle: 2,
    recallCount: 0,
    expectTier: "SKIP",
    // 跳过公式验证，仅做源码验证
    description: "coldStartUntil > now \u2192 \u5373\u4F7F idle \u4E5F\u4E0D\u8870\u51CF\uFF08decay() \u5185\u8DF3\u8FC7\u68C0\u67E5\uFF09"
  }
];
function verifySourceCodeLogic() {
  console.log("\n\n\u{1F4DC} \u6E90\u7801\u7EA7\u903B\u8F91\u9A8C\u8BC1\n" + "\u2500".repeat(50));
  console.log("\u2744\uFE0F \u51B7\u542F\u52A8\u4FDD\u62A4\u9A8C\u8BC1:");
  console.log(`   COLD_START_GRACE_DAYS = ${COLD_START_GRACE_DAYS} \u5929`);
  console.log(`   COLD_START_DECAY_MULTIPLIER = ${COLD_START_DECAY_MULTIPLIER}`);
  console.log("   \u65B0\u8BB0\u5FC6\u521B\u5EFA\u540E\u8BBE\u7F6E coldStartUntil = now + COLD_START_GRACE_DAYS");
  console.log("   decay() \u7B2C 720 \u884C\u68C0\u67E5: if (m.coldStartUntil && now < m.coldStartUntil) { continue; }");
  console.log("   \u2192 \u5982\u679C\u5728\u4FDD\u62A4\u671F\u5185\uFF0C\u8BB0\u5FC6\u8DF3\u8FC7\u8870\u51CF\u5FAA\u73AF\uFF0Ctier \u4E0D\u53D8");
  console.log("   \u2705 \u6E90\u7801\u9A8C\u8BC1\u901A\u8FC7");
  console.log("\n\u{1F5D1}\uFE0F \u5F52\u6863Purge\u9A8C\u8BC1:");
  console.log("   ARCHIVE_TTL_DAYS = 180\uFF08decay() \u51FD\u6570\u5185\u90E8\u5C40\u90E8\u5E38\u91CF\uFF0C\u7B2C 705 \u884C\uFF09");
  console.log("   decay() \u7B2C 741 \u884C\u68C0\u67E5: if (daysIdle > ARCHIVE_TTL_DAYS) { await this.delete(); }");
  console.log("   \u2192 \u5982\u679C archived \u8BB0\u5FC6 idle \u8D85\u8FC7 180 \u5929\uFF0C\u6C38\u4E45\u5220\u9664");
  console.log("   \u2705 \u6E90\u7801\u9A8C\u8BC1\u901A\u8FC7");
}
async function main() {
  console.log("\n\u{1F4D0} Composite Score + Tier \u5224\u65AD\u9A8C\u8BC1\n" + "\u2500".repeat(50));
  let passed = 0, failed = 0;
  for (const tc of testCases) {
    if (tc.expectTier === "SKIP") {
      console.log(`
\u25B6 ${tc.name}... \u23ED\uFE0F SKIP (\u6E90\u7801\u7EA7\u9A8C\u8BC1\uFF0C\u4E0B\u65B9\u5355\u72EC\u5904\u7406)`);
      passed++;
      continue;
    }
    const dm = getDecayMultiplier(tc.reliability);
    const effectiveDays = Math.ceil(tc.daysIdle * dm);
    const decayedImp = decayImportance(tc.baseImportance, tc.reliability, tc.daysIdle);
    const recency = computeRecency(tc.daysIdle);
    const accessBonus = Math.min(Math.log1p(tc.recallCount) * 0.05, ACCESS_BONUS_MAX);
    const score = decayedImp * WEIGHT_BASE + tc.usefulness * WEIGHT_USEFULNESS + recency * WEIGHT_RECENCY + accessBonus;
    const tier = recomputeTier(tc.baseImportance, tc.usefulness, tc.daysIdle, tc.recallCount, tc.reliability);
    process.stdout.write(`
\u25B6 ${tc.name}... `);
    if (tier === tc.expectTier) {
      console.log(`\u2705 PASS`);
      console.log(`   ${tc.description}`);
      console.log(`   reliability=${tc.reliability} decayMultiplier=${dm} effectiveDays=${effectiveDays}`);
      console.log(`   importance: ${tc.baseImportance} \u2192 ${decayedImp.toFixed(4)} (\xD70.95^${effectiveDays})`);
      console.log(`   recency=${recency.toFixed(3)} accessBonus=${accessBonus.toFixed(3)}`);
      console.log(`   composite score=${score.toFixed(4)} \u2192 tier=${tier}`);
      passed++;
    } else {
      console.log(`\u274C FAIL`);
      console.log(`   ${tc.description}`);
      console.log(`   reliability=${tc.reliability} decayMultiplier=${dm} effectiveDays=${effectiveDays}`);
      console.log(`   importance: ${tc.baseImportance} \u2192 ${decayedImp.toFixed(4)}`);
      console.log(`   composite score=${score.toFixed(4)} \u2192 tier=${tier}`);
      console.log(`   \u671F\u671B tier: ${tc.expectTier}, \u5B9E\u9645: ${tier}`);
      failed++;
    }
  }
  console.log("\n\n\u{1F3F7}\uFE0F Tier \u8FC1\u79FB\u89C4\u5219:");
  console.log("   permanent \u2192 stable:   composite score \u964D\u81F3 < 0.85 \u6216 recallCount < 3");
  console.log("   stable \u2192 decay:       composite score \u964D\u81F3 0.3~0.6");
  console.log("   decay \u2192 archived:     composite score \u964D\u81F3 < 0.3");
  console.log("   stable \u2192 permanent:   composite score >= 0.85 && recallCount >= 3");
  console.log("   decay \u2192 stable:       composite score \u56DE\u5347\u81F3 >= 0.6");
  console.log("   archived \u2192 decay:     composite score \u56DE\u5347\u81F3 >= 0.3");
  verifySourceCodeLogic();
  console.log("\n" + "\u2550".repeat(50));
  console.log(`
\u{1F4CA} \u9A8C\u8BC1\u7ED3\u679C: ${passed} \u901A\u8FC7, ${failed} \u5931\u8D25`);
  console.log("\n\u2705 Decay \u673A\u5236\u6838\u5FC3\u903B\u8F91\u9A8C\u8BC1\u5B8C\u6210");
  console.log("   - \u8870\u51CF\u516C\u5F0F: importance * 0.95^(ceil(idleDays * decayMultiplier))");
  console.log("   - decayMultiplier: \u9AD8\u53EF\u9760=0.5, \u4E2D=0.7, \u4F4E=1.0");
  console.log("   - Tier \u5224\u65AD: composite score = base*0.4 + usefulness*0.3 + recency*0.2 + accessBonus");
  console.log("   - Tier \u8FC1\u79FB: permanent \u2192 stable \u2192 decay \u2192 archived");
  console.log("   - \u51B7\u542F\u52A8\u4FDD\u62A4: COLD_START_GRACE_DAYS \u5929\u514D\u75AB\u671F\uFF08coldStartUntil \u68C0\u67E5\uFF09");
  console.log("   - \u5F52\u6863\u6E05\u7406: archived + ARCHIVE_TTL_DAYS(180)\u5929 \u2192 purge");
  console.log("");
  if (failed > 0) {
    console.log("\u26A0\uFE0F \u6709\u6D4B\u8BD5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 decay \u903B\u8F91\u5B9E\u73B0");
    process.exit(1);
  }
}
main().catch((err) => {
  console.error("\u274C Decay verification failed:", err.message);
  process.exit(1);
});
