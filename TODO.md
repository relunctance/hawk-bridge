# 🦅 hawk-bridge Roadmap & TODO

> Last updated: 2026-04-10
> Based on: Unified Memory Architecture discussion with GQL

---

## 🎯 Unified Memory Architecture: 5-Tier × 3-Scope

### Core Concept

The unified architecture solves **two dimensions at once**:

| Dimension | Purpose | Values |
|-----------|---------|--------|
| **Tier** (时间维度) | Memory longevity | constitutional, lifetime, period, event, working |
| **Scope** (所有权维度) | Memory ownership | personal, org, system |

**5 Tiers × 3 Scopes = Complete coverage** from personal 100-year memory to enterprise ToB systems.

### Tier × Scope Matrix

```
            Scope →
Tier ↓      Personal      Org           System（外部企业系统）
─────────────────────────────────────────────────────────────
L0 宪法     个人价值观     企业宪章        连接器协议、数据契约
L1 生命     人生里程碑     企业里程碑      组织架构沿革
L2 周期     十年分桶       项目/财年周期   行业周期
L3 事件     日常记忆       团队决策        外部系统事件
L4 工作     会话上下文     项目上下文       实时数据流
```

### Unified Schema

```typescript
interface UnifiedMemory {
  id: string;
  fingerprint: string;           // SHA-256
  
  // Tier（时间维度）
  tier: 'constitutional' | 'lifetime' | 'period' | 'event' | 'working';
  
  // Scope（所有权维度）
  scope: {
    level: 'personal' | 'org' | 'system';
    entity?: string;             // org: 'market_dept'; system: 'SAP_ERP'
  };
  
  // 内容
  content: string;
  category: 'fact' | 'preference' | 'decision' | 'entity' | 'relationship';
  
  // 时间
  created: Date;
  expires: Date | null;         // null = 永久
  periodId?: string;            // L2 用：'2020_2029'
  
  // 溯源
  source: {
    type: 'user_interaction' | 'connector' | 'system';
    connectorId?: string;
    originalId?: string;
  };
  
  // 晋升链
  promotionHistory: {
    from: string;
    to: string;
    reason: string;
    date: Date;
  }[];
  
  // L0 宪法特殊字段
  amendments?: {
    id: string;
    text: string;
    date: Date;
  }[];
}
```

---

## 📋 Implementation Roadmap

### Phase 1: Constitutional Memory Foundation
**Target: v2.0**

- [ ] **Unified Schema Implementation**
  - [ ] Define `tier` + `scope` dual-field schema
  - [ ] Update `MemoryManager.store()` to accept tier + scope
  - [ ] Update `MemoryManager.recall()` to filter by tier + scope
  - [ ] Add `fingerprint` (SHA-256) generation on write
  - [ ] Add `promotionHistory` tracking

- [ ] **L0 Constitutional Layer**
  - [ ] `immutable: true` flag — constitutional memories cannot be modified/deleted
  - [ ] Amendment mode: new statements append via `amendments[]`, never overwrite
  - [ ] Multi-replica sync (GitHub + Gitee) for L0 memories
  - [ ] Constitutional consistency checker (L1 memories cannot contradict L0)

- [ ] **L1 Lifetime Layer**
  - [ ] `lifetime.milestone` schema with life phases
  - [ ] Milestone types: career, personal, relationship, health
  - [ ] Promotion pipeline: L3 → L1 with user confirmation
  - [ ] `related_constitutional_amendments` linking to L0

- [ ] **L2 Period Layer**
  - [ ] Decade bucket naming: `period_id: "2020_2029"`
  - [ ] Period closure: when decade ends, period becomes read-only archive
  - [ ] Era context fields for period memories

### Phase 2: DARK Archive System
**Target: v2.1**

- [ ] **DARK File Format (Dogged Archive Record Keeper)**
  - [ ] Each memory = one independent JSON file
  - [ ] Schema: `id`, `fingerprint`, `created`, `expires`, `tier`, `scope`, `content`, `source`, `migrated_at`
  - [ ] JSON files are self-contained — readable without any database

- [ ] **Cold Storage Pipeline**
  - [ ] Daily cron: `~/.hawk/archive/YYYY/MM/dark_YYYYMMDD_HHMMSS.json`
  - [ ] Git versioning: `git add ~/.hawk/archive/ && git commit && git push` (GitHub + Gitee)
  - [ ] Checksum verification on every write
  - [ ] Archive health check cron

- [ ] **Restore from Archive**
  - [ ] `rebuild_lancedb_from_archive()` script
  - [ ] Re-embedding on restore (use current embedding service)
  - [ ] Verification: checksum comparison pre/post restore

### Phase 3: Enterprise Connector System
**Target: v2.2**

- [ ] **Connector Interface (Plugin Contract)**
  - [ ] `EnterpriseConnector` interface definition
  - [ ] `fetch()`, `push?()`, `query()`, `health()` methods
  - [ ] Connector registry and lifecycle management

- [ ] **Built-in Connectors**
  - [ ] `FeishuConnector` — 飞书日历/文档/审批
  - [ ] `ConfluenceConnector` — 内部文档知识库
  - [ ] `JiraConnector` — 项目任务/Bug状态
  - [ ] `GitHubConnector` — 代码决策/PR评论
  - [ ] `SapConnector` — SAP ERP数据（可选，企业自选）

- [ ] **Scope=system Implementation**
  - [ ] System memories stored with `scope.level: 'system'`
  - [ ] Read-only by default (connector controls updates)
  - [ ] `push()` support: internal decisions → write back to external systems

