/**
 * CircuitBreaker 单元测试
 *
 * 测试状态机：closed → open → half-open → closed
 * 覆盖：成功重置、失败累积、熔断开启、半开试探、状态查询
 */

import { describe, it, expect } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    // threshold=3, resetMs=1000ms, halfOpenMax=2
    cb = new CircuitBreaker(3, 1000, 2);
  });

  // ─── 初始状态 ───────────────────────────────────────────────
  describe('初始状态', () => {
    it('刚创建时为 closed 状态', () => {
      expect(cb.getStatus().state).toBe('closed');
      expect(cb.getStatus().failures).toBe(0);
    });
  });

  // ─── 成功调用 ───────────────────────────────────────────────
  describe('成功调用', () => {
    it('成功调用后仍为 closed，failures 清零', async () => {
      await cb.run(async () => 'ok');
      expect(cb.getStatus().state).toBe('closed');
      expect(cb.getStatus().failures).toBe(0);
    });

    it('多次成功后仍可正常调用', async () => {
      for (let i = 0; i < 5; i++) {
        await cb.run(async () => `ok${i}`);
      }
      expect(cb.getStatus().state).toBe('closed');
    });
  });

  // ─── 失败累积 ───────────────────────────────────────────────
  describe('失败累积', () => {
    it('失败次数未达阈值时保持 closed', async () => {
      for (let i = 0; i < 2; i++) {
        await cb.run(async () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(cb.getStatus().state).toBe('closed');
      expect(cb.getStatus().failures).toBe(2);
    });

    it('失败达到阈值后变为 open', async () => {
      for (let i = 0; i < 3; i++) {
        await cb.run(async () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(cb.getStatus().state).toBe('open');
    });

    it('open 状态下再次调用立即抛出 CircuitOpenError', async () => {
      // 先打穿
      for (let i = 0; i < 3; i++) {
        await cb.run(async () => { throw new Error('fail'); }).catch(() => {});
      }
      // open 后调用应直接抛错
      await expect(cb.run(async () => 'ok')).rejects.toThrow(CircuitOpenError);
    });
  });

  // ─── 自动恢复 (resetMs 后) ─────────────────────────────────
  describe('自动恢复 (resetMs 后)', () => {
    it('resetMs 过后自动进入 half-open 并允许调用', async () => {
      // 打穿 circuit
      for (let i = 0; i < 3; i++) {
        await cb.run(async () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(cb.getStatus().state).toBe('open');

      // 等 resetMs + 50ms
      await new Promise(r => setTimeout(r, 1050));

      // 此时调用应成功（进入 half-open，第一次通过）
      const result = await cb.run(async () => 'recovered');
      expect(result).toBe('recovered');
      // half-open 成功 → 回到 closed
      expect(cb.getStatus().state).toBe('closed');
    });

    it('resetMs 未到时仍然 open', async () => {
      for (let i = 0; i < 3; i++) {
        await cb.run(async () => { throw new Error('fail'); }).catch(() => {});
      }
      await expect(cb.run(async () => 'ok')).rejects.toThrow(CircuitOpenError);
    });
  });

  // ─── half-open 限流 ─────────────────────────────────────────
  describe('half-open 限流', () => {
    it('half-open 状态下只允许 halfOpenMax 次调用', async () => {
      // 打穿
      for (let i = 0; i < 3; i++) {
        await cb.run(async () => { throw new Error('fail'); }).catch(() => {});
      }

      // 等恢复
      await new Promise(r => setTimeout(r, 1050));

      // half-open 允许 2 次
      await cb.run(async () => 'a');
      await cb.run(async () => 'b');

      // 第三次被拒绝
      await expect(cb.run(async () => 'c')).rejects.toThrow(CircuitOpenError);
    });

    it('half-open 失败后回到 open', async () => {
      // 打穿
      for (let i = 0; i < 3; i++) {
        await cb.run(async () => { throw new Error('fail'); }).catch(() => {});
      }

      // 等恢复
      await new Promise(r => setTimeout(r, 1050));

      // half-open 成功 1 次
      await cb.run(async () => 'ok');
      // half-open 失败 1 次
      await cb.run(async () => { throw new Error('fail'); }).catch(() => {});

      expect(cb.getStatus().state).toBe('open');
    });
  });

  // ─── lastFailure 记录 ───────────────────────────────────────
  describe('lastFailure 记录', () => {
    it('失败后 lastFailure 被更新', async () => {
      const before = Date.now();
      await cb.run(async () => { throw new Error('fail'); }).catch(() => {});
      const after = Date.now();
      expect(cb.getStatus().lastFailure).toBeGreaterThanOrEqual(before);
      expect(cb.getStatus().lastFailure).toBeLessThanOrEqual(after);
    });
  });
});

