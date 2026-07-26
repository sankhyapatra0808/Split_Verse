export type CircuitBreakerState = "closed" | "open" | "half-open";

export type CircuitBreakerOptions = {
  name: string;
  timeoutMs: number;
  maxConcurrent: number;
  failureThreshold: number;
  recoveryTimeoutMs: number;
  successThreshold: number;
  shouldRecordFailure?: (error: unknown) => boolean;
};

export class CircuitBreakerOpenError extends Error {
  constructor(name: string) {
    super(`${name} circuit breaker is open`);
    this.name = "CircuitBreakerOpenError";
  }
}

export class DependencyConcurrencyLimitError extends Error {
  constructor(name: string, maxConcurrent: number) {
    super(`${name} concurrency limit reached (${maxConcurrent})`);
    this.name = "DependencyConcurrencyLimitError";
  }
}

export class DependencyTimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`${name} timed out after ${timeoutMs}ms`);
    this.name = "DependencyTimeoutError";
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = "closed";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private nextRetryAt = 0;
  private inFlight = 0;

  constructor(private readonly options: CircuitBreakerOptions) {}

  getSnapshot() {
    return {
      name: this.options.name,
      state: this.currentState(),
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      inFlight: this.inFlight,
      nextRetryAt: this.nextRetryAt,
    };
  }

  async execute<T>(operation: () => Promise<T>) {
    const state = this.currentState();

    if (state === "open") {
      throw new CircuitBreakerOpenError(this.options.name);
    }

    if (state === "half-open" && this.inFlight > 0) {
      throw new CircuitBreakerOpenError(this.options.name);
    }

    if (this.inFlight >= this.options.maxConcurrent) {
      throw new DependencyConcurrencyLimitError(
        this.options.name,
        this.options.maxConcurrent,
      );
    }

    this.inFlight += 1;

    let timedOut = false;
    let timeout: NodeJS.Timeout | undefined;

    const operationPromise = Promise.resolve()
      .then(operation)
      .then(
        (result) => {
          if (!timedOut) {
            this.recordSuccess();
          }

          return result;
        },
        (error: unknown) => {
          if (!timedOut && this.shouldRecordFailure(error)) {
            this.recordFailure();
          }

          throw error;
        },
      )
      .finally(() => {
        this.inFlight = Math.max(0, this.inFlight - 1);
      });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        this.recordFailure();
        reject(
          new DependencyTimeoutError(this.options.name, this.options.timeoutMs),
        );
      }, this.options.timeoutMs);
    });

    try {
      return await Promise.race([operationPromise, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }

      operationPromise.catch(() => {
        // The caller already received the timeout; keep the original operation
        // observed until it releases its concurrency slot.
      });
    }
  }

  private currentState() {
    if (this.state === "open" && Date.now() >= this.nextRetryAt) {
      this.state = "half-open";
      this.consecutiveSuccesses = 0;
    }

    return this.state;
  }

  private recordSuccess() {
    if (this.state === "half-open") {
      this.consecutiveSuccesses += 1;

      if (this.consecutiveSuccesses >= this.options.successThreshold) {
        this.close();
      }

      return;
    }

    this.consecutiveFailures = 0;
  }

  private recordFailure() {
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures += 1;

    if (
      this.state === "half-open" ||
      this.consecutiveFailures >= this.options.failureThreshold
    ) {
      this.open();
    }
  }

  private open() {
    this.state = "open";
    this.nextRetryAt = Date.now() + this.options.recoveryTimeoutMs;
  }

  private close() {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.nextRetryAt = 0;
  }

  private shouldRecordFailure(error: unknown) {
    return this.options.shouldRecordFailure?.(error) ?? true;
  }
}
