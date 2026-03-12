import { z } from 'zod';
import { Tool } from '@ooda-agent/core';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebFetchResult {
  url: string;
  title: string;
  content: string;
  statusCode: number;
}

export interface WebConfig {
  searchEngine: 'duckduckgo' | 'serper' | 'bing';
  serperApiKey?: string;
  bingApiKey?: string;
  timeout: number;
  maxFetchLength: number;
}

function getConfig(): WebConfig {
  return {
    searchEngine: (process.env.SEARCH_ENGINE as WebConfig['searchEngine']) || 'duckduckgo',
    serperApiKey: process.env.SERPER_API_KEY,
    bingApiKey: process.env.BING_API_KEY,
    timeout: parseInt(process.env.WEB_REQUEST_TIMEOUT || '30000', 10),
    maxFetchLength: parseInt(process.env.WEB_FETCH_MAX_LENGTH || '50000', 10),
  };
}

async function searchWithTimeout(
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

export async function searchDuckDuckGo(query: string, limit: number = 5): Promise<WebSearchResult[]> {
  const config = getConfig();
  
  try {
    const instantAnswerUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    
    const instantResponse = await searchWithTimeout(instantAnswerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    }, config.timeout);
    
    if (instantResponse.ok) {
      const data = await instantResponse.json() as {
        AbstractText?: string;
        AbstractURL?: string;
        Heading?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
        Results?: Array<{ Text?: string; FirstURL?: string }>;
      };
      
      const results: WebSearchResult[] = [];
      
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.AbstractText,
        });
      }
      
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics) {
          if (topic.Text && topic.FirstURL && results.length < limit) {
            results.push({
              title: topic.Text.split(' - ')[0] || query,
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }
        }
      }
      
      if (data.Results) {
        for (const result of data.Results) {
          if (result.Text && result.FirstURL && results.length < limit) {
            results.push({
              title: result.Text,
              url: result.FirstURL,
              snippet: result.Text,
            });
          }
        }
      }
      
      if (results.length > 0) {
        return results.slice(0, limit);
      }
    }
    
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const htmlResponse = await searchWithTimeout(htmlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    }, config.timeout);
    
    if (!htmlResponse.ok) {
      throw new Error(`DuckDuckGo search failed: ${htmlResponse.status}`);
    }
    
    const html = await htmlResponse.text();
    const results: WebSearchResult[] = [];
    
    const resultPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetPattern = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    
    const urls: { url: string; title: string }[] = [];
    let match;
    
    while ((match = resultPattern.exec(html)) !== null && urls.length < limit) {
      let rawUrl = match[1];
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      
      const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        rawUrl = decodeURIComponent(uddgMatch[1]);
      }
      
      if (rawUrl.startsWith('http')) {
        urls.push({ url: rawUrl, title });
      }
    }
    
    const snippets: string[] = [];
    while ((match = snippetPattern.exec(html)) !== null && snippets.length < limit) {
      const snippet = match[1].replace(/<[^>]*>/g, '').trim();
      snippets.push(snippet);
    }
    
    for (let i = 0; i < Math.min(urls.length, limit); i++) {
      results.push({
        title: urls[i].title,
        url: urls[i].url,
        snippet: snippets[i] || '',
      });
    }
    
    return results;
  } catch (error) {
    console.error('DuckDuckGo search error:', error);
    throw error;
  }
}

