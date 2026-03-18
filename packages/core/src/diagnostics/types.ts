// 自测自修自检系统 - 类型定义

export interface DiagnosticCheck {
  name: string;
  description: string;
  category: 'config' | 'network' | 'llm' | 'storage' | 'memory';
  check(): Promise<CheckResult>;
  fix?(): Promise<FixResult>;
}

export interface CheckResult {
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: Record<string, unknown>;
  error?: Error;
}

export interface FixResult {
  status: 'fixed' | 'failed' | 'skipped';
  message: string;
  action?: string;
  error?: Error;
}

export interface DiagnosticReport {
  timestamp: number;
  overallStatus: 'healthy' | 'degraded' | 'critical';
  checks: CheckResult[];
  fixes: FixResult[];
  recommendations: string[];
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  version: string;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warning';
    responseTime: number;
  }[];
}
