# hawk-bridge v1.3 Roadmap — 自我进化架构 L0 层补全

## 背景

hawk-bridge 是自我进化闭环的 L0 记忆层。需要补充与 L5 soul-force 的闭环接口，以及作为 L0→L1 触发层的能力。

---

## 分布式记忆系统路线图（v2.0 目标）

> 定位：独立分布式记忆系统，吸星大法——吸收 memory-core 优势，超越其局限
> 目标：多租户 + 水平扩展 + 企业级可靠性

---

### 阶段一：地基工程（分布式前提）✅ 启动

> 完成时间：2026-04-12 开始
> 目标：SQLite 存储 + 多租户隔离预留 + Temporal Decay

| 任务 | 文件 | 状态 |
|------|------|------|
| **SQLite 替代 JSON 存储** | `context-hawk/hawk/memory.py` | ✅ 完成（2026-04-12） |
| **tenant_id 字段预留** | `context-hawk/hawk/memory.py` | ✅ 完成（字段已加） |
| **WAL 事务日志** | `context-hawk/hawk/memory.py` | ✅ 完成 |
| **懒删除机制** | `context-hawk/hawk/memory.py` | ✅ 完成 |
| **100年永久存储架构布局** | `context-hawk/hawk/memory.py` | ✅ 完成（2026-04-12） |
| **Temporal Decay 时间衰减** | `context-hawk/hawk/memory.py` | ✅ 完成（整合懒删除） |

**验收标准**：
- MemoryManager 读写全部走 SQLite，memories.json 不再使用
- 所有记忆表有 `tenant_id` 字段（default="self"）
- 超过 TTL 的记忆在 store/recall 时自动懒删除
- 写入先写 WAL，重启可恢复
- tier/permanence_policy/storage_tier 字段已埋入 schema（向后兼容）
- memory_tiers 表已创建（5-Tier 预定义数据）

---

### 100年永久存储架构方案（未来可低成本升级）

> 目标：今天布局，未来随时可以低成本升级到完整 5-Tier × 3-Scope 永久存储体系
> 核心原则：**接口和字段先预留，实现分阶段，逐步激活**

#### 1. 数据模型（现在就要埋进去）

**扩展的 MemoryItem**：
```python
@dataclass
class MemoryItem:
    # ── 现有字段（保留，向后兼容）────────────────────
    id: str
    text: str
    category: str = "other"
    importance: float = 0.5
    access_count: int = 0
    last_accessed: float = 0.0
    created_at: float = 0.0
    layer: str = "working"    # working|short|long|archive（现有4层兼容）
    tenant_id: str = "self"
    metadata: dict = field(default_factory=dict)

    # ── 100年存储新增字段（提前预留）────────────────
    # 5-Tier 体系（L0-L4）
    tier: str = "L3"           # L0/L1/L2/L3/L4，对应 README 的 5-Tier
    permanence_policy: str = "conditional"  # permanent/conditional/temporary
                              # permanent  = 永不删除（L0/L1 核心层）
                              # conditional = 满足条件后晋升为 permanent
                              # temporary  = 普通 TTL 过期删除

    # 冷热分层
    storage_tier: str = "hot"  # hot/cold/archived
                              # hot    = LanceDB/内存（活跃访问）
                              # cold   = S3/对象存储（少访问）
                              # archived = 归档（几乎不访问）
    cold_storage_key: str = None  # S3 key，冷数据在对象存储中的路径
    cold_at: float = None       # 进入冷存储的时间戳

    # 晋升追踪
    promotion_history: list = field(default_factory=list)
                              # [{"from": "L3", "to": "L2", "at": 1234567890, "reason": "auto_promote"}]
    last_promotion_check: float = 0

    # 可靠性保障
    checksum: str = None        # SHA-256 数据完整性校验
    backup_copies: int = 1     # 跨区域副本数
    encryption_key_id: str = None  # BYOK 加密密钥 ID
```

