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
  unit?: string;
  timestamp: number;
  source: string;
  change24h?: number;
  changePercent24h?: number;
  warning?: string;
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

  // 1. 上海黄金交易所 (SGE) - 国内金价优先
  try {
    // 使用专业黄金价格网站获取国内金价
    const response = await fetchWithTimeout(
      'https://www.chinagold.org.cn/market/gold-price.html',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
      },
      QUICK_TIMEOUT
    );

    if (response.ok) {
      const html = await response.text();
      // 尝试多种价格提取模式
      const patterns = [
        /Au99\.99[^\d]*(\d+\.?\d*)/i,
        /国内金价[^\d]*(\d+\.?\d*)/i,
        /现货黄金[^\d]*(\d+\.?\d*)/i,
        /(\d{3,4}\.\d{2})/,
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          const price = parseFloat(match[1]);
          // 国内金价通常在 800-1500 元/克 范围内
          if (price >= 800 && price <= 1500) {
            const priceData: PriceData = {
              symbol: 'Au99.99',
              price: price,
              currency: 'CNY',
              unit: '元/克',
              timestamp: Date.now(),
              source: '中国黄金协会',
            };
            priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
            console.log(`[RealtimeData] 国内金价: ${price} 元/克`);
            return priceData;
          }
        }
      }
    }
  } catch (error) {
    errors.push(`中国黄金协会: ${error}`);
  }

  // 2. 尝试东方财富网黄金数据
  try {
    const response = await fetchWithTimeout(
      'https://quote.eastmoney.com/qihuo/QH0.html',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      QUICK_TIMEOUT
    );

    if (response.ok) {
      const html = await response.text();
      // 东方财富网格式
      const match = html.match(/(\d{3,4}\.\d{2})/);
      if (match) {
        const price = parseFloat(match[1]);
        if (price >= 800 && price <= 1500) {
          const priceData: PriceData = {
            symbol: 'Au99.99',
            price: price,
            currency: 'CNY',
            unit: '元/克',
            timestamp: Date.now(),
            source: '东方财富',
          };
          priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
          console.log(`[RealtimeData] 国内金价(东方财富): ${price} 元/克`);
          return priceData;
        }
      }
    }
  } catch (error) {
    errors.push(`东方财富: ${error}`);
  }

  // 3. 直接抓取黄金网实时报价
  try {
    const response = await fetchWithTimeout(
      'https://www.24k.hk/gold-price-china/',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      QUICK_TIMEOUT
    );

    if (response.ok) {
      const html = await response.text();
      const patterns = [
        /人民币.*?(\d+\.?\d*).*?元\/克/i,
        /CNY.*?(\d+\.?\d*)/i,
        /(\d{3,4}\.\d{2})/,
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          const price = parseFloat(match[1]);
          if (price >= 800 && price <= 1500) {
            const priceData: PriceData = {
              symbol: 'Au99.99',
              price: price,
              currency: 'CNY',
              unit: '元/克',
              timestamp: Date.now(),
              source: '24k.hk',
            };
            priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
            console.log(`[RealtimeData] 国内金价(24k.hk): ${price} 元/克`);
            return priceData;
          }
        }
      }
    }
  } catch (error) {
    errors.push(`24k.hk: ${error}`);
  }

  // 4. goldapi.io - 国际金价 (需要 API key)
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

  // 2. 使用 web_search_and_fetch 获取实际页面内容来提取价格
  try {
    const { webSearchAndFetchTool } = await import('./web-tools');
    const searchResult = await webSearchAndFetchTool.execute({
      query: '今日国际金价 现货黄金 XAU USD 价格',
      limit: 3,
      fetchContent: true,
    }, { sessionId: 'gold-price', workingDirectory: process.cwd(), maxExecutionTime: 10000, resources: { memory: 0, cpu: 0 } });

    if (searchResult.results && searchResult.results.length > 0) {
      // 从实际页面内容中提取价格
      for (const result of searchResult.results) {
        const content = result.content || result.snippet || '';
        // 尝试匹配各种价格格式
        const pricePatterns = [
          /金价[^\d]*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
          /gold[^\d]*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
          /XAU[^\d]*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
          /(\d{1,3}(?:,\d{3})*\.\d{2})/,
        ];

        for (const pattern of pricePatterns) {
          const match = content.match(pattern);
          if (match) {
            const priceStr = match[1].replace(/,/g, '');
            const price = parseFloat(priceStr);
            // 过滤明显不合理的黄金价格（小于100或大于10000）
            if (price > 100 && price < 10000) {
              console.log(`[RealtimeData] 从 ${result.url} 提取到金价: ${price}`);
              const priceData: PriceData = {
                symbol: 'XAU/USD',
                price: price,
                currency: 'USD',
                timestamp: Date.now(),
                source: 'web_content:' + result.url,
              };
              priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
              return priceData;
            }
          }
        }
      }
    }
  } catch (error) {
    errors.push(`web_search_and_fetch: ${error}`);
  }

  // 3. 尝试 Yahoo Finance API (无需 API key)
  try {
    const response = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d`,
      {},
      QUICK_TIMEOUT
    );

    if (response.ok) {
      const data = await response.json();
      const result = data?.chart?.result?.[0];
      if (result?.meta?.regularMarketPrice) {
        const price = result.meta.regularMarketPrice;
        const priceData: PriceData = {
          symbol: 'XAU/USD',
          price: price,
          currency: 'USD',
          timestamp: Date.now(),
          source: 'Yahoo Finance (GC=F)',
          change24h: result.meta.regularMarketChange || 0,
          changePercent24h: result.meta.regularMarketChangePercent || 0,
        };
        priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
        console.log(`[RealtimeData] Yahoo Finance 金价: ${price}`);
        return priceData;
      }
    }
  } catch (error) {
    errors.push(`Yahoo Finance: ${error}`);
  }

  // 4. 尝试直接抓取kitco.com的金价页面
  try {
    const response = await fetchWithTimeout(
      'https://www.kitco.com/charts/livegold.html',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      QUICK_TIMEOUT
    );

    if (response.ok) {
      const html = await response.text();
      // 从kitco页面提取价格
      const priceMatch = html.match(/goldAsk\s*=\s*'(\d+\.?\d*)'/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1]);
        const priceData: PriceData = {
          symbol: 'XAU/USD',
          price: price,
          currency: 'USD',
          timestamp: Date.now(),
          source: 'kitco.com',
        };
        priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
        console.log(`[RealtimeData] Kitco 金价: ${price}`);
        return priceData;
      }
    }
  } catch (error) {
    errors.push(`kitco.com: ${error}`);
  }

  // 5. 尝试 metals-API.com 免费端点
  try {
    const response = await fetchWithTimeout(
      `https://metals-api.com/api/latest?access_key=free&base=USD&symbols=XAU`,
      {},
      QUICK_TIMEOUT
    );

    if (response.ok) {
      const data = await response.json();
      if (data?.rates?.XAU) {
        // metals-api 返回的是 1 USD = ? XAU
        // 如果 XAU 价值大于 1，说明这是错误数据（金价不可能低于 1 美元）
        if (data.rates.XAU >= 1) {
          errors.push('metals-api: 返回数据格式错误 (rates.XAU >= 1)');
        } else {
          const price = 1 / data.rates.XAU;
          // 验证价格合理性：黄金价格应该在 100-10000 美元之间
          if (price >= 100 && price <= 10000) {
            const priceData: PriceData = {
              symbol: 'XAU/USD',
              price: price,
              currency: 'USD',
              timestamp: Date.now(),
              source: 'metals-api.com',
            };
            priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
            console.log(`[RealtimeData] Metals-API 金价: ${price}`);
            return priceData;
          } else {
            errors.push(`metals-api: 价格不合理 (${price})`);
          }
        }
      }
    }
  } catch (error) {
    errors.push(`metals-api: ${error}`);
  }

  // 6. 使用 web_search_and_fetch 获取实际页面内容来提取价格
  try {
    const { webSearchAndFetchTool } = await import('./web-tools');
    const searchResult = await webSearchAndFetchTool.execute({
      query: 'gold price XAU USD today',
      limit: 3,
      fetchContent: true,
    }, { sessionId: 'gold-price', workingDirectory: process.cwd(), maxExecutionTime: 10000, resources: { memory: 0, cpu: 0 } });

    if (searchResult.results && searchResult.results.length > 0) {
      for (const result of searchResult.results) {
        const content = result.content || result.snippet || '';
        const pricePatterns = [
          /gold[^\d]*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
          /XAU[^\d]*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
          /(\d{1,3}(?:,\d{3})*\.\d{2})/,
        ];

        for (const pattern of pricePatterns) {
          const match = content.match(pattern);
          if (match) {
            const priceStr = match[1].replace(/,/g, '');
            const price = parseFloat(priceStr);
            if (price > 100 && price < 10000) {
              console.log(`[RealtimeData] 从 ${result.url} 提取到金价: ${price}`);
              const priceData: PriceData = {
                symbol: 'XAU/USD',
                price: price,
                currency: 'USD',
                timestamp: Date.now(),
                source: 'web_content:' + result.url,
              };
              priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
              return priceData;
            }
          }
        }
      }
    }
  } catch (error) {
    errors.push(`web_search_and_fetch: ${error}`);
  }

  // 所有API都失败，返回明确的错误信息
  console.error('[RealtimeData] 所有金价API都失败:', errors);

  // 检查是否有缓存可用（即使过期也比错误数据好）
  const expiredCache = priceCache.get(cacheKey);
  if (expiredCache) {
    const priceData = expiredCache.data as PriceData;
    const cacheAge = Math.round((Date.now() - expiredCache.timestamp) / 60000);
    // 验证缓存数据是否合理
    if (priceData.price >= 1000 && priceData.price <= 10000) {
      console.log(`[RealtimeData] 使用过期缓存数据（${cacheAge}分钟前）`);
      return {
        ...priceData,
        source: `缓存(过期${cacheAge}分钟): ${priceData.source}`,
        warning: `数据来自${cacheAge}分钟前的缓存，当前网络不可用，价格可能已变化`,
      };
    }
  }

  // 无法获取任何有效数据，返回明确错误
  throw new Error(`无法获取金价数据：网络连接不可用或所有API均已失效。请检查网络后重试。`);
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
