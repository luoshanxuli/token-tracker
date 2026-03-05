Token Tracker 使用指南
===================

功能说明
--------
Token Tracker 是一个用于追踪 Claude Code 使用过程中 token 消耗的工具集。

**新增：Session Analyzer（推荐）**
直接分析 Claude Code 的会话文件，无需配置 hook，简单可靠！

文件结构
--------
.claude/tools/token-tracker/
├── session-analyzer.py  # 会话分析工具（推荐，无需配置）
├── token-tracer.js      # 追踪记录（需要 hook 配置）
├── monitor.js           # 实时监控显示
├── daily-stats.js       # 每日统计查看
├── reset-session.js     # 重置会话统计
└── data/
    ├── session-tokens.json   # 当前会话统计
    ├── token-trace.log       # 详细日志
    ├── live-update.json      # 实时更新数据
    └── daily/                # 每日统计数据
        ├── 2026-03-05.json
        └── ...

快速开始（推荐方法）
------------------

方法 1：Session Analyzer（最简单，推荐）

直接运行脚本，无需任何配置：

# 分析当前会话的 token 使用情况
python .claude/tools/token-tracker/session-analyzer.py

输出示例：
======================================================================
  Claude Code Session Token 分析报告
======================================================================

会话文件: 2057f7ad-2de1-4ccb-88cd-db2d39335eed.jsonl
记录数量: 278 条
文件大小: 1782.7 KB

-------------------------------Token 统计-------------------------------
  输入 Token:            92,767 (92.8K)
  输出 Token:            19,150 (19.1K)
  缓存读取:          10,388,774 (10388.8K)
  缓存创建:           2,259,019 (2259.0K)
  ────────────────────────────────────────────────────────────────────
  总计:                 111,917 (111.9K)

---------------------------成本估算 (Opus 4.5)----------------------------
  输入成本:          $    1.3915
  输出成本:          $    1.4363
  缓存读取成本:      $   15.5832
  缓存写入成本:      $   42.3566
  ────────────────────────────────────────────────────────────────────
  总成本:            $   60.7675

--------------------------------工具使用统计--------------------------------
  Edit                    30 次  输入:   8.3K  输出:   7.6K
  Read                    30 次  输入:   7.7K  输出:     20
  Bash                    22 次  输入:   6.5K  输出:      0
  ...

优点：
- 无需配置 hook
- 直接读取 Claude Code 的会话数据
- 显示详细的成本估算
- 包含工具使用统计

方法 2：Hook + 实时监控（需要配置）

编辑 .claude/settings.json，添加 hook 配置：

{
  "env": {
    "ANTHROPIC_BASE_URL": "https://hone.vvvv.ee/",
    "ANTHROPIC_AUTH_TOKEN": "sk-...",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "DISABLE_AUTOUPDATER": "1"
  },
  "hooks": {
    "tool_use": "node .claude/tools/token-tracker/token-tracer.js"
  }
}

配置后，每次使用工具都会自动记录 token 消耗。

2. 实时监控

打开两个终端窗口：

# 终端 1：启动实时监控
cd E:\claude
node .claude/tools/token-tracker/monitor.js

# 终端 2：正常使用 Claude Code
# 监控窗口会实时显示 token 消耗

3. 查看每日统计（新功能）

# 查看今天的统计
node .claude/tools/token-tracker/daily-stats.js

# 查看指定日期
node .claude/tools/token-tracker/daily-stats.js 2026-03-05

# 查看最近 7 天
node .claude/tools/token-tracker/daily-stats.js --week

# 查看所有日期汇总
node .claude/tools/token-tracker/daily-stats.js --all

每日统计数据格式
----------------
每天的数据保存在 data/daily/YYYY-MM-DD.json：

{
  "date": "2026-03-05",
  "total": 15000,
  "operations": [
    {
      "timestamp": "2026-03-05T10:30:15.123Z",
      "time": "10:30:15",
      "tool": "Read",
      "tokens": 1200,
      "detail": "E:\\claude\\main.c"
    }
  ],
  "files": {},
  "searches": [],
  "toolStats": {
    "Read": 8000,
    "Grep": 2000,
    "Glob": 500,
    "Skill": 3000,
    "Other": 1500
  }
}

使用示例
--------

场景 1：开始新的工作会话

# 重置会话统计
node .claude/tools/token-tracker/reset-session.js

# 启动实时监控
node .claude/tools/token-tracker/monitor.js

场景 2：查看今天的消耗

node .claude/tools/token-tracker/daily-stats.js

输出示例：
═══════════════════════════════════════════════════════
  日期: 2026-03-05  总计: 15.0K tokens
═══════════════════════════════════════════════════════

📊 工具统计
   Read      8.0K tokens (53.3%)
   Grep      2.0K tokens (13.3%)
   Skill     3.0K tokens (20.0%)
   Other     2.0K tokens (13.3%)

📝 操作记录 (共 45 条，显示最近 20 条)
   10:30:15 📖 Read    1.2K E:\claude\main.c
   10:31:20 🔍 Grep     500 "function.*main"
   ...

场景 3：查看本周消耗趋势

node .claude/tools/token-tracker/daily-stats.js --week

输出示例：
═══════════════════════════════════════════════════════
  最近 7 天统计
═══════════════════════════════════════════════════════

2026-02-28  12.5K tokens  (38 次操作)
2026-03-01  15.2K tokens  (45 次操作)
2026-03-02   8.3K tokens  (22 次操作)
2026-03-03  20.1K tokens  (67 次操作)
2026-03-04  18.7K tokens  (53 次操作)
2026-03-05  15.0K tokens  (45 次操作)

周总计: 89.8K tokens

成本估算
--------
使用 --all 参数查看总消耗和估算成本：

node .claude/tools/token-tracker/daily-stats.js --all

输出会包含：
- 所有日期的 token 消耗
- 总计 token 数
- 基于 Opus 4.5 的成本估算

注意事项
--------
1. 数据持久化：每日数据永久保存，不会被重置
2. 会话统计：reset-session.js 只重置当前会话，不影响每日统计
3. Token 估算：token 数量是估算值，实际消耗以 API 返回为准
4. 成本计算：假设 input/output 比例为 3:7

故障排查
--------

Hook 未生效
检查 .claude/settings.json 中的 hook 配置是否正确。

数据目录不存在
首次运行会自动创建 data/daily/ 目录。

查看原始数据
# 查看今天的原始 JSON
type .claude\tools\token-tracker\data\daily\2026-03-05.json

# 列出所有日期
dir .claude\tools\token-tracker\data\daily\

---
最后更新: 2026-03-05
版本: 2.0
