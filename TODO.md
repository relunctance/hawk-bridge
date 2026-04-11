# hawk-bridge v1.3 Roadmap — 自我进化架构 L0 层补全

## 背景

hawk-bridge 是自我进化闭环的 L0 记忆层。需要补充与 L5 soul-force 的闭环接口，以及作为 L0→L1 触发层的能力。

---

## 当前能力 vs 架构需求差距

| 功能 | 当前 | 架构需求 | 状态 |
|------|------|----------|------|
| 记忆存储检索 | ✅ | ✅ | 完成 |
| L5→L0 写接口 | ❌ | ✅ | **待实现** |
| 向 soul-force 暴露读 API | ❌ | ✅ | **待实现** |
| L0→L1 自动触发 | ❌ | ✅ dream后触发 inspect | **待实现** |
| 进化结果专属 importance | ❌ | ✅ success=0.95/failure=0.25 | **待实现** |
| name/description 自动生成 | ⚠️ 字段有，capture未填充 | ✅ LLM提取时同步生成 | **部分缺失** |
| drift 超时自动 re-verify | ❌ | ✅ | **待实现** |

---

## 待实现功能

### P0 — 核心闭环接口（L0 ⇄ L5）

#### 1. `hawk_bridge write` 写接口

**目标**：给 L5 soul-force 提供写记忆的入口

**接口形式**：
```bash
python3 -m hawkbridge write \
  --text "[ISSUE-001] 修复成功: DTO在Logic层使用" \
  --category decision \
  --importance 0.9 \
  --source evolution-success \
  --metadata '{"issue_id": "ISSUE-001"}'
```

**实现位置**：`src/cli/write.ts` + `src/hooks/hawk-write/`

---

#### 2. `hawk_bridge read --source` 过滤查询

**目标**：soul-force 按 source 过滤读取记忆

**接口形式**：
```bash
python3 -m hawkbridge read \
  --source evolution-success \
  --source evolution-failure \
  --limit 20
```

**用途**：
- soul-force 读取历史进化结果
- 按 issue_id 追溯
- 统计进化效果

---

### P0 — 闭环触发：L0 → L1

#### 3. dream hook 完成后自动触发 L1 inspect

**目标**：dream 整合完成后，如果积累了 ≥5 条新记忆，自动触发 auto-evolve inspect

**实现方式**：
- dream hook 结束时检查新记忆数量
- 调用 `openclaw cron` 或发送 webhook 触发 inspect
- 配置项：
```yaml
hawk:
  autoInspect:
    enabled: true
    minNewMemories: 5
    triggerOnDream: true
```

---

### P1 — 进化感知：记忆带结构化描述

#### 4. capture 时 LLM 自动生成 name + description

**目标**：每次 capture 时，LLM 同步生成：
- `name`：记忆的简短标题（10-30字）
- `description`：一句话描述（50字内）

**效果**：
- dual selector 可用 header scan 选记忆
- 记忆可追溯、可审计
- 与 soul-force 的进化知识库对齐

**修改位置**：
- `context-hawk/hawk/extractor.py` — 提取时加 name/description 字段
- `src/hooks/hawk-capture/handler.ts` — 写入时包含 name/description

---

### P1 — 进化效果：专属 importance 级别

#### 5. evolution 专属 importance 级别

**目标**：区分来自进化成功/失败的记忆

**新增级别**：
```typescript
const EVOLUTION_SUCCESS = 0.95;  // 来自成功修复，高优
const EVOLUTION_FAILURE = 0.25;   // 来自失败记录，降权
```

**recall 行为**：
- `evolution_success` 记忆 → 固定出现在 top 3
- `evolution_failure` 记忆 → 需要明确触发词才出现

---

### P2 — 感知增强：drift 触发 re-verify

#### 6. drift 超时自动触发 re-verify

**目标**：过期记忆自动触发相关代码段的重新巡检

**触发条件**：
- 某记忆超过 `DRIFT_THRESHOLD_DAYS * 2` 未验证
- 且 reliability ≥ 0.5（可信记忆才触发）

**处理流程**：
1. hawk过期 检测到超期记忆
2. 记录 `issue_id` 关联
3. 自动触发 auto-evolve verify 对相关代码段
4. 验证结果写回 hawk-bridge

---

## 实现顺序建议

```
Step 1: hawk_bridge write CLI     ← L5 写入口
Step 2: hawk_bridge read --source  ← soul-force 追溯用
Step 3: name/description 自动生成  ← capture 时 LLM 同步
Step 4: evolution 专属 importance   ← 读写时区分
Step 5: dream 后触发 inspect      ← L0 → L1 闭环
Step 6: drift 超时 re-verify     ← 感知增强
Step 7: 多维质量分（A）           ← 给 L5 提供进化参考数据
Step 8: 感知反馈 L5→L1（B）     ← 成功经验反向优化 capture
Step 9: 跨项目经验迁移（C）      ← 新项目继承经验
Step 10: 主动验证（D）          ← 定时确认重要记忆
Step 11: 记忆版本历史（E）       ← 可审计、可回滚
```

