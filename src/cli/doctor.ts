#!/usr/bin/env node
/**
 * hawk-doctor: Diagnostic tool to verify hawk-bridge installation
 * Run: node dist/cli/doctor.js
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { getConfig } from '../config.js';
import { Embedder } from '../embeddings.js';

interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  message: string;
}

const checks: Check[] = [];

function check(name: string, fn: () => { status: Check['status']; message: string }) {
  try {
    const result = fn();
    checks.push({ name, ...result });
  } catch (e: any) {
    checks.push({ name, status: 'fail', message: `Error: ${e.message}` });
  }
}

async function runDoctor() {
  const args = process.argv.slice(2);
  const testEmbed = args.includes('--test-embed') || args.includes('-e');

  console.log('\n🦅 hawk-bridge 诊断工具\n' + '═'.repeat(50) + '\n');

  // 1. Python check
  check('Python', () => {
    try {
      const out = execSync('python3 --version 2>&1', { encoding: 'utf-8' }).trim();
      return { status: 'pass', message: out };
    } catch {
      return { status: 'fail', message: 'Python3 未找到，请安装 Python 3.8+' };
    }
  });

  // 2. LanceDB check
  check('LanceDB', () => {
    try {
      // Check by examining node_modules
      const lancedbPath = path.join(process.cwd(), 'node_modules', '@lancedb', 'lancedb', 'dist', 'index.js');
      if (fs.existsSync(lancedbPath)) {
        return { status: 'pass', message: '@lancedb/lancedb installed' };
      }
      // Alternative: check package.json
      const pkgJson = path.join(process.cwd(), 'node_modules', '@lancedb', 'lancedb', 'package.json');
      if (fs.existsSync(pkgJson)) {
        return { status: 'pass', message: '@lancedb/lancedb installed (package.json found)' };
      }
      return { status: 'fail', message: '@lancedb/lancedb 未安装，请运行 npm install' };
    } catch (e: any) {
      return { status: 'fail', message: `LanceDB 检查失败: ${e.message}` };
    }
  });

  // 3. Config file check
  check('配置文件', () => {
    const yamlPath = path.join(os.homedir(), '.hawk', 'config.yaml');
    const jsonPath = path.join(os.homedir(), '.hawk', 'config.json');
    if (fs.existsSync(yamlPath)) {
      return { status: 'pass', message: `~/.hawk/config.yaml 存在` };
    } else if (fs.existsSync(jsonPath)) {
      return { status: 'warn', message: `~/.hawk/config.json 存在（建议迁移到 YAML）` };
    } else {
      return { status: 'warn', message: `无配置文件，使用默认配置` };
    }
  });

  // 4. Config parse check (sync - just check yaml loading)
  check('配置解析', () => {
    try {
      const yamlPath = path.join(os.homedir(), '.hawk', 'config.yaml');
      const jsonPath = path.join(os.homedir(), '.hawk', 'config.json');
      if (fs.existsSync(yamlPath) || fs.existsSync(jsonPath)) {
        return { status: 'pass', message: '配置文件可读取' };
      }
      return { status: 'warn', message: '无配置文件，使用默认配置' };
    } catch {
      return { status: 'fail', message: '配置解析失败' };
    }
  });

  // 5. Embedder API key check
  check('Embedding API Key', () => {
    const keys = [
      process.env.OLLAMA_BASE_URL,
      process.env.QWEN_API_KEY,
      process.env.DASHSCOPE_API_KEY,
      process.env.JINA_API_KEY,
      process.env.OPENAI_API_KEY,
      process.env.COHERE_API_KEY,
    ].filter(Boolean);

    if (keys.length > 0) {
      const hasKey = keys.some(k => !k?.startsWith('ollama'));
      return {
        status: hasKey ? 'pass' : 'warn',
        message: hasKey ? `API Key 存在 (${keys.length}个)` : '仅 OLLAMA_BASE_URL 配置（本地部署）'
      };
    }
    return { status: 'warn', message: '未检测到 API Key，将使用 fallback（无向量搜索）' };
  });

  // 6. hawk CLI check
  check('hawk CLI', () => {
    const hawkCli = path.join(os.homedir(), '.hawk', 'bin', 'hawk');
    if (fs.existsSync(hawkCli)) {
      return { status: 'pass', message: '~/.hawk/bin/hawk 存在' };
    }
    return { status: 'warn', message: '~/.hawk/bin/hawk 不存在（可选）' };
  });

  // 7. Disk space
  check('磁盘空间', () => {
    try {
      const stat = fs.statfsSync(os.homedir());
      const freeGB = (stat.bsize * stat.bavail) / 1e9;
      if (freeGB < 1) return { status: 'fail', message: `可用空间不足 ${freeGB.toFixed(1)} GB` };
      if (freeGB < 5) return { status: 'warn', message: `可用空间 ${freeGB.toFixed(1)} GB（偏少）` };
      return { status: 'pass', message: `可用空间 ${freeGB.toFixed(1)} GB` };
    } catch { return { status: 'info', message: '无法检测磁盘空间' }; }
  });

  // 8. Hooks registration check
  check('OpenClaw Hooks', () => {
    const pluginJson = path.join(process.cwd(), 'openclaw.plugin.json');
    if (fs.existsSync(pluginJson)) {
      try {
        const plugin = JSON.parse(fs.readFileSync(pluginJson, 'utf-8'));
        const hookNames = (plugin.hooks || []).map((h: any) => h.name);
        return { status: 'pass', message: `已注册 hooks: ${hookNames.join(', ')}` };
      } catch {
        return { status: 'warn', message: 'openclaw.plugin.json 格式错误' };
      }
    }
    return { status: 'info', message: 'openclaw.plugin.json 未找到（仅开发检查）' };
  });

  // Summary
  // Embedder connectivity test (async, only when --test-embed)
  if (testEmbed) {
    console.log('\n正在测试 Embedder 连通性...\n');
    try {
      const config: any = await getConfig();
      const embedder = new Embedder(config.embedding);
      const start = Date.now();
      const vectors = await embedder.embed(['hello']);
      const latency = Date.now() - start;
      if (vectors && vectors.length > 0 && vectors[0].length > 0) {
        console.log(`✅ Embedder 连通性: 成功 (${latency}ms, ${vectors[0].length}维向量)\n`);
      } else {
        console.log(`⚠️ Embedder 连通性: 返回结果异常\n`);
      }
    } catch (e: any) {
      console.log(`❌ Embedder 连通性: 失败 — ${e.message}\n`);
    }
  }

  console.log('诊断结果:\n');
  const pass = checks.filter(c => c.status === 'pass').length;
  const fail = checks.filter(c => c.status === 'fail').length;
  const warn = checks.filter(c => c.status === 'warn').length;
  const info = checks.filter(c => c.status === 'info').length;

  for (const c of checks) {
    const icon = c.status === 'pass' ? '✅' : c.status === 'fail' ? '❌' : c.status === 'warn' ? '⚠️' : 'ℹ️';
    console.log(`${icon} ${c.name}: ${c.message}`);
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`总结: ${pass} 通过, ${fail} 失败, ${warn} 警告, ${info} 信息`);

  if (fail > 0) {
    console.log('\n❌ 有失败项，请修复后再使用。\n');
    process.exit(1);
  } else if (warn > 0) {
    console.log('\n⚠️ 有警告项，建议处理后再使用。\n');
    process.exit(0);
  } else {
    console.log('\n✅ 所有检查通过，hawk-bridge 可以正常使用！\n');
  }
}

runDoctor().catch(console.error);
