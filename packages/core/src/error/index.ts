export enum ErrorType {
  PERMISSION_DENIED = 'permission_denied',
  TOOL_NOT_FOUND = 'tool_not_found',
  VALIDATION_ERROR = 'validation_error',
  CONFIG_ERROR = 'config_error',
  PROVIDER_ERROR = 'provider_error',
  AGENT_ERROR = 'agent_error',
  UNKNOWN_ERROR = 'unknown_error',
}

export interface AgentError extends Error {
  type: ErrorType;
  message: string;
  toolName?: string;
  timestamp: number;
  stack?: string;
  details?: string;
}

export type ErrorHandlerFn = (error: AgentError) => void;

export class ErrorHandler {
  private handlers: Map<ErrorType, ErrorHandlerFn[]> = new Map();
  
  constructor() {
    Object.values(ErrorType).forEach(type => {
      this.handlers.set(type, []);
    });
  }
  
  public registerHandler(type: ErrorType, handler: ErrorHandlerFn): void {
    const handlers = this.handlers.get(type) || [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }
  
  public handleError(error: AgentError): void {
    const handlers = this.handlers.get(error.type) || [];
    handlers.forEach(handler => handler(error));
  }
  
  public createError(
    type: ErrorType, 
    message: string, 
    options?: { toolName?: string; details?: string }
  ): AgentError {
    const error: AgentError = {
      type,
      message,
      timestamp: Date.now(),
      name: type,
      toolName: options?.toolName,
      details: options?.details,
    };
    return error;
  }
}

export const errorHandler = new ErrorHandler();

// Circuit breaker exports
export { CircuitBreaker, CircuitBreakerState, CircuitBreakerOptions, CircuitBreakerConfigs } from './circuit-breaker';
