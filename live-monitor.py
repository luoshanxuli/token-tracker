#!/usr/bin/env python3
# Copyright (c) 2026 luoshanxuli2010@163.com
# SPDX-License-Identifier: MIT

"""
Claude Code Live Token Monitor
实时监控当前会话的 token 使用情况
"""

import json
import time
import sys
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import os

class TokenMonitor:
    def __init__(self, session_file):
        self.session_file = session_file
        self.last_position = 0
        self.total_input = 0
        self.total_output = 0
        self.total_cache_read = 0
        self.total_cache_creation = 0
        self.operation_count = 0
        self.tool_stats = defaultdict(lambda: {
            'count': 0,
            'input': 0,
            'output': 0
        })
        self.file_stats = defaultdict(lambda: {
            'count': 0,
            'input': 0,
            'output': 0
        })

        # 初始化：读取已有内容
        if session_file.exists():
            self._read_existing_content()

    def _read_existing_content(self):
        """读取已有内容，初始化统计"""
        with open(self.session_file, 'r', encoding='utf-8') as f:
            for line in f:
                self._process_line(line, show_output=False)
            self.last_position = f.tell()

    def _process_line(self, line, show_output=True):
        """处理一行 JSON 数据"""
        line = line.strip()
        if not line:
            return

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

                self.total_input += input_tok
                self.total_output += output_tok
                self.total_cache_read += cache_read
                self.total_cache_creation += cache_creation
                self.operation_count += 1

                # 提取工具调用信息
                tool_name = None
                file_path = None

                if 'content' in data['message']:
                    for item in data['message']['content']:
                        if isinstance(item, dict) and item.get('type') == 'tool_use':
                            tool_name = item.get('name', 'Unknown')
                            tool_input = item.get('input', {})

                            # 提取文件路径
                            if 'file_path' in tool_input:
                                file_path = tool_input['file_path']
                            elif 'path' in tool_input:
                                file_path = tool_input['path']

                            # 更新工具统计
                            self.tool_stats[tool_name]['count'] += 1
                            self.tool_stats[tool_name]['input'] += input_tok
                            self.tool_stats[tool_name]['output'] += output_tok

                            # 更新文件统计
                            if file_path:
                                self.file_stats[file_path]['count'] += 1
                                self.file_stats[file_path]['input'] += input_tok
                                self.file_stats[file_path]['output'] += output_tok

                # 实时显示
                if show_output and (input_tok > 0 or output_tok > 0):
                    self._display_operation(timestamp, tool_name, file_path,
                                          input_tok, output_tok, cache_read)

        except json.JSONDecodeError:
            pass
        except Exception as e:
            pass

    def _display_operation(self, timestamp, tool_name, file_path,
                          input_tok, output_tok, cache_read):
        """显示单个操作"""
        # 解析时间戳
        try:
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            time_str = dt.strftime('%H:%M:%S')
        except:
            time_str = '??:??:??'

        # 工具图标
        tool_icons = {
            'Read': '📖',
            'Write': '✍️',
            'Edit': '✏️',
            'Bash': '⚡',
            'Grep': '🔍',
            'Glob': '📁',
            'Skill': '🎯',
            'WebFetch': '🌐',
            'Task': '🤖'
        }
        icon = tool_icons.get(tool_name, '🔧')

        # 格式化 token 数量
        total = input_tok + output_tok
        token_str = f"{total:>5}"
        if total >= 1000:
            token_str = f"{total/1000:>4.1f}K"

        # 显示信息
        tool_display = f"{tool_name:<10}" if tool_name else "Unknown   "

        if file_path:
            # 缩短文件路径
            if len(file_path) > 50:
                file_display = "..." + file_path[-47:]
            else:
                file_display = file_path
            print(f"  {time_str} {icon} {tool_display} {token_str}  {file_display}")
        else:
            print(f"  {time_str} {icon} {tool_display} {token_str}")

    def _display_summary(self):
        """显示汇总信息"""
        # 清屏（可选）
        # os.system('cls' if os.name == 'nt' else 'clear')

        print("\n" + "=" * 80)
        print(f"  实时 Token 监控 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)

        # Token 统计
        total_tokens = self.total_input + self.total_output
        print(f"\n{'Token 统计':-^80}")
        print(f"  输入:  {self.total_input:>10,}  |  输出:  {self.total_output:>10,}  |  "
              f"总计:  {total_tokens:>10,}")
        print(f"  缓存读取: {self.total_cache_read:>10,}  |  缓存创建: {self.total_cache_creation:>10,}")

        # 成本估算
        input_cost = self.total_input * 15 / 1_000_000
        output_cost = self.total_output * 75 / 1_000_000
        cache_read_cost = self.total_cache_read * 1.5 / 1_000_000
        cache_write_cost = self.total_cache_creation * 18.75 / 1_000_000
        total_cost = input_cost + output_cost + cache_read_cost + cache_write_cost

        print(f"\n{'成本估算':-^80}")
        print(f"  输入: ${input_cost:>8.4f}  |  输出: ${output_cost:>8.4f}  |  "
              f"缓存: ${cache_read_cost + cache_write_cost:>8.4f}  |  "
              f"总计: ${total_cost:>8.4f}")

        # 工具统计（Top 5）
        if self.tool_stats:
            print(f"\n{'工具使用 Top 5':-^80}")
            sorted_tools = sorted(self.tool_stats.items(),
                                key=lambda x: x[1]['count'],
                                reverse=True)[:5]
            for tool_name, stats in sorted_tools:
                total = stats['input'] + stats['output']
                print(f"  {tool_name:<15} {stats['count']:>4} 次  "
                      f"Token: {total:>7,}  "
                      f"(输入: {stats['input']:>6,}, 输出: {stats['output']:>6,})")

        # 文件统计（Top 5）
        if self.file_stats:
            print(f"\n{'文件访问 Top 5':-^80}")
            sorted_files = sorted(self.file_stats.items(),
                                key=lambda x: x[1]['count'],
                                reverse=True)[:5]
            for file_path, stats in sorted_files:
                # 缩短路径
                if len(file_path) > 60:
                    display_path = "..." + file_path[-57:]
                else:
                    display_path = file_path

                total = stats['input'] + stats['output']
                print(f"  {stats['count']:>2} 次  Token: {total:>7,}  {display_path}")

        print("\n" + "=" * 80)
        print(f"  操作总数: {self.operation_count}  |  监控中... (Ctrl+C 退出)")
        print("=" * 80 + "\n")

    def watch(self, interval=1.0, summary_interval=10):
        """监控文件变化"""
        print(f"开始监控会话: {self.session_file.name}")
        print(f"监控间隔: {interval}秒  |  汇总间隔: {summary_interval}秒")
        print("=" * 80 + "\n")

        last_summary_time = time.time()

        try:
            while True:
                # 检查文件是否有新内容
                if self.session_file.exists():
                    with open(self.session_file, 'r', encoding='utf-8') as f:
                        f.seek(self.last_position)
                        new_lines = f.readlines()
                        self.last_position = f.tell()

                        # 处理新行
                        for line in new_lines:
                            self._process_line(line, show_output=True)

                # 定期显示汇总
                current_time = time.time()
                if current_time - last_summary_time >= summary_interval:
                    self._display_summary()
                    last_summary_time = current_time

                time.sleep(interval)

        except KeyboardInterrupt:
            print("\n\n监控已停止")
            self._display_summary()

def find_latest_session():
    """查找最新的会话文件"""
    home = Path.home()
    projects_dir = home / ".claude" / "projects" / "E--claude"

    if not projects_dir.exists():
        return None

    jsonl_files = list(projects_dir.glob("*.jsonl"))
    if not jsonl_files:
        return None

    # 按修改时间排序，返回最新的
    latest = max(jsonl_files, key=lambda p: p.stat().st_mtime)
    return latest

def main():
    """主函数"""
    # 查找最新会话
    session_file = find_latest_session()
    if not session_file:
        print("错误: 未找到会话文件", file=sys.stderr)
        sys.exit(1)

    # 创建监控器
    monitor = TokenMonitor(session_file)

    # 开始监控
    monitor.watch(interval=0.5, summary_interval=15)

if __name__ == "__main__":
    main()