**扩展的 SQLite Schema**（新增列，可 NULL，向后兼容）：
```sql
ALTER TABLE memories ADD COLUMN tier TEXT NOT NULL DEFAULT 'L3';
ALTER TABLE memories ADD COLUMN permanence_policy TEXT NOT NULL DEFAULT 'conditional';
ALTER TABLE memories ADD COLUMN storage_tier TEXT NOT NULL DEFAULT 'hot';
ALTER TABLE memories ADD COLUMN cold_storage_key TEXT;
ALTER TABLE memories ADD COLUMN cold_at REAL;
ALTER TABLE memories ADD COLUMN promotion_history TEXT NOT NULL DEFAULT '[]';
ALTER TABLE memories ADD COLUMN last_promotion_check REAL NOT NULL DEFAULT 0;
ALTER TABLE memories ADD COLUMN checksum TEXT;
ALTER TABLE memories ADD COLUMN backup_copies INTEGER NOT NULL DEFAULT 1;
ALTER TABLE memories ADD COLUMN encryption_key_id TEXT;

-- Tier 定义表（现在就创建）
CREATE TABLE IF NOT EXISTS memory_tiers (
    id              TEXT PRIMARY KEY,           -- L0/L1/L2/L3/L4
    name            TEXT NOT NULL,             -- Constitutional/Lifetime/Period/Event/Working
    description     TEXT,
    min_years       INTEGER NOT NULL DEFAULT 0, -- 最低保留年限
    storage         TEXT NOT NULL DEFAULT 'hot',-- hot/cold/archived
    cold_after_days INTEGER,                   -- 多少天后迁冷（NULL=不迁冷）
    permanence      TEXT NOT NULL DEFAULT 'conditional', -- permanent/conditional/temporary
    promotion_criteria TEXT,                   -- JSON，晋升条件规则
    created_at      REAL NOT NULL
);

-- 初始 Tier 数据（现在就插入）
INSERT OR IGNORE INTO memory_tiers VALUES
('L0', 'Constitutional', '核心身份/价值观/永久协议', 100, 'archived', NULL,   'permanent',
 '{"criteria": ["category=constitutional", "tag=permanent", "importance>=0.98"]}', 0),
('L1', 'Lifetime',       '人生里程碑/重大决定',      50, 'cold',     NULL,   'permanent',
 '{"criteria": ["category=decision AND importance>=0.9", "category=milestone"]}', 0),
('L2', 'Period',         '重要事实/偏好',            30, 'cold',     365*20, 'conditional',
 '{"criteria": ["importance>=0.7", "access_count>=10"]}', 0),
('L3', 'Event',          '普通事件/日常记忆',        10, 'hot',      365*5,  'conditional',
 '{"criteria": ["importance>=0.5"]}', 0),
('L4', 'Working',         '会话上下文',               0, 'hot',      NULL,   'temporary',
 '{}', 0);
```

#### 2. Tier 计算逻辑（现在就埋逻辑，以后激活）

```python
def _compute_tier_and_permanence(
    self,
    category: str,
    importance: float,
    access_count: int,
    metadata: dict = None
) -> tuple[str, str]:
    """
    返回 (tier, permanence_policy)

    逻辑：
    - category=constitutional 或 tag=permanent → L0 + permanent
    - category=decision 且 importance≥0.9 → L1 + permanent
    - category=milestone → L1 + permanent
    - importance≥0.7 → L2 + conditional
    - importance≥0.5 → L3 + conditional
    - 其他 → L4 + temporary

    这个方法现在就实现，但 permanence=permanent 的冷存储迁移暂不实现（以后低成本升级）
    """
    metadata = metadata or {}
    tags = metadata.get("tags", [])

    # L0: 核心身份/价值观/永久协议
    if category == "constitutional" or "permanent" in tags or importance >= 0.98:
        return ("L0", "permanent")

    # L1: 人生里程碑/重大决定
    if category in ("decision", "milestone") and importance >= 0.9:
        return ("L1", "permanent")

    # L2: 重要事实/偏好（30年）
    if importance >= 0.7:
        return ("L2", "conditional")

    # L3: 普通事件（5-10年）
    if importance >= 0.5:
        return ("L3", "conditional")

    # L4: 会话上下文
    return ("L4", "temporary")
```

#### 3. 存储分层策略（接口预留，实现暂缓）

```python
def _should_cold_migrate(self, memory: MemoryItem) -> bool:
    """
    判断记忆是否应该迁移冷存储。
    现在只实现 hot 判断，cold/archived 迁移逻辑暂缓。
    以后加 S3 支持时，只需补充 _move_to_cold() 一个方法即可。
    """
    if memory.tier in ("L0", "L1"):
        return False  # 永久层不迁移
    if memory.storage_tier == "cold":
        return False  # 已经在冷存储

    # L3: 5年后迁冷
    if memory.tier == "L3":
        return (time.time() - memory.created_at) > 365 * 5 * 86400

    # L2: 20年后迁冷
    if memory.tier == "L2":
        return (time.time() - memory.created_at) > 365 * 20 * 86400

    return False

def _move_to_cold(self, memory_id: str, tenant_id: str = None):
    """
    冷迁移（以后实现 S3，支持低成本升级）
    当前版本：只更新 storage_tier='cold'，不实际迁移数据

    以后升级只需：
    1. 上传 memory text + metadata 到 S3
    2. 更新 cold_storage_key = f"memories/{tenant_id}/{memory_id}.json"
    3. 更新 storage_tier='cold', cold_at=now
    4. 从热数据库删除（或标记为 cold）
    """
    self.update(memory_id, storage_tier="cold", cold_at=time.time())

def _move_to_hot(self, memory_id: str, tenant_id: str = None):
    """
    热召回（从冷存储恢复到热层）。以后实现 S3，支持低成本升级。
    """
    self.update(memory_id, storage_tier="hot", cold_storage_key=None)
```

