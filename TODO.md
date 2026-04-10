# 🦅 hawk-bridge Roadmap & TODO

> Last updated: 2026-04-10
> Based on: "记忆宪法" design discussion with GQL

---

## 🎯 50-Year Memory Architecture (Core Roadmap)

### Phase 1: Constitutional Memory Foundation
**Target: v2.0**

- [ ] **L0 Constitutional Layer**
  - [ ] Define `constitutional` memory tier schema
  - [ ] Implement `immutable: true` flag — constitutional memories cannot be modified/deleted
  - [ ] Amendment mode: new statements append, never overwrite
  - [ ] Constitutional memories stored with multi-replica sync (GitHub + Gitee)
  - [ ] `related_constitutional_amendments` linking for cross-tier references

- [ ] **L1 Lifetime Layer**
  - [ ] Define `lifetime.milestone` memory schema
  - [ ] Milestone events: career, personal, relationship, health
  - [ ] Life phase tracking (幼年 → 求学 → 职业期 → 退休)
  - [ ] Promotion pipeline: L3 events → L1 lifetime memories
  - [ ] `related_constitutional_amendments` linking to L0

- [ ] **Cross-tier Integrity**
  - [ ] Integrity verification cron job (checksum validation)
  - [ ] Constitutional consistency checker (no L1 memory contradicts L0)

### Phase 2: DARK Archive System
**Target: v2.1**

- [ ] **DARK File Format (Dogged Archive Record Keeper)**
  - [ ] Each memory = one independent JSON file
  - [ ] Schema: `id`, `fingerprint` (SHA-256), `created`, `expires`, `category`, `scope`, `content`, `source`, `decay_tier`, `vector_embedding`, `migrated_at`
  - [ ] JSON files are self-contained — readable without any database

- [ ] **Cold Storage Pipeline**
  - [ ] Daily cron job: `~/.hawk/archive/YYYY/MM/dark_YYYYMMDD_HHMMSS.json`
  - [ ] Git-based versioning: `git add ~/.hawk/archive/ && git commit && git push` (GitHub + Gitee dual push)
  - [ ] Checksum verification on every write
  - [ ] Archive verification alerting (daily health check)

- [ ] **Multi-Platform Replication**
  - [ ] GitHub primary repository
  - [ ] Gitee mirror (automatic sync)
  - [ ] Optional: AWS S3 Glacier / 阿里云归档 bucket
  - [ ] Local NAS backup with 3-2-1 rule

### Phase 3: Format Migration System
**Target: v2.2**

- [ ] **Format Migration Infrastructure**
  - [ ] Migration scripts versioned in Git alongside data
  - [ ] Each migration: vN → v(N+1) with rollback capability
  - [ ] Re-embedding on migration (use current embedding service)
  - [ ] Migration verification: checksum comparison pre/post

- [ ] **Scheduled Migration Cadence**
  - [ ] Every 5 years: major format review and migration
  - [ ] Annual: minor format cleanup
  - [ ] Migration log: who, when, what changed

### Phase 4: Tier Promotion Engine
**Target: v2.3**

- [ ] **Smart Promotion Pipeline**
  - [ ] Track `access_count` per memory
  - [ ] LLM-based promotion assessment (score > threshold → proposal)
  - [ ] User confirmation flow for low-confidence promotions
  - [ ] Promotion from L3 → L1 with constitutional amendment creation
  - [ ] Promotion history log

- [ ] **Decay + Promotion Balance**
  - [ ] L3 decay schedule: 30d → Short → 90d → Long → 1y → Archive → 5y → soft-delete → 10y → hard-delete
  - [ ] Promotion interrupts decay (promoted memories bypass decay)
  - [ ] Decay pause option (user-suspend decay for specific memories)

### Phase 5: Query & Retrieval Upgrade
**Target: v2.4**

- [ ] **Tier-Aware Retrieval**
  - [ ] L0: Exact ID lookup (constitutional statements have stable IDs)
  - [ ] L1: Timeline-ordered retrieval with phase context
  - [ ] L2: Period-based retrieval with era context
  - [ ] L3: Hybrid vector + BM25 retrieval (existing behavior)
  - [ ] Tier-weighted result ranking (L0 > L1 > L2 > L3)

- [ ] **Constitutional Memory Query Interface**
  - [ ] `recall_constitutional(query)` — exact match with ID preservation
  - [ ] `recall_lifetime(person)` — all milestones for a person/entity
  - [ ] `recall_period(year_range)` — all memories from specific era

---

## 🔧 Technical TODOs

### Storage & Durability
- [ ] Implement DARK file writer (append-only JSON per memory)
- [ ] Implement archive verification cron job
- [ ] Add SHA-256 fingerprinting to all memories at write time
- [ ] Build restore-from-archive script (rebuild LanceDB from DARK files)
- [ ] Dual Git push script (GitHub + Gitee)

### Schema Changes
- [ ] Add `tier` field: `constitutional | lifetime | period | event | working`
- [ ] Add `immutable` field (boolean)
- [ ] Add `expires` field with null = permanent
- [ ] Add `fingerprint` field (SHA-256)
- [ ] Add `period_id` field for period-tier memories
- [ ] Add `promotion_history` array field

### API Changes
- [ ] `MemoryManager.store()` accepts `tier` parameter
- [ ] `MemoryManager.promote(memory_id, target_tier)` 
- [ ] `MemoryManager.recall()` respects tier-aware ranking
- [ ] `MemoryManager.verify_integrity()` returns consistency report

### Configuration
- [ ] Add `archive.enabled` config flag
- [ ] Add `archive.darkFileDir` path config
- [ ] Add `archive.gitRemotes` array (multi-platform)
- [ ] Add `archive.coldStorage` config (S3/阿里云)
- [ ] Add `archive.dailyArchiveCron` schedule
- [ ] Add `constitutional.immutableCategories` list
- [ ] Add `capture.promotionThreshold` score

---

## 📊 Milestones

| Version | Theme | Target |
|---------|-------|--------|
| v1.x | Current: 4-tier decay, hybrid retrieval | ✅ Released |
| v2.0 | Constitutional + Lifetime memory layers | TBD |
| v2.1 | DARK Archive + Cold Storage pipeline | TBD |
| v2.2 | Format migration system | TBD |
| v2.3 | Tier promotion engine | TBD |
| v2.4 | Tier-aware retrieval | TBD |

---

## 💡 Design Principles

1. **Constitutional Layer is the anchor** — all memories eventually become constitutional or fade away
2. **Every memory is a file** — never depend on a database format for long-term storage
3. **Append-only** — no overwrite, no delete without explicit user action
4. **Multi-replica** — GitHub + Gitee + local NAS = no single point of failure
5. **Migration-ready** — format can change, content must survive
6. **User in the loop** — promotions and deletions require user confirmation for constitutional memories

---

## 🔗 References

- Design discussion: 2026-04-10 conversation with GQL
- Core analogy: 国家宪法层级 (Constitutional hierarchy) applied to memory architecture
- Human life stages: 幼年 → 成年 → 中年 → 老年
- Enterprise life stages: 初创 → 爬升期 → 稳定期 → 衰退期
