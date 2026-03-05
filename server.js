#!/usr/bin/env node
/**
 * Copyright (c) 2026 luoshanxuli2010@163.com
 * SPDX-License-Identifier: MIT
 *
 * Token Monitor Web Server
 * 启动 Web 界面的 HTTP 服务器
 * 用法: node server.js
 * 然后在浏览器打开 http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;

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

// 解析会话文件
function parseSessionFile(filePath) {
    const data = {
        totalInput: 0,
        totalOutput: 0,
        cacheRead: 0,
        cacheCreation: 0,
        history: [],
        toolStats: {}
    };

    if (!fs.existsSync(filePath)) {
        return data;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach(line => {
        if (!line.trim()) return;

        try {
            const record = JSON.parse(line);

            if (record.message && record.message.usage) {
                const usage = record.message.usage;
                const timestamp = record.timestamp || '';

                const inputTok = usage.input_tokens || 0;
                const outputTok = usage.output_tokens || 0;
                const cacheRead = usage.cache_read_input_tokens || 0;
                const cacheCreation = usage.cache_creation_input_tokens || 0;

                data.totalInput += inputTok;
                data.totalOutput += outputTok;
                data.cacheRead += cacheRead;
                data.cacheCreation += cacheCreation;

                // 提取工具调用信息
                if (record.message.content) {
                    for (const item of record.message.content) {
                        if (item.type === 'tool_use') {
                            const toolName = item.name || 'Unknown';
                            const toolInput = item.input || {};

                            // 更新工具统计
                            if (!data.toolStats[toolName]) {
                                data.toolStats[toolName] = { count: 0, tokens: 0 };
                            }
                            data.toolStats[toolName].count++;
                            data.toolStats[toolName].tokens += inputTok + outputTok;

                            // 提取文件路径
                            let filePath = toolInput.file_path || toolInput.path;

                            // 添加到历史
                            const time = timestamp ? new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : '';
                            data.history.push({
                                time,
                                tool: toolName,
                                tokens: inputTok + outputTok,
                                detail: filePath || toolInput.pattern || ''
                            });
                        }
                    }
                }
            }
        } catch (e) {
            // 忽略解析错误
        }
    });

    return data;
}

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
    // 设置 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.url === '/') {
        // 返回 HTML 页面
        const htmlPath = path.join(__dirname, 'monitor.html');
        const html = fs.readFileSync(htmlPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    } else if (req.url === '/api/session-data') {
        // 返回会话数据
        const sessionFile = findLatestSession();
        if (sessionFile) {
            const data = parseSessionFile(sessionFile);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(data));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Session file not found' }));
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`\x1b[32m✓ Token Monitor Web Server 已启动\x1b[0m`);
    console.log(`\x1b[36m➜ 在浏览器打开: http://localhost:${PORT}\x1b[0m`);
    console.log(`\x1b[90m按 Ctrl+C 停止服务器\x1b[0m\n`);
});
