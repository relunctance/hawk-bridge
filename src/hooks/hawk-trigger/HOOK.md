# hawk-trigger Hook

> Evaluates trigger rules on every user message and caches results for hawk-recall.

## Overview

The hawk-trigger hook listens to `message_received` events and evaluates trigger rules against the user's message. When rules match, it caches the trigger context so hawk-recall can inject the relevant procedure memories.

## Architecture

```
message_received → hawk-trigger evaluates rules → caches trigger context
                                                      ↓
                          hawk-recall reads context → injects procedures
```

## Trigger Types

| Type | Description | Example |
|------|-------------|---------|
| `explicit_procedure` | Query explicitly mentions a procedure topic | "怎么部署", "数据库回滚步骤" |
| `implicit_task` | Implicit intent based on context | "照旧处理", "用老办法" |
| `micro_action` | Short operational commands | "清一下缓存", "开个灰度" |
| `negative` | Should NOT trigger | "今天天气怎么样", "1+1等于几" |

## Rule Matching

- **explicit_procedure / micro_action**: Match on `any_of_titles_contains` keywords OR `any_of_keys`
- **implicit_task**: Match on trigger phrases (照旧/老办法/跟之前一样/继续/按惯例)
- **negative**: Block trigger if any keyword matches

## hawk-memory (Go) Integration

The hook calls `POST /rules/evaluate` on hawk-memory (Go):

```json
POST /rules/evaluate
{
  "query": "用户消息",
  "include_negative": true
}
```

Response:
```json
{
  "should_trigger": true,
  "matched_rule_ids": ["rule-xxx"],
  "matched_rule_types": ["explicit_procedure"],
  "procedures": [...],
  "injection_constraints": {...}
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HAWK_API_URL` | `http://127.0.0.1:18360` | hawk-memory (Go) base URL |
