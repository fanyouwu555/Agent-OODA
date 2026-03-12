// scripts/test-web-tools.ts
// 测试联网功能

import 'dotenv/config';
import { webSearch, webFetch } from '../packages/tools/src/web-tools';

async function testWebSearch() {
  console.log('=== 测试网络搜索功能 ===\n');
  
  const query = 'TypeScript 最佳实践';
  console.log(`搜索关键词: ${query}`);
  console.log(`搜索引擎: ${process.env.SEARCH_ENGINE || 'duckduckgo'}\n`);
  
  try {
    const results = await webSearch(query, 5);
    
    console.log(`找到 ${results.length} 个结果:\n`);
    
    results.forEach((result, index) => {
      console.log(`--- 结果 ${index + 1} ---`);
      console.log(`标题: ${result.title}`);
      console.log(`URL: ${result.url}`);
      console.log(`摘要: ${result.snippet.substring(0, 100)}...`);
      console.log();
    });
    
    return results;
  } catch (error) {
    console.error('搜索失败:', (error as Error).message);
    throw error;
  }
}

async function testWebFetch() {
  console.log('=== 测试网页抓取功能 ===\n');
  
  const testUrl = 'https://www.typescriptlang.org/docs/';
  console.log(`抓取URL: ${testUrl}\n`);
  
  try {
    const result = await webFetch(testUrl);
    
    console.log(`状态码: ${result.statusCode}`);
    console.log(`标题: ${result.title}`);
    console.log(`内容长度: ${result.content.length} 字符`);
    console.log(`内容预览:\n${result.content.substring(0, 500)}...\n`);
    
    return result;
  } catch (error) {
    console.error('抓取失败:', (error as Error).message);
    throw error;
  }
}

async function testDuckDuckGoDirectly() {
  console.log('=== 测试 DuckDuckGo 搜索 (通过 webSearch) ===\n');
  
  const originalEngine = process.env.SEARCH_ENGINE;
  process.env.SEARCH_ENGINE = 'duckduckgo';
  
  const query = 'Node.js 教程';
  console.log(`搜索关键词: ${query}\n`);
  
  try {
    const results = await webSearch(query, 3);
    
    console.log(`找到 ${results.length} 个结果:\n`);
    
    results.forEach((result, index) => {
      console.log(`--- 结果 ${index + 1} ---`);
      console.log(`标题: ${result.title}`);
      console.log(`URL: ${result.url}`);
      console.log(`摘要: ${result.snippet.substring(0, 100)}...`);
      console.log();
    });
    
    process.env.SEARCH_ENGINE = originalEngine;
    return results;
  } catch (error) {
    process.env.SEARCH_ENGINE = originalEngine;
    console.error('DuckDuckGo 搜索失败:', (error as Error).message);
    throw error;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     OODA Agent 联网功能测试               ║');
  console.log('╚════════════════════════════════════════════╝\n');
  
  console.log('配置信息:');
  console.log(`  搜索引擎: ${process.env.SEARCH_ENGINE || 'duckduckgo'}`);
  console.log(`  请求超时: ${process.env.WEB_REQUEST_TIMEOUT || '30000'}ms`);
  console.log(`  最大抓取长度: ${process.env.WEB_FETCH_MAX_LENGTH || '50000'}字符\n`);
  
  try {
    await testDuckDuckGoDirectly();
    console.log('\n' + '─'.repeat(50) + '\n');
    
    await testWebSearch();
    console.log('\n' + '─'.repeat(50) + '\n');
    
    await testWebFetch();
    
    console.log('\n✅ 所有测试通过！');
  } catch (error) {
    console.error('\n❌ 测试失败:', (error as Error).message);
    process.exit(1);
  }
}

main();
