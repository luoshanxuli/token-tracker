# Token Tracker

> Claude Code Token 使用监控和统计工具

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/yourusername/token-tracker)

**作者：** luoshanxuli2010@163.com

## 简介

Token Tracker 是一套用于监控和分析 Claude Code token 使用情况的本地工具集。通过实时监控、历史统计和数据分析，帮助用户了解本地 token 消耗情况，优化使用习惯，减少冗余操作。

## 功能特性

- 🔍 **Session Analyzer** - 直接分析 Claude Code 会话文件，无需配置
- 📊 **实时监控** - 追踪每次工具调用的 token 消耗
- 📈 **每日统计** - 按日期统计 token 使用情况
- 💾 **本地存储** - 所有数据保存在本地，保护隐私
- 💰 **成本估算** - 基于 Opus 4.5 定价的费用估算

## 快速开始

### 方法 1：Session Analyzer（推荐，无需配置）

直接运行脚本分析当前会话的 token 使用情况：

```bash
python .claude/tools/token-tracker/session-analyzer.py
```

**优点：**
- 无需配置 hook
- 直接读取 Claude Code 的会话数据
- 显示详细的成本估算
- 包含工具使用统计

### 方法 2：Hook + 实时监控

#### 1. 配置 Hook

编辑 `.claude/settings.json`，添加以下配置：

```json
{
  "hooks": {
    "tool_use": "node .claude/tools/token-tracker/token-tracer.js"
  }
}
```

#### 2. 启动实时监控

```bash
# 终端 1：启动实时监控
node .claude/tools/token-tracker/monitor.js

# 终端 2：正常使用 Claude Code
```

## 使用示例

### 查看每日统计

```bash
# 查看今天的统计
node .claude/tools/token-tracker/daily-stats.js

# 查看指定日期
node .claude/tools/token-tracker/daily-stats.js 2026-03-05

# 查看最近 7 天
node .claude/tools/token-tracker/daily-stats.js --week

# 查看所有日期汇总（含成本估算）
node .claude/tools/token-tracker/daily-stats.js --all
```

### 重置会话统计

```bash
node .claude/tools/token-tracker/reset-session.js
```

## 文件结构

```
.claude/tools/token-tracker/
├── session-analyzer.py  # 会话分析工具（推荐）
├── token-tracer.js      # Token 追踪记录（需要 hook 配置）
├── monitor.js           # 实时监控显示
├── daily-stats.js       # 每日统计查看
├── reset-session.js     # 重置会话统计
├── LICENSE              # MIT 许可证
├── README.md            # 项目文档
└── data/
    ├── live-update.json      # 实时更新数据
    └── daily/                # 每日统计数据
        ├── 2026-03-05.json
        └── ...
```

## 数据存储

每日统计数据保存在 `data/daily/YYYY-MM-DD.json`，格式如下：

```json
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
  "toolStats": {
    "Read": 8000,
    "Grep": 2000,
    "Glob": 500,
    "Skill": 3000,
    "Other": 1500
  }
}
```

## 故障排查

### Hook 未生效

检查 `.claude/settings.json` 中的 hook 配置是否正确。

### 数据目录不存在

首次运行会自动创建 `data/daily/` 目录。

### 查看原始数据

```bash
# 查看今天的原始 JSON
type .claude\tools\token-tracker\data\daily\2026-03-05.json

# 列出所有日期
dir .claude\tools\token-tracker\data\daily\
```

## 免责声明

本工具仅供学习和参考使用，实际 token 消耗以 Claude 官方账单为准。开发者不对因使用本工具导致的任何损失承担责任。

## 许可证

本项目采用 [MIT License](LICENSE) 开源许可证。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 更新日志

### v2.0.0 (2026-03-05)
- 新增 Session Analyzer 功能，无需 hook 配置
- 新增每日统计功能
- 新增成本估算功能
- 优化数据存储结构

---

**最后更新：** 2026-03-05
