# Claude Code Vs Hawk Bridge.Md

> 从 TODO.md 归档的非执行类内容
> 归档时间：2026-04-23
> 归档原因：战略分析/竞品对比类内容，不属于可执行 TODO，已在 hawk-okr 中保留战略视角

---

## 📊 Claude Code vs hawk-bridge {#claude-code-vs-hawk-bridge}

### 整体能力对比

| 功能 | Claude Code | hawk-bridge | 差距 |
|------|-------------|-------------|------|
| **存储介质** | .md 文件（文件化） | LanceDB（纯向量） | 🔴 架构差异 |
| **入口索引** | MEMORY.md（200行限制） | 无 | 🔴 缺失 |
| **记忆分类** | 4类 + scope + body_structure + 详尽示例 | fact/preference/decision/entity | 🔴 分类体系弱 |
| **What NOT to Save** | 显式 LLM 指导 | 隐式预过滤 | 🔴 缺失显式指导 |
| **Trust 验证** | 记忆→验证文件/函数存在 | 无 | 🔴 缺失 |
| **记忆年龄标签** | freshness text（>1天显示caveat） | 无 | 🔴 缺失 |
| **来源追溯** | mtime + type + description + verification_count | 部分 | 🟡 不完整 |
| **Team Memory** | 完整 + symlink 安全 | 无 | 🔴 缺失 |
| **Recent tools-aware** | 选记忆时排除正在用的工具文档 | 无 | 🔴 缺失 |
| **双重选择器** | manifest扫描→LLM选topN→读文件 | 纯向量搜索 | 🔴 选优策略弱 |
| **Ignore 指令** | 完全忽略记忆 | 无 | 🟡 缺失 |
| **相对日期→绝对日期** | 自动转换 | 无 | 🟡 缺失 |
| **记忆遥测** | MemoryShapeTelemetry | 无 | 🟢 缺失 |
| **4层衰减** | 无（文件化+TTL） | Working/Short/Long/Archive | ✅ hawk更强 |
| **向量搜索** | 无 | BM25 + ANN + RRF | ✅ hawk更强 |
| **记忆去重** | 文件名去重 | SimHash + 向量相似度 | ✅ hawk更强 |

### Capture 写入质量

| 功能 | Claude Code | Hermes | hawk-bridge v1.x | 状态 |
|------|-------------|--------|-------------------|------|
| 相对日期→绝对日期 | ✅ | ❌ | ❌ | Phase 0 |
| 写入置信度阈值 | 🟡 | ✅ | ❌ | Phase 1 |
| 注入检测器 | 🟡 | ✅ | ❌ | Phase 1 |
| 来源类型标注 | ✅ | ✅ | ❌ | Phase 1 |
| What NOT to Save 指导 | ✅ | ❌ | ❌ | Phase 0 |
| 4层衰减 (Working/Short/Long/Archive) | ❌ | ✅ | ✅ | ✅ 已实现 |

### autoself 10层架构支撑

| 功能 | autoself L 层需求 | hawk-bridge 现状 | 状态 |
|------|-----------------|-----------------|------|
| Hook 系统（Session/Task 生命周期） | L6 superpowers/ECC | 只有 decay hook | #16 ❌ 未实现 |
| 子 Agent 上下文注入 API | L3 | 无 | #17 ❌ 未实现 |
| Learnings 记忆分类 | L1 + L4 | 无 | #18 ❌ 未实现 |
| Task History 记忆 | L6 task-tracker | 无 | #19 ❌ 未实现 |
| Effect Evaluation 记忆 | L6 + L5 | 无 | #20 ❌ 未实现 |
| Cron Job 结果自动写入 | L1 定时巡检 | 不过 hawk-bridge | #21 ❌ 未实现 |
| Multi-Agent Session Isolation | L3 多 Agent | session_id 字段存在 | #22 ⚠️ 待验证 |
| Constitution 锚定记忆 | L6 qujin-editor | 无 | #23 ❌ 未实现 |

### Hermes 特有功能（补充）

| 功能 | Hermes | hawk-bridge | 状态 |
|------|--------|-------------|------|
| Context Fence 防注入包装 | ✅ `<memory-context>` 栅栏 | ❌ 无 | #13 ❌ 未实现 |
| 记忆内容安全扫描（threat detection） | ✅ 扫描 injection/exfil 攻击 | ❌ 无 | #14 ❌ 未实现 |
| 字符限额 + `§` 分隔符机制 | ✅ 2200/1375 chars 上限 | ❌ 无 | #15 ❌ 未实现 |

---


