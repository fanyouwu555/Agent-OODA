// packages/core/src/ooda/data-source.ts
// 数据源配置管理系统 - 配置驱动的多数据源支持

import type { DatabaseManager } from '@ooda-agent/storage';

interface DataSourceRow {
  id: string;
  type: string;
  source_type: string;
  name: string;
  base_url: string | null;
  api_key: string | null;
  query_template: string | null;
  priority: number;
  reliability: number;
  avg_latency: number;
  tags: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

interface StrategyRow {
  id: string;
  intent: string;
  data_type: string;
  tool_name: string;
  args: string;
  success: number;
  error_type: string | null;
  execution_time: number;
  created_at: number;
}

/**
 * 支持的数据类型
 */
export enum DataType {
  GOLD_PRICE = 'gold_price',
  SILVER_PRICE = 'silver_price',
  STOCK = 'stock',
  FOREX = 'forex',
  CRYPTO = 'crypto',
  WEATHER = 'weather',
  NEWS = 'news',
  GENERAL = 'general',
}

/**
 * 数据源类型
 */
export enum DataSourceType {
  API = 'api',           // 专用 API
  WEB_SEARCH = 'web_search',   // Web 搜索
  WEB_FETCH = 'web_fetch',      // 网页抓取
  RSS = 'rss',           // RSS 订阅
}

/**
 * 数据源配置
 */
export interface DataSourceConfig {
  id: string;
  type: DataType;                    // 数据类型
  sourceType: DataSourceType;        // 源类型
  name: string;                      // 显示名称
  baseUrl?: string;                  // API 基础 URL
  apiKey?: string;                   // API Key (可选)
  queryTemplate?: string;            // 查询模板
  priority: number;                  // 优先级 (越小越高)
  reliability: number;               // 可靠性 0-1
  avgLatency: number;                // 平均延迟 ms
  tags: string[];                    // 标签
  enabled: boolean;                  // 是否启用
  createdAt: number;
  updatedAt: number;
}

/**
 * 策略记忆记录
 */
export interface StrategyRecord {
  id: string;
  intent: string;                    // 用户意图 (如 "今日金价")
  dataType: DataType;               // 数据类型
  toolName: string;                 // 使用的工具
  args: string;                     // 工具参数 (JSON)
  success: boolean;                 // 是否成功
  errorType?: string;               // 错误类型 (如果失败)
  executionTime: number;             // 执行时间 ms
  createdAt: number;
}

/**
 * 工具能力描述
 */
export interface ToolCapability {
  toolName: string;
  supportedDataTypes: DataType[];
  reliability: number;
  avgLatency: number;
  tags: string[];
}

/**
 * 默认数据源配置 (内置)
 */
const DEFAULT_DATA_SOURCES: Omit<DataSourceConfig, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // 黄金价格数据源
  {
    type: DataType.GOLD_PRICE,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '百度搜索-金价',
    queryTemplate: '{query} 今日金价 黄金价格',
    priority: 1,
    reliability: 0.7,
    avgLatency: 2000,
    tags: ['gold', 'china', 'realtime', 'search'],
    enabled: true,
  },
  {
    type: DataType.GOLD_PRICE,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '新浪财经-金价',
    queryTemplate: '{query} 黄金价格 实时',
    priority: 2,
    reliability: 0.8,
    avgLatency: 1500,
    tags: ['gold', 'china', 'realtime', 'sina'],
    enabled: true,
  },
  {
    type: DataType.GOLD_PRICE,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '东方财富-金价',
    queryTemplate: '{query} 今日金价',
    priority: 3,
    reliability: 0.75,
    avgLatency: 1800,
    tags: ['gold', 'china', 'realtime', 'eastmoney'],
    enabled: true,
  },
  {
    type: DataType.GOLD_PRICE,
    sourceType: DataSourceType.WEB_SEARCH,
    name: 'DuckDuckGo-金价',
    queryTemplate: '{query} gold price today',
    priority: 99,
    reliability: 0.5,
    avgLatency: 3000,
    tags: ['gold', 'international', 'search'],
    enabled: true,
  },
  // 汇率数据源
  {
    type: DataType.FOREX,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '百度搜索-汇率',
    queryTemplate: '{query} 今日汇率',
    priority: 1,
    reliability: 0.7,
    avgLatency: 2000,
    tags: ['forex', 'china', 'realtime', 'search'],
    enabled: true,
  },
  // 天气数据源
  {
    type: DataType.WEATHER,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '百度搜索-天气',
    queryTemplate: '{query} 天气',
    priority: 1,
    reliability: 0.7,
    avgLatency: 1500,
    tags: ['weather', 'china', 'realtime', 'search'],
    enabled: true,
  },
  // 通用搜索 (兜底)
  {
    type: DataType.GENERAL,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '百度搜索-通用',
    queryTemplate: '{query}',
    priority: 100,
    reliability: 0.6,
    avgLatency: 2000,
    tags: ['general', 'search', 'fallback'],
    enabled: true,
  },
  {
    type: DataType.GENERAL,
    sourceType: DataSourceType.WEB_SEARCH,
    name: 'DuckDuckGo-通用',
    queryTemplate: '{query}',
    priority: 101,
    reliability: 0.5,
    avgLatency: 2500,
    tags: ['general', 'search', 'fallback'],
    enabled: true,
  },
  // 新闻数据源
  {
    type: DataType.NEWS,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '百度搜索-新闻',
    queryTemplate: '{query} 新闻 最新',
    priority: 1,
    reliability: 0.7,
    avgLatency: 2000,
    tags: ['news', 'china', 'realtime', 'search'],
    enabled: true,
  },
  {
    type: DataType.NEWS,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '新浪新闻',
    queryTemplate: '{query} 最新消息',
    priority: 2,
    reliability: 0.75,
    avgLatency: 1800,
    tags: ['news', 'china', 'sina'],
    enabled: true,
  },
  // 股票数据源
  {
    type: DataType.STOCK,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '百度搜索-股票',
    queryTemplate: '{query} 股票 行情',
    priority: 1,
    reliability: 0.7,
    avgLatency: 2000,
    tags: ['stock', 'china', 'realtime', 'search'],
    enabled: true,
  },
  {
    type: DataType.STOCK,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '东方财富-股票',
    queryTemplate: '{query} 股票行情',
    priority: 2,
    reliability: 0.8,
    avgLatency: 1500,
    tags: ['stock', 'china', 'eastmoney'],
    enabled: true,
  },
  // 加密货币数据源
  {
    type: DataType.CRYPTO,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '百度搜索-币价',
    queryTemplate: '{query} 比特币 以太坊 价格',
    priority: 1,
    reliability: 0.6,
    avgLatency: 2000,
    tags: ['crypto', 'bitcoin', 'realtime', 'search'],
    enabled: true,
  },
  {
    type: DataType.CRYPTO,
    sourceType: DataSourceType.WEB_SEARCH,
    name: 'CoinGecko-币价',
    queryTemplate: '{query} price',
    priority: 2,
    reliability: 0.8,
    avgLatency: 1500,
    tags: ['crypto', 'international', 'coingecko'],
    enabled: true,
  },
  // 白银价格
  {
    type: DataType.SILVER_PRICE,
    sourceType: DataSourceType.WEB_SEARCH,
    name: '百度搜索-银价',
    queryTemplate: '{query} 今日银价 白银价格',
    priority: 1,
    reliability: 0.7,
    avgLatency: 2000,
    tags: ['silver', 'china', 'realtime', 'search'],
    enabled: true,
  },
];

