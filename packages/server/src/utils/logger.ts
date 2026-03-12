// packages/server/src/utils/logger.ts
import { promises as fs } from 'fs';
import * as path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  enableFile: boolean;
  logDir: string;
  maxFileSize: number; // bytes
  maxFiles: number;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private config: LoggerConfig;
  private currentLogFile: string | null = null;
  private currentFileSize: number = 0;
  private writeQueue: string[] = [];
  private isWriting: boolean = false;

  constructor() {
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) || 'info',
      enableFile: process.env.LOG_TO_FILE === 'true',
      logDir: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    };

    if (this.config.enableFile) {
      this.ensureLogDir();
    }
  }

  private async ensureLogDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.logDir, { recursive: true });
    } catch (e) {
      console.error('[Logger] Failed to create log directory:', e);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  private formatMessage(level: LogLevel, category: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}${dataStr}`;
  }

  private formatConsoleMessage(level: LogLevel, category: string, message: string, data?: unknown): string {
    const dataStr = data ? ` ${JSON.stringify(data, null, 2)}` : '';
    return `[${category}] ${message}${dataStr}`;
  }

  private getColorForLevel(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m', // red
    };
    return colors[level] || '\x1b[0m';
  }

  private async getLogFile(): Promise<string> {
    if (!this.currentLogFile) {
      const date = new Date().toISOString().split('T')[0];
      this.currentLogFile = path.join(this.config.logDir, `server-${date}.log`);
      try {
        const stats = await fs.stat(this.currentLogFile);
        this.currentFileSize = stats.size;
      } catch {
        this.currentFileSize = 0;
      }
    }

    // Rotate if file is too large
    if (this.currentFileSize > this.config.maxFileSize) {
      await this.rotateLogFile();
    }

    return this.currentLogFile;
  }

  private async rotateLogFile(): Promise<void> {
    if (!this.currentLogFile) return;

    const baseName = path.basename(this.currentLogFile, '.log');
    const ext = '.log';

    // Rotate existing files
    for (let i = this.config.maxFiles - 1; i > 0; i--) {
      const oldFile = path.join(this.config.logDir, `${baseName}.${i}${ext}`);
      const newFile = path.join(this.config.logDir, `${baseName}.${i + 1}${ext}`);
      try {
        await fs.rename(oldFile, newFile);
      } catch {
        // File doesn't exist, continue
      }
    }

    // Rotate current file
    const rotatedFile = path.join(this.config.logDir, `${baseName}.1${ext}`);
    try {
      await fs.rename(this.currentLogFile, rotatedFile);
    } catch {
      // File doesn't exist
    }

    this.currentLogFile = null;
    this.currentFileSize = 0;
  }

  private async writeToFile(message: string): Promise<void> {
    if (!this.config.enableFile) return;

    this.writeQueue.push(message);
    if (this.isWriting) return;

    this.isWriting = true;
    try {
      while (this.writeQueue.length > 0) {
        const logFile = await this.getLogFile();
        const messages = this.writeQueue.splice(0, this.writeQueue.length);
        const content = messages.join('\n') + '\n';

        await fs.appendFile(logFile, content, 'utf-8');
        this.currentFileSize += Buffer.byteLength(content, 'utf-8');
      }
    } catch (e) {
      console.error('[Logger] Failed to write to log file:', e);
    } finally {
      this.isWriting = false;
    }
  }

  log(level: LogLevel, category: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    const consoleMsg = this.formatConsoleMessage(level, category, message, data);
    const fileMsg = this.formatMessage(level, category, message, data);

    // Console output with colors
    const color = this.getColorForLevel(level);
    const reset = '\x1b[0m';
    const prefix = `${color}[${level.toUpperCase()}]${reset}`;

    if (level === 'error') {
      console.error(prefix, consoleMsg);
    } else if (level === 'warn') {
      console.warn(prefix, consoleMsg);
    } else {
      console.log(prefix, consoleMsg);
    }

    // File output
    this.writeToFile(fileMsg);
  }

  debug(category: string, message: string, data?: unknown): void {
    this.log('debug', category, message, data);
  }

  info(category: string, message: string, data?: unknown): void {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.log('warn', category, message, data);
  }

  error(category: string, message: string, data?: unknown): void {
    this.log('error', category, message, data);
  }

  // HTTP Request logging
  logRequest(method: string, url: string, headers?: Record<string, string>, body?: unknown): void {
    this.info('HTTP', `${method} ${url}`, {
      headers: this.sanitizeHeaders(headers),
      body: this.truncateBody(body),
    });
  }

  // HTTP Response logging
  logResponse(method: string, url: string, status: number, duration: number, body?: unknown): void {
    const level = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info';
    this.log(level, 'HTTP', `${method} ${url} - ${status} (${duration}ms)`, {
      status,
      duration,
      body: this.truncateBody(body),
    });
  }

  // WebSocket logging
  logWebSocket(type: 'connect' | 'disconnect' | 'message' | 'error', data?: unknown): void {
    this.info('WebSocket', type, data);
  }

  // Database logging
  logDB(operation: string, table: string, data?: unknown): void {
    this.debug('Database', `${operation} ${table}`, data);
  }

  // SSE logging
  logSSE(sessionId: string, eventType: string, data?: unknown): void {
    this.debug('SSE', `Session ${sessionId}: ${eventType}`, data);
  }

  // OODA loop logging
  logOODA(sessionId: string, phase: string, data?: unknown): void {
    this.debug('OODA', `Session ${sessionId}: ${phase}`, data);
  }

  // Sanitize sensitive headers
  private sanitizeHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
    if (!headers) return undefined;
    const sanitized = { ...headers };
    const sensitive = ['authorization', 'cookie', 'x-api-key'];
    for (const key of Object.keys(sanitized)) {
      if (sensitive.includes(key.toLowerCase())) {
        sanitized[key] = '***';
      }
    }
    return sanitized;
  }

  // Truncate large bodies
  private truncateBody(body: unknown, maxLength: number = 1000): unknown {
    if (!body) return body;
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    if (str.length <= maxLength) return body;
    return str.substring(0, maxLength) + `... (${str.length - maxLength} more chars)`;
  }

  // Get log file path
  getLogFilePath(): string | null {
    return this.currentLogFile;
  }

  // Update config
  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.enableFile && newConfig.enableFile !== this.config.enableFile) {
      this.ensureLogDir();
    }
  }
}

export const logger = new Logger();
