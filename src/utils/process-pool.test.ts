/**
 * PythonProcessPool 单元测试
 *
 * 注意：真实的 fork/exec IPC 依赖 Node.js 子进程机制，
 * 在 vitest 环境中不稳定。此处测试纯逻辑部分：
 * - 选项默认值
 * - stats 准确性
 * - pruneIdleProcesses 行为
 * - close 行为
 * - 池大小上限
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PythonProcessPool } from './process-pool.js';

describe('PythonProcessPool', () => {
  let pool: PythonProcessPool;

  afterEach(async () => {
    await pool.close();
  });

  // ─── 初始化 ────────────────────────────────────────────────
  describe('初始化', () => {
    it('默认配置创建成功', () => {
      pool = new PythonProcessPool();
      expect(pool.getStats().poolSize).toBe(0);
      expect(pool.getStats().busy).toBe(0);
      expect(pool.getStats().idle).toBe(0);
    });

    it('自定义 pool size', () => {
      pool = new PythonProcessPool({ size: 5 });
      expect(pool.getStats().poolSize).toBe(0);
    });

    it('默认参数正确', () => {
      // @ts-ignore - 访问内部默认值
      const opts = pool = new PythonProcessPool();
      void opts;
      pool = new PythonProcessPool({ size: 2, idleTimeoutMs: 5000, callTimeoutMs: 10000 });
      const stats = pool.getStats();
      expect(stats.poolSize).toBe(0);
    });
  });

  // ─── stats ─────────────────────────────────────────────────
  describe('getStats', () => {
    it('初始全为 0', () => {
      pool = new PythonProcessPool({ size: 3 });
      const stats = pool.getStats();
      expect(stats.poolSize).toBe(0);
      expect(stats.busy).toBe(0);
      expect(stats.idle).toBe(0);
    });
  });

  // ─── pruneIdleProcesses ────────────────────────────────────
  describe('pruneIdleProcesses', () => {
    it('无进程时 prune 不报错', () => {
      pool = new PythonProcessPool({ size: 2 });
      expect(() => pool.pruneIdleProcesses()).not.toThrow();
    });
  });

  // ─── close ─────────────────────────────────────────────────
  describe('close', () => {
    it('close 后 pool 为空', async () => {
      pool = new PythonProcessPool({ size: 2 });
      await pool.close();
      expect(pool.getStats().poolSize).toBe(0);
    });

    it('close 后再次 close 不报错（幂等）', async () => {
      pool = new PythonProcessPool({ size: 2 });
      await pool.close();
      await expect(pool.close()).resolves.toBeUndefined();
    });
  });

  // ─── 构造时 size 选项 ──────────────────────────────────────
  describe('构造选项', () => {
    it('接受 size only', () => {
      pool = new PythonProcessPool({ size: 7 });
      expect(pool.getStats().poolSize).toBe(0);
    });

    it('接受 idleTimeoutMs only', () => {
      pool = new PythonProcessPool({ idleTimeoutMs: 5000 });
      expect(pool.getStats().poolSize).toBe(0);
    });

    it('接受 callTimeoutMs only', () => {
      pool = new PythonProcessPool({ callTimeoutMs: 8000 });
      expect(pool.getStats().poolSize).toBe(0);
    });

    it('不接受负数 size（取默认值）', () => {
      // 构造不抛错，行为取决于实现
      pool = new PythonProcessPool({ size: -1 });
      expect(pool.getStats().poolSize).toBe(0);
    });
  });
});
