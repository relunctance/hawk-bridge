/**
 * Simple circuit breaker to prevent cascading failures when calling external services.
 *
 * States:
 *  - closed:   normal operation, requests pass through
 *  - open:     circuit tripped, requests fail fast without calling the service
 *  - half-open: testing if service recovered, limited requests pass through
 */

export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private halfOpenCount = 0;

  constructor(
    private threshold = 5,         // failures before opening
    private resetMs = 30_000,      // ms before trying again
    private halfOpenMax = 2,       // requests to let through in half-open
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetMs) {
        this.state = 'half-open';
        this.halfOpenCount = 0;
      } else {
        throw new CircuitOpenError(`Circuit is open, retry after ${this.resetMs}ms`);
      }
    }

    if (this.state === 'half-open') {
      if (this.halfOpenCount >= this.halfOpenMax) {
        throw new CircuitOpenError('Circuit half-open limit reached');
      }
      this.halfOpenCount++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  getStatus(): { state: string; failures: number; lastFailure: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure,
    };
  }
}

export class CircuitOpenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'CircuitOpenError';
  }
}
