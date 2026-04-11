#!/usr/bin/env node

// src/cli/doctor.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
var checks = [];
function check(name, fn) {
  try {
    const result = fn();
    checks.push({ name, ...result });
  } catch (e) {
    checks.push({ name, status: "fail", message: `Error: ${e.message}` });
  }
}
async function runDoctor() {
  console.log("\n\u{1F985} hawk-bridge \u8BCA\u65AD\u5DE5\u5177\n" + "\u2550".repeat(50) + "\n");
  check("Python", () => {
    try {
      const out = execSync("python3 --version 2>&1", { encoding: "utf-8" }).trim();
      return { status: "pass", message: out };
    } catch {
      return { status: "fail", message: "Python3 \u672A\u627E\u5230\uFF0C\u8BF7\u5B89\u88C5 Python 3.8+" };
    }
  });
  check("LanceDB", () => {
    try {
      const lancedbPath = path.join(process.cwd(), "node_modules", "@lancedb", "lancedb", "dist", "index.js");
      if (fs.existsSync(lancedbPath)) {
        return { status: "pass", message: "@lancedb/lancedb installed" };
      }
      const pkgJson = path.join(process.cwd(), "node_modules", "@lancedb", "lancedb", "package.json");
      if (fs.existsSync(pkgJson)) {
        return { status: "pass", message: "@lancedb/lancedb installed (package.json found)" };
      }
      return { status: "fail", message: "@lancedb/lancedb \u672A\u5B89\u88C5\uFF0C\u8BF7\u8FD0\u884C npm install" };
    } catch (e) {
      return { status: "fail", message: `LanceDB \u68C0\u67E5\u5931\u8D25: ${e.message}` };
    }
  });
  check("\u914D\u7F6E\u6587\u4EF6", () => {
    const yamlPath = path.join(os.homedir(), ".hawk", "config.yaml");
    const jsonPath = path.join(os.homedir(), ".hawk", "config.json");
    if (fs.existsSync(yamlPath)) {
      return { status: "pass", message: `~/.hawk/config.yaml \u5B58\u5728` };
    } else if (fs.existsSync(jsonPath)) {
      return { status: "warn", message: `~/.hawk/config.json \u5B58\u5728\uFF08\u5EFA\u8BAE\u8FC1\u79FB\u5230 YAML\uFF09` };
    } else {
      return { status: "warn", message: `\u65E0\u914D\u7F6E\u6587\u4EF6\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u914D\u7F6E` };
    }
  });
  check("\u914D\u7F6E\u89E3\u6790", () => {
    try {
      const yamlPath = path.join(os.homedir(), ".hawk", "config.yaml");
      const jsonPath = path.join(os.homedir(), ".hawk", "config.json");
      if (fs.existsSync(yamlPath) || fs.existsSync(jsonPath)) {
        return { status: "pass", message: "\u914D\u7F6E\u6587\u4EF6\u53EF\u8BFB\u53D6" };
      }
      return { status: "warn", message: "\u65E0\u914D\u7F6E\u6587\u4EF6\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u914D\u7F6E" };
    } catch {
      return { status: "fail", message: "\u914D\u7F6E\u89E3\u6790\u5931\u8D25" };
    }
  });
  check("Embedding API Key", () => {
    const keys = [
      process.env.OLLAMA_BASE_URL,
      process.env.QWEN_API_KEY,
      process.env.DASHSCOPE_API_KEY,
      process.env.JINA_API_KEY,
      process.env.OPENAI_API_KEY,
      process.env.COHERE_API_KEY
    ].filter(Boolean);
    if (keys.length > 0) {
      const hasKey = keys.some((k) => !k?.startsWith("ollama"));
      return {
        status: hasKey ? "pass" : "warn",
        message: hasKey ? `API Key \u5B58\u5728 (${keys.length}\u4E2A)` : "\u4EC5 OLLAMA_BASE_URL \u914D\u7F6E\uFF08\u672C\u5730\u90E8\u7F72\uFF09"
      };
    }
    return { status: "warn", message: "\u672A\u68C0\u6D4B\u5230 API Key\uFF0C\u5C06\u4F7F\u7528 fallback\uFF08\u65E0\u5411\u91CF\u641C\u7D22\uFF09" };
  });
  check("hawk CLI", () => {
    const hawkCli = path.join(os.homedir(), ".hawk", "bin", "hawk");
    if (fs.existsSync(hawkCli)) {
      return { status: "pass", message: "~/.hawk/bin/hawk \u5B58\u5728" };
    }
    return { status: "warn", message: "~/.hawk/bin/hawk \u4E0D\u5B58\u5728\uFF08\u53EF\u9009\uFF09" };
  });
  check("\u78C1\u76D8\u7A7A\u95F4", () => {
    try {
      const stat = fs.statfsSync(os.homedir());
      const freeGB = stat.bsize * stat.bavail / 1e9;
      if (freeGB < 1) return { status: "fail", message: `\u53EF\u7528\u7A7A\u95F4\u4E0D\u8DB3 ${freeGB.toFixed(1)} GB` };
      if (freeGB < 5) return { status: "warn", message: `\u53EF\u7528\u7A7A\u95F4 ${freeGB.toFixed(1)} GB\uFF08\u504F\u5C11\uFF09` };
      return { status: "pass", message: `\u53EF\u7528\u7A7A\u95F4 ${freeGB.toFixed(1)} GB` };
    } catch {
      return { status: "info", message: "\u65E0\u6CD5\u68C0\u6D4B\u78C1\u76D8\u7A7A\u95F4" };
    }
  });
  check("OpenClaw Hooks", () => {
    const pluginJson = path.join(process.cwd(), "openclaw.plugin.json");
    if (fs.existsSync(pluginJson)) {
      try {
        const plugin = JSON.parse(fs.readFileSync(pluginJson, "utf-8"));
        const hookNames = (plugin.hooks || []).map((h) => h.name);
        return { status: "pass", message: `\u5DF2\u6CE8\u518C hooks: ${hookNames.join(", ")}` };
      } catch {
        return { status: "warn", message: "openclaw.plugin.json \u683C\u5F0F\u9519\u8BEF" };
      }
    }
    return { status: "info", message: "openclaw.plugin.json \u672A\u627E\u5230\uFF08\u4EC5\u5F00\u53D1\u68C0\u67E5\uFF09" };
  });
  console.log("\u8BCA\u65AD\u7ED3\u679C:\n");
  const pass = checks.filter((c) => c.status === "pass").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const info = checks.filter((c) => c.status === "info").length;
  for (const c of checks) {
    const icon = c.status === "pass" ? "\u2705" : c.status === "fail" ? "\u274C" : c.status === "warn" ? "\u26A0\uFE0F" : "\u2139\uFE0F";
    console.log(`${icon} ${c.name}: ${c.message}`);
  }
  console.log("\n" + "\u2500".repeat(50));
  console.log(`\u603B\u7ED3: ${pass} \u901A\u8FC7, ${fail} \u5931\u8D25, ${warn} \u8B66\u544A, ${info} \u4FE1\u606F`);
  if (fail > 0) {
    console.log("\n\u274C \u6709\u5931\u8D25\u9879\uFF0C\u8BF7\u4FEE\u590D\u540E\u518D\u4F7F\u7528\u3002\n");
    process.exit(1);
  } else if (warn > 0) {
    console.log("\n\u26A0\uFE0F \u6709\u8B66\u544A\u9879\uFF0C\u5EFA\u8BAE\u5904\u7406\u540E\u518D\u4F7F\u7528\u3002\n");
    process.exit(0);
  } else {
    console.log("\n\u2705 \u6240\u6709\u68C0\u67E5\u901A\u8FC7\uFF0Chawk-bridge \u53EF\u4EE5\u6B63\u5E38\u4F7F\u7528\uFF01\n");
  }
}
runDoctor().catch(console.error);
