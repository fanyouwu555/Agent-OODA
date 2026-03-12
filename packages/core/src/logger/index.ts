// packages/core/src/logger/index.ts

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  maxFileSize: number; // bytes
  maxFiles: number;
  format: 'json' | 'text';
}

export class Logger {
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      minLevel: 'info',
      enableConsole: true,
      enableFile: false,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      format: 'text',
      ...config,
    };

    // 定期刷新缓冲区
    this.startFlushTimer();
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.flush();
    }, 5000); // 每5秒刷新一次
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.config.minLevel);
  }

  private formatLog(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify({
        timestamp: new Date(entry.timestamp).toISOString(),
        level: entry.level.toUpperCase(),
        message: entry.message,
        context: entry.context,
        error: entry.error?.message,
        stack: entry.error?.stack,
      });
    }

    // Text format
    const timestamp = new Date(entry.timestamp).toISOString();
    let text = `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      text += ` ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      text += `\nError: ${entry.error.message}`;
      if (entry.error.stack) {
        text += `\n${entry.error.stack}`;
      }
    }

    return text;
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    if (!this.config.enableFile || !this.config.filePath) return;

    const formatted = this.formatLog(entry) + '\n';
    
    try {
      // 使用动态导入避免在浏览器环境中出错
      if (typeof window === 'undefined') {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        // 检查文件大小并轮转
        await this.rotateLogFile();
        
        // 追加写入
        await fs.appendFile(this.config.filePath!, formatted, 'utf-8');
      }
    } catch (error) {
      console.error('Failed to write log to file:', error);
    }
  }

  private async rotateLogFile(): Promise<void> {
    if (typeof window !== 'undefined') return;

    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const stats = await fs.stat(this.config.filePath!).catch(() => null);
      
      if (stats && stats.size > this.config.maxFileSize) {
        // 轮转文件
        const dir = path.dirname(this.config.filePath!);
        const ext = path.extname(this.config.filePath!);
        const base = path.basename(this.config.filePath!, ext);
        
        // 删除最旧的文件
        const oldestFile = path.join(dir, `${base}.${this.config.maxFiles}${ext}`);
        await fs.unlink(oldestFile).catch(() => {});
        
        // 重命名现有文件
        for (let i = this.config.maxFiles - 1; i >= 1; i--) {
          const oldFile = path.join(dir, `${base}.${i}${ext}`);
          const newFile = path.join(dir, `${base}.${i + 1}${ext}`);
          await fs.rename(oldFile, newFile).catch(() => {});
        }
        
        // 重命名当前文件
        const newFile = path.join(dir, `${base}.1${ext}`);
        await fs.rename(this.config.filePath!, newFile).catch(() => {});
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context,
      error,
    };

    // 添加到缓冲区
    this.logBuffer.push(entry);

    // 控制台输出
    if (this.config.enableConsole) {
      const formatted = this.formatLog(entry);
      
      switch (level) {
        case 'debug':
          console.debug(formatted);
          break;
        case 'info':
          console.info(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        case 'error':
          console.error(formatted);
          break;
      }
    }

    // 立即写入错误日志
    if (level === 'error') {
      this.writeToFile(entry);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log('warn', message, context, error);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('error', message, context, error);
  }

  // 刷新缓冲区到文件
  async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    for (const entry of entries) {
      await this.writeToFile(entry);
    }
  }

  // 获取最近的日志
  getRecentLogs(count: number = 100): LogEntry[] {
    return this.logBuffer.slice(-count);
  }

  // 更新配置
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // 销毁 logger
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

// 默认 logger 实例
let defaultLogger: Logger | null = null;

export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger(config);
  }
  return defaultLogger;
}

export function resetLogger(): void {
  if (defaultLogger) {
    defaultLogger.destroy();
    defaultLogger = null;
  }
}
