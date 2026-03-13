// MCP 工具包 - 预配置的常用 MCP 服务
// 包含: Context7, GrepApp, WebSearch

import { Tool, ExecutionContext } from '@ooda-agent/core';
import { z } from 'zod';

/**
 * Context7 MCP 工具
 * 用于获取最新的库文档和代码示例
 * 
 * 使用方式: 在提示词中添加 "use context7" 让 LLM 自动调用
 * 示例: "Create a React hook, use context7"
 */
export const context7Tool: Tool<{ 
  library: string; 
  query: string;
}, {
  library: string;
  results: Array<{
    title: string;
    content: string;
    source: string;
    relevance: number;
  }>;
  query: string;
  timestamp: number;
}> = {
  name: 'context7',
  description: '获取最新的库文档和代码示例。通过 Context7 MCP 服务查询最新的、版本特定的文档和代码示例。',
  schema: z.object({
    library: z.string().describe('要查询的库名称，如 "react", "next.js", "lodash"'),
    query: z.string().describe('具体问题或代码示例请求'),
  }),
  permissions: [
    { type: 'network', pattern: '**' }
  ],
  
  async execute(input, context) {
    const { library, query } = input;
    
    try {
      // 调用 Context7 API
      // 注意: 这里使用 HTTP 方式连接到 Context7 MCP 服务器
      const response = await fetch('https://mcp.context7.com/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'context7_resolve-library-id',
            arguments: {
              libraryName: library,
              query: query
            }
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Context7 API 错误: ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        library,
        query,
        results: data.result || [],
        timestamp: Date.now()
      };
    } catch (error) {
      // 如果 MCP 服务器不可用，返回说明
      return {
        library,
        query,
        results: [{
          title: 'MCP 服务器未连接',
          content: '请确保 Context7 MCP 服务器已启动。你可以通过以下方式连接: npx -y @upstash/context7-mcp',
          source: 'system',
          relevance: 1
        }],
        timestamp: Date.now()
      };
    }
  }
};

/**
 * GrepApp MCP 工具
 * 用于在 GitHub 公共仓库中搜索代码
 */
export const grepAppTool: Tool<{
  query: string;
  language?: string;
  limit?: number;
}, {
  query: string;
  results: Array<{
    repository: string;
    path: string;
    content: string;
    language: string;
    stars: number;
  }>;
  total: number;
  timestamp: number;
}> = {
  name: 'grep_app',
  description: '在 GitHub 公共仓库中搜索代码。使用 grep.app API 搜索数百万个公共 GitHub 仓库。',
  schema: z.object({
    query: z.string().describe('代码搜索查询，如 "useState React hook"'),
    language: z.string().optional().describe('编程语言过滤，如 "typescript", "python"'),
    limit: z.number().optional().describe('返回结果数量，默认 10'),
  }),
  permissions: [
    { type: 'network', pattern: '**' }
  ],
  
  async execute(input, context) {
    const { query, language, limit = 10 } = input;
    
    try {
      // 使用 GrepApp API
      const apiUrl = new URL('https://grep.app/api/search');
      apiUrl.searchParams.set('q', query);
      if (language) {
        apiUrl.searchParams.set('lang', language);
      }
      apiUrl.searchParams.set('limit', limit.toString());
      
      const response = await fetch(apiUrl.toString(), {
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`GrepApp API 错误: ${response.status}`);
      }
      
      const data = await response.json();
      
      const results = (data.hits?.hits || []).map((hit: any) => ({
        repository: hit.repository?.full_name || 'unknown',
        path: hit.path || '',
        content: hit.content?.substring(0, 500) || '',
        language: hit.language || language || 'unknown',
        stars: hit.repository?.stargazers_count || 0
      }));
      
      return {
        query,
        results,
        total: results.length,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        query,
        results: [],
        total: 0,
        timestamp: Date.now()
      };
    }
  }
};

/**
 * WebSearch MCP 工具
 * 用于网络搜索
 */
export const webSearchTool: Tool<{
  query: string;
  numResults?: number;
}, {
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  timestamp: number;
}> = {
  name: 'web_search',
  description: '执行网络搜索。返回相关的网页结果摘要。',
  schema: z.object({
    query: z.string().describe('搜索查询'),
    numResults: z.number().optional().describe('返回结果数量，默认 10'),
  }),
  permissions: [
    { type: 'network', pattern: '**' }
  ],
  
  async execute(input, context) {
    const { query, numResults = 10 } = input;
    
    try {
      // 使用 Exa Search API (免费层可用)
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.EXA_API_KEY || '',
        },
        body: JSON.stringify({
          query,
          numResults,
          type: 'keyword'
        })
      });
      
      if (!response.ok) {
        // 如果没有 API key，使用备用搜索
        throw new Error('使用备用搜索');
      }
      
      const data = await response.json();
      
      return {
        query,
        results: (data.results || []).map((r: any) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet
        })),
        timestamp: Date.now()
      };
    } catch {
      // 备用: 使用 DuckDuckGo HTML 搜索
      try {
        const ddgUrl = new URL('https://html.duckduckgo.com/html/');
        ddgUrl.searchParams.set('q', query);
        
        const response = await fetch(ddgUrl.toString());
        const html = await response.text();
        
        // 简单解析 HTML 结果
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        const matches = html.matchAll(/<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]+)</g);
        
        let count = 0;
        for (const match of matches) {
          if (count >= numResults) break;
          results.push({
            title: match[2].replace(/<[^>]+>/g, ''),
            url: match[1],
            snippet: match[3].replace(/<[^>]+>/g, '').trim()
          });
          count++;
        }
        
        return {
          query,
          results,
          timestamp: Date.now()
        };
      } catch (searchError) {
        return {
          query,
          results: [],
          timestamp: Date.now()
        };
      }
    }
  }
};

/**
 * WebFetch MCP 工具
 * 用于获取网页内容
 */
export const webFetchTool: Tool<{
  url: string;
  format?: 'text' | 'markdown';
}, {
  url: string;
  title: string;
  content: string;
  format: string;
  timestamp: number;
}> = {
  name: 'web_fetch',
  description: '获取网页内容。将网页转换为纯文本或 Markdown 格式。',
  schema: z.object({
    url: z.string().describe('要获取的网页 URL'),
    format: z.enum(['text', 'markdown']).optional().describe('输出格式，默认 text'),
  }),
  permissions: [
    { type: 'network', pattern: '**' }
  ],
  
  async execute(input, context) {
    const { url, format = 'text' } = input;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OODA-Agent/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        }
      });
      
      if (!response.ok) {
        throw new Error(`获取失败: ${response.status}`);
      }
      
      const html = await response.text();
      
      // 简单提取标题
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : url;
      
      // 简单提取正文（去除 HTML 标签）
      let content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .substring(0, 10000); // 限制内容长度
      
      return {
        url,
        title,
        content,
        format,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        url,
        title: '获取失败',
        content: `无法获取网页内容: ${(error as Error).message}`,
        format,
        timestamp: Date.now()
      };
    }
  }
};

/**
 * 初始化所有 MCP 工具
 * 在应用启动时调用此函数
 */
export function initializeMCPTools(): void {
  console.log('[MCP] 初始化 MCP 工具包');
  console.log('[MCP] - Context7: 代码文档搜索');
  console.log('[MCP] - GrepApp: GitHub 代码搜索');
  console.log('[MCP] - WebSearch: 网络搜索');
  console.log('[MCP] - WebFetch: 网页抓取');
}

export default {
  context7Tool,
  grepAppTool,
  webSearchTool,
  webFetchTool,
  initializeMCPTools
};