#### 4. 晋升策略（现在埋接口，以后激活）

```python
def check_promotion(self, memory_id: str, tenant_id: str = None) -> bool:
    """
    检查记忆是否满足晋升条件。
    - L3 → L2: importance >= 0.7 且 access_count >= 10
    - L2 → L1: importance >= 0.9 且 access_count >= 20 且 category in (decision, milestone)
    - L1 → L0: 需要人工确认（constitutional 标记）

    现在只实现检查逻辑，实际晋升迁移暂缓（以后低成本升级）
    """
    memory = self.get(memory_id, tenant_id)
    if not memory:
        return False

    tier = memory.tier
    importance = memory.importance
    access_count = memory.access_count

    if tier == "L3" and importance >= 0.7 and access_count >= 10:
        self._promote(memory, "L2", "auto: importance>=0.7 and access_count>=10")
        return True

    if tier == "L2" and importance >= 0.9 and access_count >= 20:
        if memory.category in ("decision", "milestone"):
            self._promote(memory, "L1", "auto: milestone promotion")
            return True

    if tier == "L1" and (memory.metadata.get("tag") == "permanent"):
        # L0 需要人工确认，不自动晋升
        return False

    return False

def _promote(self, memory: MemoryItem, new_tier: str, reason: str):
    """
    晋升记忆到更高层级。
    现在只更新 tier 字段，永久层升级暂缓。以后加 S3 时只需补充：
    - L0/L1 晋升时切换到 archived 存储
    - 更新 permanence_policy=permanent
    """
    old_tier = memory.tier
    now = time.time()

    history = list(memory.promotion_history) if memory.promotion_history else []
    history.append({"from": old_tier, "to": new_tier, "at": now, "reason": reason})

    self.update(
        memory.id,
        tier=new_tier,
        permanence_policy="permanent" if new_tier in ("L0", "L1") else "conditional",
        promotion_history=history,
        last_promotion_check=now,
    )

    # 更新存储层级
    if new_tier in ("L0", "L1"):
        self.update(memory.id, storage_tier="archived")
    elif new_tier == "L2" and memory.storage_tier == "hot":
        self.update(memory.id, storage_tier="cold")
```

#### 5. 未来低成本升级详细路径

> 原则：每次升级只改局部，不动已有接口，不影响已有数据

---

**升级阶段 2：S3 冷存储（预计工作量 1-2 天）**

目标：L2/L3 记忆 5-20 年后自动迁移到 S3，节省 LanceDB 存储成本

需要修改的文件：`context-hawk/hawk/memory.py`

