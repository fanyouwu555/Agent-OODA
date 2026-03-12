import { z } from 'zod';
import { Tool } from '@ooda-agent/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { validatePath, validatePathForWrite } from './utils/path-validator';

const ALLOWED_COMMANDS = [
  'ls', 'cat', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr',
  'grep', 'find', 'xargs', 'echo', 'printf', 'pwd', 'whoami', 'which',
  'git', 'git-status', 'git-log', 'git-diff', 'git-branch',
  'npm', 'npx', 'yarn', 'pnpm', 'node',
  'mkdir', 'touch', 'cp', 'mv', 'chmod',
  'curl', 'wget',
];

const DANGEROUS_PATTERNS = [
  /\brm\s+-rf\s+\//i,
  /\brm\s+-rf\s+\*/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\binit\s+0\b/i,
  /\b:\(\)\s*\{\s*:\|:&\s*\}\s*;:/i,
  /\>\s*\/dev\//i,
  /\$\(/,
  /`/,
  /\|\|/,
  /&&/,
  /;/,
  /\|/,
  /\bexport\b/i,
  /\beval\b/i,
  /\bexec\b/i,
  /\bsource\b/i,
  /\b\.\s+/,
];

function parseCommand(input: string): { command: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  
  const parts = trimmed.split(/\s+/);
  const command = parts[0];
  
  return { command, args: parts.slice(1) };
}

function validateCommand(input: string): { command: string; args: string[] } {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(input)) {
      throw new Error(`检测到危险命令模式，禁止执行`);
    }
  }
  
  const parsed = parseCommand(input);
  if (!parsed) {
    throw new Error(`无法解析命令: ${input}`);
  }
  
  const baseCommand = parsed.command;
  if (!ALLOWED_COMMANDS.includes(baseCommand)) {
    throw new Error(`命令不允许: ${baseCommand}。允许的命令: ${ALLOWED_COMMANDS.slice(0, 10).join(', ')}...`);
  }
  
  return parsed;
}

export const readFileTool: Tool<{ path: string; offset?: number; limit?: number; encoding?: string }, { content: string; lines: string[]; totalLines: number; path: string }> = {
  name: 'read_file',
  description: '读取文件内容，支持分页读取',
  schema: z.object({
    path: z.string().describe('文件绝对路径'),
    offset: z.number().optional().describe('起始行号（从1开始）'),
    limit: z.number().optional().describe('读取行数'),
    encoding: z.enum(['utf-8', 'binary']).optional().describe('文件编码'),
  }),
  permissions: [
    { type: 'file_read', pattern: '**/*' }
  ],
  
  async execute(input, context) {
    const filePath = await validatePath(input.path, context.workingDirectory);
    
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`路径不是文件: ${filePath}`);
      }
      
      const encoding = input.encoding || 'utf-8';
      const content = await fs.readFile(filePath, encoding as BufferEncoding);
      
      if (encoding === 'binary') {
        return {
          content: `[二进制文件，大小: ${stats.size} 字节]`,
          lines: [],
          totalLines: 0,
          path: filePath,
        };
      }
      
      const allLines = content.split('\n');
      const totalLines = allLines.length;
      
      const offset = input.offset ? Math.max(1, input.offset) - 1 : 0;
      const limit = input.limit || allLines.length;
      
      const lines = allLines.slice(offset, offset + limit);
      
      return {
        content: lines.join('\n'),
        lines,
        totalLines,
        path: filePath,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`文件不存在: ${filePath}`);
      }
      throw error;
    }
  }
};

export const writeFileTool: Tool<{ path: string; content: string; mode?: 'write' | 'append'; createDirs?: boolean }, { success: boolean; path: string; bytesWritten: number }> = {
  name: 'write_file',
  description: '写入文件内容，支持创建目录和追加模式',
  schema: z.object({
    path: z.string().describe('文件绝对路径'),
    content: z.string().describe('要写入的内容'),
    mode: z.enum(['write', 'append']).optional().describe('写入模式'),
    createDirs: z.boolean().optional().describe('是否自动创建目录'),
  }),
  permissions: [
    { type: 'file_write', pattern: '**/*' }
  ],
  
  async execute(input, context) {
    const filePath = await validatePathForWrite(input.path, context.workingDirectory);
    
    try {
      if (input.createDirs) {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
      }
      
      const flag = input.mode === 'append' ? 'a' : 'w';
      await fs.writeFile(filePath, input.content, { flag, encoding: 'utf-8' });
      
      return {
        success: true,
        path: filePath,
        bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
      };
    } catch (error) {
      throw new Error(`写入文件失败: ${(error as Error).message}`);
    }
  }
};

export const listDirectoryTool: Tool<{ path: string; recursive?: boolean }, { entries: Array<{ name: string; type: 'file' | 'directory'; size?: number; modified?: number }>; path: string }> = {
  name: 'list_directory',
  description: '列出目录内容',
  schema: z.object({
    path: z.string().describe('目录路径'),
    recursive: z.boolean().optional().describe('是否递归列出'),
  }),
  permissions: [
    { type: 'file_read', pattern: '**/*' }
  ],
  
  async execute(input, context) {
    const dirPath = await validatePath(input.path, context.workingDirectory);
    
    try {
      const entries: Array<{ name: string; type: 'file' | 'directory'; size?: number; modified?: number }> = [];
      
      const listDir = async (dir: string, base: string) => {
        const items = await fs.readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          const relativePath = path.relative(base, fullPath);
          
          if (item.isDirectory()) {
            entries.push({
              name: relativePath,
              type: 'directory',
            });
            
            if (input.recursive) {
              await listDir(fullPath, base);
            }
          } else if (item.isFile()) {
            const stats = await fs.stat(fullPath);
            entries.push({
              name: relativePath,
              type: 'file',
              size: stats.size,
              modified: stats.mtimeMs,
            });
          }
        }
      };
      
      await listDir(dirPath, dirPath);
      
      return { entries, path: dirPath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`目录不存在: ${dirPath}`);
      }
      throw error;
    }
  }
};

export const deleteFileTool: Tool<{ path: string; recursive?: boolean }, { success: boolean; path: string }> = {
  name: 'delete_file',
  description: '删除文件或目录',
  schema: z.object({
    path: z.string().describe('要删除的路径'),
    recursive: z.boolean().optional().describe('是否递归删除目录'),
  }),
  permissions: [
    { type: 'file_write', pattern: '**/*' }
  ],
  
  async execute(input, context) {
    const filePath = await validatePath(input.path, context.workingDirectory);
    
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        if (input.recursive) {
          await fs.rm(filePath, { recursive: true });
        } else {
          await fs.rmdir(filePath);
        }
      } else {
        await fs.unlink(filePath);
      }
      
      return { success: true, path: filePath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`文件或目录不存在: ${filePath}`);
      }
      throw error;
    }
  }
};

export const runBashTool: Tool<{ command: string; timeout?: number; cwd?: string }, { stdout: string; stderr: string; exitCode: number; executionTime: number }> = {
  name: 'run_bash',
  description: '执行bash命令',
  schema: z.object({
    command: z.string().describe('要执行的命令'),
    timeout: z.number().optional().describe('超时时间（毫秒）'),
    cwd: z.string().optional().describe('工作目录'),
  }),
  permissions: [
    { type: 'exec', pattern: '**' }
  ],
  
  async execute(input, context) {
    const { command, args } = validateCommand(input.command);
    
    const cwd = input.cwd 
      ? path.resolve(context.workingDirectory, input.cwd)
      : context.workingDirectory;
    
    if (!cwd.startsWith(context.workingDirectory)) {
      throw new Error(`权限不足：无法在工作目录外执行命令。路径: ${cwd}`);
    }
    
    const timeout = input.timeout || context.maxExecutionTime || 30000;
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd,
        shell: false,
        timeout,
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
          executionTime: Date.now() - startTime,
        });
      });
      
      proc.on('error', (error) => {
        reject(new Error(`命令执行失败: ${error.message}`));
      });
    });
  }
};

export const grepTool: Tool<{ pattern: string; path: string; recursive?: boolean; ignoreCase?: boolean }, { matches: Array<{ file: string; line: number; content: string }>; count: number }> = {
  name: 'grep',
  description: '在文件中搜索匹配的文本',
  schema: z.object({
    pattern: z.string().describe('搜索模式（正则表达式）'),
    path: z.string().describe('搜索路径'),
    recursive: z.boolean().optional().describe('是否递归搜索'),
    ignoreCase: z.boolean().optional().describe('是否忽略大小写'),
  }),
  permissions: [
    { type: 'file_read', pattern: '**/*' }
  ],
  
  async execute(input, context) {
    const searchPath = path.resolve(context.workingDirectory, input.path);
    
    if (!searchPath.startsWith(context.workingDirectory)) {
      throw new Error(`权限不足：无法访问工作目录外的文件。路径: ${searchPath}`);
    }
    
    const matches: Array<{ file: string; line: number; content: string }> = [];
    const regex = new RegExp(input.pattern, input.ignoreCase ? 'gi' : 'g');
    
    const searchFile = async (filePath: string) => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            matches.push({
              file: path.relative(context.workingDirectory, filePath),
              line: index + 1,
              content: line.trim().slice(0, 200),
            });
          }
          regex.lastIndex = 0;
        });
      } catch {
        // Skip files that can't be read
      }
    };
    
    const searchDir = async (dir: string) => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        
        if (item.isDirectory() && input.recursive) {
          await searchDir(fullPath);
        } else if (item.isFile()) {
          await searchFile(fullPath);
        }
      }
    };
    
    try {
      const stats = await fs.stat(searchPath);
      
      if (stats.isDirectory()) {
        await searchDir(searchPath);
      } else {
        await searchFile(searchPath);
      }
      
      return { matches, count: matches.length };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`路径不存在: ${searchPath}`);
      }
      throw error;
    }
  }
};

export const globTool: Tool<{ pattern: string; path?: string }, { files: string[]; count: number }> = {
  name: 'glob',
  description: '使用glob模式匹配文件',
  schema: z.object({
    pattern: z.string().describe('glob模式，如 **/*.ts'),
    path: z.string().optional().describe('搜索路径，默认为工作目录'),
  }),
  permissions: [
    { type: 'file_read', pattern: '**/*' }
  ],
  
  async execute(input, context) {
    const searchPath = input.path 
      ? path.resolve(context.workingDirectory, input.path)
      : context.workingDirectory;
    
    if (!searchPath.startsWith(context.workingDirectory)) {
      throw new Error(`权限不足：无法访问工作目录外的路径。路径: ${searchPath}`);
    }
    
    const files: string[] = [];
    const pattern = input.pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${pattern}$`);
    
    const scanDir = async (dir: string) => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        const relativePath = path.relative(searchPath, fullPath);
        
        if (item.isDirectory()) {
          await scanDir(fullPath);
        } else if (item.isFile() && regex.test(relativePath)) {
          files.push(relativePath);
        }
      }
    };
    
    try {
      await scanDir(searchPath);
      return { files, count: files.length };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`路径不存在: ${searchPath}`);
      }
      throw error;
    }
  }
};

export const getTimeTool: Tool<{}, { 
  iso: string; 
  timestamp: number; 
  date: string; 
  time: string; 
  weekday: string;
  timezone: string;
}> = {
  name: 'get_time',
  description: '获取当前日期和时间',
  schema: z.object({}),
  permissions: [],
  
  async execute() {
    const now = new Date();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    
    return {
      iso: now.toISOString(),
      timestamp: now.getTime(),
      date: now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      weekday: weekdays[now.getDay()],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }
};
