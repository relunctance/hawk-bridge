import * as esbuild from 'esbuild';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const childProcess = await import('child_process').catch(() => null);
const execSync = childProcess ? childProcess.execSync : null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXTERNALS = [
  'fs',
  'openclaw', 'https-proxy-agent', 'lancedb', '@lancedb/*',
  'openai', 'rank_bm25', 'crypto',
  'pino', 'prom-client', 'pino-std-serializers',
  'node:os', 'os', 'node:fs', 'node:path', 'node:crypto', 'node:stream', 'node:util', 'node:async_hooks',
];

const builds = [
  { entry: 'src/index.ts', out: 'dist/index.js' },
  { entry: 'src/hooks/hawk-recall/handler.ts', out: 'dist/hooks/hawk-recall/handler.js' },
  { entry: 'src/hooks/hawk-capture/handler.ts', out: 'dist/hooks/hawk-capture/handler.js' },
  { entry: 'src/hooks/hawk-decay/handler.ts', out: 'dist/hooks/hawk-decay/handler.js' },
  { entry: 'src/cli/decay.ts', out: 'dist/cli/decay.js' },
  { entry: 'src/cli/verify.ts', out: 'dist/cli/verify.js' },
  { entry: 'src/seed.ts', out: 'dist/seed.js' },
  { entry: 'src/cli/write.ts', out: 'dist/cli/write.js' },
  { entry: 'src/cli/read-source.ts', out: 'dist/cli/read-source.js' },
  { entry: 'src/cli/doctor.ts', out: 'dist/cli/doctor.js' },
  { entry: 'src/cli/stats.ts', out: 'dist/cli/stats.js' },
  { entry: 'src/cli/decay-verify.ts', out: 'dist/cli/decay-verify.js' },
];

Promise.all(builds.map(({ entry, out }) =>
  esbuild.build({
    entryPoints: [entry],
    bundle: true,
    outfile: out,
    platform: 'node',
    format: 'esm',
    external: EXTERNALS,
  })
)).then(() => {
  // Check for console.* calls in source (no-console rule)
  // CLI tools (src/cli/) are user-facing — their console.log is intentional output, skip them
  const srcFiles = builds
    .filter(b => b.entry.startsWith('src/') && !b.entry.startsWith('src/cli/'))
    .map(b => b.entry);
  if (execSync) {
    for (const f of srcFiles) {
      const rel = f.replace('src/', '');
      try {
        const output = execSync(
          `grep -n 'console\\.\\(log\\|debug\\)' src/${rel} 2>/dev/null || true`,
          { cwd: path.join(__dirname, '..'), encoding: 'utf8' }
        ).trim();
        if (output) {
          console.warn(`[no-console] console.log/debug found in ${f}:\n${output}`);
        }
      } catch { /* ignore */ }
    }
  }

  fs.cpSync('src/hooks/hawk-recall/HOOK.md', 'dist/hooks/hawk-recall/HOOK.md');
  fs.cpSync('src/hooks/hawk-capture/HOOK.md', 'dist/hooks/hawk-capture/HOOK.md');
  fs.cpSync('src/hooks/hawk-decay/HOOK.md', 'dist/hooks/hawk-decay/HOOK.md');

  // Sync dist/ to workspace so Gateway picks up latest build
  const repoRoot = path.join(__dirname, '..');  // /home/gql/repos/hawk-bridge
  const workspaceDist = '/home/gql/.openclaw/workspace/dist';
  try {
    const stat = fs.lstatSync(workspaceDist);
    if (stat.isDirectory() || stat.isSymbolicLink()) {
      fs.rmSync(workspaceDist, { recursive: true });
      console.log('[sync] Removed old workspace/dist');
    }
  } catch {}
  if (!fs.existsSync(workspaceDist)) {
    fs.symlinkSync(repoRoot, workspaceDist, 'junction');
    console.log('[sync] Linked workspace/dist → hawk-bridge (自动同步)');
  }

  console.log('Built successfully');
}).catch(e => {
  console.error(e.message);
  process.exit(1);
});
