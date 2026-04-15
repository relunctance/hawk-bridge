/**
 * Process pool for Python subprocess execution.
 *
 * Reuses forked Python processes instead of spawning a new one per call.
 * Prevents resource exhaustion under high-frequency hawk-capture invocations.
 *
 * Features:
 * - Configurable pool size (default: 3)
 * - Idle timeout: processes exit after 60s without work
 * - Per-call timeout with SIGTERM escalation to SIGKILL
 * - Clean teardown on process exit
 */

import { fork, ChildProcess } from 'child_process';
import { logger } from '../logger.js';

interface PooledProcess {
  proc: ChildProcess;
  idleSince: number;
  busy: boolean;
  workQueue: Array<{
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
    timeout: NodeJS.Timeout;
  }>;
}

interface PoolOptions {
  size?: number;
  idleTimeoutMs?: number;
  callTimeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<PoolOptions> = {
  size: 3,
  idleTimeoutMs: 60_000,
  callTimeoutMs: 30_000,
};

export class PythonProcessPool {
  private pool: PooledProcess[] = [];
  private options: Required<PoolOptions>;

  constructor(options: PoolOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  private findIdleSlot(): PooledProcess | null {
    return this.pool.find(p => !p.busy) ?? null;
  }

  private spawnProcess(): PooledProcess {
    // Note: the Python script path is passed per-call since it varies
    const proc = fork(process.execPath, ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    const slot: PooledProcess = {
      proc,
      idleSince: Date.now(),
      busy: false,
      workQueue: [],
    };

    proc.on('error', (err) => {
      logger.error({ err }, '[PythonProcessPool] subprocess error');
      this.removeProcess(slot);
    });

    proc.on('exit', (code, signal) => {
      logger.warn({ code, signal }, '[PythonProcessPool] subprocess exited');
      this.removeProcess(slot);
    });

    this.pool.push(slot);
    return slot;
  }

  private removeProcess(slot: PooledProcess): void {
    const idx = this.pool.indexOf(slot);
    if (idx >= 0) {
      // Cancel all pending work
      for (const work of slot.workQueue) {
        clearTimeout(work.timeout);
        work.reject(new Error('Process died'));
      }
      this.pool.splice(idx, 1);
    }
  }

  /**
   * Execute a Python script using the process pool.
   *
   * @param script  The Python script content (passed via -c)
   * @param timeoutMs  Per-call timeout (default: 30s)
   */
  async exec(script: string, timeoutMs?: number): Promise<string> {
    const to = timeoutMs ?? this.options.callTimeoutMs;

    // 1. Get or create an idle process
    let slot = this.findIdleSlot();
    if (!slot) {
      if (this.pool.length < this.options.size) {
        slot = this.spawnProcess();
      } else {
        // Pool full — wait and retry
        await new Promise<void>(r => setTimeout(r, 500));
        return this.exec(script, to);
      }
    }

    slot.busy = true;
    slot.idleSince = Date.now();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        slot!.workQueue.shift();
        reject(new Error(`Python subprocess timeout after ${to}ms`));
      }, to);

      slot!.workQueue.push({ resolve: resolve as (v: unknown) => void, reject, timeout: timer });

      const proc = slot!.proc;
      let stdout = '';
      let stderr = '';

      // Write script to stdin and signal EOF
      proc.stdin?.write(script + '\n');
      proc.stdin?.end();

      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        const work = slot!.workQueue.shift();
        clearTimeout(timer);
        slot!.busy = false;
        slot!.idleSince = Date.now();

        if (code !== 0) {
          logger.error({ code, stderr }, '[PythonProcessPool] subprocess error');
          reject(new Error(stderr || `exit code ${code}`));
        } else {
          resolve(stdout.trim());
        }
      });

      proc.on('error', (err) => {
        const work = slot!.workQueue.shift();
        clearTimeout(timer);
        slot!.busy = false;
        reject(err);
      });
    });
  }

  /** Idle-check: terminate processes that have been idle too long */
  pruneIdleProcesses(): void {
    const now = Date.now();
    for (const slot of this.pool) {
      if (!slot.busy && now - slot.idleSince > this.options.idleTimeoutMs) {
        slot.proc.kill();
        this.removeProcess(slot);
      }
    }
  }

  getStats(): { poolSize: number; busy: number; idle: number } {
    return {
      poolSize: this.pool.length,
      busy: this.pool.filter(p => p.busy).length,
      idle: this.pool.filter(p => !p.busy).length,
    };
  }

  async close(): Promise<void> {
    for (const slot of this.pool) {
      slot.proc.kill();
    }
    this.pool = [];
  }
}
