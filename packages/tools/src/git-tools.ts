import { z } from 'zod';
import { Tool } from '@ooda-agent/core';
import { spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(require('child_process').exec);

// 执行 Git 命令的辅助函数
async function executeGitCommand(command: string): Promise<string> {
  const { stdout, stderr } = await execAsync(command, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120000,
  });
  return stdout || stderr || '操作成功';
}

// 检查是否是 Git 仓库
async function checkGitRepo(repoPath: string): Promise<string | null> {
  const gitDir = path.resolve(repoPath);
  try {
    await fs.access(path.join(gitDir, '.git'));
    return gitDir;
  } catch {
    return null;
  }
}

// Git 状态工具
export const gitStatusTool: Tool<{ path: string; short?: boolean }, { data: string }> = {
  name: 'git_status',
  description: '查看 Git 仓库状态，包括修改、暂存、未跟踪的文件',
  schema: z.object({
    path: z.string().describe('Git 仓库路径'),
    short: z.boolean().optional().describe('简短格式'),
  }),
  permissions: [
    { type: 'file_read', pattern: '**/.git/**' }
  ],
  
  async execute({ path: repoPath, short = false }) {
    const gitDir = await checkGitRepo(repoPath);
    if (!gitDir) {
      return { data: `错误: 路径 "${repoPath}" 不是 Git 仓库` };
    }

    const flag = short ? '-s' : '';
    const result = await executeGitCommand(`git -C "${gitDir}" status ${flag}`);
    return { data: result };
  },
};

// Git 日志工具
export const gitLogTool: Tool<{ path: string; maxCount?: number; format?: 'oneline' | 'medium' | 'full'; author?: string; since?: string; file?: string }, { data: string }> = {
  name: 'git_log',
  description: '查看 Git 提交历史',
  schema: z.object({
    path: z.string().describe('Git 仓库路径'),
    maxCount: z.number().optional().describe('最大提交数，默认 10'),
    format: z.enum(['oneline', 'medium', 'full']).optional().describe('日志格式'),
    author: z.string().optional().describe('按作者过滤'),
    since: z.string().optional().describe('起始日期 (如: 2024-01-01)'),
    file: z.string().optional().describe('查看特定文件的日志'),
  }),
  permissions: [
    { type: 'file_read', pattern: '**/.git/**' }
  ],
  
  async execute({ path: repoPath, maxCount = 10, format = 'medium', author, since, file }) {
    const gitDir = await checkGitRepo(repoPath);
    if (!gitDir) {
      return { data: `错误: 路径 "${repoPath}" 不是 Git 仓库` };
    }

    let formatStr = '';
    switch (format) {
      case 'oneline':
        formatStr = '--oneline';
        break;
      case 'full':
        formatStr = '--format=fuller';
        break;
      default:
        formatStr = '';
    }

    const args = ['-C', gitDir, 'log', `-${maxCount}`, formatStr];
    if (author) args.push('--author', author);
    if (since) args.push('--since', since);
    if (file) args.push('--', file);

    const result = await executeGitCommand(`git ${args.map(a => `"${a}"`).join(' ')}`);
    return { data: result };
  },
};

