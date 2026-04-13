import * as esbuild from 'esbuild';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXTERNALS = [
  'openclaw', 'https-proxy-agent', 'lancedb', '@lancedb/*',
  'openai', 'rank_bm25', 'crypto',
  'pino', 'prom-client', 'pino-std-serializers',
  'node:os', 'node:fs', 'node:path', 'node:crypto', 'node:stream', 'node:util', 'node:async_hooks',
];

const builds = [
  { entry: 'src/index.ts', out: 'dist/index.js' },
  { entry: 'src/hooks/hawk-recall/handler.ts', out: 'dist/hooks/hawk-recall/hawk-recall.js' },
  { entry: 'src/hooks/hawk-capture/handler.ts', out: 'dist/hooks/hawk-capture/hawk-capture.js' },
  { entry: 'src/hooks/hawk-decay/handler.ts', out: 'dist/hooks/hawk-decay/hawk-decay.js' },
  { entry: 'src/cli/decay.ts', out: 'dist/cli/decay.js' },
  { entry: 'src/cli/verify.ts', out: 'dist/cli/verify.js' },
  { entry: 'src/seed.ts', out: 'dist/seed.js' },
  { entry: 'src/cli/write.ts', out: 'dist/cli/write.js' },
  { entry: 'src/cli/read-source.ts', out: 'dist/cli/read-source.js' },
  { entry: 'src/cli/doctor.ts', out: 'dist/cli/doctor.js' },
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
  fs.cpSync('src/hooks/hawk-recall/HOOK.md', 'dist/hooks/hawk-recall/HOOK.md');
  fs.cpSync('src/hooks/hawk-capture/HOOK.md', 'dist/hooks/hawk-capture/HOOK.md');
  fs.cpSync('src/hooks/hawk-decay/HOOK.md', 'dist/hooks/hawk-decay/HOOK.md');
  console.log('Built successfully');
}).catch(e => {
  console.error(e.message);
  process.exit(1);
});
