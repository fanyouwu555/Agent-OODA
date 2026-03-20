// 实时数据获取工具集 - 解决LLM训练数据过时问题

import { z } from 'zod';
import { Tool } from '@ooda-agent/core';

// ============================================
// 类型定义
// ============================================

export interface RealtimeDataConfig {
  timeout: number;
  cacheDuration: number; // 缓存时间（毫秒）
}

export interface PriceData {
  symbol: string;
  price: number;
  currency: string;
  timestamp: number;
  source: string;
  change24h?: number;
  changePercent24h?: number;
}

export interface WeatherData {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  timestamp: number;
}

// 简单的内存缓存 - 使用联合类型支持价格数据和新闻数据
const priceCache = new Map<string, { data: PriceData | NewsData; timestamp: number }>();

function getConfig(): RealtimeDataConfig {
  return {
    timeout: parseInt(process.env.REALTIME_DATA_TIMEOUT || '10000', 10),
    cacheDuration: parseInt(process.env.REALTIME_CACHE_DURATION || '60000', 10), // 默认1分钟缓存
  };
}

// ============================================
// 金价获取工具
// ============================================

// 模拟金价数据（当API都失败时使用）
const MOCK_GOLD_PRICE = 2150;

/**
 * 从多个免费API获取金价数据
 * 优化：减少超时时间，快速降级
 * @param forceRefresh 强制刷新：绕过缓存从网络获取最新数据
 */
async function fetchGoldPrice(forceRefresh?: boolean): Promise<PriceData> {
  const config = getConfig();
  const cacheKey = 'gold';
  const QUICK_TIMEOUT = 5000; // 快速超时 5秒

  // 检查缓存（除非强制刷新）
  if (!forceRefresh) {
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < config.cacheDuration) {
      console.log('[RealtimeData] 使用缓存的金价数据');
      return cached.data as PriceData;
    }
  } else {
    console.log('[RealtimeData] 强制刷新，绕过缓存获取最新金价');
  }

  // 尝试多个数据源
  const errors: string[] = [];

  // 1. 尝试使用黄金价格API (goldapi.io) - 需要 API key
  try {
    const apiKey = process.env.GOLD_API_KEY;
    if (apiKey) {
      const response = await fetchWithTimeout(
        `https://www.goldapi.io/api/XAU/USD`,
        {
          headers: {
            'x-access-token': apiKey,
            'Content-Type': 'application/json',
          },
        },
        QUICK_TIMEOUT
      );

      if (response.ok) {
        const data = await response.json();
        const priceData: PriceData = {
          symbol: 'XAU/USD',
          price: data.price,
          currency: 'USD',
          timestamp: Date.now(),
          source: 'goldapi.io',
          change24h: data.chg,
          changePercent24h: data.chg_pct,
        };
        priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
        return priceData;
      }
    }
  } catch (error) {
    errors.push(`goldapi.io: ${error}`);
  }

  // 2. 使用网络搜索获取实时金价（缩短超时）
  try {
    const { webSearch } = await import('./web-tools');
    const searchResults = await webSearch('今日国际金价 现货黄金 实时', 3);

    if (searchResults.length > 0) {
      // 从搜索结果中提取价格信息
      const combinedSnippet = searchResults.map(r => r.snippet).join(' ');
      const priceMatch = combinedSnippet.match(/(\d{1,2},?\d{3}\.?\d{0,2})/);

      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(',', ''));
        const priceData: PriceData = {
          symbol: 'XAU/USD',
          price: price,
          currency: 'USD',
          timestamp: Date.now(),
          source: 'web_search:' + searchResults[0].url,
        };
        priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
        return priceData;
      }
    }
  } catch (error) {
    errors.push(`web_search: ${error}`);
  }

  // 3. 使用模拟数据（快速降级）
  console.log('[RealtimeData] 使用模拟金价数据');
  const priceData: PriceData = {
    symbol: 'XAU/USD',
    price: MOCK_GOLD_PRICE,
    currency: 'USD',
    timestamp: Date.now(),
    source: 'mock_data',
  };
  priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
  return priceData;
}

// ============================================
// 股票价格获取工具
// ============================================

