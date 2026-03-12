// scripts/test-web-simple.ts
// 简单的联网功能测试

import 'dotenv/config';

const SEARCH_ENGINE = process.env.SEARCH_ENGINE || 'duckduckgo';
const TIMEOUT = parseInt(process.env.WEB_REQUEST_TIMEOUT || '30000', 10);

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchDuckDuckGo(query: string, limit: number = 5): Promise<SearchResult[]> {
  const instantAnswerUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  
  try {
    const instantResponse = await fetchWithTimeout(instantAnswerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    }, TIMEOUT);
    
    if (instantResponse.ok) {
      const data = await instantResponse.json() as any;
      const results: SearchResult[] = [];
      
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
      
      if (results.length > 0) {
        return results.slice(0, limit);
      }
    }
  } catch (error) {
    console.log('即时回答API失败，尝试HTML搜索...');
  }
  
  const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(htmlUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  }, TIMEOUT);
  
  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: ${response.status}`);
  }
  
  const html = await response.text();
  const results: SearchResult[] = [];
  
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
}

async function fetchWebPage(url: string): Promise<{ title: string; content: string; statusCode: number }> {
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  }, TIMEOUT);
  
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
    .trim();
  
  if (content.length > 5000) {
    content = content.substring(0, 5000) + '...';
  }
  
  return { title, content, statusCode: response.status };
}

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     OODA Agent 联网功能测试               ║');
  console.log('╚════════════════════════════════════════════╝\n');
  
  console.log('配置信息:');
  console.log(`  搜索引擎: ${SEARCH_ENGINE}`);
  console.log(`  请求超时: ${TIMEOUT}ms\n`);
  
  console.log('=== 测试网络搜索 ===\n');
  const query = 'TypeScript 最佳实践';
  console.log(`搜索关键词: ${query}\n`);
  
  try {
    const results = await searchDuckDuckGo(query, 5);
    console.log(`找到 ${results.length} 个结果:\n`);
    
    results.forEach((result, index) => {
      console.log(`--- 结果 ${index + 1} ---`);
      console.log(`标题: ${result.title}`);
      console.log(`URL: ${result.url}`);
      console.log(`摘要: ${result.snippet.substring(0, 100)}...`);
      console.log();
    });
  } catch (error) {
    console.error('搜索失败:', (error as Error).message);
  }
  
  console.log('─'.repeat(50) + '\n');
  
  console.log('=== 测试网页抓取 ===\n');
  const testUrl = 'https://www.typescriptlang.org/';
  console.log(`抓取URL: ${testUrl}\n`);
  
  try {
    const page = await fetchWebPage(testUrl);
    console.log(`状态码: ${page.statusCode}`);
    console.log(`标题: ${page.title}`);
    console.log(`内容长度: ${page.content.length} 字符`);
    console.log(`内容预览:\n${page.content.substring(0, 300)}...\n`);
  } catch (error) {
    console.error('抓取失败:', (error as Error).message);
  }
  
  console.log('\n✅ 测试完成！');
}

main().catch(console.error);