/**
 * 数据库表创建 SQL
 */
export const DATA_SOURCE_SQL = `
CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT,
  api_key TEXT,
  query_template TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  reliability REAL NOT NULL DEFAULT 0.5,
  avg_latency INTEGER NOT NULL DEFAULT 2000,
  tags TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_records (
  id TEXT PRIMARY KEY,
  intent TEXT NOT NULL,
  data_type TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '{}',
  success INTEGER NOT NULL,
  error_type TEXT,
  execution_time INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_sources_type ON data_sources(type);
CREATE INDEX IF NOT EXISTS idx_data_sources_enabled ON data_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_data_sources_priority ON data_sources(priority);
CREATE INDEX IF NOT EXISTS idx_strategy_intent ON strategy_records(intent);
CREATE INDEX IF NOT EXISTS idx_strategy_success ON strategy_records(success);
`;

/**
 * 数据源管理器
 */
export class DataSourceManager {
  private db: DatabaseManager | null = null;
  private memoryCache: Map<string, DataSourceConfig> = new Map();
  private strategyCache: Map<string, StrategyRecord[]> = new Map();
  private initialized = false;

  /**
   * 初始化数据源管理器
   */
  async initialize(database: DatabaseManager): Promise<void> {
    if (this.initialized) return;

    this.db = database;

    // 创建表
    this.db.run(DATA_SOURCE_SQL, []);

    // 初始化默认数据源 (如果不存在)
    await this.initializeDefaultSources();

    this.initialized = true;
    console.log('[DataSource] Manager initialized');
  }

