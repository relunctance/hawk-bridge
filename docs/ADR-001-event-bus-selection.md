# ADR-001: Event Bus 选型

**日期**：2026-04-19
**状态**：Accepted
**决策者**：maomao + 其林
**影响范围**：hawk-bridge v1.x → v2.0 架构

---

## Context（背景）

hawk-bridge 需要一个 Event Bus 来解耦各层组件（capture / recall / decay / lifecycle）。

当前架构中，这些事件是同步调用，没有异步管道。

**需求**：
- 支持 capture / recall / decay / lifecycle 四类事件
- 支持多消费者（capture 触发 decay 检查、lifecycle 状态机）
- 轻量优先（零依赖，clone 就能跑）
- 未来可升级（从小规模到大规模）

---

## Decision（决定）

**默认：In-Memory Event Bus + WAL**

- v1.x 默认使用 In-Memory Event Bus
- 写入 WAL（Write-Ahead Log）保证持久性
- 配置切换为 `event_bus.backend: in_memory`

**未来可选：Redis Streams**

- v2.x 可通过配置切换到 Redis Streams
- 修改配置：`event_bus.backend: redis`
- 不需要改代码

---

## Consequences（后果）

### 正面影响

1. **零依赖**：clone 后立即运行，不需要安装 Redis/Kafka
2. **低延迟**：In-Memory 事件传递，延迟 < 1ms
3. **简单调试**：事件流本地可见，不需要额外工具
4. **可升级**：配置改一行切换到 Redis Streams

### 负面影响

1. **单实例**：In-Memory 只支持单进程，多实例需 Redis
2. **重启丢失**：进程重启后内存事件丢失（但 WAL 恢复）
3. **规模限制**：单进程处理能力有限

### 权衡

接受单实例限制，换取零依赖和简单性。
多实例场景由 Redis Streams 覆盖。

---

## Alternatives Considered（考虑过的方案）

### 方案 A：Kafka

**选择**：不选
**原因**：
- 太重（需要 ZooKeeper / KRaft）
- 小规模场景不必要
- 运维复杂度高

### 方案 B：RabbitMQ

**选择**：不选
**原因**：
- 运维复杂（多租户、权限、集群管理）
- AMQP 协议对小规模场景过于复杂
- 管理界面虽然友好但增加运维负担

### 方案 C：Redis Streams

**选择**：v2.x 可选
**原因**：
- 足够强大的消息语义（Consumer Groups、ACK）
- 大部分项目已有 Redis
- 配置切换即可，无需改代码

### 方案 D：In-Memory（当前选择）

**选择**：v1.x 默认
**原因**：
- 零依赖，clone 就能跑
- 延迟最低
- 符合 hawk-bridge「轻量记忆引擎」的定位

---

## 实现参考

```yaml
# hawk-bridge.yaml
event_bus:
  backend: in_memory  # v1.x 默认
  # backend: redis   # v2.x 可选

redis:
  # 仅当 backend: redis 时使用
  url: redis://localhost:6379
  stream: hawk-bridge-events
  consumer_group: hawk-bridge-consumers
```