```python
# ── 当前代码（阶段1预留桩）──────────────────────────────
def _move_to_cold(self, memory_id: str, tenant_id: str = None):
    """
    当前版本：只更新 storage_tier='cold'，不实际迁移数据。
    """
    self.update(memory_id, storage_tier="cold", cold_at=time.time())

# ── 阶段2升级代码（替换上述桩实现）──────────────────
def _move_to_cold(self, memory_id: str, tenant_id: str = None):
    """
    将记忆迁移到 S3 冷存储。
    1. 从数据库读取完整记忆数据
    2. 序列化为 JSON 上传到 S3
    3. 更新 cold_storage_key = f"memories/{tenant_id}/{memory_id}.json"
    4. 更新 storage_tier='cold', cold_at=now
    5. 从热数据库删除（或保留 stub 行）
    """
    memory = self.get(memory_id, tenant_id)
    if not memory or memory.storage_tier != "hot":
        return

    import boto3, json as _json
    s3 = boto3.client("s3")
    bucket = os.environ.get("HAWK_COLD_BUCKET", "hawk-cold-storage")
    key = f"memories/{tenant_id}/{memory_id}.json"

    # 序列化完整记忆数据
    payload = _json.dumps({
        "id": memory.id,
        "text": memory.text,
        "category": memory.category,
        "importance": memory.importance,
        "metadata": memory.metadata,
        "tier": memory.tier,
        "permanence_policy": memory.permanence_policy,
        "created_at": memory.created_at,
    })

    # 上传 S3（加密）
    s3.put_object(Bucket=bucket, Key=key, Body=payload.encode(),
                 ServerSideEncryption="AES256")

    # 更新数据库：标记为冷存储
    self.update(memory_id,
                storage_tier="cold",
                cold_storage_key=key,
                cold_at=time.time())

def _move_to_hot(self, memory_id: str, tenant_id: str = None):
    """
    从 S3 冷存储恢复到热层。
    1. 从 S3 下载 JSON
    2. 回写到热数据库
    3. 删除 S3 对象（或保留备份）
    4. 更新 storage_tier='hot', cold_storage_key=NULL
    """
    memory = self.get(memory_id, tenant_id)
    if not memory or memory.storage_tier != "cold":
        return

    import boto3, json as _json
    s3 = boto3.client("s3")
    bucket = os.environ.get("HAWK_COLD_BUCKET", "hawk-cold-storage")

    # 下载 S3 对象
    response = s3.get_object(Bucket=bucket, Key=memory.cold_storage_key)
    payload = _json.loads(response["Body"].read().decode())

    # 回写到热数据库
    self.update(memory_id,
                storage_tier="hot",
                cold_storage_key=None,
                text=payload["text"],
                category=payload["category"],
                importance=payload["importance"],
                metadata=payload["metadata"])

    # 删除 S3 对象（可选，保留备份）
    # s3.delete_object(Bucket=bucket, Key=memory.cold_storage_key)

# ── 定时 cron 任务（新增文件或补充到现有 cron）────────────
# 建议用 openclaw cron，每小时运行一次：
def cold_migration_cron():
    """
    检查需要冷迁移的记忆并执行迁移。
    运行频率：每 1 小时
    """
    from hawk.memory import MemoryManager
    mm = MemoryManager()

    conn = mm._get_conn()
    rows = conn.execute(
        """SELECT id, tenant_id FROM memories
           WHERE storage_tier='hot' AND deleted=0
           AND tier IN ('L2', 'L3')"""
    ).fetchall()

    for row in rows:
        memory = mm.get(row["id"], row["tenant_id"])
        if memory and mm._should_cold_migrate(memory):
            print(f"Cold migrating {memory.id}")
            mm._move_to_cold(row["id"], row["tenant_id"])
```

**升级步骤**：
1. 安装 boto3：`pip install boto3`
2. 配置 AWS credentials（S3 bucket + IAM）
3. 替换 `_move_to_cold()` 和 `_move_to_hot()` 实现
4. 添加 cron job：`openclaw cron add --name hawk-cold-migration --every 3600 -- python3 -c "from hawk.memory import cold_migration_cron; cold_migration_cron()"`
5. 不需要数据迁移，现有 `storage_tier='hot'` 的数据继续在 LanceDB

---

**升级阶段 3：多副本 + 加密（预计工作量 2-3 天）**

目标：L0/L1 永久记忆跨区域 3 副本存储，防止单点故障丢失

需要修改的文件：`context-hawk/hawk/memory.py`（仅 write path）

