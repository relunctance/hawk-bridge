# hawk-bridge HTTP API Reference

> hawk-memory-api server (default: `http://127.0.0.1:18360`)
> Used when `HAWK_DB_PROVIDER=http`

---

## Endpoints

### `GET /health`
Health check endpoint.

**Response**
```json
{ "status": "ok" }
```

---

### `POST /capture`
Extract and store memories from a single conversation turn.

**Body**
```json
{
  "message": "用户消息",
  "response": "助手回复",
  "session_id": "sess_abc123",
  "user_id": "user_001",
  "platform": "hermes"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes* | User message (at least one of message/response required) |
| `response` | string | Yes* | Agent response |
| `session_id` | string | No | Session identifier for grouping |
| `user_id` | string | No | User identifier |
| `platform` | string | No | Source platform, default `"hermes"` |

**Response** `CaptureResponse`
```json
{
  "stored": 2,
  "extracted": 3,
  "session_id": "sess_abc123"
}
```

---

### `POST /capture/batch`
Batch capture multiple conversation turns in a single request. All extractions run in parallel; writes are sequential.

**Body**
```json
{
  "items": [
    {
      "message": "用户消息1",
      "response": "助手回复1",
      "session_id": "sess_001",
      "user_id": "user_001",
      "platform": "hermes"
    },
    {
      "message": "用户消息2",
      "response": "助手回复2",
      "session_id": "sess_002",
      "user_id": "user_002",
      "platform": "hermes"
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | array | Yes | List of conversation turns |

**Response** `BatchCaptureResponse`
```json
{
  "total": 2,
  "stored": 4,
  "extracted": 5
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total` | int | Number of input items |
| `stored` | int | Number of memories actually stored |
| `extracted` | int | Number of memories extracted (before filtering) |

---

### `POST /recall`
Vector search for relevant memories.

**Body**
```json
{
  "query": "查找关于项目的记忆",
  "top_k": 5,
  "offset": 0,
  "min_score": 0.0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `top_k` | int | No | Number of results, default 5 |
| `offset` | int | No | Pagination offset |
| `min_score` | float | No | Minimum relevance score, default 0.0 |

**Response**
```json
{
  "memories": [
    {
      "id": "abc123",
      "text": "记忆文本",
      "category": "fact",
      "importance": 0.8,
      "reliability": 0.7,
      "score": 0.92,
      "created_at": 1712345678000,
      "updated_at": 1712345678000,
      "source": "hermes",
      "metadata": {}
    }
  ],
  "count": 1,
  "total": 1
}
```

---

### `GET /memories/recent`
Returns recently accessed memories, sorted by `last_accessed_at` descending.

**Query params**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 10 | 1–100 |
| `source` | string | "" | Filter by platform (e.g. `"hermes"`) |

**Response** `MemoryItem[]`
```json
[
  {
    "id": "abc123",
    "text": "记忆文本",
    "category": "fact",
    "importance": 0.8,
    "reliability": 0.7,
    "created_at": 1712345678000,
    "updated_at": 1712345678000,
    "last_accessed_at": 1712345678000,
    "scope": "personal",
    "name": "记忆名称",
    "description": "简短描述",
    "session_id": null,
    "source": "hermes",
    "metadata": {},
    "recall_count": 3,
    "usefulness_score": 0.8
  }
]
```

---

### `POST /memories/batch-delete`
Batch soft-delete memories.

**Body**
```json
{
  "ids": ["id1", "id2", "id3"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ids` | string[] | Yes | Memory IDs to delete (max 100) |

**Response**
```json
{
  "requested": 3,
  "deleted": 3
}
```

---

### `GET /memories/{memory_id}`
Get a single memory by ID.

**Response** `MemoryItem`
```json
{
  "id": "abc123",
  "text": "记忆文本",
  "category": "fact",
  "importance": 0.8,
  "reliability": 0.7,
  "created_at": 1712345678000,
  "updated_at": 1712345678000,
  "scope": "personal",
  "name": "记忆名称",
  "description": "简短描述",
  "session_id": null,
  "source": "hermes",
  "metadata": {}
}
```

Returns `404` if not found.

---

### `POST /forget`
Soft-delete a memory.

**Query params**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `memory_id` | string | Yes | Memory ID to delete |

**Response**
```json
{ "ok": true }
```

---

### `POST /extract`
Extract memory candidates from text using LLM (no storage).

**Body**
```json
{
  "text": "需要分析提取的文本内容"
}
```

**Response**
```json
{
  "memories": [
    {
      "text": "提取的记忆1",
      "category": "fact",
      "importance": 0.8,
      "name": "记忆名称",
      "description": "简短描述"
    }
  ]
}
```

---

## Error Responses

All endpoints return appropriate HTTP status codes:

| Status | Meaning |
|--------|---------|
| `200` | Success |
| `400` | Bad request (missing required fields, invalid params) |
| `401` | Unauthorized (bad token) |
| `404` | Not found |
| `500` | Internal server error |

Error body:
```json
{
  "detail": "error description"
}
```

---

## Authentication

Some endpoints support optional token authentication:

- Query param: `?token=<HAWK_METRICS_TOKEN>`
- Header: `X-Hawk-Token: <HAWK_METRICS_TOKEN>`

When `HAWK_METRICS_TOKEN` is set, protected endpoints return `401` for missing/invalid tokens.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HAWK_DB_PROVIDER` | `lancedb` | Use `http` for hawk-memory-api backend |
| `HAWK_METRICS_TOKEN` | (none) | Auth token for metrics endpoint |
| `HAWK_METRICS_PORT` | `9090` | Port for metrics server |
| `HAWK_ALERT_WEBHOOK_URL` | (none) | Webhook URL for degraded alerts |