// Git 分支工具
export const gitBranchTool: Tool<{ path: string; action: 'list' | 'create' | 'delete' | 'switch'; branchName?: string; remote?: boolean }, { data: string }> = {
  name: 'git_branch',
  description: '查看或管理 Git 分支',
  schema: z.object({
    path: z.string().describe('Git 仓库路径'),
    action: z.enum(['list', 'create', 'delete', 'switch']).describe('操作类型'),
    branchName: z.string().optional().describe('分支名称（创建/删除/切换时使用）'),
    remote: z.boolean().optional().describe('是否显示远程分支'),
  }),
  permissions: [
    { type: 'file_read', pattern: '**/.git/**' },
    { type: 'file_write', pattern: '**/.git/**' }
  ],
  
  async execute({ path: repoPath, action, branchName, remote = false }) {
    const gitDir = await checkGitRepo(repoPath);
    if (!gitDir) {
      return { data: `错误: 路径 "${repoPath}" 不是 Git 仓库` };
    }

    let command = '';
    switch (action) {
      case 'list':
        command = `git -C "${gitDir}" branch${remote ? ' -a' : ''}`;
        break;
      case 'create':
        if (!branchName) {
          return { data: '错误: 创建分支需要提供 branchName' };
        }
        command = `git -C "${gitDir}" branch "${branchName}"`;
        break;
      case 'delete':
        if (!branchName) {
          return { data: '错误: 删除分支需要提供 branchName' };
        }
        command = `git -C "${gitDir}" branch -d "${branchName}"`;
        break;
      case 'switch':
        if (!branchName) {
          return { data: '错误: 切换分支需要提供 branchName' };
        }
        command = `git -C "${gitDir}" checkout "${branchName}"`;
        break;
    }

    const result = await executeGitCommand(command);
    return { data: result };
  },
};

// Git Diff 工具
export const gitDiffTool: Tool<{ path: string; staged?: boolean; file?: string; commit1?: string; commit2?: string }, { data: string }> = {
  name: 'git_diff',
  description: '查看 Git 差异',
  schema: z.object({
    path: z.string().describe('Git 仓库路径'),
    staged: z.boolean().optional().describe('查看暂存区的差异'),
    file: z.string().optional().describe('查看特定文件的差异'),
    commit1: z.string().optional().describe('第一个 commit（比较两个 commit）'),
    commit2: z.string().optional().describe('第二个 commit（比较两个 commit）'),
  }),
  permissions: [
    { type: 'file_read', pattern: '**/.git/**' }
  ],
  
  async execute({ path: repoPath, staged = false, file, commit1, commit2 }) {
    const gitDir = await checkGitRepo(repoPath);
    if (!gitDir) {
      return { data: `错误: 路径 "${repoPath}" 不是 Git 仓库` };
    }

    let command = `git -C "${gitDir}" diff`;
    if (staged) command += ' --staged';
    if (commit1 && commit2) {
      command = `git -C "${gitDir}" diff "${commit1}" "${commit2}"`;
    } else if (commit1) {
      command = `git -C "${gitDir}" diff "${commit1}"`;
    }
    if (file) command += ` -- "${file}"`;

    const result = await executeGitCommand(command);
    return { data: result || '没有差异' };
  },
};

// Git Clone 工具
export const gitCloneTool: Tool<{ url: string; path?: string; branch?: string; depth?: number }, { data: string }> = {
  name: 'git_clone',
  description: '克隆 Git 仓库',
  schema: z.object({
    url: z.string().describe('仓库 URL'),
    path: z.string().optional().describe('本地路径（可选，默认使用仓库名）'),
    branch: z.string().optional().describe('指定分支'),
    depth: z.number().optional().describe('浅克隆深度'),
  }),
  permissions: [
    { type: 'file_write', pattern: '**/*' }
  ],
  
  async execute({ url, path: localPath, branch, depth }) {
    let command = `git clone`;
    if (branch) command += ` -b "${branch}"`;
    if (depth) command += ` --depth ${depth}`;
    command += ` "${url}"`;
    if (localPath) command += ` "${localPath}"`;

    const result = await executeGitCommand(command);
    return { data: result };
  },
};

// Git 添加/提交工具
export const gitCommitTool: Tool<{ path: string; message: string; files?: string[]; amend?: boolean }, { data: string }> = {
  name: 'git_commit',
  description: '添加文件到暂存区并提交',
  schema: z.object({
    path: z.string().describe('Git 仓库路径'),
    message: z.string().describe('提交信息'),
    files: z.array(z.string()).optional().describe('要添加的文件（默认全部）'),
    amend: z.boolean().optional().describe('修改最后一次提交'),
  }),
  permissions: [
    { type: 'file_write', pattern: '**/.git/**' }
  ],
  
  async execute({ path: repoPath, message, files, amend = false }) {
    const gitDir = await checkGitRepo(repoPath);
    if (!gitDir) {
      return { data: `错误: 路径 "${repoPath}" 不是 Git 仓库` };
    }

    // 添加文件
    if (files && files.length > 0) {
      for (const file of files) {
        await executeGitCommand(`git -C "${gitDir}" add "${file}"`);
      }
    } else {
      await executeGitCommand(`git -C "${gitDir}" add -A`);
    }

    // 提交
    let command = `git -C "${gitDir}" commit`;
    if (amend) {
      command += ' --amend --no-edit';
    } else {
      command += ` -m "${message}"`;
    }

    const result = await executeGitCommand(command);
    return { data: result };
  },
};

