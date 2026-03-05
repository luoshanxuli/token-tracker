#!/usr/bin/env node
/**
 * Copyright (c) 2026 luoshanxuli2010@163.com
 * SPDX-License-Identifier: MIT
 *
 * Token Monitor - 在终端实时显示 token 消耗
 * 用法: node monitor.js
 * 在另一个终端窗口运行，实时监控当前会话的 token 消耗
 *
 * 支持两种模式：
 * 1. Hook 模式（需要配置 hook）- 读取 live-update.json
 * 2. Session 模式（无需配置）- 直接读取会话 JSONL 文件
 *
 * ============================================================================
 * 设计理念 - 固定位置更新原则
 * ============================================================================
 *
 * 【核心原则】
 * 采用类似 top/htop 的固定位置更新机制，实现文本和数据分离：
 * - 文本标签固定不动（如 "Token:"、"成本:"、"输入:" 等）
 * - 只有数字部分动态更新
 * - 避免终端一直往下刷屏
 *
 * 【实现方式】
 * 1. 首次绘制：显示完整界面框架（标题、分隔线、标签、提示文字）
 * 2. 后续更新：使用 ANSI 转义序列定位光标到固定位置，只覆盖数字区域
 * 3. 关键技术：
 *    - \x1b[row;colH  : 移动光标到指定行列
 *    - \x1b[2K        : 清除当前行
 *    - \x1b[?25l/h    : 隐藏/显示光标
 *
 * 【用户体验】
 * - 界面稳定，易于阅读
 * - 数字变化清晰可见
 * - 符合终端工具的使用习惯
 *
 * 【维护要求】
 * 未来修改时必须保持此设计理念，不得改回滚动刷屏模式
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(__dirname, 'data');
const LIVE_FILE = path.join(DATA_DIR, 'live-update.json');

// 查找最新的会话文件
function findLatestSession() {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects', 'E--claude');

    if (!fs.existsSync(projectsDir)) {
        return null;
    }

    const files = fs.readdirSync(projectsDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({
            name: f,
            path: path.join(projectsDir, f),
            mtime: fs.statSync(path.join(projectsDir, f)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);

    return files.length > 0 ? files[0].path : null;
}

const SESSION_FILE = findLatestSession();

// ANSI 颜色和控制
const C = {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
    reset: '\x1b[0m',
    clear: '\x1b[2J\x1b[H',  // 清屏并移到左上角
    home: '\x1b[H',          // 移到左上角（不清屏）
    clearLine: '\x1b[2K',    // 清除当前行
    hideCursor: '\x1b[?25l', // 隐藏光标
    showCursor: '\x1b[?25h'  // 显示光标
};

function formatNum(n) {
    if (!n) return '0';
    return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
}

function formatCost(tokens, rate) {
    return (tokens * rate / 1_000_000).toFixed(4);
}

// Session 模式的状态
let sessionLastPos = 0;
let sessionData = {
    totalInput: 0,
    totalOutput: 0,
    cacheRead: 0,
    cacheCreation: 0,
    files: {},
    searches: [],
    history: [],
    toolStats: {},
    newOperations: [], // 新增：存储未显示的操作
    displayedHistory: [] // 已显示的历史操作
};

function processSessionLine(line) {
    try {
        const data = JSON.parse(line);

        if (data.message && data.message.usage) {
            const usage = data.message.usage;
            const timestamp = data.timestamp || '';

            const inputTok = usage.input_tokens || 0;
            const outputTok = usage.output_tokens || 0;
            const cacheRead = usage.cache_read_input_tokens || 0;
            const cacheCreation = usage.cache_creation_input_tokens || 0;

            sessionData.totalInput += inputTok;
            sessionData.totalOutput += outputTok;
            sessionData.cacheRead += cacheRead;
            sessionData.cacheCreation += cacheCreation;

            // 提取工具调用信息
            if (data.message.content) {
                for (const item of data.message.content) {
                    if (item.type === 'tool_use') {
                        const toolName = item.name || 'Unknown';
                        const toolInput = item.input || {};

                        // 更新工具统计
                        if (!sessionData.toolStats[toolName]) {
                            sessionData.toolStats[toolName] = { count: 0, tokens: 0 };
                        }
                        sessionData.toolStats[toolName].count++;
                        sessionData.toolStats[toolName].tokens += inputTok + outputTok;

                        // 提取文件路径
                        let filePath = toolInput.file_path || toolInput.path;
                        if (filePath) {
                            sessionData.files[filePath] = (sessionData.files[filePath] || 0) + inputTok + outputTok;
                        }

                        // 提取搜索模式
                        if (toolName === 'Grep' && toolInput.pattern) {
                            sessionData.searches.push({
                                pattern: toolInput.pattern,
                                tokens: inputTok + outputTok
                            });
                        }

                        // 添加到历史
                        const time = timestamp ? new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : '';
                        const operation = {
                            time,
                            tool: toolName,
                            tokens: inputTok + outputTok,
                            detail: filePath || toolInput.pattern || ''
                        };
                        sessionData.history.push(operation);
                        sessionData.newOperations.push(operation); // 标记为新操作
                    }
                }
            }
        }
    } catch (e) {
        // 忽略解析错误
    }
}

function loadSessionData() {
    if (!SESSION_FILE || !fs.existsSync(SESSION_FILE)) {
        return null;
    }

    try {
        const fd = fs.openSync(SESSION_FILE, 'r');
        const stats = fs.fstatSync(fd);

        // 如果文件有新内容
        if (stats.size > sessionLastPos) {
            const buffer = Buffer.alloc(stats.size - sessionLastPos);
            fs.readSync(fd, buffer, 0, buffer.length, sessionLastPos);
            sessionLastPos = stats.size;

            const lines = buffer.toString('utf-8').split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    processSessionLine(line);
                }
            });
        }

        fs.closeSync(fd);
        return sessionData;
    } catch (e) {
        return null;
    }
}

function loadLive() {
    try {
        if (fs.existsSync(LIVE_FILE)) {
            return JSON.parse(fs.readFileSync(LIVE_FILE, 'utf-8'));
        }
    } catch (e) {}
    return null;
}

let lastUpdated = 0;
let useSessionMode = true;
let lastRefreshTime = Date.now();
const REFRESH_INTERVAL = 10000; // 10秒合并一次新操作

function groupByFileType(operations) {
    const groups = {
        '.py': [],
        '.js': [],
        '.json': [],
        '.md': [],
        '.txt': [],
        '.c': [],
        '.h': [],
        'other': []
    };

    operations.forEach(op => {
        if (!op.detail) {
            groups.other.push(op);
            return;
        }

        const ext = op.detail.match(/\.(\w+)$/);
        if (ext && groups[ext[0]]) {
            groups[ext[0]].push(op);
        } else if (ext) {
            groups.other.push(op);
        } else {
            groups.other.push(op);
        }
    });

    return groups;
}

function formatOperation(op) {
    const tokenStr = formatNum(op.tokens).padEnd(7);
    const detail = op.detail || '';

    return `${C.gray}${op.time}${C.reset} ${op.tool.padEnd(10)} ${C.yellow}${tokenStr}${C.reset} ${C.cyan}${detail}${C.reset}`;
}

function render() {
    let data;

    // 尝试 Session 模式
    if (useSessionMode) {
        data = loadSessionData();
        if (data) {
            data = {
                total: data.totalInput + data.totalOutput,
                totalInput: data.totalInput,
                totalOutput: data.totalOutput,
                cacheRead: data.cacheRead,
                cacheCreation: data.cacheCreation,
                files: data.files,
                searches: data.searches,
                history: data.history,
                toolStats: data.toolStats,
                mode: 'session'
            };
        }
    }

    // 回退到 Hook 模式
    if (!data) {
        data = loadLive();
        if (data) {
            data.mode = 'hook';
        }
    }

    if (!data) {
        return;
    }

    // 每次都清屏重绘整个界面（原地刷新）
    drawFullScreen(data);
}

let isFirstDraw = true;
const MAX_OPERATIONS = 10;
const MAX_FILES = 5;

function drawFullScreen(data) {
    const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });

    // 计算成本
    const inputCost = formatCost(data.totalInput, 15);
    const outputCost = formatCost(data.totalOutput, 75);
    const cacheReadCost = formatCost(data.cacheRead, 1.5);
    const cacheWriteCost = formatCost(data.cacheCreation, 18.75);
    const totalCost = (parseFloat(inputCost) + parseFloat(outputCost) + parseFloat(cacheReadCost) + parseFloat(cacheWriteCost)).toFixed(2);

    if (isFirstDraw) {
        // 首次绘制：显示完整界面框架
        process.stdout.write(C.hideCursor); // 隐藏光标
        console.log(`Token: ${C.yellow}${formatNum(data.total).padEnd(8)}${C.reset}  |  成本: ${C.green}$${totalCost.padEnd(8)}${C.reset}  |  输入: ${C.cyan}${formatNum(data.totalInput).padEnd(8)}${C.reset}  输出: ${C.cyan}${formatNum(data.totalOutput).padEnd(8)}${C.reset}  |  ${C.gray}${now}${C.reset}`);
        console.log(`${C.gray}─────────────────────────────────────────────────────────────────────────────${C.reset}`);
        console.log('');
        console.log(`最近操作:`);

        // 预留操作行
        for (let i = 0; i < MAX_OPERATIONS; i++) {
            console.log('');
        }

        console.log('');
        console.log(`文件统计:`);

        // 预留文件行
        for (let i = 0; i < MAX_FILES; i++) {
            console.log('');
        }

        console.log('');
        console.log(`工具统计:`);
        console.log('');
        console.log('');
        console.log('');

        isFirstDraw = false;
    } else {
        // 后续更新：只更新数字部分
        // 移动到第1行（统计行）
        process.stdout.write('\x1b[1;1H');

        // 重写整行（保持格式一致）
        process.stdout.write(C.clearLine);
        process.stdout.write(`Token: ${C.yellow}${formatNum(data.total).padEnd(8)}${C.reset}  |  成本: ${C.green}$${totalCost.padEnd(8)}${C.reset}  |  输入: ${C.cyan}${formatNum(data.totalInput).padEnd(8)}${C.reset}  输出: ${C.cyan}${formatNum(data.totalOutput).padEnd(8)}${C.reset}  |  ${C.gray}${now}${C.reset}`);

        // 更新最近操作（第5行开始，第4行是标题）
        const startRow = 5;
        const recentOps = sessionData.history.slice(-MAX_OPERATIONS);
        recentOps.forEach((op, idx) => {
            process.stdout.write(`\x1b[${startRow + idx};1H`);
            process.stdout.write(C.clearLine);
            process.stdout.write(formatOperation(op));
        });

        // 清除多余的操作行
        for (let i = recentOps.length; i < MAX_OPERATIONS; i++) {
            process.stdout.write(`\x1b[${startRow + i};1H`);
            process.stdout.write(C.clearLine);
        }

        // 更新文件统计（操作行之后 + 2行，+1是标题行）
        const fileRow = startRow + MAX_OPERATIONS + 2;
        const sortedFiles = Object.entries(sessionData.files)
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_FILES);

        sortedFiles.forEach((file, idx) => {
            process.stdout.write(`\x1b[${fileRow + idx};1H`);
            process.stdout.write(C.clearLine);
            const fileName = file[0].length > 50 ? '...' + file[0].slice(-47) : file[0];
            process.stdout.write(`  ${C.cyan}${fileName.padEnd(50)}${C.reset}  ${C.yellow}${formatNum(file[1])}${C.reset}`);
        });

        // 清除多余的文件行
        for (let i = sortedFiles.length; i < MAX_FILES; i++) {
            process.stdout.write(`\x1b[${fileRow + i};1H`);
            process.stdout.write(C.clearLine);
        }

        // 更新工具统计（文件行之后 + 2行，+1是标题行）
        const toolRow = fileRow + MAX_FILES + 2;
        const sortedTools = Object.entries(sessionData.toolStats)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 3);

        sortedTools.forEach((tool, idx) => {
            process.stdout.write(`\x1b[${toolRow + idx};1H`);
            process.stdout.write(C.clearLine);
            process.stdout.write(`  ${C.magenta}${tool[0].padEnd(15)}${C.reset}  ${C.gray}${tool[1].count}次${C.reset}  ${C.yellow}${formatNum(tool[1].tokens)}${C.reset}`);
        });

        // 清除多余的工具行
        for (let i = sortedTools.length; i < 3; i++) {
            process.stdout.write(`\x1b[${toolRow + i};1H`);
            process.stdout.write(C.clearLine);
        }
    }
}

// 初始渲染 - 先清屏
process.stdout.write(C.clear);

// 首次绘制完整界面
setTimeout(() => {
    const data = loadSessionData();
    if (data) {
        drawFullScreen({
            total: data.totalInput + data.totalOutput,
            totalInput: data.totalInput,
            totalOutput: data.totalOutput,
            cacheRead: data.cacheRead,
            cacheCreation: data.cacheCreation,
            mode: 'session'
        });
    }
}, 500);

render();

// 每 2 秒检查更新
setInterval(render, 2000);

// 退出时显示光标
process.on('SIGINT', () => {
    process.stdout.write(C.showCursor);
    console.log('\n\n退出监控');
    process.exit(0);
});