```python
# ── 当前代码（阶段1预留字段）──────────────────────────────
# backup_copies INTEGER NOT NULL DEFAULT 1   ← 已埋入 schema
# encryption_key_id TEXT                       ← 已埋入 schema

# ── 阶段3升级代码（修改 store() 写入路径）───────────────

# 在 store() 末尾，INSERT 之后，追加：
def _write_replicas(self, memory: MemoryItem, tenant_id: str):
    """
    为永久层记忆（L0/L1）写 3 份跨区域副本。
    L2/L3 只写 1 份（本地 + S3 冷）。
    使用 client-side 加密，密钥由用户自己管理（BYOK）。
    """
    import boto3, json as _json, hashlib

    if memory.tier not in ("L0", "L1"):
        return  # 只有永久层需要多副本

    bucket = os.environ.get("HAWK_REPLICA_BUCKET", "hawk-replicas")
    key_prefix = f"replicas/{tenant_id}/{memory.id}"
    payload = _json.dumps({
        "id": memory.id,
        "text": memory.text,
        "checksum": hashlib.sha256(memory.text.encode()).hexdigest(),
    })

    regions = ["us-east-1", "eu-west-1", "ap-southeast-1"]
    for i, region in enumerate(regions):
        client = boto3.client("s3", region_name=region)
        key = f"{key_prefix}/副本{i+1}.json"
        client.put_object(
            Bucket=bucket, Key=key, Body=payload.encode(),
            ServerSideEncryption="AES256",
            StorageClass="GLACIER"  # 永久层用 Glacier 更便宜
        )

    # 更新副本计数
    self.update(memory.id, backup_copies=len(regions))

# 在 store() 成功后调用：
# _write_replicas(memory, tenant_id)

# ── 数据完整性校验（读取路径）──────────────────────────
def _verify_integrity(self, memory: MemoryItem) -> bool:
    """
    读取时校验 SHA-256 checksum，确保数据未损坏。
    如果校验失败，尝试从其他副本恢复。
    """
    if not memory.checksum:
        return True

    computed = hashlib.sha256(memory.text.encode()).hexdigest()
    if computed != memory.checksum:
        # 尝试从副本恢复
        self._restore_from_replica(memory)
        return False
    return True

def _restore_from_replica(self, memory: MemoryItem):
    """
    从跨区域副本恢复损坏的记忆。
    遍历所有 region，找到第一个可用的副本。
    """
    import boto3, json as _json
    regions = ["us-east-1", "eu-west-1", "ap-southeast-1"]
    bucket = os.environ.get("HAWK_REPLICA_BUCKET", "hawk-replicas")

    for region in regions:
        try:
            client = boto3.client("s3", region_name=region)
            for i in range(1, 4):
                key = f"replicas/{memory.tenant_id}/{memory.id}/副本{i}.json"
                response = client.get_object(Bucket=bucket, Key=key)
                payload = _json.loads(response["Body"].read().decode())
                # 恢复数据
                self.update(memory.id, text=payload["text"])
                return
        except Exception:
            continue
```

**升级步骤**：
1. 安装 boto3、配置 IAM（跨 region S3 access）
2. 修改 `store()` 末尾调用 `_write_replicas()`
3. 在 `get()` / `access()` 读取路径添加 `_verify_integrity()` 校验
4. 已有数据可在 cron 中批量回填 checksum：`for m in mm.list_by_tier('L0'): mm.update(m.id, checksum=sha256(m.text))`

---

**升级阶段 4：L0 人工确认（预计工作量 0.5-1 天）**

目标：L0 是最高层（100年+），晋升需要人类确认，防止错误永久化

需要修改的文件：`context-hawk/hawk/memory.py`（`check_promotion()`）

