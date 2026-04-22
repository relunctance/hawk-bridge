# 多 Agent 记忆架构设计

> v1.1 核心方向：多 Agent 分工 + 共享记忆 + 可见性控制

---

## 一、核心问题

```
当前问题：

主 Agent（maomao）派发任务给子 Agent（wukong）
  → wukong 不知道项目上下文，需要 maomao 注入
  → 但 wukong 能自主 recall maomao 的私人记忆
  → maomao 的内部推理被泄露

需要的：
  → wukong 只能看到 maomao 明确注入的记忆
  → maomao 的私人推理默认不可见
  → 团队共享的记忆可以被所有 Agent 访问
```

---

## 二、记忆分层模型

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Team Memory（共享层）                              │
│  - 项目上下文、团队决策、技术选型                            │
│  - 所有 Agent 可读                                          │
│  - 需要明确授权才能写入                                      │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Agent Memory（私有层）                             │
│  - Agent 的内部推理、临时状态、思考过程                      │
│  - 默认只有创建者可见                                        │
│  - 可以选择性地共享给其他 Agent                              │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Injected Memory（注入层）                          │
│  - 主 Agent 通过 inject-context 注入的记忆                   │
│  - 子 Agent 只能看到被注入的部分                             │
│  - 带有注入来源标记（injected_by）                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、可见性控制

### 3.1 字段设计

```typescript
interface Memory {
  id: string;
  content: string;
  
  // 可见性控制
  agent_id: string;           // 记忆创建者
  visible_to: string[];       // 可见的 Agent 列表，["*"] 表示所有人
  injected_by?: string;        // 如果是注入的，记录来源 Agent
  
  // 记忆类型
  memory_type: "team" | "private" | "injected";
  
  // 生命周期
  created_at: number;
  updated_at: number;
  expires_at?: number;
}
```

### 3.2 可见性规则

```
规则1：recall 时过滤
  → 只有 visible_to 包含当前 Agent 的记忆才会被返回

规则2：team memory 自动可见
  → memory_type = "team" 时，visible_to = ["*"]

规则3：private memory 默认只有创建者可见
  → memory_type = "private" 时，visible_to = [agent_id]

规则4：注入记忆由主 Agent 控制
  → injected_by 记录谁注入的
  → 子 Agent 不能再次注入（除非明确授权）
```

### 3.3 API 设计

```typescript
// Capture 时指定可见性
POST /api/v1/capture
{
  "content": "项目决定用 Next.js App Router",
  "memory_type": "team",        // team / private（默认）
  "visible_to": ["wukong", "bajie"],  // 可选，默认按 memory_type
  "agent_id": "maomao"
}

// Recall 时自动过滤
GET /api/v1/recall?query=架构&agent_id=wukong
{
  "memories": [
    // 只有 visible_to 包含 wukong 的记忆
  ]
}

// 主 Agent 注入上下文给子 Agent
GET /api/v1/inject-context
{
  "agent_id": "wukong",
  "task": "backend-dev",
  "depth": "standard"  // minimal / standard / full
}
```

---

## 四、上下文注入 API

### 4.1 核心场景

```
autoself L3 的设计：

tangseng-brain（主 Agent）派发子 agent
        ↓
GET /api/v1/inject-context?agent_id=wukong&task=backend-dev
        ↓
hawk-bridge 返回：
{
  "context": "项目上下文...\n团队决策：用 Next.js App Router\nwukong 的任务：...",
  "memories": [
    { "id": "...", "content": "项目上下文：..." },
    { "id": "...", "content": "技术选型：Next.js App Router" }
  ],
  "source": "injected_by_tangseng-brain"
}
        ↓
注入给 wukong 的 system prompt
```

### 4.2 注入深度

```typescript
type InjectDepth = "minimal" | "standard" | "full";

// minimal: 只注入任务直接相关的记忆
// standard: 注入任务 + 项目上下文
// full: 注入所有可见记忆
```

### 4.3 注入安全

```
安全规则：

1. 子 Agent 不能调用 inject-context 给自己注入
   → 只有主 Agent 才能注入

2. 注入的记忆带有 injected_by 标记
   → 子 Agent 知道这些记忆是主 Agent 注入的

3. 子 Agent 不能修改注入的记忆
   → injected 记忆是只读的
```

---

## 五、Team Memory

### 5.1 概念

```
Team Memory 是团队共享的记忆区域：

- 所有 Agent 都可以读取
- 需要明确授权才能写入
- 用于存储项目上下文、团队决策、技术选型

vs Private Memory：
- 只有创建者可见
- 用于存储 Agent 的内部推理
```

### 5.2 写入权限

```typescript
// 只有 team member 才能写入 team memory
// 写入时需要验证 agent_id 是 team 的成员

POST /api/v1/capture
{
  "content": "架构决策：采用微前端",
  "memory_type": "team",
  "team_id": "hawk-bridge-backend",
  "agent_id": "maomao"  // 需要是 team 成员
}
```

---

## 六、Session 隔离

### 6.1 当前问题

```
当前 hawk-bridge 使用 session_id 隔离不同会话

但问题：
  - 主 Agent 和子 Agent 可能共享 session_id
  - 子 Agent 能看到主 Agent 在同一 session 的所有记忆

需要：
  - Agent 级别的隔离，不只是 session 级别
```

### 6.2 隔离级别

```
Level 1: session_id 隔离（当前）
  → 不同会话的记忆分开

Level 2: agent_id 隔离（v1.1）
  → 不同 Agent 的记忆按 visible_to 过滤

Level 3: task_id 隔离（v2.x）
  → 同一个 Agent 的不同任务也隔离
```

---

## 七、实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| 🔴 P0 | #73 可见性控制 | recall 时按 visible_to 过滤 |
| 🔴 P0 | #17 上下文注入 API | 主 Agent 注入给子 Agent |
| 🔴 P0 | #6 Team Memory | 团队共享记忆区域 |
| 🟡 P1 | #22 Session 隔离验证 | 验证现有隔离是否生效 |
| 🟡 P1 | inject-context 安全 | 防止子 Agent 滥用注入 |
| 🟢 P2 | #59 视角感知 | 保留观点多样性 |
| 🟢 P2 | #50 Storage Quota | 资源隔离 |

---

## 八、技术实现路径

### Phase 1: v1.1（4 周）

```
1. Schema 变更
   → 在 Memory 表增加 visible_to, agent_id, memory_type 字段

2. Recall 改造
   → 在向量检索后增加 visible_to 过滤

3. inject-context API
   → 新增端点，支持 minimal/standard/full 注入深度

4. Team Memory
   → memory_type = "team" 时自动设置 visible_to = ["*"]
```

### Phase 2: v1.2（4 周）

```
1. M-flow 集成
   → 接入 Bundle Search 作为 Recall 的评分引擎

2. 注入安全
   → 验证调用者是否是主 Agent
   → 防止子 Agent 滥用注入

3. 观点感知（可选）
   → 保留不同 Agent 的观点
```

---

## 九、与 autoself 的集成

```
autoself L3 设计：

L2 tangseng-brain（主 Agent）
  ↓ 派发任务
L3 wukong/bajie/bailong（子 Agent）

hawk-bridge 支持：

1. tangseng-brain 创建记忆，标记 visible_to
2. tangseng-brain 调用 inject-context 注入给子 Agent
3. wukong/bajie/bailong recall 时只能看到被注入的记忆
4. 子 Agent 执行完后返回结果给 tangseng-brain
```

---

*最后更新：2026-04-22*
