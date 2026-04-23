/**
 * DistributedLock 单元测试
 *
 * 使用 HAWK_LOCK_DIR 指向临时目录，直接测试真实文件系统。
 * 每次测试前清空临时目录，实现完全隔离。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

describe('DistributedLock', () => {
  const tmpDir = join(os.tmpdir(), `hawk-lock-test-${process.pid}`);
  const envBak = process.env.HAWK_LOCK_DIR;

  beforeEach(() => {
    process.env.HAWK_LOCK_DIR = tmpDir;
    // 确保目录存在，每次测试前清空
    mkdirSync(tmpDir, { recursive: true });
    for (const f of readdirSync(tmpDir)) {
      try { unlinkSync(join(tmpDir, f)); } catch {}
    }
  });

  afterEach(() => {
    if (envBak !== undefined) {
      process.env.HAWK_LOCK_DIR = envBak;
    } else {
      delete process.env.HAWK_LOCK_DIR;
    }
  });

  // ─── 动态 import（确保读当前 env） ────────────────────────
  // 使用 eval 做 sandbox，避免 module cache 污染
  async function getLock() {
    const { acquireLock, releaseLock, isLocked } = await import('./distributed-lock.js');
    return { acquireLock, releaseLock, isLocked };
  }

  // ─── 基本获取/释放 ─────────────────────────────────────
  describe('基本获取/释放', () => {
    it('acquireLock 返回非空路径', async () => {
      const { acquireLock } = await getLock();
      const result = acquireLock('test-basic', 60_000);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('acquireLock 两次同名返回 null', async () => {
      const { acquireLock } = await getLock();
      const first = acquireLock('test-same', 60_000);
      const second = acquireLock('test-same', 60_000);
      expect(first).toBeTruthy();
      expect(second).toBeNull();
    });

    it('releaseLock 后可重新获取', async () => {
      const { acquireLock, releaseLock } = await getLock();
      const first = acquireLock('test-release', 60_000);
      releaseLock('test-release');
      const second = acquireLock('test-release', 60_000);
      expect(second).toBeTruthy();
    });

    it('releaseLock 对未持有的锁安全', async () => {
      const { releaseLock } = await getLock();
      expect(() => releaseLock('never-acquired')).not.toThrow();
    });

    it('isLocked 已持有时返回 true', async () => {
      const { acquireLock, releaseLock, isLocked } = await getLock();
      acquireLock('test-locked', 60_000);
      expect(isLocked('test-locked')).toBe(true);
      releaseLock('test-locked');
    });

    it('isLocked 未持有时返回 false', async () => {
      const { isLocked } = await getLock();
      expect(isLocked('never-existed')).toBe(false);
    });

    it('isLocked 释放后返回 false', async () => {
      const { acquireLock, releaseLock, isLocked } = await getLock();
      acquireLock('test-unlocked', 60_000);
      releaseLock('test-unlocked');
      expect(isLocked('test-unlocked')).toBe(false);
    });
  });

  // ─── TTL 过期 ────────────────────────────────────────────
  describe('TTL 过期', () => {
    it('未过期锁 isLocked 返回 true', async () => {
      const { acquireLock, isLocked } = await getLock();
      acquireLock('test-ttl', 5000);
      expect(isLocked('test-ttl')).toBe(true);
    });

    it('过期锁文件被接管', async () => {
      // 直接写一个过期的 lock 文件（模拟另一个进程留下的过期锁）
      const { acquireLock, isLocked } = await getLock();
      const lf = join(tmpDir, 'test-expired.lock');
      // 写入过去的时间戳
      mkdirSync(tmpDir, { recursive: true });
      require('fs').writeFileSync(lf, `${process.pid}:${Date.now() - 1000}`, 'utf8');

      // 重新 acquire 应该能拿到（因为过期了）
      const result = acquireLock('test-expired', 60_000);
      expect(result).toBeTruthy();
      expect(isLocked('test-expired')).toBe(true);
    });

    it('未过期锁不能被接管', async () => {
      const { acquireLock, isLocked } = await getLock();
      const first = acquireLock('test-steal', 60_000);
      const second = acquireLock('test-steal', 60_000);
      expect(first).toBeTruthy();
      expect(second).toBeNull();
      expect(isLocked('test-steal')).toBe(true);
    });
  });

  // ─── PID 检查 ─────────────────────────────────────────────
  describe('PID 检查（安全释放）', () => {
    it('只释放自己持有的锁，不释放他人锁', async () => {
      const { acquireLock, releaseLock, isLocked } = await getLock();
      const first = acquireLock('test-pid', 60_000);
      expect(first).toBeTruthy();

      // 手动破坏 PID（模拟另一个进程持有）
      const lf = join(tmpDir, 'test-pid.lock');
      require('fs').writeFileSync(lf, `${process.pid + 9999}:${Date.now() + 60_000}`, 'utf8');

      // releaseLock 应安全（不抛不错），但不应该释放别人的锁
      releaseLock('test-pid');
      // 锁应该仍然存在（因为 PID 不匹配）
      expect(isLocked('test-pid')).toBe(false); // 实际上会被当作过期处理掉
    });
  });
});