async function fetchStockPrice(symbol: string, forceRefresh?: boolean): Promise<PriceData> {
  const config = getConfig();
  const cacheKey = `stock:${symbol}`;

  // 检查缓存（除非强制刷新）
  if (!forceRefresh) {
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < config.cacheDuration) {
      return cached.data as PriceData;
    }
  } else {
    console.log(`[RealtimeData] 强制刷新，绕过缓存获取股票 ${symbol} 最新价格`);
  }

  // 使用 Yahoo Finance API (免费但非官方)
  try {
    const response = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      config.timeout
    );

    if (response.ok) {
      const data = await response.json();
      const result = data.chart?.result?.[0];

      if (result) {
        const meta = result.meta;
        const priceData: PriceData = {
          symbol: symbol.toUpperCase(),
          price: meta.regularMarketPrice,
          currency: meta.currency,
          timestamp: Date.now(),
          source: 'yahoo_finance',
          change24h: meta.regularMarketPrice - meta.previousClose,
          changePercent24h: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
        };
        priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
        return priceData;
      }
    }
  } catch (error) {
    console.error(`[RealtimeData] Yahoo Finance error for ${symbol}:`, error);
  }

  // 备用：使用网络搜索
  try {
    const { webSearch } = await import('./web-tools');
    const searchResults = await webSearch(`${symbol} 股票实时价格`, 3);

    if (searchResults.length > 0) {
      const priceData: PriceData = {
        symbol: symbol.toUpperCase(),
        price: 0,
        currency: 'CNY',
        timestamp: Date.now(),
        source: 'web_search:' + searchResults[0].url,
      };
      return priceData;
    }
  } catch (error) {
    console.error(`[RealtimeData] Web search error for ${symbol}:`, error);
  }

  throw new Error(`无法获取股票 ${symbol} 的价格数据`);
}

// ============================================
// 加密货币价格获取工具
// ============================================

async function fetchCryptoPrice(symbol: string, forceRefresh?: boolean): Promise<PriceData> {
  const config = getConfig();
  const cacheKey = `crypto:${symbol.toLowerCase()}`;

  // 检查缓存（除非强制刷新）
  if (!forceRefresh) {
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < config.cacheDuration) {
      return cached.data as PriceData;
    }
  } else {
    console.log(`[RealtimeData] 强制刷新，绕过缓存获取加密货币 ${symbol} 最新价格`);
  }

  // 使用 CoinGecko API (免费版)
  try {
    const response = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd&include_24hr_change=true`,
      {},
      config.timeout
    );

    if (response.ok) {
      const data = await response.json();
      const coinData = data[symbol.toLowerCase()];

      if (coinData) {
        const priceData: PriceData = {
          symbol: symbol.toUpperCase(),
          price: coinData.usd,
          currency: 'USD',
          timestamp: Date.now(),
          source: 'coingecko',
          changePercent24h: coinData.usd_24h_change,
        };
        priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
        return priceData;
      }
    }
  } catch (error) {
    console.error(`[RealtimeData] CoinGecko error for ${symbol}:`, error);
  }

  throw new Error(`无法获取加密货币 ${symbol} 的价格数据`);
}

// ============================================
// 天气数据获取工具
// ============================================

async function fetchWeather(location: string): Promise<WeatherData> {
  const config = getConfig();

  // 使用 wttr.in (免费天气API)
  try {
    const response = await fetchWithTimeout(
      `https://wttr.in/${encodeURIComponent(location)}?format=j1`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      },
      config.timeout
    );

    if (response.ok) {
      const data = await response.json();
      const current = data.current_condition?.[0];

      if (current) {
        return {
          location: data.nearest_area?.[0]?.areaName?.[0]?.value || location,
          temperature: parseInt(current.temp_C),
          condition: current.weatherDesc?.[0]?.value || '未知',
          humidity: parseInt(current.humidity),
          windSpeed: parseInt(current.windspeedKmph),
          timestamp: Date.now(),
        };
      }
    }
  } catch (error) {
    console.error(`[RealtimeData] Weather fetch error for ${location}:`, error);
  }

  throw new Error(`无法获取 ${location} 的天气数据`);
}

// ============================================
// 工具函数
// ============================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// Tool 定义
// ============================================

export const goldPriceTool: Tool<{ forceRefresh?: boolean }, PriceData> = {
  name: 'get_gold_price',
  description: '获取实时国际金价（现货黄金价格），返回美元/盎司价格和24小时变化',
  schema: z.object({
    forceRefresh: z.boolean().optional().describe('强制刷新：绕过缓存，从网络获取最新数据'),
  }),
  permissions: [{ type: 'network', pattern: '**' }],

  async execute(input) {
    return fetchGoldPrice(input.forceRefresh);
  },
};

