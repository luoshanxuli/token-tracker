#!/usr/bin/env node
/**
 * Copyright (c) 2026 luoshanxuli2010@163.com
 * SPDX-License-Identifier: MIT
 *
 * Token Hook - 记录每次 API 调用的 token 消耗
 * 由 Claude Code 的 PostToolUse hook 自动调用
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DAILY_DIR = path.join(DATA_DIR, 'daily');
const LIVE_FILE = path.join(DATA_DIR, 'live-update.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DAILY_DIR)) {
    fs.mkdirSync(DAILY_DIR, { recursive: true });
}

// 从环境变量读取 token 数据
const usage = {
    input_tokens: parseInt(process.env.CLAUDE_INPUT_TOKENS || '0'),
    output_tokens: parseInt(process.env.CLAUDE_OUTPUT_TOKENS || '0'),
    cache_read_input_tokens: parseInt(process.env.CLAUDE_CACHE_READ_TOKENS || '0'),
    cache_creation_input_tokens: parseInt(process.env.CLAUDE_CACHE_WRITE_TOKENS || '0')
};

const toolName = process.env.CLAUDE_TOOL_NAME || 'Unknown';
const toolInput = process.env.CLAUDE_TOOL_INPUT || '{}';

// 读取现有数据
let data = {
    totalInput: 0,
    totalOutput: 0,
    cacheRead: 0,
    cacheCreation: 0,
    history: [],
    toolStats: {},
    lastUpdate: null
};

if (fs.existsSync(LIVE_FILE)) {
    try {
        data = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf-8'));
    } catch (e) {
        // 忽略解析错误
    }
}

// 更新统计
data.totalInput += usage.input_tokens;
data.totalOutput += usage.output_tokens;
data.cacheRead += usage.cache_read_input_tokens;
data.cacheCreation += usage.cache_creation_input_tokens;
data.lastUpdate = new Date().toISOString();

// 更新工具统计
if (!data.toolStats[toolName]) {
    data.toolStats[toolName] = { count: 0, tokens: 0 };
}
data.toolStats[toolName].count++;
data.toolStats[toolName].tokens += usage.input_tokens + usage.output_tokens;

// 添加历史记录
const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
let detail = '';
try {
    const input = JSON.parse(toolInput);
    detail = input.file_path || input.path || input.pattern || '';
} catch (e) {
    // 忽略
}

data.history.push({
    time,
    tool: toolName,
    tokens: usage.input_tokens + usage.output_tokens,
    detail
});

// 只保留最近 100 条历史
if (data.history.length > 100) {
    data.history = data.history.slice(-100);
}

// 写入实时数据文件
fs.writeFileSync(LIVE_FILE, JSON.stringify(data, null, 2));

// 写入每日日志文件
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const dailyLogFile = path.join(DAILY_DIR, `${today}.log`);
const dailyJsonFile = path.join(DAILY_DIR, `${today}.json`);

// 1. 追加纯文本日志（简洁格式）
const totalTokens = usage.input_tokens + usage.output_tokens;
const logLine = `${time} ${toolName.padEnd(10)} ${String(totalTokens).padStart(7)} ${detail}\n`;
fs.appendFileSync(dailyLogFile, logLine);

// 2. 更新 JSON 统计文件
let dailyData = {
    date: today,
    total: 0,
    operations: [],
    toolStats: {}
};

if (fs.existsSync(dailyJsonFile)) {
    try {
        dailyData = JSON.parse(fs.readFileSync(dailyJsonFile, 'utf-8'));
    } catch (e) {
        // 忽略解析错误
    }
}

// 添加操作记录
dailyData.operations.push({
    time,
    tool: toolName,
    tokens: totalTokens,
    detail
});

// 更新总计
dailyData.total += totalTokens;

// 更新工具统计
if (!dailyData.toolStats[toolName]) {
    dailyData.toolStats[toolName] = 0;
}
dailyData.toolStats[toolName] += totalTokens;

// 写入 JSON 文件
fs.writeFileSync(dailyJsonFile, JSON.stringify(dailyData, null, 2));