export async function searchSerper(query: string, limit: number = 5): Promise<WebSearchResult[]> {
  const config = getConfig();
  
  if (!config.serperApiKey) {
    throw new Error('Serper API key not configured. Set SERPER_API_KEY environment variable.');
  }
  
  const url = 'https://google.serper.dev/search';
  
  try {
    const response = await searchWithTimeout(url, {
      method: 'POST',
      headers: {
        'X-API-KEY': config.serperApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        num: limit,
      }),
    }, config.timeout);
    
    if (!response.ok) {
      throw new Error(`Serper search failed: ${response.status}`);
    }
    
    const data = await response.json() as { organic?: Array<{ title: string; link: string; snippet: string }> };
    const results: WebSearchResult[] = [];
    
    if (data.organic) {
      for (const item of data.organic.slice(0, limit)) {
        results.push({
          title: item.title,
          url: item.link,
          snippet: item.snippet || '',
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Serper search error:', error);
    throw error;
  }
}

export async function searchBing(query: string, limit: number = 5): Promise<WebSearchResult[]> {
  const config = getConfig();
  
  if (!config.bingApiKey) {
    throw new Error('Bing API key not configured. Set BING_API_KEY environment variable.');
  }
  
  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${limit}`;
  
  try {
    const response = await searchWithTimeout(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': config.bingApiKey,
      },
    }, config.timeout);
    
    if (!response.ok) {
      throw new Error(`Bing search failed: ${response.status}`);
    }
    
    const data = await response.json() as { webPages?: { value?: Array<{ name: string; url: string; snippet: string }> } };
    const results: WebSearchResult[] = [];
    
    if (data.webPages?.value) {
      for (const item of data.webPages.value.slice(0, limit)) {
        results.push({
          title: item.name,
          url: item.url,
          snippet: item.snippet || '',
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Bing search error:', error);
    throw error;
  }
}

export async function webSearch(query: string, limit: number = 5): Promise<WebSearchResult[]> {
  const config = getConfig();
  
  switch (config.searchEngine) {
    case 'serper':
      return searchSerper(query, limit);
    case 'bing':
      return searchBing(query, limit);
    case 'duckduckgo':
    default:
      return searchDuckDuckGo(query, limit);
  }
}

export async function webFetch(url: string): Promise<WebFetchResult> {
  const config = getConfig();
  
  try {
    const response = await searchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    }, config.timeout);
    
    const html = await response.text();
    
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
      .trim();
    
    if (content.length > config.maxFetchLength) {
      content = content.substring(0, config.maxFetchLength) + '...';
    }
    
    return {
      url,
      title,
      content,
      statusCode: response.status,
    };
  } catch (error) {
    console.error('Web fetch error:', error);
    throw error;
  }
}

export const webSearchTool: Tool<{ query: string; limit?: number }, { results: WebSearchResult[]; query: string; engine: string }> = {
  name: 'web_search',
  description: '搜索网络信息，支持多种搜索引擎',
  schema: z.object({
    query: z.string().describe('搜索关键词'),
    limit: z.number().optional().describe('结果数量限制，默认5'),
  }),
  permissions: [
    { type: 'network', pattern: '**' }
  ],
  
  async execute(input) {
    const limit = input.limit || 5;
    const config = getConfig();
    const results = await webSearch(input.query, limit);
    
    return {
      results,
      query: input.query,
      engine: config.searchEngine,
    };
  }
};

export const webFetchTool: Tool<{ url: string }, WebFetchResult> = {
  name: 'web_fetch',
  description: '抓取网页内容，提取文本信息',
  schema: z.object({
    url: z.string().describe('要抓取的网页URL'),
  }),
  permissions: [
    { type: 'network', pattern: '**' }
  ],
  
  async execute(input) {
    return webFetch(input.url);
  }
};

export const webSearchAndFetchTool: Tool<{ query: string; limit?: number; fetchContent?: boolean }, { results: Array<WebSearchResult & { content?: string }>; query: string; engine: string }> = {
  name: 'web_search_and_fetch',
  description: '搜索网络并可选择抓取结果页面的内容',
  schema: z.object({
    query: z.string().describe('搜索关键词'),
    limit: z.number().optional().describe('结果数量限制，默认3'),
    fetchContent: z.boolean().optional().describe('是否抓取搜索结果页面的内容'),
  }),
  permissions: [
    { type: 'network', pattern: '**' }
  ],
  
  async execute(input) {
    const limit = input.limit || 3;
    const config = getConfig();
    const results = await webSearch(input.query, limit);
    
    if (input.fetchContent) {
      const enrichedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const fetched = await webFetch(result.url);
            return {
              ...result,
              content: fetched.content.substring(0, 2000),
            };
          } catch {
            return result;
          }
        })
      );
      
      return {
        results: enrichedResults,
        query: input.query,
        engine: config.searchEngine,
      };
    }
    
    return {
      results,
      query: input.query,
      engine: config.searchEngine,
    };
  }
};