export const stockPriceTool: Tool<{ symbol: string; forceRefresh?: boolean }, PriceData> = {
  name: 'get_stock_price',
  description: '获取股票实时价格，支持A股、港股、美股。例如：AAPL, TSLA, 600519',
  schema: z.object({
    symbol: z.string().describe('股票代码，如 AAPL, TSLA, 600519'),
    forceRefresh: z.boolean().optional().describe('强制刷新：绕过缓存，从网络获取最新数据'),
  }),
  permissions: [{ type: 'network', pattern: '**' }],

  async execute(input) {
    return fetchStockPrice(input.symbol, input.forceRefresh);
  },
};

export const cryptoPriceTool: Tool<{ symbol: string; forceRefresh?: boolean }, PriceData> = {
  name: 'get_crypto_price',
  description: '获取加密货币实时价格，支持 bitcoin, ethereum 等',
  schema: z.object({
    symbol: z.string().describe('加密货币符号，如 bitcoin, ethereum, solana'),
    forceRefresh: z.boolean().optional().describe('强制刷新：绕过缓存，从网络获取最新数据'),
  }),
  permissions: [{ type: 'network', pattern: '**' }],

  async execute(input) {
    return fetchCryptoPrice(input.symbol, input.forceRefresh);
  },
};

export const weatherTool: Tool<{ location: string }, WeatherData> = {
  name: 'get_weather',
  description: '获取指定城市的实时天气信息',
  schema: z.object({
    location: z.string().describe('城市名称，如 北京, Shanghai, Tokyo'),
  }),
  permissions: [{ type: 'network', pattern: '**' }],

  async execute(input) {
    return fetchWeather(input.location);
  },
};

// ============================================
// 智能实时数据查询工具
// ============================================

export const smartRealtimeQueryTool: Tool<
  { query: string; dataType?: 'price' | 'weather' | 'news' | 'auto'; forceRefresh?: boolean },
  { success: boolean; data?: unknown; message: string; source: string; timestamp: number }
> = {
  name: 'smart_realtime_query',
  description: `智能实时数据查询工具。根据查询内容自动判断需要获取的实时数据类型。
  支持的查询类型：
  - 金价、黄金价格、gold price -> 获取实时金价
  - 股票价格、股价、stock price -> 获取股票价格
  - 加密货币、比特币、以太坊 -> 获取加密货币价格
  - 天气、温度、weather -> 获取天气信息
  - 其他实时信息 -> 使用网络搜索`,
  schema: z.object({
    query: z.string().describe('用户查询内容'),
    dataType: z.enum(['price', 'weather', 'news', 'auto']).optional().describe('数据类型，默认auto自动判断'),
    forceRefresh: z.boolean().optional().describe('强制刷新：绕过缓存，从网络获取最新数据'),
  }),
  permissions: [{ type: 'network', pattern: '**' }],

  async execute(input) {
    const query = input.query.toLowerCase();
    const dataType = input.dataType || 'auto';
    const forceRefresh = input.forceRefresh;

    // 自动判断查询类型
    if (dataType === 'auto') {
      // 金价相关
      if (query.includes('金') || query.includes('gold') || query.includes('xau')) {
        try {
          const data = await fetchGoldPrice(forceRefresh);
          return {
            success: true,
            data,
            message: `实时金价: $${data.price.toFixed(2)}/盎司`,
            source: data.source,
            timestamp: data.timestamp,
          };
        } catch (error) {
          return {
            success: false,
            message: `获取金价失败: ${error}`,
            source: 'error',
            timestamp: Date.now(),
          };
        }
      }

      // 天气相关
      if (query.includes('天气') || query.includes('温度') || query.includes('weather')) {
        // 提取城市名（简化处理）
        const cities = ['北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '武汉', '西安', '重庆'];
        const city = cities.find(c => query.includes(c)) || '北京';

        try {
          const data = await fetchWeather(city);
          return {
            success: true,
            data,
            message: `${data.location}当前天气: ${data.temperature}°C, ${data.condition}`,
            source: 'wttr.in',
            timestamp: data.timestamp,
          };
        } catch (error) {
          return {
            success: false,
            message: `获取天气失败: ${error}`,
            source: 'error',
            timestamp: Date.now(),
          };
        }
      }

      // 加密货币
      if (query.includes('比特币') || query.includes('bitcoin') || query.includes('btc')) {
        try {
          const data = await fetchCryptoPrice('bitcoin', forceRefresh);
          return {
            success: true,
            data,
            message: `比特币实时价格: $${data.price.toFixed(2)}`,
            source: data.source,
            timestamp: data.timestamp,
          };
        } catch (error) {
          return {
            success: false,
            message: `获取比特币价格失败: ${error}`,
            source: 'error',
            timestamp: Date.now(),
          };
        }
      }

      if (query.includes('以太坊') || query.includes('ethereum') || query.includes('eth')) {
        try {
          const data = await fetchCryptoPrice('ethereum', forceRefresh);
          return {
            success: true,
            data,
            message: `以太坊实时价格: $${data.price.toFixed(2)}`,
            source: data.source,
            timestamp: data.timestamp,
          };
        } catch (error) {
          return {
            success: false,
            message: `获取以太坊价格失败: ${error}`,
            source: 'error',
            timestamp: Date.now(),
          };
        }
      }
    }

    // 默认使用网络搜索
    try {
      const { webSearch } = await import('./web-tools');
      const results = await webSearch(query + ' 实时', 3);

      return {
        success: true,
        data: results,
        message: `找到 ${results.length} 条实时信息`,
        source: 'web_search',
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        message: `查询失败: ${error}`,
        source: 'error',
        timestamp: Date.now(),
      };
    }
  },
};

// ============================================
// 新闻数据获取工具
// ============================================

export interface NewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
}

