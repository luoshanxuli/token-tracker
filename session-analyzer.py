#!/usr/bin/env python3
# Copyright (c) 2026 luoshanxuli2010@163.com
# SPDX-License-Identifier: MIT

"""
Claude Code Session Token Analyzer
从会话 JSONL 文件中提取和分析 token 使用情况
"""

import json
import sys
from pathlib import Path
from datetime import datetime
from collections import defaultdict

def find_latest_session(projects_dir):
    """查找最新的会话文件"""
    project_path = projects_dir / "E--claude"
    if not project_path.exists():
        return None

    jsonl_files = list(project_path.glob("*.jsonl"))
    if not jsonl_files:
        return None

    # 按修改时间排序，返回最新的
    latest = max(jsonl_files, key=lambda p: p.stat().st_mtime)
    return latest

def parse_session_file(file_path):
    """解析会话文件，提取 token 使用信息"""
    records = []
    tool_stats = defaultdict(lambda: {
        'count': 0,
        'input_tokens': 0,
        'output_tokens': 0,
        'cache_read': 0
    })

    total_input = 0
    total_output = 0
    total_cache_read = 0
    total_cache_creation = 0

    with open(file_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            try:
                data = json.loads(line)

                # 提取 usage 信息
                if 'message' in data and 'usage' in data['message']:
                    usage = data['message']['usage']
                    timestamp = data.get('timestamp', '')

                    input_tok = usage.get('input_tokens', 0)
                    output_tok = usage.get('output_tokens', 0)
                    cache_read = usage.get('cache_read_input_tokens', 0)
                    cache_creation = usage.get('cache_creation_input_tokens', 0)

                    total_input += input_tok
                    total_output += output_tok
                    total_cache_read += cache_read
                    total_cache_creation += cache_creation

                    # 提取工具调用信息
                    if 'content' in data['message']:
                        for item in data['message']['content']:
                            if isinstance(item, dict) and item.get('type') == 'tool_use':
                                tool_name = item.get('name', 'Unknown')
                                tool_stats[tool_name]['count'] += 1
                                tool_stats[tool_name]['input_tokens'] += input_tok
                                tool_stats[tool_name]['output_tokens'] += output_tok
                                tool_stats[tool_name]['cache_read'] += cache_read

                    records.append({
                        'timestamp': timestamp,
                        'input_tokens': input_tok,
                        'output_tokens': output_tok,
                        'cache_read': cache_read,
                        'cache_creation': cache_creation,
                        'total': input_tok + output_tok
                    })

            except json.JSONDecodeError as e:
                print(f"警告: 第 {line_num} 行 JSON 解析失败: {e}", file=sys.stderr)
                continue
            except Exception as e:
                print(f"警告: 第 {line_num} 行处理失败: {e}", file=sys.stderr)
                continue

    return {
        'records': records,
        'tool_stats': dict(tool_stats),
        'totals': {
            'input_tokens': total_input,
            'output_tokens': total_output,
            'cache_read_tokens': total_cache_read,
            'cache_creation_tokens': total_cache_creation,
            'total_tokens': total_input + total_output
        }
    }

def format_number(num):
    """格式化数字，添加千位分隔符"""
    if num >= 1000:
        return f"{num/1000:.1f}K"
    return str(num)

def print_report(data, session_file):
    """打印分析报告"""
    totals = data['totals']
    tool_stats = data['tool_stats']
    records = data['records']

    print("=" * 70)
    print(f"  Claude Code Session Token 分析报告")
    print("=" * 70)
    print(f"\n会话文件: {session_file.name}")
    print(f"记录数量: {len(records)} 条")
    print(f"文件大小: {session_file.stat().st_size / 1024:.1f} KB")

    print(f"\n{'Token 统计':-^70}")
    print(f"  输入 Token:        {totals['input_tokens']:>10,} ({format_number(totals['input_tokens'])})")
    print(f"  输出 Token:        {totals['output_tokens']:>10,} ({format_number(totals['output_tokens'])})")
    print(f"  缓存读取:          {totals['cache_read_tokens']:>10,} ({format_number(totals['cache_read_tokens'])})")
    print(f"  缓存创建:          {totals['cache_creation_tokens']:>10,} ({format_number(totals['cache_creation_tokens'])})")
    print(f"  {'─' * 68}")
    print(f"  总计:              {totals['total_tokens']:>10,} ({format_number(totals['total_tokens'])})")

    # 成本估算 (Opus 4.5 定价)
    # Input: $15 per 1M tokens, Output: $75 per 1M tokens
    # Cache read: $1.5 per 1M tokens, Cache write: $18.75 per 1M tokens
    input_cost = totals['input_tokens'] * 15 / 1_000_000
    output_cost = totals['output_tokens'] * 75 / 1_000_000
    cache_read_cost = totals['cache_read_tokens'] * 1.5 / 1_000_000
    cache_write_cost = totals['cache_creation_tokens'] * 18.75 / 1_000_000
    total_cost = input_cost + output_cost + cache_read_cost + cache_write_cost

    print(f"\n{'成本估算 (Opus 4.5)':-^70}")
    print(f"  输入成本:          ${input_cost:>10.4f}")
    print(f"  输出成本:          ${output_cost:>10.4f}")
    print(f"  缓存读取成本:      ${cache_read_cost:>10.4f}")
    print(f"  缓存写入成本:      ${cache_write_cost:>10.4f}")
    print(f"  {'─' * 68}")
    print(f"  总成本:            ${total_cost:>10.4f}")

    if tool_stats:
        print(f"\n{'工具使用统计':-^70}")
        sorted_tools = sorted(tool_stats.items(),
                            key=lambda x: x[1]['count'],
                            reverse=True)
        for tool_name, stats in sorted_tools[:10]:  # 只显示前10个
            print(f"  {tool_name:<20} {stats['count']:>5} 次  "
                  f"输入: {format_number(stats['input_tokens']):>6}  "
                  f"输出: {format_number(stats['output_tokens']):>6}")

    print("\n" + "=" * 70)

def main():
    """主函数"""
    # 查找 Claude Code 数据目录
    home = Path.home()
    projects_dir = home / ".claude" / "projects"

    if not projects_dir.exists():
        print(f"错误: 未找到 Claude Code 数据目录: {projects_dir}", file=sys.stderr)
        sys.exit(1)

    # 查找最新会话
    session_file = find_latest_session(projects_dir)
    if not session_file:
        print("错误: 未找到会话文件", file=sys.stderr)
        sys.exit(1)

    # 解析会话文件
    print(f"正在分析会话文件: {session_file.name}...")
    data = parse_session_file(session_file)

    # 打印报告
    print_report(data, session_file)

if __name__ == "__main__":
    main()
