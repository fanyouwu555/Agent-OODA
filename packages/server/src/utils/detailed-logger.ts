// packages/server/src/utils/detailed-logger.ts
// 增强的详细日志系统 - 记录 OODA 和服务器客户端通信

import { promises as fs } from 'fs';
import * as path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace';
export type LogCategory = 'OODA' | 'SERVER' | 'SSE' | 'WEBSOCKET' | 'HTTP' | 'TOOL' | 'SKILL' | 'MEMORY' | 'DB' | 'PERMISSION' | 'CONFIG' | 'SYSTEM';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  sessionId?: string;
  message: string;
  data?: unknown;
}

interface LoggerState {
  enabled: boolean;
  level: LogLevel;
  categories: Record<LogCategory, boolean>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const DEFAULT_CATEGORIES: LogCategory[] = [
  'OODA', 'SERVER', 'SSE', 'WEBSOCKET', 'HTTP', 'TOOL', 'SKILL', 'MEMORY', 'DB', 'PERMISSION', 'CONFIG', 'SYSTEM'
];

class DetailedLogger {
  private state: LoggerState;
  private logDir: string;
  private currentLogFile: string | null = null;
  private logEntries: LogEntry[] = [];
  private maxMemoryEntries: number = 1000;
  private enableFile: boolean = true;

  constructor() {
    // 默认启用所有日志
    this.state = {
      enabled: true,
      level: (process.env.LOG_LEVEL as LogLevel) || 'debug',  // 默认改为 debug 以记录更多信息
      categories: this.initCategories(true),
    };

    // 日志目录为项目根目录
    this.logDir = process.env.LOG_DIR || path.dirname(path.dirname(process.cwd()));
  }

  private initCategories(enabled: boolean): Record<LogCategory, boolean> {
    const categories: Record<LogCategory, boolean> = {} as Record<LogCategory, boolean>;
    DEFAULT_CATEGORIES.forEach(cat => {
      categories[cat] = enabled;
    });
    return categories;
  }

  // ============ 开关控制 ============
  
  /**
   * 启用/禁用日志记录
   */
  setEnabled(enabled: boolean): void {
    this.state.enabled = enabled;
  }

  /**
   * 获取当前启用状态
   */
  isEnabled(): boolean {
    return this.state.enabled;
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.state.level = level;
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.state.level;
  }

  /**
   * 启用/禁用特定分类的日志
   */
  setCategoryEnabled(category: LogCategory, enabled: boolean): void {
    this.state.categories[category] = enabled;
  }

  /**
   * 批量设置分类启用状态
   */
  setCategories(categories: Partial<Record<LogCategory, boolean>>): void {
    Object.keys(categories).forEach(cat => {
      this.state.categories[cat as LogCategory] = categories[cat as LogCategory]!;
    });
  }

  /**
   * 获取所有分类的启用状态
   */
  getCategories(): Record<LogCategory, boolean> {
    return { ...this.state.categories };
  }

  /**
   * 启用/禁用文件输出
   */
  setFileEnabled(enabled: boolean): void {
    this.enableFile = enabled;
  }

  /**
   * 获取文件输出状态
   */
  isFileEnabled(): boolean {
    return this.enableFile;
  }

  // ============ 日志记录 ============

  private shouldLog(level: LogLevel, category: LogCategory): boolean {
    if (!this.state.enabled) return false;
    if (!this.state.categories[category]) return false;
    return LOG_LEVELS[level] >= LOG_LEVELS[this.state.level];
  }

