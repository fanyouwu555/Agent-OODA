// packages/tools/src/skills/base-skill.ts
import { z } from 'zod';
import { Skill, SkillContext, Permission } from '@ooda-agent/core';

// 基础技能类
export abstract class BaseSkill implements Skill {
  abstract name: string;
  abstract description: string;
  abstract category: string;
  abstract version: string;
  abstract dependencies: string[];
  abstract schema: z.ZodSchema;
  abstract permissions: Permission[];
  
  async initialize(): Promise<void> {
    // 基础初始化逻辑
    console.log(`Initializing skill: ${this.name}`);
  }
  
  async shutdown(): Promise<void> {
    // 基础关闭逻辑
    console.log(`Shutting down skill: ${this.name}`);
  }
  
  abstract execute(input: unknown, context: SkillContext): Promise<unknown>;
}

// 文件操作技能
export class FileSkill extends BaseSkill {
  name = 'file_skill';
  description = '文件操作技能';
  category = 'file';
  version = '1.0.0';
  dependencies: string[] = [];
  
  schema = z.object({
    action: z.enum(['read', 'write', 'list']),
    path: z.string().describe('文件路径'),
    content: z.string().optional().describe('文件内容'),
  });
  
  permissions: Permission[] = [
    { type: 'file_read', pattern: '**/*' },
    { type: 'file_write', pattern: '**/*' },
  ];
  
  async execute(input: any, context: SkillContext): Promise<unknown> {
    const { action, path, content } = input;
    
    switch (action) {
      case 'read':
        return this.readFile(path, context);
      case 'write':
        return this.writeFile(path, content, context);
      case 'list':
        return this.listFiles(path, context);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
  
  private async readFile(path: string, context: SkillContext): Promise<unknown> {
    // 安全检查
    if (!path.startsWith(context.workingDirectory)) {
      throw new Error('权限不足：无法访问工作目录外的文件');
    }
    
    // 模拟文件读取
    return {
      action: 'read',
      path,
      content: `文件内容: ${path}`,
      success: true,
    };
  }
  
  private async writeFile(path: string, content: string, context: SkillContext): Promise<unknown> {
    // 安全检查
    if (!path.startsWith(context.workingDirectory)) {
      throw new Error('权限不足：无法写入工作目录外的文件');
    }
    
    // 模拟文件写入
    return {
      action: 'write',
      path,
      success: true,
    };
  }
  
  private async listFiles(path: string, context: SkillContext): Promise<unknown> {
    // 安全检查
    if (!path.startsWith(context.workingDirectory)) {
      throw new Error('权限不足：无法访问工作目录外的文件');
    }
    
    // 模拟文件列表
    return {
      action: 'list',
      path,
      files: ['file1.txt', 'file2.txt', 'dir1'],
      success: true,
    };
  }
}

// 网络搜索技能
export class WebSkill extends BaseSkill {
  name = 'web_skill';
  description = '网络搜索技能';
  category = 'web';
  version = '1.0.0';
  dependencies: string[] = [];
  
  schema = z.object({
    action: z.enum(['search', 'fetch']),
    query: z.string().optional().describe('搜索关键词'),
    url: z.string().optional().describe('网页URL'),
  });
  
  permissions: Permission[] = [
    { type: 'network', pattern: '**' },
  ];
  
  async execute(input: any, context: SkillContext): Promise<unknown> {
    const { action, query, url } = input;
    
    switch (action) {
      case 'search':
        return this.searchWeb(query!, context);
      case 'fetch':
        return this.fetchWeb(url!, context);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
  
  private async searchWeb(query: string, context: SkillContext): Promise<unknown> {
    // 模拟搜索
    return {
      action: 'search',
      query,
      results: [
        {
          title: `关于 ${query} 的搜索结果`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
          snippet: `这是关于 ${query} 的搜索结果摘要`,
        },
      ],
      success: true,
    };
  }
  
  private async fetchWeb(url: string, context: SkillContext): Promise<unknown> {
    // 模拟网页抓取
    return {
      action: 'fetch',
      url,
      content: '网页内容',
      success: true,
    };
  }
}

// 代码执行技能
export class CodeSkill extends BaseSkill {
  name = 'code_skill';
  description = '代码执行技能';
  category = 'code';
  version = '1.0.0';
  dependencies: string[] = [];
  
  schema = z.object({
    language: z.enum(['javascript', 'python', 'bash']),
    code: z.string().describe('代码内容'),
    timeout: z.number().optional().default(30000).describe('执行超时时间'),
  });
  
  permissions: Permission[] = [
    { type: 'exec', pattern: '**' },
  ];
  
  async execute(input: any, context: SkillContext): Promise<unknown> {
    const { language, code, timeout } = input;
    
    // 安全检查
    const dangerousPatterns = ['rm -rf', 'format', 'shutdown'];
    if (dangerousPatterns.some(pattern => code.includes(pattern))) {
      throw new Error('禁止执行危险代码');
    }
    
    // 模拟代码执行
    return {
      language,
      code: code.substring(0, 100) + (code.length > 100 ? '...' : ''),
      output: `执行结果: ${language}代码执行成功`,
      success: true,
    };
  }
}