  /**
   * 初始化默认数据源
   */
  private async initializeDefaultSources(): Promise<void> {
    for (const source of DEFAULT_DATA_SOURCES) {
      const existing = this.db!.get(
        'SELECT id FROM data_sources WHERE type = ? AND source_type = ? AND name = ?',
        [source.type, source.sourceType, source.name]
      );

      if (!existing) {
        const id = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        this.db!.run(
          `INSERT INTO data_sources (id, type, source_type, name, base_url, api_key, query_template, priority, reliability, avg_latency, tags, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            source.type,
            source.sourceType,
            source.name,
            source.baseUrl || null,
            source.apiKey || null,
            source.queryTemplate || null,
            source.priority,
            source.reliability,
            source.avgLatency,
            JSON.stringify(source.tags),
            source.enabled ? 1 : 0,
            now,
            now,
          ]
        );
      }
    }
  }

  /**
   * 根据数据类型获取最佳数据源
   */
  getBestSource(dataType: DataType): DataSourceConfig | null {
    // 优先从内存缓存读取
    const cacheKey = `best_${dataType}`;
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    if (!this.db) return null;

    const sources = this.db.all(
      `SELECT * FROM data_sources 
       WHERE type = ? AND enabled = 1 
       ORDER BY priority ASC, reliability DESC, avg_latency ASC
       LIMIT 1`,
      [dataType]
    );

    if (sources.length === 0) {
      // 降级到通用搜索
      return this.getBestSource(DataType.GENERAL);
    }

    const source = this.rowToConfig(sources[0]);
    this.memoryCache.set(cacheKey, source);
    return source;
  }

  /**
   * 获取某数据类型的所有可用数据源
   */
  getSourcesByType(dataType: DataType): DataSourceConfig[] {
    if (!this.db) return [];

    const sources = this.db.all(
      `SELECT * FROM data_sources 
       WHERE type = ? AND enabled = 1 
       ORDER BY priority ASC`,
      [dataType]
    );

    return sources.map(s => this.rowToConfig(s));
  }

  /**
   * 获取所有数据源
   */
  getAllSources(): DataSourceConfig[] {
    if (!this.db) return [];

    const sources = this.db.all(
      `SELECT * FROM data_sources ORDER BY type, priority`
    );

    return sources.map(s => this.rowToConfig(s));
  }

  /**
   * 添加数据源
   */
  addSource(config: Omit<DataSourceConfig, 'id' | 'createdAt' | 'updatedAt'>): DataSourceConfig {
    if (!this.db) throw new Error('DataSourceManager not initialized');

    const id = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    this.db.run(
      `INSERT INTO data_sources (id, type, source_type, name, base_url, api_key, query_template, priority, reliability, avg_latency, tags, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        config.type,
        config.sourceType,
        config.name,
        config.baseUrl || null,
        config.apiKey || null,
        config.queryTemplate || null,
        config.priority,
        config.reliability,
        config.avgLatency,
        JSON.stringify(config.tags),
        config.enabled ? 1 : 0,
        now,
        now,
      ]
    );

    // 清除缓存
    this.clearCache();

    return { ...config, id, createdAt: now, updatedAt: now };
  }

  /**
   * 更新数据源
   */
  updateSource(id: string, updates: Partial<DataSourceConfig>): boolean {
    if (!this.db) return false;

    const existing = this.db.get('SELECT * FROM data_sources WHERE id = ?', [id]);
    if (!existing) return false;

    const now = Date.now();
    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      values.push(updates.name);
    }
    if (updates.baseUrl !== undefined) {
      sets.push('base_url = ?');
      values.push(updates.baseUrl);
    }
    if (updates.queryTemplate !== undefined) {
      sets.push('query_template = ?');
      values.push(updates.queryTemplate);
    }
    if (updates.priority !== undefined) {
      sets.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.reliability !== undefined) {
      sets.push('reliability = ?');
      values.push(updates.reliability);
    }
    if (updates.avgLatency !== undefined) {
      sets.push('avg_latency = ?');
      values.push(updates.avgLatency);
    }
    if (updates.tags !== undefined) {
      sets.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.enabled !== undefined) {
      sets.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }

    sets.push('updated_at = ?');
    values.push(now);
    values.push(id);

    this.db.run(
      `UPDATE data_sources SET ${sets.join(', ')} WHERE id = ?`,
      values
    );

    // 清除缓存
    this.clearCache();

    return true;
  }

  /**
   * 删除数据源
   */
  deleteSource(id: string): boolean {
    if (!this.db) return false;

    this.db.run('DELETE FROM data_sources WHERE id = ?', [id]);
    this.clearCache();
    return true;
  }

  /**
   * 启用/禁用数据源
   */
  toggleSource(id: string, enabled: boolean): boolean {
    return this.updateSource(id, { enabled });
  }

  /**
   * 记录策略执行结果
   */
  recordStrategyResult(record: Omit<StrategyRecord, 'id' | 'createdAt'>): void {
    if (!this.db) return;

    const id = `sr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    this.db.run(
      `INSERT INTO strategy_records (id, intent, data_type, tool_name, args, success, error_type, execution_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        record.intent,
        record.dataType,
        record.toolName,
        record.args,
        record.success ? 1 : 0,
        record.errorType || null,
        record.executionTime,
        now,
      ]
    );

    // 清除策略缓存
    this.strategyCache.clear();
  }

