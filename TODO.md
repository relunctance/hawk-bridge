# TODO — hawk-bridge v1.2 Backlog

> Priority: **low**. Core 9 items shipped in v1.1. Run stable first, then revisit.

## Logging & Observability

### [ ] Log file output
- pino currently writes to stdout — not usable in production
- Add `HAWK_LOG_FILE=~/.hawk/logs/hawk.log` support to write to file
- Or: add `pino-pretty` for dev-friendly console output

### [ ] Prometheus persistence
- prom-client metrics are in-memory, wiped on restart
- To track long-term trends: needs Prometheus + Grafana stack
- Low urgency unless running at scale

### [ ] Metrics auth
- `/metrics` endpoint has no auth — exposes usage data
- Add simple `HAWK_METRICS_TOKEN=xxx` Bearer token check

## Alerting

### [ ] Degraded health alerting
- health check returns `degraded` status but nobody is notified
- Add `HAWK_ALERT_WEBHOOK=https://...` env var
- POST alert payload when health check fails

## Nice to Have (not urgent)

- [x] **uninstall.sh** — 一键卸载脚本，支持：取消插件注册、删除符号链接、清理 ~/.hawk 数据、删除 context-hawk、清理构建产物、确认提示
- [ ] Multi-tenant namespace support
- [ ] Batch write API (`storeMany`)
- [ ] Dry-run mode for migration (`--dry-run`)
- [ ] Multi-language SDK (currently TypeScript only)

---

## Done ✅

- v1.1: 9 core improvements (retry, backup, pagination, structured logging, health endpoint, doctor connectivity test, reranking, prometheus metrics, config versioning)
- v1.0: Initial release with LanceDB + Ollama/Xinference support
