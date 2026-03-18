// packages/core/src/error/circuit-breaker.ts
import { AgentError, ErrorType } from './index';

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms to stay open before attempting half-open */
  timeout: number;
  /** Number of successful requests needed to close from half-open */
  successThreshold: number;
  /** Whether to monitor error rate instead of just failures */
  monitorErrorRate?: boolean;
  /** Error rate threshold (0.0 to 1.0) when monitoring error rate */
  errorRateThreshold?: number;
  /** Minimum number of requests before error rate evaluation */
  minimumRequests?: number;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number = 0;
  private totalRequests = 0;
  private failedRequests = 0;
  
  constructor(private name: string, private options: CircuitBreakerOptions) {
    // Validate options
    if (options.failureThreshold <= 0) {
      throw new Error('failureThreshold must be greater than 0');
    }
    if (options.timeout <= 0) {
      throw new Error('timeout must be greater than 0');
    }
    if (options.successThreshold <= 0) {
      throw new Error('successThreshold must be greater than 0');
    }
    if (options.monitorErrorRate) {
      if (options.errorRateThreshold === undefined || 
          options.errorRateThreshold <= 0 || 
          options.errorRateThreshold > 1) {
        throw new Error('errorRateThreshold must be between 0 and 1 when monitorErrorRate is true');
      }
      if (options.minimumRequests === undefined || options.minimumRequests < 1) {
        throw new Error('minimumRequests must be at least 1 when monitorErrorRate is true');
      }
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw this.createOpenCircuitError();
    }

    this.totalRequests++;
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if execution is allowed based on current state
   */
  canExecute(): boolean {
    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;
      case CircuitBreakerState.OPEN:
        if (Date.now() - this.lastFailureTime >= this.options.timeout) {
          this.state = CircuitBreakerState.HALF_OPEN;
          this.successCount = 0;
          return true;
        }
        return false;
      case CircuitBreakerState.HALF_OPEN:
        return true;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successCount++;
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.successCount >= this.options.successThreshold) {
        this.close();
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.failedRequests++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitBreakerState.CLOSED) {
      if (this.shouldOpen()) {
        this.open();
      }
    } else if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.open();
    }
  }

  /**
   * Determine if circuit should open based on failure count or error rate
   */
  private shouldOpen(): boolean {
    if (this.options.monitorErrorRate) {
      return this.shouldOpenByErrorRate();
    } else {
      return this.failureCount >= this.options.failureThreshold;
    }
  }

  /**
   * Check if error rate exceeds threshold
   */
  private shouldOpenByErrorRate(): boolean {
    if (this.totalRequests < (this.options.minimumRequests || 1)) {
      return false;
    }
    
    const errorRate = this.failedRequests / this.totalRequests;
    return errorRate >= (this.options.errorRateThreshold || 0.5);
  }

  /**
   * Open the circuit breaker
   */
  private open(): void {
    this.state = CircuitBreakerState.OPEN;
    // Optionally notify error handler
    const error = this.createErrorInfo('Circuit breaker opened');
    // errorHandler.handleError(error);
  }

  /**
   * Close the circuit breaker
   */
  private close(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.failedRequests = 0;
    // Optionally notify error handler
    const error = this.createErrorInfo('Circuit breaker closed');
    // errorHandler.handleError(error);
  }

  /**
   * Create an error info object for circuit breaker events
   */
  private createErrorInfo(message: string): AgentError {
    return {
      name: 'CircuitBreakerError',
      message: `${this.name}: ${message}`,
      type: ErrorType.AGENT_ERROR,
      timestamp: Date.now(),
      details: `State: ${this.state}, Failures: ${this.failureCount}/${this.options.failureThreshold}`
    };
  }

  /**
   * Create an error when circuit is open
   */
  private createOpenCircuitError(): AgentError {
    return {
      name: 'CircuitBreakerOpenError',
      message: `${this.name}: Circuit breaker is open`,
      type: ErrorType.AGENT_ERROR,
      timestamp: Date.now(),
      details: `State: ${this.state}, Failures: ${this.failureCount}, Last failure: ${this.lastFailureTime}`
    };
  }

  /**
   * Get the error that would be thrown when circuit is open
   */
  getOpenCircuitError(): AgentError {
    return this.createOpenCircuitError();
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    totalRequests: number;
    failedRequests: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      failedRequests: this.failedRequests,
      lastFailureTime: this.lastFailureTime
    };
  }

  /**
   * Manually open the circuit breaker
   */
  forceOpen(): void {
    this.open();
  }

  /**
   * Manually close the circuit breaker
   */
  forceClose(): void {
    this.close();
  }
}

// Predefined circuit breaker configurations for common use cases
export const CircuitBreakerConfigs = {
  /** Default configuration for general use */
  DEFAULT: {
    failureThreshold: 5,
    timeout: 60000, // 1 minute
    successThreshold: 3
  },
  
  /** Configuration for external API calls */
  EXTERNAL_API: {
    failureThreshold: 3,
    timeout: 30000, // 30 seconds
    successThreshold: 2,
    monitorErrorRate: true,
    errorRateThreshold: 0.5,
    minimumRequests: 10
  },
  
  /** Configuration for database operations */
  DATABASE: {
    failureThreshold: 5,
    timeout: 60000, // 1 minute
    successThreshold: 3,
    monitorErrorRate: true,
    errorRateThreshold: 0.3,
    minimumRequests: 5
  },
  
  /** Configuration for file system operations */
  FILE_SYSTEM: {
    failureThreshold: 3,
    timeout: 15000, // 15 seconds
    successThreshold: 2
  }
};