---

## 更深层能力补全（v1.4+）

### A. 多维质量分

**目标**：reliability 之外新增三个维度，供 L5 进化参考

| 维度 | 说明 | 范围 |
|------|------|------|
| `quality` | 记忆内容质量（完整度、描述清晰度） | 0.0-1.0 |
| `utility` | 有用程度（被 recall 次数、带来价值） | 0.0-1.0 |
| `freshness` | 新鲜度（内容是否过时，不只是时间） | 0.0-1.0 |

**接口**：`hawk_bridge quality --id xxx` 查询记忆多维质量

---

### B. 感知反馈（L5 → L1）

**目标**：L5 成功修复的模式 → 反向影响 L1 capture 的加权策略

**实现**：
- L5 写 `evolution-success` 记忆时，同时写 `~/.hawk/evolution-tags.json`
- hawk-capture 读取该文件，动态调整同类内容的 importance threshold
- 例：某类内容多次成功修复 → capture 时该类 importance 上调 0.1

**效果**：capture 策略随进化动态优化

---

### C. 跨项目经验迁移

**目标**：项目 A 解决过的问题 → 推荐给遇到类似问题的项目 B

**实现**：
- 记忆按 `project` scope 隔离
- 新项目启动时，向相似项目学习经验
- `hawk recall --project-similar=laravel-ecommerce` 拉取跨项目经验

**效果**：新项目快速继承历史经验，少走弯路

---

### D. 主动验证（定时确认重要记忆）

**目标**：不只在 recall 时被动验证，而是主动去确认重要记忆是否还正确

**实现**：
- 定时任务（cron）扫描 reliability ≥ 0.7 的记忆
- 对每条记忆，grep 相关代码段，验证内容是否还匹配
- 不匹配 → 自动降级 reliability + 写入 driftNote
- 匹配 → reliability 小幅提升

**效果**：重要记忆不随时间失效

---

### E. 记忆版本历史（update 快照）

**目标**：每次 update 记录旧版本快照，支持回滚和审计

**实现**：
```json
{
  "id": "mem_xxx",
  "current_version": 3,
  "versions": [
    {"version": 1, "text": "...", "updated_at": "2026-01-01"},
    {"version": 2, "text": "...", "updated_at": "2026-03-15"},
    {"version": 3, "text": "...", "updated_at": "2026-04-12"}
  ]
}
```
- `hawk_bridge history --id xxx` 查看版本历史
- `hawk_bridge rollback --id xxx --version 2` 回滚到指定版本

**效果**：记忆修改可审计、可回滚

---

## 参考架构

```
L5 soul-force
    ↓ write --source evolution-success
hawk-bridge
    ↓ read --source evolution-success
    ↓ recall 时：success 高优，failure 低优
    ↓ dream 完成后 → 触发 auto-evolve inspect
```

---

## 更深层能力补全（v1.5+）

### F. MCP Memory Protocol 接口

**目标**：其他 AI 系统（如 Claude Code）通过 MCP 调用 hawk-bridge 记忆

**实现**：
- 实现 MCP tool：`memory.query(query) → memories`
- 其他 AI 工具通过 MCP 协议查询 hawk-bridge

```json
// MCP tool schema
{
  "name": "memory_query",
  "description": "Query hawk-bridge memory store",
  "input": { "query": "string", "topK": 5 },
  "output": [{ "text": "...", "importance": 0.9, "category": "fact" }]
}
```

---

### G. 记忆隐私层（fine-grained）

**目标**：personal / team / project 之外，细粒度可见性控制

**实现**：
- 新增 `visibility` 字段：`private | team-visible | project-visible | public`
- recall 时按可见性过滤
- team 内哪些记忆对哪些人可见可配置

**效果**：私人偏好不应该进入团队共享

---

### H. 记忆冲突自动解决

**目标**：检测矛盾记忆对，自动触发 verify 确认

**检测逻辑**：
- 同一 category 下，两条记忆内容关键词重叠 > 70%
- 但具体结论矛盾（如"A 是对的" vs "B 是对的"）
- 例："用户喜欢 Arial" vs "用户喜欢 Helvetica"

**处理流程**：
1. 检测到矛盾对 → 写入 `conflict_pairs`
2. 触发 verify → 确认哪个正确
3. 错误的降 reliability 或删除

---

### I. 记忆溯源（why this memory）

