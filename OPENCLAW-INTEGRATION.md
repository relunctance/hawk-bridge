# OpenClaw 集成配置

## 问题

 hawk-bridge 编译后 hooks 在 `dist/hooks/`，但 OpenClaw 默认只从以下目录扫描：

- `~/.openclaw/hooks/`（用户安装的 hooks）
- 插件自带的 hooks
- `hooks.internal.load.extraDirs` 配置的额外目录

## 解决方案

在 `~/.openclaw/openclaw.json` 中添加：

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "load": {
        "extraDirs": ["/path/to/hawk-bridge/dist/hooks"]
      }
    }
  }
}
```

## 永久化

将上述配置加入 OpenClaw 的 workspace 配置或通过 `openclaw hooks` 命令安装。

## 多平台支持

要支持 OpenClaw、Hermes 等多平台共享记忆：

1. **platform 字段**：每条记忆标记来源平台（`openclaw` / `hermes`）
2. **recall mode**：
   - `global`（默认）：所有平台共享
   - `platform_only`：仅同平台
   - `federated`：指定平台列表

详见任务 `tasks/inbox/maomao/2026-04-15-011-all-remaining-tasks.md`