```python
# ── 当前代码（阶段1自动晋升）──────────────────────────────
# check_promotion() 中：L3→L2→L1 自动晋升，L1→L0 需要人工
# L0 晋升目前被 return False 阻止

# ── 阶段4升级代码───────────────────────────────

# 新增确认表：
# CREATE TABLE IF NOT EXISTS promotion_confirmations (
#     id          TEXT PRIMARY KEY,
#     memory_id   TEXT NOT NULL,
#     from_tier   TEXT NOT NULL,
#     to_tier     TEXT NOT NULL,
#     reason      TEXT,
#     suggested_at REAL NOT NULL,
#     confirmed   INTEGER,  -- NULL=pending, 1=confirmed, 0=rejected
#     confirmed_at REAL,
#     confirmed_by TEXT,
#     UNIQUE(memory_id, from_tier, to_tier)
# );

PROMOTION_CONFIRM_SCHEMA = """
CREATE TABLE IF NOT EXISTS promotion_confirmations (
    id          TEXT PRIMARY KEY,
    memory_id   TEXT NOT NULL,
    from_tier   TEXT NOT NULL,
    to_tier     TEXT NOT NULL,
    reason      TEXT,
    suggested_at REAL NOT NULL,
    confirmed   INTEGER,
    confirmed_at REAL,
    confirmed_by TEXT,
    UNIQUE(memory_id, from_tier, to_tier)
);
"""

def check_promotion(self, memory_id: str, tenant_id: str = None) -> bool:
    """
    检查记忆是否满足晋升条件。
    L0 晋升需要人工确认，不自动执行。
    """
    memory = self.get(memory_id, tenant_id)
    if not memory:
        return False

    tier = memory.tier
    importance = memory.importance
    access_count = memory.access_count

    if tier == "L3" and importance >= 0.7 and access_count >= 10:
        self._promote(memory, "L2", "auto: importance>=0.7 and access_count>=10", tenant_id)
        return True

    if tier == "L2" and importance >= 0.9 and access_count >= 20:
        if memory.category in ("decision", "milestone"):
            self._promote(memory, "L1", "auto: milestone promotion", tenant_id)
            return True

    # L1 → L0: 需要人工确认
    if tier == "L1":
        # 检查是否已申请确认或已确认
        if self._needs_l0_confirmation(memory, tenant_id):
            return False  # 等待人工确认
        # 申请确认（写入待确认表）
        self._request_l0_confirmation(memory, tenant_id)
        return False

    return False

def _needs_l0_confirmation(self, memory: MemoryItem, tenant_id: str) -> bool:
    """检查是否需要 L0 确认或已在确认流程中"""
    conn = self._get_conn()
    row = conn.execute(
        """SELECT confirmed FROM promotion_confirmations
           WHERE memory_id=? AND from_tier='L1' AND to_tier='L0'""",
        (memory.id,)
    ).fetchone()
    return row is not None  # NULL=pending, 1=confirmed, 0=rejected

def _request_l0_confirmation(self, memory: MemoryItem, tenant_id: str):
    """写入 L0 晋升确认请求"""
    import uuid
    conn = self._get_conn()
    conn.execute(
        """INSERT OR IGNORE INTO promotion_confirmations
           (id, memory_id, from_tier, to_tier, reason, suggested_at)
           VALUES (?, ?, 'L1', 'L0', ?, ?)""",
        (str(uuid.uuid4()), memory.id,
         f"L1→L0 晋升候选：{memory.text[:50]}...（importance={memory.importance}）",
         time.time())
    )
    conn.commit()
    print(f"[MemoryManager] L0 晋升需要人工确认: {memory.id}")

def confirm_l0_promotion(self, memory_id: str, confirmed: bool, confirmed_by: str = "human") -> bool:
    """
    人类确认 L0 晋升。
    confirmed=True → 执行晋升
    confirmed=False → 拒绝，记忆留在 L1
    """
    memory = self.get(memory_id)
    if not memory or memory.tier != "L1":
        return False

    conn = self._get_conn()
    conn.execute(
        """UPDATE promotion_confirmations
           SET confirmed=?, confirmed_at=?, confirmed_by=?
           WHERE memory_id=? AND from_tier='L1' AND to_tier='L0'""",
        (1 if confirmed else 0, time.time(), confirmed_by, memory_id)
    )
    conn.commit()

    if confirmed:
        self._promote(memory, "L0", "human_confirmed", confirmed_by)

    return True

# CLI 命令（补充）：
def list_pending_l0_confirmations():
    """列出所有待确认的 L0 晋升请求（管理员用）"""
    conn = self._get_conn()
    rows = conn.execute(
        """SELECT p.*, m.text, m.importance FROM promotion_confirmations p
           JOIN memories m ON p.memory_id=m.id
           WHERE p.confirmed IS NULL AND p.to_tier='L0'"""
    ).fetchall()
    return rows
```

**升级步骤**：
1. 在 `_init_db()` 中添加 `PROMOTION_CONFIRM_SCHEMA` 表创建
2. 修改 `check_promotion()` 中的 L1→L0 分支
3. 添加 `confirm_l0_promotion()` 方法
4. 添加 CLI 命令：`hawk晋升确认 <memory_id> --confirm`
5. 已有 L1 数据通过 cron 批量检查是否符合 L0 条件，补充写入确认请求

---

### 100年架构现状（阶段1完成后）

> 以下是今天阶段1已经埋入的全部内容，未来低成本升级的基础。

**Schema 新增字段**：
| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `tier` | TEXT | 'L3' | L0/L1/L2/L3/L4 五层 |
| `permanence_policy` | TEXT | 'conditional' | permanent/conditional/temporary |
| `storage_tier` | TEXT | 'hot' | hot/cold/archived |
| `cold_storage_key` | TEXT | NULL | S3 对象路径（未来 S3 激活）|
| `cold_at` | REAL | NULL | 进入冷存储时间 |
| `promotion_history` | TEXT | '[]' | JSON 晋升历史 |
| `last_promotion_check` | REAL | 0 | 上次晋升检查时间 |
| `checksum` | TEXT | NULL | SHA-256 数据完整性校验 |
| `backup_copies` | INTEGER | 1 | 跨区域副本数 |
| `encryption_key_id` | TEXT | NULL | BYOK 加密密钥 ID |

**新增表**：`memory_tiers`（L0-L4 预置数据）