**目标**：recall 结果附带"为什么选这条"，可回答"你为什么记得这个"

**实现**：recall 输出附带命中原因

```json
[
  {
    "text": "用户是产品经理",
    "reason": "命中: 关键词'产品经理'重叠",
    "source": "2026-03-15 对话"
  }
]
```

---

### J. 记忆分析仪表盘

**目标**：分析记忆覆盖盲区和过载

**命令**：`hawk analyze`

**输出**：
- 记忆覆盖话题分布
- 完全没有覆盖的话题
- 过载话题（某类记忆太多）
- 建议："你聊了很多关于 X，但没记住 Y"

---

### K. Per-memory 独立 TTL

**目标**：不同类型记忆不同过期时间，不再一刀切

**capture 时自动判断**：

| 类型 | TTL | 例 |
|------|-----|----|
| 临时信息 | 7 天 | 会议改到3点 |
| 事实类 | 90 天 | 用户是产品经理 |
| 偏好类 | 180 天 | 用户喜欢 Arial |
| 永久信息 | 永不过期 | 用户工作 10 年 |

---

## 多租户支持（v1.6+）

### MT-1. tenant_id 上下文注入

**目标**：所有 API 支持 tenant_id 隔离

**实现**：
```typescript
// 改动前
hawk_bridge.add_memory(text: "...", category: "fact")

// 改动后
hawk_bridge.add_memory(text: "...", category: "fact", tenant_id: "self")
```

**隔离方式**：查询时加 `WHERE tenant_id = {current_tenant}`

---

### MT-2. 多租户目录结构

**目标**：记忆按 tenant_id 隔离存储

```
~/.hawk/
  lancedb/
    memory_{tenant_id}.lance.db   # 按租户分库
  audit_{tenant_id}.log
  config_{tenant_id}.yaml
```

---

### MT-3. Learnings 三层隔离

**目标**：Tenant/Team/Global 三层

| 层级 | 归属 | 隔离 |
|------|------|------|
| Tenant Learnings | 租户私有 | tenant_id 隔离 |
| Team Learnings | 租户内共享 | team_id 隔离 |
| Global Learnings | 厂商维护 | 所有租户可见 |

---

## 🏢 企业级 / 生产级能力补全（v2.0+）

> hawk-bridge 当前定位：个人开发工具。要往企业级走，需要以下能力。

### 当前定位 vs 企业级要求

| 维度 | 当前状态 | 企业级要求 | 优先级 |
|------|----------|----------|--------|
| 数据可靠性 | 单 LanceDB，无灾备 | 多副本 + 定期快照 + 异地容灾 | 🔴 P0 |
| 崩溃恢复 | 无 WAL，可能数据损坏 | ACID + WAL + 幂等写入 | 🔴 P0 |
| 安全隔离 | 无多租户，所有 agent 共用 DB | 租户级加密 + RBAC 访问控制 | 🔴 P0 |
| 敏感数据 | 明文存储 | 静态加密（BYOK）+ 字段级加密 | 🔴 P0 |
| 可观测性 | 无 metrics/tracing | OpenTelemetry + Prometheus + Grafana | 🔴 P0 |
| 水平扩展 | 单 LanceDB 实例 | 分布式向量库（Milvus/Pinecone） | 🔴 P0 |
| 冷热分层 | 全部存 LanceDB | 热数据向量库 + 冷数据对象存储 | 🟡 P1 |
| 操作工具 | 无 | backup / restore / migration / upgrade | 🟡 P1 |
| SLA 保障 | 无 | 99.9%+ 可用承诺 + SLO 监控 | 🟡 P1 |

---

### E-P0-1: 数据可靠性（多副本 + 快照）

**目标**：单机崩溃不丢数据

**实现**：
```yaml
# config.yaml
hawk:
  storage:
    replication: 3           # 3 副本
    snapshot_interval: 1h    # 每小时快照
    backup_destination: s3://hawk-backup/
    retention: 30d            # 快照保留 30 天
```

**验收标准**：
- 单机硬盘损坏 → 自动从副本恢复，数据零丢失
- 可恢复到任意时间点（within 快照间隔）

---

### E-P0-2: 崩溃恢复（WAL + 幂等写入）

**目标**：进程崩溃不损坏数据，重启后自动恢复

**实现**：
- 每次写入先写 WAL（Write-Ahead Log）
- WAL 完整后才能提交
- 重启时重放 WAL，恢复到一致状态
- 所有写入操作幂等（相同输入不重复写入）

**验收标准**：
- 进程 kill -9 → 重启后数据完整
- 写入 1000 条，断电 → 重启后数据一致

---

### E-P0-3: 多租户安全隔离（RBAC）

**目标**：不同租户的记忆完全隔离，不可跨租户访问

