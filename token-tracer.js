#!/usr/bin/env node
/**
 * Copyright (c) 2026 luoshanxuli2010@163.com
 * SPDX-License-Identifier: MIT
 *
 * Token Tracer - 记录 token 消耗并更新共享数据文件
 * 由 hook 触发，数据写入文件供 monitor 读取显示
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DAILY_DIR = path.join(DATA_DIR, 'daily');
const SESSION_FILE = path.join(DATA_DIR, 'session-tokens.json');
const LIVE_FILE = path.join(DATA_DIR, 'live-update.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DAILY_DIR)) {
    fs.mkdirSync(DAILY_DIR, { recursive: true });
}

// 估算 token
function estimateTokens(text) {
    if (!text) return 0;
    const str = String(text);
    const chinese = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
    return Math.ceil(chinese / 1.5 + (str.length - chinese) / 4);
}

// 保留完整路径
function shortPath(p) {
    return p || '';
}

// 加载会话
function loadSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
        }
    } catch (e) {}
    return { skill: null, files: {}, searches: [], total: 0, history: [] };
}

function saveSession(data) {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
}

// 更新实时数据（供 monitor 读取）
function updateLive(data) {
    fs.writeFileSync(LIVE_FILE, JSON.stringify({ ...data, updated: Date.now() }));
}

// 获取今天的日期字符串 (YYYY-MM-DD)
function getToday() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

// 加载每日统计
function loadDailyStats(date) {
    const dailyFile = path.join(DAILY_DIR, `${date}.json`);
    try {
        if (fs.existsSync(dailyFile)) {
            return JSON.parse(fs.readFileSync(dailyFile, 'utf-8'));
        }
    } catch (e) {}
    return {
        date,
        total: 0,
        operations: [],
        files: {},
        searches: [],
        toolStats: { Read: 0, Grep: 0, Glob: 0, Skill: 0, Other: 0 }
    };
}

// 保存每日统计
function saveDailyStats(date, data) {
    const dailyFile = path.join(DAILY_DIR, `${date}.json`);
    fs.writeFileSync(dailyFile, JSON.stringify(data, null, 2));
}

// 更新每日统计
function updateDailyStats(toolName, tokens, detail) {
    const today = getToday();
    const daily = loadDailyStats(today);

    const now = new Date();
    const timestamp = now.toISOString();
    const time = now.toTimeString().split(' ')[0];

    // 添加操作记录
    daily.operations.push({
        timestamp,
        time,
        tool: toolName,
        tokens,
        detail: detail || ''
    });

    // 更新总计
    daily.total += tokens;

    // 更新工具统计
    const toolKey = ['Read', 'Grep', 'Glob', 'Skill'].includes(toolName) ? toolName : 'Other';
    daily.toolStats[toolKey] = (daily.toolStats[toolKey] || 0) + tokens;

    saveDailyStats(today, daily);
}

// 主函数
function main() {
    let stdinData = '';
    try {
        stdinData = fs.readFileSync(0, 'utf-8');
    } catch (e) {
        return;
    }

    if (!stdinData) return;

    let hookData = {};
    try {
        hookData = JSON.parse(stdinData);
    } catch (e) {
        return;
    }

    const toolName = hookData.tool_name || 'unknown';
    const toolInput = hookData.tool_input || {};
    const toolResponse = hookData.tool_response || {};

    const inputTokens = estimateTokens(JSON.stringify(toolInput));
    const responseContent = toolResponse.file?.content ||
                           (typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse));
    const outputTokens = estimateTokens(responseContent);
    const tokens = inputTokens + outputTokens;

    let session = loadSession();

    // 构建历史记录项
    const time = new Date().toTimeString().split(' ')[0];
    let historyItem = { time, tool: toolName, tokens };

    // Skill 触发：重置会话
    if (toolName === 'Skill') {
        const skillName = toolInput.skill || 'unknown';
        historyItem.detail = skillName;
        session = {
            skill: skillName,
            skillTokens: tokens,
            files: {},
            searches: [],
            total: tokens,
            history: [historyItem],
            startTime: new Date().toISOString()
        };
    } else {
        // 非 skill 期间
        if (!session.skill) {
            session.skill = 'default';
            session.total = 0;
            session.files = {};
            session.searches = [];
            session.history = [];
        }

        session.total += tokens;

        if (toolName === 'Read') {
            const file = shortPath(toolInput.file_path);
            session.files[file] = (session.files[file] || 0) + tokens;
            historyItem.detail = file;
        }
        else if (toolName === 'Grep') {
            session.searches.push({ pattern: toolInput.pattern, tokens });
            historyItem.detail = `"${toolInput.pattern}"`;
        }
        else if (toolName === 'Glob') {
            session.searches.push({ pattern: toolInput.pattern, tokens });
            historyItem.detail = toolInput.pattern;
        }

        session.history.push(historyItem);
        // 保留最近 20 条
        if (session.history.length > 20) {
            session.history = session.history.slice(-20);
        }
    }

    saveSession(session);
    updateLive(session);

    // 更新每日统计
    updateDailyStats(toolName, tokens, historyItem.detail);
}

main();