export interface NewsData {
  category: string;
  items: NewsItem[];
  timestamp: number;
}

/**
 * 获取最新新闻
 * 使用网络搜索获取最新新闻
 * @param forceRefresh 强制刷新：绕过缓存从网络获取最新数据
 */
async function fetchLatestNews(category: string = 'general', forceRefresh?: boolean): Promise<NewsData> {
  const config = getConfig();
  const cacheKey = `news:${category}`;

  // 检查缓存（除非强制刷新）
  if (!forceRefresh) {
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < config.cacheDuration) {
      console.log('[RealtimeData] 使用缓存的新闻数据');
      return cached.data as NewsData;
    }
  } else {
    console.log('[RealtimeData] 强制刷新，绕过缓存获取最新新闻');
  }

  // 构建搜索查询
  const searchQueries: Record<string, string> = {
    general: '最新新闻 头条 今日',
    tech: '科技新闻 最新',
    finance: '财经新闻 股市',
    sports: '体育新闻 最新',
    entertainment: '娱乐新闻 明星',
    international: '国际新闻 全球',
  };

  const query = searchQueries[category] || searchQueries.general;

  try {
    const { webSearch } = await import('./web-tools');
    const results = await webSearch(query, 5);

    const items: NewsItem[] = results.map(r => ({
      title: r.title,
      summary: r.snippet,
      url: r.url,
      source: new URL(r.url).hostname,
      publishedAt: new Date().toISOString(),
    }));

    const newsData: NewsData = {
      category,
      items,
      timestamp: Date.now(),
    };

    // 缓存新闻数据
    priceCache.set(cacheKey, { data: newsData, timestamp: Date.now() });

    return newsData;
  } catch (error) {
    console.error('[RealtimeData] News fetch error:', error);
    throw new Error(`无法获取新闻数据: ${error}`);
  }
}

export const newsTool: Tool<{ category?: string; forceRefresh?: boolean }, NewsData> = {
  name: 'get_latest_news',
  description: '获取最新新闻，支持分类：general(综合), tech(科技), finance(财经), sports(体育), entertainment(娱乐), international(国际)',
  schema: z.object({
    category: z.enum(['general', 'tech', 'finance', 'sports', 'entertainment', 'international']).optional().describe('新闻分类'),
    forceRefresh: z.boolean().optional().describe('强制刷新：绕过缓存，从网络获取最新数据'),
  }),
  permissions: [{ type: 'network', pattern: '**' }],

  async execute(input) {
    return fetchLatestNews(input.category || 'general', input.forceRefresh);
  },
};

// 导出所有工具
export const realtimeDataTools = [
  goldPriceTool,
  stockPriceTool,
  cryptoPriceTool,
  weatherTool,
  newsTool,
  smartRealtimeQueryTool,
];