**实现**：
```typescript
interface Tenant {
  id: string;           // 租户唯一标识
  name: string;
  rbac_policy: RBACPolicy;
  encryption_key: string;  // BYOK，租户自己管理
}

interface RBACPolicy {
  can_read: string[];   // 可读的记忆 categories
  can_write: string[];   // 可写的记忆 categories
  can_delete: string[];  // 可删除的记忆 categories
  can_share: string[];   // 可共享的记忆 categories
}
```

**验收标准**：
- Tenant A 的记忆对 Tenant B 完全不可见
- 即使知道记忆 ID 也无法访问
- Admin 无法读取普通租户的私有记忆

---

### E-P0-4: 敏感数据静态加密

**目标**：记忆内容加密存储，密钥由租户自己管理

**实现**：
- BYOK（Bring Your Own Key）：租户提供加密密钥
- 字段级加密：importance、content、category 分别加密
- API 访问时解密，内存中明文使用

**验收标准**：
- 即使 DBA 直接查 DB 也无法读懂记忆内容
- 密钥轮换（key rotation）不丢数据

---

### E-P0-5: 可观测性（OpenTelemetry）

**目标**：完整的 metrics / traces / logs，出了问题可排查

**实现**：
```typescript
// 埋点指标
- hawk_memory_total{tenant, tier}        // 各 tier 记忆数量
- hawk_recall_latency_seconds{tenant}    // recall 延迟
- hawk_capture_total{tenant, category}  // capture 数量
- hawk_recall_hit_rate{tenant}           // recall 命中率
- hawk_importance_score{tenant, tier}    // 各 tier 平均 importance

// traces
- trace_id: 每条 recall 请求有唯一 trace
- span: capture / embed / search / inject 各阶段耗时
```

**验收标准**：
- Grafana 面板能看到所有指标
- trace ID 可串联 recall 全流程
- 告警规则：recall 延迟 > 500ms 触发告警

---

### E-P0-6: 水平扩展（分布式向量库）

**目标**：单实例不够用时，水平扩容

**实现**：
```yaml
# 从 LanceDB 迁移到 Milvus
hawk:
  vector_db:
    provider: milvus
    endpoints:
      - milvus-node-1:19530
      - milvus-node-2:19530
      - milvus-node-3:19530
    collection_shards: 6
```

**验收标准**：
- 1000 万记忆时，recall 延迟 < 100ms
- 扩容不停服
- 向量搜索结果与单机一致

---

### E-P1-1: 冷热分层存储

**目标**：久远/低价值记忆迁移到对象存储，省成本

**实现**：
```typescript
// 热数据：Tier.PERMANENT + Tier.STABLE → LanceDB（SSD）
// 冷数据：Tier.DECAY + Tier.ARCHIVED → S3/OSS（对象存储）

// 自动分层
if (memory.tier === TIER_DECAY && last_accessed < now - 7d) {
  await migrateToColdStorage(memory);  // 压缩后存 S3
}

// recall 时自动从冷存储捞回热层
if (isInColdStorage(memory)) {
  memory = await warmUp(memory);  // 解压，加载到 LanceDB
}
```

**验收标准**：
- 冷数据 recall 延迟 < 2s（可接受）
- 存储成本下降 70%

---

### E-P1-2: 操作工具链

**目标**：生产环境必备的运维工具

**命令集**：
```bash
# 备份
hawk-admin backup --tenant {id} --destination s3://...

# 恢复
hawk-admin restore --tenant {id} --from s3://.../backup-2026-04-12.tar.gz

# 迁移
hawk-admin migrate --from local --to milvus --tenant {id}

# 升级
hawk-admin upgrade --from 1.x --to 2.0 --backup

# 健康检查
hawk-admin health --tenant {id}
```

**验收标准**：
- 备份/恢复 RTO < 1 小时
- 升级不停服（蓝绿部署）

---

### E-P1-3: SLA / SLO 保障

**目标**：企业级可用性承诺

**SLO 定义**：
| 指标 | SLO |
|------|-----|
| recall 可用性 | 99.9% / 月 |
| recall P99 延迟 | < 500ms |
| capture 成功率 | 99.5% / 月 |
| 数据持久性 | 99.9999% / 年 |

**验收标准**：
- SLO 监控面板可见
- 违反 SLO 自动告警
- 有 credit 补偿机制

---

## 企业级 vs 个人版路线选择

| 方向 | 定位 | 复杂度 |
|------|------|--------|
| 当前路线（v1.x） | 个人开发工具 | 低 |
| 企业级路线（v2.x） | 多租户 SaaS / 企业内部署 | 极高 |

**建议**：hawk-bridge 当前聚焦 v1.x 闭环能力，企业级需求作为独立路线图。