**已埋入逻辑**：
- `_compute_tier_and_permanence()` — store() 时自动调用，决定 tier 和 permanence_policy
- `check_promotion()` — access() 时自动检查，满足条件自动晋升
- `_should_cold_migrate()` — 接口预留，返回 False（未来激活冷存储）
- `_move_to_cold()` — 桩实现，只更新字段（未来加 S3 上传）
- `_move_to_hot()` — 桩实现，只更新字段（未来加 S3 下载）

**向后兼容**：所有新字段有 DEFAULT 值，现有 store()/recall()/access() 接口不变。

---

#### 6. 向后兼容性保证

所有新增字段都有 DEFAULT 值，现有代码无需修改：
- `tier = 'L3'`（L4→L3 的映射，现有 working→L4 自动降级）
- `permanence_policy = 'conditional'`（现有记忆都是 conditional）
- `storage_tier = 'hot'`（现有记忆都在热层）
- `cold_storage_key = NULL`（暂无冷数据）
- `promotion_history = []`（现有记忆无晋升历史）

**不影响范围**：store() / recall() / access() 的接口签名不变。

---

**验收标准**：
- MemoryManager 读写全部走 SQLite，memories.json 不再使用
- 所有记忆表有 `tenant_id` 字段（default="self"）
- 超过 TTL 的记忆在 store/recall 时自动懒删除
- 写入先写 WAL，重启可恢复

---

### 阶段二：能力对齐（对齐 memory-core）

> 目标：吸收 Dreaming + Session Transcript + 多 Agent 隔离

| 任务 | 文件 | 状态 |
|------|------|------|
| **Dreaming 三阶段系统** | `hawk-dream/` | 📋 待办 |
| **DREAMS.md 日记** | `hawk-dream/` | 📋 待办 |
| **Session Transcript 扫描** | `hawk-dream/` | 📋 待办 |
| **多 Agent 记忆隔离** | `memory.py` + `config.py` | 📋 待办 |
| **Compaction 自动 flush** | `hawk-capture/` | 📋 待办 |

**验收标准**：
- dream hook 等同于 memory-core 的 Light→REM→Deep 三阶段
- DREAMS.md 人类可读梦境记录
- session transcript 摄入作为记忆信号源
- agent_id 隔离查询，各 Agent 记忆互不可见

---

### 阶段三：分布式增强

> 目标：MCP 接口 + OpenTelemetry + 水平扩展

| 任务 | 文件 | 状态 |
|------|------|------|
| **MCP Memory Protocol** | `src/mcp/` | 📋 待办 |
| **OpenTelemetry 可观测性** | `hawk-governance/` | 📋 待办 |
| **向量存储插件化（Milvus/Pinecone）** | `src/store/` | 📋 待办 |
| **跨租户经验迁移** | `memory.py` | 📋 待办 |
| **RBAC 访问控制** | `memory.py` | 📋 待办 |

**验收标准**：
- 其他 AI 工具可通过 MCP 调用 hawk-bridge
- metrics/traces/logs 完整，可接 Prometheus/Grafana
- 可切换向量存储后端（LanceDB / Milvus / Pinecone）
- 跨租户经验推荐（需授权）

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

## 🐢 性能优化项（2026-04-12）

> 优先级：🐢 高 | 🏗️ 中 | 🔧 低

### 🐢 高优先级

#### 性能-1. SQLite 替代 JSON 文件存储
- **文件**: `context-hawk/hawk/memory.py`
- **问题**: `~/.hawk/memories.json` 全量读写，并发靠 RLock 串行化，文件损坏风险
- **方案**: 迁移到 SQLite（结构化）+ LanceDB（向量）双引擎
- **预期收益**: 消除并发瓶颈，O(1) 读写

#### 性能-2. BM25 增量索引优化
- **文件**: `src/retriever.ts:38` (`BM25_REBUILD_THRESHOLD = 10`)
- **问题**: 超过 10 条新记忆就全量重建 corpus
- **方案**: 改为对数增量或定时批处理，persistent corpus
- **预期收益**: 记忆越多越不会因 BM25 拖慢

#### 性能-3. embedding 批量 API 调用
- **文件**: `context-hawk/hawk/vector_retriever.py`
- **问题**: `recall` 只 embed 单个 query，未利用 `_get_embedding(List[str])` 的批量能力
- **方案**: query expansion 多 query 并发时充分利用批量 embedding
- **预期收益**: 减少 API 调用次数和延迟

#### 性能-4. 双重存储事务同步
- **文件**: `context-hawk/hawk/memory.py` + `context-hawk/hawk/vector_retriever.py`
- **问题**: MemoryManager(JSON) + LanceDB 两条写入路径，一条失败不回滚
- **方案**: 引入事务机制或 WAL 模式，确保一致性
- **预期收益**: 数据一致性保障

