# Go 语言集成指南

> 如何用 Go 操作 LanceDB 记忆系统（通过 hawk-memory (Go) HTTP API）

---

## 架构概览

```
┌──────────────────────────────────────────────────────────────┐
│                         Go Client                            │
│                    (任何 HTTP Client)                        │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP/1.1 keep-alive
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              hawk-memory (Go) (FastAPI, port 18360)           │
│                                                              │
│  ┌────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │ /recall    │   │ /capture     │   │ /memories/{id}   │  │
│  │ 召回记忆    │   │ 存储记忆      │   │ 单条读写          │  │
│  └────────────┘   └──────────────┘   └──────────────────┘  │
│                                                              │
│         ┌───────────────┬─────────────────┐                 │
│         │ xinference    │  LanceDB 0.30    │                 │
│         │ bge-m3 :9997 │  (~/.hawk/lancedb)│                │
│         │ 本地 embedding│  本地 FTS 搜索    │                 │
│         └───────────────┴─────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
```

---

## 方案选择

| 方案 | 适用场景 | 性能 | 实现复杂度 |
|------|---------|------|----------|
| **A. 直接调 HTTP API** | 通用场景，推荐 | 见下方实测数据 | ⭐ 最简单 |
| **B. HTTP API 旁路 LLM 提取** | 高频写入（>1/s） | ~10ms/条（纯 LanceDB） | ⭐⭐ |
| **C. LanceDB REST Server** | 极致性能（100+ QPS） | 1000+ QPS | ⭐⭐⭐ |

---

## 方案 A：直接调 HTTP API（推荐）

### 实测性能数据

> 2026-04-19 实测，xinference bge-m3 + LanceDB 0.30

| 操作 | 并发场景 | 延迟 | 实际 QPS |
|------|---------|------|---------|
| **Recall** | 冷启动（无缓存） | 77ms | — |
| **Recall** | 5 并发用户 | P50 284ms / P95 419ms | **13 QPS** |
| **Recall** | 20 并发（过载） | P50 1501ms | 12 QPS |
| **Capture（含 LLM 提取）** | 单次 | ~2900ms | — |
| **Capture（旁路 LLM）** | 单次 | ~250ms | ~4 QPS |
| xinference embedding | 单次 | 240ms | — |
| xinference embedding | 并发 5 | 28ms 总（5.6ms/call） | — |

**结论**：
- Recall 性能优秀（P50 284ms，13 QPS），满足实时对话场景
- Capture 瓶颈在 LLM 提取（外部 Minimax API，~2.5s），非 LanceDB 本身
- 5 并发用户内性能稳定，超过后单 worker 开始排队

### Go 调用示例

```go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
    "time"
)

// ─── 召回记忆 ─────────────────────────────────────────────────

type RecallRequest struct {
    Query    string  `json:"query"`
    TopK    int     `json:"top_k"`
    MinScore float64 `json:"min_score"`
}

type Memory struct {
    ID         string                 `json:"id"`
    Text       string                 `json:"text"`
    Category   string                 `json:"category"`
    Importance float64                `json:"importance"`
    Score      float64                `json:"score"`
    Metadata   map[string]interface{} `json:"metadata"`
}

func Recall(query string, topK int) ([]Memory, error) {
    req := RecallRequest{Query: query, TopK: topK, MinScore: 0.3}
    body, _ := json.Marshal(req)

    resp, err := http.Post(
        "http://127.0.0.1:18360/recall",
        "application/json",
        bytes.NewReader(body),
    )
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var result struct {
        Memories []Memory `json:"memories"`
        Count    int      `json:"count"`
    }
    json.NewDecoder(resp.Body).Decode(&result)
    return result.Memories, nil
}

// ─── 存储记忆（含 LLM 提取）───────────────────────────────

type CaptureRequest struct {
    SessionID string `json:"session_id"`
    UserID   string `json:"user_id"`
    Message  string `json:"message"`
    Response string `json:"response"`
    Platform string `json:"platform"`
}

func Capture(sessionID, userID, message, response string) error {
    req := CaptureRequest{
        SessionID: sessionID,
        UserID:   userID,
        Message:  message,
        Response: response,
        Platform: "go-client",
    }
    body, _ := json.Marshal(req)

    resp, err := http.Post(
        "http://127.0.0.1:18360/capture",
        "application/json",
        bytes.NewReader(body),
    )
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    return nil
}

// ─── 直接读取单条记忆 ───────────────────────────────────

func GetMemory(id string) (*Memory, error) {
    resp, err := http.Get("http://127.0.0.1:18360/memories/" + id)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode == 404 {
        return nil, nil
    }

    var mem Memory
    json.NewDecoder(resp.Body).Decode(&mem)
    return &mem, nil
}

// ─── 软删除记忆 ─────────────────────────────────────────

func Forget(memoryID string) error {
    req, _ := http.NewRequest("POST",
        "http://127.0.0.1:18360/forget?memory_id="+memoryID, nil)
    client := &http.Client{Timeout: 5 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    return nil
}
```

### 性能优化建议

```go
// 1. 使用 HTTP Keep-Alive 连接池（标准库 http.Client 默认已启用）
client := &http.Client{
    Timeout: 10 * time.Second,
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
    },
}

// 2. Recall 时批量请求而非循环单条
// ✅ 好：一次请求 top_k=20
resp, _ := client.Post("http://127.0.0.1:18360/recall", "application/json",
    strings.NewReader(`{"query":"关键词","top_k":20,"min_score":0.3}`))

// ❌ 差：循环 20 次请求
for i := 0; i < 20; i++ {
    client.Post("http://127.0.0.1:18360/recall", ...)
}

// 3. Capture 时使用批量接口（减少 LLM 提取次数）
// /capture/batch 一次提交多条对话，统一提取
```

