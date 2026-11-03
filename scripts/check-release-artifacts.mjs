#!/usr/bin/env node
// 发布产物安全闸门：扫描前端 dist，阻止把服务端密钥、上游地址或提示词哨兵打进客户端。
//
// 用法：
//   node scripts/check-release-artifacts.mjs                # 默认扫 webapp/admin/site 的 dist
//   node scripts/check-release-artifacts.mjs path/to/dist   # 指定目录
//   node scripts/check-release-artifacts.mjs --self-test    # 自测：临时目录放一个假密钥，必须报错
//
// 只打印文件、行号与规则名，不打印命中的原文；发现任何一项都以非 0 退出。

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".css", ".html", ".json", ".txt", ".xml", ".svg"]);
const SKIP_DIRS = new Set(["node_modules", ".git"]);

const RULES = [
  {
    name: "env-secret-assignment",
    // 变量名出现在客户端就足够可疑；不打印值。
    re: /\b(?:LECSYNC_API_KEY|AI_PROVIDER_API_KEY|ALIYUN_SMS_ACCESS_KEY_ID|ALIYUN_SMS_ACCESS_KEY_SECRET|DEEPSEEK_API_KEY|KIMI_API_KEY|MIMO_API_KEY|VISION_PROVIDER_API_KEY|ADMIN_PASSWORD|ADMIN_SESSION_SECRET|ACCOUNT_ENCRYPTION_KEY|TOKEN_PEPPER)\b\s*[:=]\s*["']?[A-Za-z0-9]/,
  },
  { name: "openai-style-key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "bearer-token", re: /\bBearer\s+[A-Za-z0-9._~+/-]{24,}/ },
  { name: "prompt-guard-token", re: /ZX-GUARD-[A-Z0-9]{6,}/ },
  { name: "upstream-provider-host", re: /api\.lecsync\.com/ },
];

function walk(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  return files;
}

function scanRoot(root) {
  const findings = [];
  if (!existsSync(root)) return { root, missing: true, findings, files: 0 };
  const files = walk(root);
  for (const file of files) {
    const rel = relative(root, file);
    if (rel.endsWith(".map")) {
      findings.push({ file: rel, line: 0, rule: "source-map-present" });
      continue;
    }
    if (/^\.env/.test(rel)) {
      findings.push({ file: rel, line: 0, rule: "env-file-in-dist" });
      continue;
    }
    const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    for (const rule of RULES) {
      for (let index = 0; index < lines.length; index += 1) {
        if (rule.re.test(lines[index])) {
          findings.push({ file: rel, line: index + 1, rule: rule.name });
        }
      }
    }
  }
  return { root, missing: false, findings, files: files.length };
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "zhixi-release-check-"));
  try {
    const fakeKey = "sk-" + "test".repeat(6);
    writeFileSync(join(dir, "app.js"), `const fake = '${fakeKey}';\n`);
    writeFileSync(join(dir, "notes.txt"), "ZX-GUARD-ABCDEF12\n");
    const result = scanRoot(dir);
    const names = new Set(result.findings.map((finding) => finding.rule));
    const ok = names.has("openai-style-key") && names.has("prompt-guard-token");
    if (!ok) {
      console.error("self-test failed: expected openai-style-key and prompt-guard-token");
      process.exit(1);
    }
    console.log("self-test passed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const roots = args.length ? args : ["webapp/dist", "admin/dist", "site/dist"];
let failed = false;
for (const root of roots) {
  const result = scanRoot(root);
  if (result.missing) {
    console.log(`SKIP ${root} (not built)`);
    continue;
  }
  if (result.findings.length === 0) {
    console.log(`PASS ${root} (${result.files} files)`);
    continue;
  }
  failed = true;
  console.log(`FAIL ${root} (${result.findings.length} findings)`);
  for (const finding of result.findings.slice(0, 50)) {
    console.log(`  ${finding.file}:${finding.line} [${finding.rule}]`);
  }
  if (result.findings.length > 50) {
    console.log(`  ... and ${result.findings.length - 50} more`);
  }
}

if (failed) {
  console.error("Release artifact check failed: do not publish these bundles.");
  process.exit(1);
}
console.log("Release artifact check passed.");