### Phase 4: Org Memory Layer
**Target: v2.3**

- [ ] **Scope=org Foundation**
  - [ ] `org` memory schema: department, team, project
  - [ ] Access control: users only see their org's memories
  - [ ] Org hierarchy: company → department → team → project

- [ ] **Org Memory Features**
  - [ ] Department shared memory (市场部/研发部/销售部)
  - [ ] Team memory: current sprint, decisions, internal docs
  - [ ] Cross-team memory sharing (with permission)
  - [ ] Org-level OKR and strategy tracking

### Phase 5: Tier Promotion Engine
**Target: v2.4**

- [ ] **Smart Promotion Pipeline**
  - [ ] Track `access_count` per memory
  - [ ] LLM-based promotion assessment (score > threshold → proposal)
  - [ ] User confirmation flow for low-confidence promotions
  - [ ] Promotion: L3 → L2 → L1 → L0 with constitutional amendment

- [ ] **Decay + Promotion Balance**
  - [ ] Decay schedule: 30d → Short → 90d → Long → 1y → Archive → 5y → soft-delete → 10y → hard-delete
  - [ ] Promotion interrupts decay
  - [ ] Decay pause for user-suspended memories

### Phase 6: Query & Retrieval Upgrade
**Target: v2.5**

- [ ] **Tier-Aware Retrieval**
  - [ ] L0: Exact ID lookup (constitutional statements stable IDs)
  - [ ] L1: Timeline-ordered retrieval with phase context
  - [ ] L2: Period-based retrieval with era context
  - [ ] L3: Hybrid vector + BM25 (existing behavior)
  - [ ] Tier-weighted result ranking: Constitutional(0.4) > Lifetime(0.3) > Period(0.2) > Event(0.1)

- [ ] **Scope-Aware Retrieval**
  - [ ] Filter by `scope.level` (personal/org/system)
  - [ ] Filter by `scope.entity` (specific dept or system)
  - [ ] Cross-scope aggregation with weighted ranking
  - [ ] Role-based access control per scope

- [ ] **Unified Query Interface**
  ```typescript
  interface UnifiedQuery {
    text: string;
    tiers?: ('constitutional' | 'lifetime' | 'period' | 'event')[];
    scopes?: ('personal' | 'org' | 'system')[];
    orgEntity?: string;      // 'market_dept'
    systemEntity?: string;   // 'SAP_ERP'
    dateRange?: { start: Date; end: Date };
  }
  ```

---

## 🔧 Technical TODOs

### Schema Changes (v2.0)
- [ ] Add `tier` field: `constitutional | lifetime | period | event | working`
- [ ] Add `scope.level` field: `personal | org | system`
- [ ] Add `scope.entity` field (optional string)
- [ ] Add `fingerprint` field (SHA-256)
- [ ] Add `periodId` field for period-tier
- [ ] Add `promotionHistory[]` array
- [ ] Add `amendments[]` for constitutional tier
- [ ] Add `source.connectorId` and `source.originalId`

### API Changes
- [ ] `MemoryManager.store(tier, scope, ...)` — tier + scope required
- [ ] `MemoryManager.recall(query: UnifiedQuery)` — unified query interface
- [ ] `MemoryManager.promote(memoryId, targetTier)` — tier promotion
- [ ] `MemoryManager.verifyIntegrity()` — consistency report
- [ ] `ConnectorRegistry.register(connector)` — plugin system
- [ ] `ConnectorRegistry.get(id)` — lookup connector

### Configuration
- [ ] `memory.tierDefaults` — default tier per scope
- [ ] `memory.scopeAccessControl` — role-based scope permissions
- [ ] `connectors` — connector registry config
- [ ] `archive.enabled` — DARK archive toggle
- [ ] `archive.gitRemotes[]` — multi-platform sync
- [ ] `archive.dailyCron` — archive schedule

---

## 📊 Milestones

| Version | Theme | Target |
|---------|-------|--------|
| v1.x | Current: 4-tier decay, hybrid retrieval | ✅ Released |
| v2.0 | Unified Schema + L0/L1 Constitutional + L2 Period | TBD |
| v2.1 | DARK Archive + Cold Storage pipeline | TBD |
| v2.2 | Enterprise Connector System + Scope=system | TBD |
| v2.3 | Org Memory Layer + Scope=org | TBD |
| v2.4 | Tier Promotion Engine | TBD |
| v2.5 | Tier-Aware + Scope-Aware Retrieval | TBD |

---

## 💡 Design Principles

1. **Tier = Time dimension** — how long the memory lives (100+ years for constitutional)
2. **Scope = Ownership dimension** — whose memory (personal/org/system)
3. **Constitutional Layer is the anchor** — memories either become constitutional or fade away
4. **DARK File Format** — every memory = one independent JSON file (never depend on a database)
5. **Append-only** — no overwrite, no delete without explicit user action
6. **Multi-replica** — GitHub + Gitee + local NAS (no single point of failure)
7. **Connector Plugin System** — enterprises plug in their own systems as Scope=system
8. **Migration-ready** — format can change, content must survive 100 years

---

## 🔗 References

- Design discussion: 2026-04-10 conversation with GQL
- Core analogy: 国家宪法层级 (Constitutional hierarchy) + 企业组织架构 (Org structure)
- Human life stages: 幼年 → 成年 → 中年 → 老年
- Enterprise life stages: 初创 → 爬升期 → 稳定期 → 衰退期
- 5 Tiers × 3 Scopes = Unified Memory Architecture for personal 100-year + enterprise ToB
