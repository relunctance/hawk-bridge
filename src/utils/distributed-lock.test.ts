/**
 * DistributedLock 单元测试
 *
 * 使用 setLockDir() 指向临时目录，每次测试前清空，实现完全隔离。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, unlinkSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { setLockDir } from './distributed-lock.js';
import { acquireLock, releaseLock, isLocked } from './distributed-lock.js';

describe('DistributedLock', () => {
  const tmpDir = join(os.tmpdir(), `hawk-lock-test-${Date.now()}`);

  beforeEach(() => {
    // 设置测试锁目录
    setLockDir(tmpDir);
    // 每次测试前清空
    mkdirSync(tmpDir, { recursive: true });
    for (const f of readdirSync(tmpDir)) {
      try { unlinkSync(join(tmpDir, f)); } catch {}
    }
  });

  // ─── 基本获取/释放 ─────────────────────────────────────
  describe('基本获取/释放', () => {
    it('acquireLock 返回非空路径', () => {
      const result = acquireLock('test-basic', 60_000);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('acquireLock 两次同名返回 null', () => {
      const first = acquireLock('test-same', 60_000);
      const second = acquireLock('test-same', 60_000);
      expect(first).toBeTruthy();
      expect(second).toBeNull();
    });

    it('releaseLock 后可重新获取', () => {
      const first = acquireLock('test-release', 60_000);
      releaseLock('test-release');
      const second = acquireLock('test-release', 60_000);
      expect(second).toBeTruthy();
    });

    it('releaseLock 对未持有的锁安全（幂等）', () => {
      expect(() => releaseLock('never-acquired')).not.toThrow();
    });

    it('isLocked 已持有时返回 true', () => {
      acquireLock('test-locked', 60_000);
      expect(isLocked('test-locked')).toBe(true);
    });

    it('isLocked 未持有时返回 false', () => {
      expect(isLocked('never-existed')).toBe(false);
    });

    it('isLocked 释放后返回 false', () => {
      acquireLock('test-unlocked', 60_000);
      releaseLock('test-unlocked');
      expect(isLocked('test-unlocked')).toBe(false);
    });
  });

  // ─── TTL 过期 ────────────────────────────────────────────
  describe('TTL 过期', () => {
    it('未过期锁 isLocked 返回 true', () => {
      acquireLock('test-ttl', 5000);
      expect(isLocked('test-ttl')).toBe(true);
    });

    it('过期锁文件被接管（主动过期）', () => {
      // 直接写一个过期的 lock 文件（模拟另一个进程留下的过期锁）
      const lf = join(tmpDir, 'test-expired.lock');
      mkdirSync(tmpDir, { recursive: true });
      // 写入过去的时间戳（PID 用当前进程，不影响逻辑）
      writeFileSync(lf, `${process.pid}:${Date.now() - 1000}`, 'utf8');

      // 重新 acquire 应该能拿到（因为过期了）
      const result = acquireLock('test-expired', 60_000);
      expect(result).toBeTruthy();
      expect(isLocked('test-expired')).toBe(true);
    });

    it('未过期锁不能被同名进程获取', () => {
      acquireLock('test-no-steal', 60_000);
      const second = acquireLock('test-no-steal', 60_000);
      expect(second).toBeNull();
      expect(isLocked('test-no-steal')).toBe(true);
    });
  });

  // ─── PID 检查 ─────────────────────────────────────────────
  describe('PID 检查（安全释放）', () => {
    it('只释放自己持有的锁，不释放他人 PID 的锁', () => {
      // 先获取锁
      acquireLock('test-pid', 60_000);

      // 手动改写 lock 文件内容为他人 PID（模拟另一个进程持有）
      const lf = join(tmpDir, 'test-pid.lock');
      writeFileSync(lf, `${process.pid + 9999}:${Date.now() + 60_000}`, 'utf8');

      // releaseLock 应该安全但不会删除（PID 不匹配）
      releaseLock('test-pid');

      // 锁文件仍然存在（因为 releaseLock 只删除自己 PID 的锁）
      expect(existsSync(lf)).toBe(true);
    });

    it('同 PID 可正常释放', () => {
      const lf = join(tmpDir, 'test-same-pid.lock');
      writeFileSync(lf, `${process.pid}:${Date.now() + 60_000}`, 'utf8');

      // 同 PID 会被 heldLocks Map 记住，可以释放
      releaseLock('test-same-pid');
      expect(existsSync(lf)).toBe(false);
    });
  });
});
