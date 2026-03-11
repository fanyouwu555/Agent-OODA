// packages/tools/src/base-tool.ts
import { z } from 'zod';
import { Tool } from '@ooda-agent/core';

// 读取文件工具
export const readFileTool: Tool<{ path: string; offset?: number; limit?: number }, { content: string[]; totalLines: number; path: string }> = {
  name: 'read_file',
  description: '读取文件内容',
  schema: z.object({
    path: z.string().describe('文件绝对路径'),
    offset: z.number().optional().describe('起始行'),
    limit: z.number().optional().describe('读取行数'),
  }),
  permissions: [
    { type: 'file_read', pattern: '**/*' }
  ],
  
  async execute(input, context) {
    const { path, offset, limit } = input;
    
    // 安全检查
    if (!path.startsWith(context.workingDirectory)) {
      throw new Error('权限不足：无法访问工作目录外的文件');
    }
    
    // 模拟文件读取
    return {
      content: [`文件内容: ${path}`],
      totalLines: 1,
      path,
    };
  }
};

// 写入文件工具
export const writeFileTool: Tool<{ path: string; content: string }, { success: boolean; path: string }> = {
  name: 'write_file',
  description: '写入文件内容',
  schema: z.object({
    path: z.string().describe('文件绝对路径'),
    content: z.string().describe('文件内容'),
  }),
  permissions: [
    { type: 'file_write', pattern: '**/*' }
  ],
  
  async execute(input, context) {
    const { path, content } = input;
    
    // 安全检查
    if (!path.startsWith(context.workingDirectory)) {
      throw new Error('权限不足：无法写入工作目录外的文件');
    }
    
    // 模拟文件写入
    return {
      success: true,
      path,
    };
  }
};

// 执行bash命令工具
export const runBashTool: Tool<{ command: string }, { output: string; exitCode: number }> = {
  name: 'run_bash',
  description: '执行bash命令',
  schema: z.object({
    command: z.string().describe('要执行的命令'),
  }),
  permissions: [
    { type: 'exec', pattern: '**' }
  ],
  
  async execute(input, context) {
    const { command } = input;
    
    // 安全检查：禁止危险命令
    const dangerousCommands = ['rm -rf', 'format', 'shutdown'];
    if (dangerousCommands.some(cmd => command.includes(cmd))) {
      throw new Error('禁止执行危险命令');
    }
    
    // 模拟命令执行
    return {
      output: `执行命令: ${command}\n模拟输出`,
      exitCode: 0,
    };
  }
};

// 网络搜索工具
export const searchWebTool: Tool<{ query: string }, { results: { title: string; url: string; snippet: string }[] }> = {
  name: 'search_web',
  description: '搜索网络信息',
  schema: z.object({
    query: z.string().describe('搜索关键词'),
  }),
  permissions: [
    { type: 'network', pattern: '**' }
  ],
  
  async execute(input) {
    const { query } = input;
    
    // 模拟搜索结果
    return {
      results: [
        {
          title: `关于 ${query} 的搜索结果`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
          snippet: `这是关于 ${query} 的搜索结果摘要`,
        },
      ],
    };
  }
};