  private createEntry(level: LogLevel, category: LogCategory, message: string, data?: unknown, sessionId?: string): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      sessionId,
      message,
      data: this.sanitizeData(data),
    };
  }

  private sanitizeData(data: unknown): unknown {
    if (!data) return data;
    
    // 移除敏感信息
    const sanitized = JSON.parse(JSON.stringify(data));
    const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'password', 'token', 'secret'];
    
    const sanitizeObject = (obj: unknown): unknown => {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          result[key] = '***REDACTED***';
        } else {
          result[key] = sanitizeObject(value);
        }
      }
      return result;
    };
    
    return sanitizeObject(sanitized);
  }

  private truncateData(data: unknown, maxLength: number = 5000): unknown {
    if (data === undefined || data === null) return data;
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    if (str.length <= maxLength) return data;
    return str.substring(0, maxLength) + ` ... (truncated ${str.length - maxLength} chars)`;
  }

  private log(level: LogLevel, category: LogCategory, message: string, data?: unknown, sessionId?: string): void {
    if (!this.shouldLog(level, category)) return;

    const entry = this.createEntry(level, category, message, this.truncateData(data), sessionId);
    
    // 添加到内存
    this.logEntries.push(entry);
    if (this.logEntries.length > this.maxMemoryEntries) {
      this.logEntries = this.logEntries.slice(-this.maxMemoryEntries);
    }

    // 控制台输出
    this.logToConsole(entry);

    // 文件输出
    if (this.enableFile) {
      this.logToFile(entry);
    }
  }

  private logToConsole(entry: LogEntry): void {
    const color = this.getColorForLevel(entry.level);
    const reset = '\x1b[0m';
    const catColor = this.getColorForCategory(entry.category);
    
    console.log(`${color}[${entry.level.toUpperCase()}]${reset} ${catColor}[${entry.category}]${reset} ${entry.message}`, 
      entry.data ? JSON.stringify(entry.data, null, 2) : '');
  }

  private getColorForLevel(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      trace: '\x1b[90m',  // gray
      debug: '\x1b[36m',  // cyan
      info: '\x1b[32m',   // green
      warn: '\x1b[33m',   // yellow
      error: '\x1b[31m',  // red
    };
    return colors[level] || '\x1b[0m';
  }

  private getColorForCategory(category: LogCategory): string {
    const colors: Record<LogCategory, string> = {
      OODA: '\x1b[35m',      // magenta
      SERVER: '\x1b[34m',    // blue
      SSE: '\x1b[33m',       // yellow
      WEBSOCKET: '\x1b[36m', // cyan
      HTTP: '\x1b[32m',      // green
      TOOL: '\x1b[95m',      // light magenta
      SKILL: '\x1b[96m',     // light cyan
      MEMORY: '\x1b[93m',    // light yellow
      DB: '\x1b[90m',        // dark gray
      PERMISSION: '\x1b[91m',// light red
      CONFIG: '\x1b[94m',    // light blue
      SYSTEM: '\x1b[37m',    // white
    };
    return colors[category] || '\x1b[0m';
  }

  private async logToFile(entry: LogEntry): Promise<void> {
    try {
      await this.ensureLogDir();
      const logFile = await this.getLogFile();
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(logFile, line, 'utf-8');
    } catch (e) {
      console.error('[DetailedLogger] Failed to write to file:', e);
    }
  }

  private async ensureLogDir(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (e) {
      // Directory may already exist
    }
  }

  private async getLogFile(): Promise<string> {
    if (!this.currentLogFile) {
      const date = new Date().toISOString().split('T')[0];
      this.currentLogFile = path.join(this.logDir, `ooda-detailed-${date}.log`);
    }
    return this.currentLogFile;
  }

  // ============ 公共日志方法 ============

  trace(category: LogCategory, message: string, data?: unknown, sessionId?: string): void {
    this.log('trace', category, message, data, sessionId);
  }

  debug(category: LogCategory, message: string, data?: unknown, sessionId?: string): void {
    this.log('debug', category, message, data, sessionId);
  }

  info(category: LogCategory, message: string, data?: unknown, sessionId?: string): void {
    this.log('info', category, message, data, sessionId);
  }

  warn(category: LogCategory, message: string, data?: unknown, sessionId?: string): void {
    this.log('warn', category, message, data, sessionId);
  }

  error(category: LogCategory, message: string, data?: unknown, sessionId?: string): void {
    this.log('error', category, message, data, sessionId);
  }

  // ============ OODA 专用日志 ============

  logOODAPhase(phase: string, sessionId: string, data?: unknown): void {
    this.debug('OODA', `[${phase.toUpperCase()}]`, data, sessionId);
  }

  logOODAToolCall(sessionId: string, toolName: string, args?: unknown, result?: unknown): void {
    this.info('OODA', `Tool call: ${toolName}`, { args, result }, sessionId);
  }

  logOODADecision(sessionId: string, decision: string, reasoning?: string, options?: string[]): void {
    this.info('OODA', `Decision: ${decision}`, { reasoning, options }, sessionId);
  }

  logOOBAObservation(sessionId: string, input: string, observations?: unknown): void {
    this.debug('OODA', `Observation: ${input.substring(0, 100)}...`, observations, sessionId);
  }

  logOODAOrientation(sessionId: string, intent: string, context?: unknown): void {
    this.debug('OODA', `Orientation: ${intent}`, context, sessionId);
  }

  logOODAAction(sessionId: string, action: string, result?: unknown): void {
    this.info('OODA', `Action: ${action}`, result, sessionId);
  }

  logOODAComplete(sessionId: string, output: string, metadata?: unknown): void {
    this.info('OODA', 'OODA Loop Complete', { output: output.substring(0, 200), metadata }, sessionId);
  }

  logOODAError(sessionId: string, error: string, details?: unknown): void {
    this.error('OODA', `Error: ${error}`, details, sessionId);
  }

  // ============ SSE 专用日志 ============

  logSSEConnect(sessionId: string): void {
    this.debug('SSE', 'SSE connected', undefined, sessionId);
  }

  logSSEDisconnect(sessionId: string): void {
    this.debug('SSE', 'SSE disconnected', undefined, sessionId);
  }

  logSSEEvent(sessionId: string, eventType: string, data?: unknown): void {
    this.info('SSE', `Event: ${eventType}`, data, sessionId);
  }

  logSSESend(sessionId: string, eventType: string, payload?: unknown): void {
    this.debug('SSE', `Sending to client: ${eventType}`, payload, sessionId);
  }

  // ============ WebSocket 专用日志 ============

  logWSConnect(clientId: string, ip?: string): void {
    this.info('WEBSOCKET', 'Client connected', { clientId, ip });
  }

  logWSDisconnect(clientId: string, code?: number, reason?: string): void {
    this.info('WEBSOCKET', 'Client disconnected', { clientId, code, reason });
  }

  logWSMessage(clientId: string, direction: 'incoming' | 'outgoing', message: unknown): void {
    const level = direction === 'incoming' ? 'debug' : 'trace';
    this.log(level, 'WEBSOCKET', `Message ${direction}`, message, clientId);
  }

  logWSError(clientId: string, error: string, details?: unknown): void {
    this.error('WEBSOCKET', `Error: ${error}`, details, clientId);
  }

  logWSBroadcast(sessionId: string, messageType: string, recipients: number): void {
    this.debug('WEBSOCKET', `Broadcast to ${recipients} clients`, { sessionId, messageType, recipients });
  }

  // ============ 获取日志 ============

  /**
   * 获取内存中的日志条目
   */
  getEntries(options?: {
    level?: LogLevel;
    category?: LogCategory;
    sessionId?: string;
    limit?: number;
    offset?: number;
  }): LogEntry[] {
    let entries = [...this.logEntries];

    if (options?.level) {
      const minLevel = LOG_LEVELS[options.level];
      entries = entries.filter(e => LOG_LEVELS[e.level] >= minLevel);
    }

    if (options?.category) {
      entries = entries.filter(e => e.category === options.category);
    }

    if (options?.sessionId) {
      entries = entries.filter(e => e.sessionId === options.sessionId);
    }

    const offset = options?.offset || 0;
    const limit = options?.limit || 100;

    return entries.slice(offset, offset + limit);
  }

  /**
   * 获取日志统计信息
   */
  getStats(): {
    total: number;
    byLevel: Record<LogLevel, number>;
    byCategory: Record<LogCategory, number>;
    enabled: boolean;
    level: LogLevel;
    categories: Record<LogCategory, boolean>;
    logDir: string;
  } {
    const byLevel: Record<LogLevel, number> = { trace: 0, debug: 0, info: 0, warn: 0, error: 0 };
    const byCategory: Record<LogCategory, number> = {} as Record<LogCategory, number>;

    for (const entry of this.logEntries) {
      byLevel[entry.level]++;
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
    }

    return {
      total: this.logEntries.length,
      byLevel,
      byCategory,
      enabled: this.state.enabled,
      level: this.state.level,
      categories: this.state.categories,
      logDir: this.logDir,
    };
  }

  // ============ 清除日志 ============

  /**
   * 清除内存中的日志
   */
  clearMemory(): number {
    const count = this.logEntries.length;
    this.logEntries = [];
    return count;
  }

  /**
   * 清除日志文件
   */
  async clearFiles(): Promise<{ deleted: number; files: string[] }> {
    try {
      await this.ensureLogDir();
      const files = await fs.readdir(this.logDir);
      let deleted = 0;
      const deletedFiles: string[] = [];

      for (const file of files) {
        if (file.startsWith('ooda-') && file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          await fs.unlink(filePath);
          deleted++;
          deletedFiles.push(file);
        }
      }

      return { deleted, files: deletedFiles };
    } catch (e) {
      this.error('SYSTEM', 'Failed to clear log files', e);
      return { deleted: 0, files: [] };
    }
  }

  /**
   * 清除所有日志（内存和文件）
   */
  async clearAll(): Promise<{ memoryCleared: number; filesDeleted: number; files: string[] }> {
    const memoryCleared = this.clearMemory();
    const fileResult = await this.clearFiles();
    
    return {
      memoryCleared,
      filesDeleted: fileResult.deleted,
      files: fileResult.files,
    };
  }

  // ============ 导出日志 ============

  /**
   * 导出日志到文件
   */
  async exportLog(options?: {
    level?: LogLevel;
    category?: LogCategory;
    sessionId?: string;
    startTime?: string;
    endTime?: string;
    format?: 'json' | 'text';
  }): Promise<string> {
    let entries = [...this.logEntries];

    if (options?.level) {
      const minLevel = LOG_LEVELS[options.level];
      entries = entries.filter(e => LOG_LEVELS[e.level] >= minLevel);
    }

    if (options?.category) {
      entries = entries.filter(e => e.category === options.category);
    }

    if (options?.sessionId) {
      entries = entries.filter(e => e.sessionId === options.sessionId);
    }

    if (options?.startTime) {
      const start = new Date(options.startTime).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= start);
    }

    if (options?.endTime) {
      const end = new Date(options.endTime).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() <= end);
    }

    if (options?.format === 'text') {
      return entries.map(e => 
        `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.category}]${e.sessionId ? ` [${e.sessionId}]` : ''} ${e.message}${e.data ? ' ' + JSON.stringify(e.data) : ''}`
      ).join('\n');
    }

    return JSON.stringify(entries, null, 2);
  }

  /**
   * 获取日志文件路径
   */
  getLogFilePath(): string | null {
    return this.currentLogFile;
  }

  /**
   * 获取所有日志文件列表
   */
  async getLogFiles(): Promise<string[]> {
    try {
      await this.ensureLogDir();
      const files = await fs.readdir(this.logDir);
      return files
        .filter(f => f.startsWith('ooda-') && f.endsWith('.log'))
        .map(f => path.join(this.logDir, f));
    } catch {
      return [];
    }
  }
}

export const detailedLogger = new DetailedLogger();
export default detailedLogger;