### 🏗️ 中优先级

#### 架构-1. 统一 normalize 实现
- **文件**: `context-hawk/hawk/normalize.py` + `src/normalize.ts`
- **问题**: 28 条 normalize 规则在 TS 和 Python 各实现一份
- **方案**: Python 作为唯一真值，TS 只做数据转换调用 Python
- **预期收益**: 减少重复 bug，只改一处

#### 架构-2. BM25 延迟加载竞态修复
- **文件**: `src/retriever.ts`
- **问题**: `bm25BuildPromise` 并发时存在中间态（bm25Dirty=false 但 bm25=null）
- **方案**: 添加双重检查锁定或 Promise 缓存
- **预期收益**: 消除并发搜索时的潜在 panic

#### 架构-3. 清理无效 fallback 代码
- **文件**: `context-hawk/hawk/wrapper.py`
- **问题**: `_call_minimax` 的 urllib fallback 路径因 openai 必装而永不执行，且缺少 json import
- **方案**: 删除无用代码，统一走 OpenAI SDK
- **预期收益**: 代码更干净

### 🔒 中优先级

#### 可靠-1. 添加重试机制
- **文件**: `context-hawk/hawk/vector_retriever.py`, `context-hawk/hawk/wrapper.py`
- **问题**: embedding API、LLM 调用无重试，偶发网络抖动导致整个 recall/capture 失败
- **方案**: 引入指数退避重试（3 次尝试）
- **预期收益**: 提升在不稳定网络下的鲁棒性

#### 可靠-2. decay 懒删除机制
- **文件**: `context-hawk/hawk/memory.py`
- **问题**: `decay()` 手动触发，进程 crash 后衰减永不发生，archive 永不删除
- **方案**: 在 `store()` 和 `recall()` 前检查 idle 时间，触发懒删除
- **预期收益**: 避免存储泄漏

#### 生态-1. memory-wiki 配套
- **文件**: `context-hawk/hawk/` + `src/`
- **问题**: hawk-bridge 无 memory-wiki 配套的知识库层
- **方案**: 实现 hawk-wiki，提供 deterministic page structure、structured claims、contradiction tracking
- **预期收益**: 与 memory-core + memory-wiki 对齐

#### 生态-2. OpenTelemetry 可观测性
- **文件**: `context-hawk/hawk/governance.py`
- **问题**: hawk-bridge 零 metrics/traces，无法接入 Prometheus/Grafana
- **方案**: 引入 OpenTelemetry SDK，埋点 hawk_memory_total / hawk_recall_latency_seconds / hawk_capture_total 等
- **预期收益**: 分布式运维可观测

#### 生态-3. MCP Memory Protocol 接口
- **文件**: `src/mcp/`
- **问题**: 其他 AI 工具无法通过 MCP 协议调用 hawk-bridge
- **方案**: 实现 MCP tool schema: `memory.query(query, topK) → memories`
- **预期收益**: 第三方 AI 系统可接入hawk-bridge 记忆

#### 生态-4. governance 指标增强
- **文件**: `context-hawk/hawk/governance.py`
- **问题**: 当前 governance.py 维度有限，不如 memory-core 6 信号体系
- **方案**: 扩展为 frequency / relevance / query_diversity / recency / consolidation / conceptual_richness 六维
- **预期收益**: 与 memory-core Dreaming 体系对齐

---

#### 可靠-3. normalize 正则预编译验证
- **文件**: `context-hawk/hawk/normalize.py`
- **问题**: `_make_emoji_re()` 在函数内动态生成，虽模块级已预编译但存在隐患
- **方案**: 验证所有正则都在模块级预编译，添加单元测试
- **预期收益**: 消除正则重建开销和潜在 bug

### 🔧 低优先级

#### 质量-1. Config 类逻辑简化
- **文件**: `context-hawk/hawk/config.py`
- **问题**: Config 类同时处理环境变量覆盖和配置文件覆盖，职责不清
- **方案**: 分离为 EnvConfig + FileConfig，优先级清晰
- **预期收益**: 可维护性提升

#### 质量-2. MemoryManager batch 操作
- **文件**: `context-hawk/hawk/memory.py`
- **问题**: store 6 条记忆 = 6 次文件 I/O + 6 次全量 json.dump
- **方案**: 添加 `store_batch()` 和 `save_batch()`，减少 I/O
- **预期收益**: 批量导入场景性能大幅提升

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