// Git 远程操作工具
export const gitRemoteTool: Tool<{ path: string; action: 'list' | 'add' | 'remove' | 'set-url'; name?: string; url?: string }, { data: string }> = {
  name: 'git_remote',
  description: '管理 Git 远程仓库',
  schema: z.object({
    path: z.string().describe('Git 仓库路径'),
    action: z.enum(['list', 'add', 'remove', 'set-url']).describe('操作类型'),
    name: z.string().optional().describe('远程仓库名称'),
    url: z.string().optional().describe('远程仓库 URL'),
  }),
  permissions: [
    { type: 'file_read', pattern: '**/.git/**' },
    { type: 'file_write', pattern: '**/.git/**' }
  ],
  
  async execute({ path: repoPath, action, name, url }) {
    const gitDir = await checkGitRepo(repoPath);
    if (!gitDir) {
      return { data: `错误: 路径 "${repoPath}" 不是 Git 仓库` };
    }

    let command = '';
    switch (action) {
      case 'list':
        command = `git -C "${gitDir}" remote -v`;
        break;
      case 'add':
        if (!name || !url) {
          return { data: '错误: 添加远程仓库需要提供 name 和 url' };
        }
        command = `git -C "${gitDir}" remote add "${name}" "${url}"`;
        break;
      case 'remove':
        if (!name) {
          return { data: '错误: 删除远程仓库需要提供 name' };
        }
        command = `git -C "${gitDir}" remote remove "${name}"`;
        break;
      case 'set-url':
        if (!name || !url) {
          return { data: '错误: 设置远程仓库 URL 需要提供 name 和 url' };
        }
        command = `git -C "${gitDir}" remote set-url "${name}" "${url}"`;
        break;
    }

    const result = await executeGitCommand(command);
    return { data: result };
  },
};

// Git Pull/Push 工具
export const gitSyncTool: Tool<{ path: string; action: 'pull' | 'push' | 'fetch'; remote?: string; branch?: string; force?: boolean }, { data: string }> = {
  name: 'git_sync',
  description: '从远程仓库拉取或推送代码',
  schema: z.object({
    path: z.string().describe('Git 仓库路径'),
    action: z.enum(['pull', 'push', 'fetch']).describe('操作类型'),
    remote: z.string().optional().describe('远程仓库名称（默认 origin）'),
    branch: z.string().optional().describe('分支名称'),
    force: z.boolean().optional().describe('强制推送（谨慎使用）'),
  }),
  permissions: [
    { type: 'file_write', pattern: '**/.git/**' }
  ],
  
  async execute({ path: repoPath, action, remote = 'origin', branch, force = false }) {
    const gitDir = await checkGitRepo(repoPath);
    if (!gitDir) {
      return { data: `错误: 路径 "${repoPath}" 不是 Git 仓库` };
    }

    let command = `git -C "${gitDir}" ${action}`;
    
    if (action === 'push' && force) {
      command += ' --force';
    }
    
    command += ` "${remote}"`;
    if (branch) command += ` "${branch}"`;

    const result = await executeGitCommand(command);
    return { data: result };
  },
};

// 导出所有 Git 工具
export const gitTools = [
  gitStatusTool,
  gitLogTool,
  gitBranchTool,
  gitDiffTool,
  gitCloneTool,
  gitCommitTool,
  gitRemoteTool,
  gitSyncTool,
];