  /**
   * 获取某意图的历史成功记录
   */
  getSuccessHistory(intent: string, dataType: DataType): StrategyRecord | null {
    const cacheKey = `${intent}_${dataType}`;
    
    if (this.strategyCache.has(cacheKey)) {
      const records = this.strategyCache.get(cacheKey)!;
      return records.length > 0 ? records[0] : null;
    }

    if (!this.db) return null;

    const records = this.db.all(
      `SELECT * FROM strategy_records 
       WHERE intent = ? AND data_type = ? AND success = 1 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [intent, dataType]
    );

    const mapped = records.map(r => this.rowToStrategy(r));
    this.strategyCache.set(cacheKey, mapped);

    return mapped.length > 0 ? mapped[0] : null;
  }

  /**
   * 获取某工具的成功率
   */
  getToolSuccessRate(toolName: string): number {
    if (!this.db) return 0.5; // 默认

    const total = this.db.get(
      'SELECT COUNT(*) as cnt FROM strategy_records WHERE tool_name = ?',
      [toolName]
    );

    if (!total || total.cnt === 0) return 0.5;

    const success = this.db.get(
      'SELECT COUNT(*) as cnt FROM strategy_records WHERE tool_name = ? AND success = 1',
      [toolName]
    );

    return success.cnt / total.cnt;
  }

  /**
   * 获取某数据源 (dataType + toolName) 在特定时间段内的成功率
   */
  getSourceSuccessRate(dataType: DataType, toolName: string, timeWindowHours: number = 24): number {
    if (!this.db) return 0.5;

    const since = Date.now() - timeWindowHours * 60 * 60 * 1000;
    
    const total = this.db.get(
      `SELECT COUNT(*) as cnt FROM strategy_records 
       WHERE data_type = ? AND tool_name = ? AND created_at > ?`,
      [dataType, toolName, since]
    );

    if (!total || total.cnt === 0) return 0.5;

    const success = this.db.get(
      `SELECT COUNT(*) as cnt FROM strategy_records 
       WHERE data_type = ? AND tool_name = ? AND success = 1 AND created_at > ?`,
      [dataType, toolName, since]
    );

    return success.cnt / total.cnt;
  }

  /**
   * 获取数据源的健康度评分 (综合成功率和延迟)
   */
  getSourceHealthScore(dataType: DataType, toolName: string): number {
    const successRate = this.getSourceSuccessRate(dataType, toolName);
    
    // 获取平均延迟
    const avgLatency = this.db?.get(
      `SELECT AVG(execution_time) as avg_time FROM strategy_records 
       WHERE data_type = ? AND tool_name = ? AND success = 1`,
      [dataType, toolName]
    );

    // 延迟评分 (延迟越低越好, 假设 10s 为最差)
    const latencyScore = avgLatency?.avg_time 
      ? Math.max(0, 1 - (avgLatency.avg_time as number) / 10000)
      : 0.5;

    // 综合评分: 70% 成功率 + 30% 延迟
    return successRate * 0.7 + latencyScore * 0.3;
  }

  /**
   * 根据成功率自动调整数据源权重
   * 策略: 成功率高 → 提高优先级; 成功率低 → 降低优先级
   */
  adjustSourceWeights(dataType: DataType): void {
    if (!this.db) return;

    const sources = this.getSourcesByType(dataType);
    
    for (const source of sources) {
      const successRate = this.getSourceSuccessRate(dataType, source.name);
      const currentPriority = source.priority;
      
      // 根据成功率调整优先级
      // 成功率 > 80%: 优先级提高 (数字减小)
      // 成功率 < 40%: 优先级降低 (数字增大)
      let newPriority = currentPriority;
      
      if (successRate > 0.8 && currentPriority > 1) {
        newPriority = Math.max(1, currentPriority - 1);
      } else if (successRate < 0.4) {
        newPriority = currentPriority + 1;
      }
      
      if (newPriority !== currentPriority) {
        this.updateSource(source.id, { priority: newPriority });
        console.log(`[DataSource] Adjusted priority for ${source.name}: ${currentPriority} → ${newPriority} (success rate: ${(successRate * 100).toFixed(1)}%)`);
      }
    }
  }

  /**
   * 获取推荐的备用数据源 (当主要数据源失败时)
   */
  getFallbackSource(dataType: DataType, failedToolName: string): DataSourceConfig | null {
    const sources = this.getSourcesByType(dataType);
    
    // 过滤掉失败的数据源，按优先级排序
    const available = sources
      .filter(s => s.name !== failedToolName && s.enabled)
      .sort((a, b) => a.priority - b.priority);
    
    return available[0] || null;
  }

  /**
   * 批量调整所有数据源的权重
   */
  rebalanceAllSources(): void {
    const allTypes = Object.values(DataType);
    
    for (const dataType of allTypes) {
      this.adjustSourceWeights(dataType);
    }
    
    console.log('[DataSource] Rebalanced all source weights');
  }

  /**
   * 获取策略学习统计信息
   */
  getLearningStats(dataType?: DataType): { dataType: string; totalAttempts: number; successRate: number; avgLatency: number }[] {
    if (!this.db) return [];

    const query = dataType
      ? `SELECT data_type, COUNT(*) as total, 
         SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
         AVG(execution_time) as avg_time
         FROM strategy_records WHERE data_type = ? GROUP BY data_type`
      : `SELECT data_type, COUNT(*) as total, 
         SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
         AVG(execution_time) as avg_time
         FROM strategy_records GROUP BY data_type`;

    const rows = dataType 
      ? this.db.all(query, [dataType])
      : this.db.all(query);

    return rows.map((r: any) => ({
      dataType: r.data_type,
      totalAttempts: r.total,
      successRate: r.successes / r.total,
      avgLatency: r.avg_time || 0,
    }));
  }

  /**
   * 清除过期的策略记录
   */
  cleanExpiredRecords(daysToKeep: number = 30): number {
    if (!this.db) return 0;

    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const result = this.db.run(
      'DELETE FROM strategy_records WHERE created_at < ?',
      [cutoff]
    );

    console.log(`[DataSource] Cleaned expired records, removed ${result?.changes || 0} entries`);
    return result?.changes || 0;
  }

  /**
   * 生成查询参数
   */
  buildQueryParams(dataType: DataType, userInput: string): { query: string; tool: string; args: Record<string, unknown> } {
    const source = this.getBestSource(dataType);
    
    if (!source) {
      // 兜底到通用搜索
      return {
        query: userInput,
        tool: 'web_search',
        args: { query: userInput, limit: 5 }
      };
    }

    // 根据源类型生成不同的参数
    let tool: string;
    let query: string;

    switch (source.sourceType) {
      case DataSourceType.WEB_SEARCH:
        tool = 'web_search';
        query = source.queryTemplate 
          ? source.queryTemplate.replace('{query}', userInput)
          : userInput;
        break;
      case DataSourceType.WEB_FETCH:
        tool = 'web_fetch';
        query = source.baseUrl 
          ? source.baseUrl.replace('{query}', encodeURIComponent(userInput))
          : userInput;
        break;
      default:
        tool = 'web_search';
        query = userInput;
    }

    return {
      query,
      tool,
      args: {
        query,
        limit: 5,
        fetchContent: source.sourceType === DataSourceType.WEB_SEARCH,
      }
    };
  }

  /**
   * 清除所有缓存
   */
  private clearCache(): void {
    this.memoryCache.clear();
    this.strategyCache.clear();
  }

  /**
   * 行数据转换为配置
   */
  private rowToConfig(row: DataSourceRow): DataSourceConfig {
    return {
      id: row.id,
      type: row.type as DataType,
      sourceType: row.source_type as DataSourceType,
      name: row.name,
      baseUrl: row.base_url || undefined,
      apiKey: row.api_key || undefined,
      queryTemplate: row.query_template || undefined,
      priority: row.priority,
      reliability: row.reliability,
      avgLatency: row.avg_latency,
      tags: JSON.parse(row.tags || '[]'),
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 行数据转换为策略记录
   */
  private rowToStrategy(row: StrategyRow): StrategyRecord {
    return {
      id: row.id,
      intent: row.intent,
      dataType: row.data_type as DataType,
      toolName: row.tool_name,
      args: row.args,
      success: row.success === 1,
      errorType: row.error_type || undefined,
      executionTime: row.execution_time,
      createdAt: row.created_at,
    };
  }
}

// 单例
let dataSourceManager: DataSourceManager | null = null;

export function getDataSourceManager(db?: DatabaseManager): DataSourceManager {
  if (!dataSourceManager && db) {
    dataSourceManager = new DataSourceManager();
    dataSourceManager.initialize(db).catch(console.error);
  }
  if (!dataSourceManager) {
    throw new Error('DataSourceManager not initialized. Call getDataSourceManager with a DatabaseManager first, or use initializeDataSourceManager().');
  }
  return dataSourceManager;
}

export function setDataSourceManager(manager: DataSourceManager): void {
  dataSourceManager = manager;
}

export function initializeDataSourceManager(db: DatabaseManager): DataSourceManager {
  const manager = new DataSourceManager();
  manager.initialize(db).catch(console.error);
  dataSourceManager = manager;
  return manager;
}
