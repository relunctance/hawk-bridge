/**
 * hawk-stats: CLI command to display hawk-bridge memory statistics.
 *
 * Usage:
 *   node dist/cli/stats.js           # show summary stats
 *   node dist/cli/stats.js --json    # JSON output (for scripting)
 *   node dist/cli/stats.js --tiers   # show tier distribution
 *   node dist/cli/stats.js --agents  # show agent distribution
 *
 * Shows:
 *   - Total memory count
 *   - Tier distribution (permanent / stable / decay / archived)
 *   - Agent/scope distribution
 *   - DB size on disk
 *   - Recent activity (last accessed)
 *   - Memory count by category
 */

import { HawkDB } from '../lancedb.js';
import * as path from 'path';
import * as fs from 'fs';

interface TierCount {
  permanent: number;
  stable: number;
  decay: number;
  archived: number;
}

interface CategoryCount {
  [key: string]: number;
}

interface AgentCount {
  [key: string]: number;
}

function getDBPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.hawk', 'lancedb');
}

async function getDirSize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirSize(full);
      } else {
        const stat = await fs.promises.stat(full);
        total += stat.size;
      }
    }
  } catch { /* ignore */ }
  return total;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const tiersMode = args.includes('--tiers');
  const agentsMode = args.includes('--agents');

  const db = new HawkDB();
  await db.init();

  // Get all memories
  const memories = await db.getAllMemories();
  const total = memories.length;

  // Get DB stats
  const stats = await db.getDBStats();
  const dbPath = getDBPath();
  let dirSizeBytes = 0;
  try {
    dirSizeBytes = await getDirSize(dbPath);
  } catch { /* ignore */ }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  if (jsonMode) {
    // Count tiers
    const tiers: TierCount = { permanent: 0, stable: 0, decay: 0, archived: 0 };
    const categories: CategoryCount = {};
    const agents: AgentCount = {};
    const now = Date.now();
    let recent7d = 0;
    let recent30d = 0;

    for (const m of memories) {
      const scope = m.scope || 'unknown';
      if (scope === 'permanent') tiers.permanent++;
      else if (scope === 'stable') tiers.stable++;
      else if (scope === 'decay') tiers.decay++;
      else if (scope === 'archived' || scope === 'archive') tiers.archived++;
      else tiers.stable++;

      const cat = m.category || 'other';
      categories[cat] = (categories[cat] || 0) + 1;

      const owner = (m.metadata as any)?.owner_agent ?? (m.metadata as any)?.ownerAgent ?? 'unknown';
      agents[owner] = (agents[owner] || 0) + 1;

      const daysIdle = (now - m.lastAccessedAt) / 86400000;
      if (daysIdle <= 7) recent7d++;
      if (daysIdle <= 30) recent30d++;
    }

    const output = {
      total,
      tiers,
      categories,
      agents,
      dbSizeBytes: dirSizeBytes,
      dbSizeFormatted: formatBytes(dirSizeBytes),
      recent7d,
      recent30d,
      lockedCount: memories.filter(m => m.locked).length,
    };

    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // ─── Human-readable output ──────────────────────────────────────────────────────

  console.log('\n🦅 hawk-bridge 统计信息\n' + '═'.repeat(50));
  console.log(`\n📊 总记忆数: ${total}`);
  console.log(`💾 数据库大小: ${formatBytes(dirSizeBytes)}`);
  console.log(`📁 数据库路径: ${dbPath}`);

  // Tier distribution
  const tiers: TierCount = { permanent: 0, stable: 0, decay: 0, archived: 0 };
  const categories: CategoryCount = {};
  const agents: AgentCount = {};
  const now = Date.now();
  let recent7d = 0;
  let recent30d = 0;
  let lockedCount = 0;

  for (const m of memories) {
    const scope = m.scope || 'unknown';
    if (scope === 'permanent') tiers.permanent++;
    else if (scope === 'stable') tiers.stable++;
    else if (scope === 'decay') tiers.decay++;
    else if (scope === 'archived' || scope === 'archive') tiers.archived++;
    else tiers.stable++;

    const cat = m.category || 'other';
    categories[cat] = (categories[cat] || 0) + 1;

    const owner = (m.metadata as any)?.owner_agent ?? (m.metadata as any)?.ownerAgent ?? 'unknown';
    agents[owner] = (agents[owner] || 0) + 1;

    const daysIdle = (now - m.lastAccessedAt) / 86400000;
    if (daysIdle <= 7) recent7d++;
    if (daysIdle <= 30) recent30d++;
    if (m.locked) lockedCount++;
  }

  if (tiersMode || agentsMode) {
    if (tiersMode) {
      console.log('\n🏷️ Tier 分布:');
      console.log(`   🟢 permanent (永久): ${tiers.permanent}`);
      console.log(`   🔵 stable (稳定):    ${tiers.stable}`);
      console.log(`   🟡 decay (衰减):     ${tiers.decay}`);
      console.log(`   ⚪ archived (归档):  ${tiers.archived}`);
    }
    if (agentsMode) {
      console.log('\n👥 Agent 分布:');
      const sorted = Object.entries(agents).sort((a, b) => b[1] - a[1]);
      for (const [agent, count] of sorted) {
        console.log(`   ${agent}: ${count}`);
      }
    }
    console.log('');
    return;
  }

  console.log('\n🏷️ Tier 分布:');
  console.log(`   🟢 permanent (永久): ${tiers.permanent}  (>=${(0.75).toFixed(2)} importance, >=3次recall)`);
  console.log(`   🔵 stable (稳定):    ${tiers.stable}  (>=${(0.5).toFixed(2)} importance)`);
  console.log(`   🟡 decay (衰减):     ${tiers.decay}  (>${(0.3).toFixed(2)} importance)`);
  console.log(`   ⚪ archived (归档):  ${tiers.archived}  (<=${(0.3).toFixed(2)} importance)`);

  console.log('\n📁 Category 分布:');
  const catSorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of catSorted) {
    const bar = '█'.repeat(Math.round(count / total * 20));
    console.log(`   ${cat.padEnd(12)} ${String(count).padStart(4)} ${bar}`);
  }

  console.log('\n📅 活跃度:');
  console.log(`   7 天内访问:  ${recent7d}`);
  console.log(`   30 天内访问: ${recent30d}`);
  console.log(`   🔒 锁定:     ${lockedCount}`);

  // Recent memories
  if (memories.length > 0) {
    const recent = await db.listRecent(5);
    console.log('\n🕐 最近 5 条记忆:');
    for (const m of recent) {
      const age = Math.round((now - m.lastAccessedAt) / 60000);
      const ageStr = age < 60 ? `${age}m ago` : age < 1440 ? `${Math.round(age / 60)}h ago` : `${Math.round(age / 1440)}d ago`;
      const text = m.text.length > 60 ? m.text.slice(0, 60) + '...' : m.text;
      console.log(`   [${m.category}] ${text} (${ageStr})`);
    }
  }

  console.log('\n' + '═'.repeat(50) + '\n');
}

main().catch(err => {
  console.error('❌ Stats failed:', err.message);
  process.exit(1);
});
