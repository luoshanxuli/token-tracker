#!/usr/bin/env node
/**
 * Copyright (c) 2026 luoshanxuli2010@163.com
 * SPDX-License-Identifier: MIT
 *
 * Daily Stats - 查看每日 token 统计
 * 用法:
 *   node daily-stats.js           # 查看今天
 *   node daily-stats.js 2026-03-05  # 查看指定日期
 *   node daily-stats.js --week    # 查看最近7天
 *   node daily-stats.js --all     # 查看所有日期
 */

const fs = require('fs');
const path = require('path');

const DAILY_DIR = path.join(__dirname, 'data', 'daily');

// ANSI 颜色
const C = {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
    reset: '\x1b[0m'
};

function formatNum(n) {
    if (!n) return '0';
    return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

function loadDaily(date) {
    const file = path.join(DAILY_DIR, `${date}.json`);
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf-8'));
        }
    } catch (e) {}
    return null;
}

function getAllDates() {
    if (!fs.existsSync(DAILY_DIR)) return [];
    return fs.readdirSync(DAILY_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
        .sort();
}

function showDailyReport(date) {
    const data = loadDaily(date);

    if (!data) {
        console.log(`${C.gray}${date}: 无数据${C.reset}`);
        return;
    }

    console.log(`\n${C.bold}═══════════════════════════════════════════════════════${C.reset}`);
    console.log(`${C.bold}  日期: ${C.cyan}${date}${C.reset}  ${C.red}总计: ${C.yellow}${formatNum(data.total)}${C.reset} tokens`);
    console.log(`${C.bold}═══════════════════════════════════════════════════════${C.reset}\n`);

    // 工具统计
    console.log(`${C.cyan}工具统计:${C.reset}`);
    Object.entries(data.toolStats || {}).forEach(([tool, tokens]) => {
        if (tokens > 0) {
            const percent = ((tokens / data.total) * 100).toFixed(1);
            console.log(`   ${tool.padEnd(8)} ${C.yellow}${formatNum(tokens).padStart(6)}${C.reset} tokens (${percent}%)`);
        }
    });
    console.log('');

    // 操作记录（最近20条）
    const ops = data.operations || [];
    if (ops.length > 0) {
        console.log(`${C.magenta}操作记录: (共 ${ops.length} 条，显示最近 20 条)${C.reset}`);
        ops.slice(-20).forEach(op => {
            console.log(`   ${C.gray}${op.time}${C.reset} ${op.tool.padEnd(6)} ${C.yellow}${formatNum(op.tokens).padStart(6)}${C.reset} ${C.gray}${op.detail || ''}${C.reset}`);
        });
    }
}

function showWeekSummary() {
    const dates = getAllDates().slice(-7);

    console.log(`\n${C.bold}═══════════════════════════════════════════════════════${C.reset}`);
    console.log(`${C.bold}  最近 7 天统计${C.reset}`);
    console.log(`${C.bold}═══════════════════════════════════════════════════════${C.reset}\n`);

    let weekTotal = 0;
    dates.forEach(date => {
        const data = loadDaily(date);
        if (data) {
            weekTotal += data.total;
            const opsCount = (data.operations || []).length;
            console.log(`${C.cyan}${date}${C.reset}  ${C.yellow}${formatNum(data.total).padStart(6)}${C.reset} tokens  (${opsCount} 次操作)`);
        }
    });

    console.log(`\n${C.bold}周总计: ${C.yellow}${formatNum(weekTotal)}${C.reset} tokens${C.reset}`);
}

function showAllSummary() {
    const dates = getAllDates();

    console.log(`\n${C.bold}═══════════════════════════════════════════════════════${C.reset}`);
    console.log(`${C.bold}  所有日期统计 (共 ${dates.length} 天)${C.reset}`);
    console.log(`${C.bold}═══════════════════════════════════════════════════════${C.reset}\n`);

    let grandTotal = 0;
    dates.forEach(date => {
        const data = loadDaily(date);
        if (data) {
            grandTotal += data.total;
            const opsCount = (data.operations || []).length;
            console.log(`${C.cyan}${date}${C.reset}  ${C.yellow}${formatNum(data.total).padStart(6)}${C.reset} tokens  (${opsCount} 次操作)`);
        }
    });

    console.log(`\n${C.bold}总计: ${C.yellow}${formatNum(grandTotal)}${C.reset} tokens${C.reset}`);

    // 估算成本
    const inputTokens = Math.floor(grandTotal * 0.3);
    const outputTokens = grandTotal - inputTokens;
    const cost = (inputTokens / 1000000 * 15) + (outputTokens / 1000000 * 75);
    console.log(`${C.gray}估算成本 (Opus 4.5): $${cost.toFixed(2)}${C.reset}`);
}

function main() {
    const arg = process.argv[2];

    if (!fs.existsSync(DAILY_DIR)) {
        console.log(`${C.red}错误: 数据目录不存在${C.reset}`);
        console.log(`${C.gray}请先运行 token-tracer.js 生成数据${C.reset}`);
        return;
    }

    if (!arg) {
        // 默认显示今天
        showDailyReport(getToday());
    } else if (arg === '--week') {
        showWeekSummary();
    } else if (arg === '--all') {
        showAllSummary();
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
        // 指定日期
        showDailyReport(arg);
    } else {
        console.log(`${C.red}用法:${C.reset}`);
        console.log(`  node daily-stats.js           ${C.gray}# 查看今天${C.reset}`);
        console.log(`  node daily-stats.js 2026-03-05  ${C.gray}# 查看指定日期${C.reset}`);
        console.log(`  node daily-stats.js --week    ${C.gray}# 查看最近7天${C.reset}`);
        console.log(`  node daily-stats.js --all     ${C.gray}# 查看所有日期${C.reset}`);
    }
}

main();