---

## 方案 B：旁路 LLM 提取（高频写入场景）

当写入 QPS 需求超过 1/s 时（如日志收集、事件采集），绕过 `/capture` 的 LLM 提取步骤，直接调用 xinference embedding + LanceDB 写入。

### 流程

```
Go → xinference :9997 (embedding, ~5ms/call 并发)
  → LanceDB 写入（3-10ms/条）
```

### Go 示例（方案 B）

```go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

// Step 1: 调用本地 xinference 获取向量
func EmbedText(text string) ([]float32, error) {
    req := map[string]interface{}{
        "model": "bge-m3",
        "input": text,
    }
    body, _ := json.Marshal(req)

    resp, err := http.Post(
        "http://localhost:9997/v1/embeddings",
        "application/json",
        bytes.NewReader(body),
    )
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var result struct {
        Data []struct {
            Embedding []float32 `json:"embedding"`
        } `json:"data"`
    }
    json.NewDecoder(resp.Body).Decode(&result)
    return result.Data[0].Embedding, nil
}

// Step 2: 写入 LanceDB（通过 hawk-memory (Go) 的 memories 端点或直接 REST，见方案 C）
// 目前推荐通过 hawk-memory (Go) /memories POST 端点写入
// 注意：需要确认 hawk-memory (Go) 支持直接写入带向量的记忆
```

> ⚠️ **注意**：方案 B 需要 hawk-memory (Go) 支持直接写入带 embedding 的记忆。
> 当前 `/capture` 端点会自动调用 LLM 提取，不适合高频写入场景。
> 如需方案 B，建议在 hawk-memory (Go) 中添加 `POST /memories` 直接写入端点。

---

## 方案 C：LanceDB REST Server（极致性能）

绕过整个 hawk-memory (Go) Python 层，直接用 LanceDB 内置 REST API。

```bash
# 启动 LanceDB REST Server（需要 LanceDB >= 0.7）
lancedb connect ~/.hawk/lancedb --host 0.0.0.0 --port 8080
```

```go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

func main() {
    // 搜索
    req := map[string]interface{}{
        "query": "记忆内容",
        "limit": 5,
    }
    body, _ := json.Marshal(req)

    resp, _ := http.Post(
        "http://localhost:8080/v1/table/hawk_memories/query",
        "application/json",
        bytes.NewReader(body),
    )
    defer resp.Body.Close()

    // 写入（使用 LanceDB REST API）
    writeReq := []map[string]interface{}{
        {
            "id":      "mem_id_001",
            "text":    "记忆内容",
            "vector":  make([]float32, 1024), // bge-m3 维度
            "category": "fact",
        },
    }
    writeBody, _ := json.Marshal(writeReq)
    http.Post(
        "http://localhost:8080/v1/table/hawk_memories/insert",
        "application/json",
        bytes.NewReader(writeBody),
    )
}
```

**性能**：LanceDB 直连读写 **1000+ QPS**，适合高吞吐场景。

---

## 健康检查与监控

```go
// 健康检查
func HealthCheck() (string, error) {
    resp, err := http.Get("http://127.0.0.1:18360/health")
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    return result["status"].(string), nil
}

// 统计信息
func Stats() (map[string]interface{}, error) {
    resp, err := http.Get("http://127.0.0.1:18360/stats")
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    return result, nil
}
```

---

## 常见问题

### Q: hawk-memory (Go) 单 worker 并发不够用怎么办？

A: 当前 `uvicorn` 默认单进程。在 `install-systemd.sh` 中修改启动命令：

```bash
# 改为多 worker（CPU 核心数）
uvicorn --workers 4 --host 127.0.0.1 --port 18360 ...
```

多 worker 后 xinference embedding 的并发能力会被充分利用，Recall QPS 可线性提升至 **40-60 QPS**。

### Q: Capture 含 LLM 提取太慢怎么办？

A: 使用方案 B，旁路 LLM 提取。如果必须使用 `/capture`，将 LLM 提取改为异步：

```go
// 非阻塞 capture
go func() {
    http.Post("http://127.0.0.1:18360/capture", "application/json", body)
}()
```

### Q: Go 连接 xinference 9997 端口需要 API Key 吗？

A: 本地 xinference 默认无认证。如需认证，启动时加 `--api-key` 参数。

### Q: 如何追踪请求？

A: hawk-memory (Go) 支持 `X-Request-ID` 响应头：

```go
req, _ := http.NewRequest("GET", "http://127.0.0.1:18360/recall", body)
req.Header.Set("X-Request-ID", "my-trace-id-123")
resp, _ := client.Do(req)
traceID := resp.Header.Get("X-Request-ID") // 与请求头一致
```

---

## API 端点速查

| 方法 | 路径 | 说明 | 延迟 |
|------|------|------|------|
| GET | `/health` | 健康检查 | ~1ms |
| POST | `/recall` | 向量召回 | P50 284ms |
| POST | `/capture` | 存储（含 LLM 提取） | ~2900ms |
| POST | `/capture/batch` | 批量存储 | N×~2900ms |
| POST | `/extract` | 仅 LLM 提取 | ~2500ms |
| GET | `/stats` | 统计信息 | ~50ms |
| GET | `/memories/{id}` | 读取单条 | ~10ms |
| POST | `/forget` | 软删除 | ~10ms |
| POST | `/memories/batch-delete` | 批量软删除 | ~50ms |
| GET | `/memories/recent` | 最近访问 | ~20ms |
