# hawk-bridge

> OpenClaw/Hermes Agent Memory Bridge — Hook API for capturing and recalling episodic memory.

**仓库**：https://github.com/relunctance/hawk-bridge  
**许可**：Apache 2.0

---

## 已实现功能

### Core Hooks
- `capture` — 记忆捕获（text/category/entity/importance）
- `recall` — 记忆召回（向量检索 + 关键词检索 + RRF 融合）
- `health` — 服务健康检查

### Memory Management
- LanceDB 存储引擎
- FTS 全文索引（支持中文分词）
- Decay 衰减引擎（基于访问频率 + 时间）
- agent_id namespace 隔离
- Soft delete（`superseded_by` 字段）

### Observability
- 结构化日志（slog，JSON 格式）
- Request ID 追踪
- Latency 测量（P50/P99）
- `/health` 端点（lancedb + xinference 状态）

### Integrations
- OpenClaw Hook 适配器
- Hermes Hook 适配器（Python）
- hawk-memory HTTP API 客户端（`:18368/v1/`）

---

## 架构

```
┌──────────────────────────────────────┐
│         Agent（OpenClaw/Hermes）       │
└────────────────┬─────────────────────┘
                 │ Hook API
┌────────────────▼─────────────────────┐
│            hawk-bridge                │
│  Capture Hook → HTTP POST /capture   │
│  Recall Hook → HTTP POST /recall    │
└────────────────┬─────────────────────┘
                 │ HTTP
┌────────────────▼─────────────────────┐
│        hawk-memory（Go :18368）       │
│  LanceDB + xinference embedding     │
└──────────────────────────────────────┘
```

---

## 快速开始

```bash
npm install hawk-bridge
```

```typescript
import { HawkBridge } from 'hawk-bridge';

const bridge = new HawkBridge({
  memoryUrl: 'http://localhost:18368'
});

// Capture
await bridge.capture({
  text: '用户偏好使用 TypeScript',
  category: 'preference',
  agentId: 'my-agent'
});

// Recall
const memories = await bridge.recall({
  query: '用户喜欢什么语言',
  agentId: 'my-agent'
});
```

---

## 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `HAWK_DB_PROVIDER` | 存储提供者 | `http` |
| `HAWK_MEMORY_URL` | hawk-memory 服务地址 | `http://127.0.0.1:18368/v1` |
| `HAWK_LOG_LEVEL` | 日志级别 | `info` |

---

## 文档

- [SKILL.md](./SKILL.md) — 详细集成指南
- [ARCHITECTURE.md](./docs/ARCHITECTURE-v2.md) — 架构设计 v2.0
- [ hawk-memory Go 服务](https://github.com/relunctance/hawk-memory)

---

## Roadmap

功能路线图在私有仓库 [hawk-okr](https://github.com/relunctance/hawk-okr) 中维护，不在此公开。
