import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  gitStatusTool,
  gitLogTool,
  gitBranchTool,
  gitDiffTool,
  gitCloneTool,
  gitCommitTool,
  gitRemoteTool,
  gitSyncTool,
} from '../git-tools';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  access: vi.fn(),
}));

import { promisify } from 'util';
import * as fs from 'fs/promises';

const mockExec = vi.fn();
vi.mocked(promisify).mockReturnValue(mockExec);

describe('Git Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('gitStatusTool', () => {
    it('should return error for non-git directory', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

      const result = await gitStatusTool.execute({ path: '/not/git' });

      expect(result.data).toContain('错误');
      expect(result.data).toContain('不是 Git 仓库');
    });

    it('should return git status for valid repo', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'On branch main\nnothing to commit', stderr: '' });

      const result = await gitStatusTool.execute({ path: '/valid/repo' });

      expect(result.data).toContain('On branch main');
    });

    it('should support short format', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'M file.txt', stderr: '' });

      const result = await gitStatusTool.execute({ path: '/valid/repo', short: true });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('-s'), expect.any(Object));
    });
  });

  describe('gitLogTool', () => {
    it('should return log for valid repo', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ 
        stdout: 'commit abc123\nAuthor: Test\nDate: Mon Jan 1\n\nTest commit', 
        stderr: '' 
      });

      const result = await gitLogTool.execute({ path: '/valid/repo', maxCount: 5 });

      expect(result.data).toContain('commit');
    });

    it('should support different formats', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'abc123 Test commit', stderr: '' });

      const result = await gitLogTool.execute({ 
        path: '/valid/repo', 
        format: 'oneline',
        maxCount: 10 
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('--oneline'), expect.any(Object));
    });

    it('should filter by author', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'commit abc', stderr: '' });

      await gitLogTool.execute({ 
        path: '/valid/repo', 
        author: 'John Doe',
        maxCount: 10 
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('--author'), expect.any(Object));
    });
  });

  describe('gitBranchTool', () => {
    it('should list branches', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: '* main\n  develop\n  feature', stderr: '' });

      const result = await gitBranchTool.execute({ 
        path: '/valid/repo', 
        action: 'list' 
      });

      expect(result.data).toContain('main');
    });

    it('should create branch', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: '', stderr: '' });

      const result = await gitBranchTool.execute({ 
        path: '/valid/repo', 
        action: 'create',
        branchName: 'new-feature'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('branch "new-feature"'), expect.any(Object));
    });

    it('should require branchName for create action', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await gitBranchTool.execute({ 
        path: '/valid/repo', 
        action: 'create' 
      });

      expect(result.data).toContain('错误');
      expect(result.data).toContain('branchName');
    });

    it('should delete branch', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'Deleted branch old-feature', stderr: '' });

      const result = await gitBranchTool.execute({ 
        path: '/valid/repo', 
        action: 'delete',
        branchName: 'old-feature'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('branch -d'), expect.any(Object));
    });

    it('should switch branch', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'Switched to branch develop', stderr: '' });

      const result = await gitBranchTool.execute({ 
        path: '/valid/repo', 
        action: 'switch',
        branchName: 'develop'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('checkout'), expect.any(Object));
    });
  });

  describe('gitDiffTool', () => {
    it('should show diff', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ 
        stdout: 'diff --git a/file.txt b/file.txt\n+new line', 
        stderr: '' 
      });

      const result = await gitDiffTool.execute({ path: '/valid/repo' });

      expect(result.data).toContain('diff');
    });

    it('should show staged diff', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'staged changes', stderr: '' });

      await gitDiffTool.execute({ path: '/valid/repo', staged: true });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('--staged'), expect.any(Object));
    });

    it('should show diff for specific file', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'file diff', stderr: '' });

      await gitDiffTool.execute({ path: '/valid/repo', file: 'test.txt' });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('test.txt'), expect.any(Object));
    });

    it('should show diff between commits', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'commit diff', stderr: '' });

      await gitDiffTool.execute({ 
        path: '/valid/repo', 
        commit1: 'abc123',
        commit2: 'def456'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('abc123'), expect.any(Object));
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('def456'), expect.any(Object));
    });
  });

  describe('gitCloneTool', () => {
    it('should clone repository', async () => {
      mockExec.mockResolvedValue({ stdout: 'Cloning into repo...', stderr: '' });

      const result = await gitCloneTool.execute({ 
        url: 'https://github.com/user/repo.git' 
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('git clone'), expect.any(Object));
      expect(result.data).toContain('Cloning');
    });

    it('should clone to specific path', async () => {
      mockExec.mockResolvedValue({ stdout: 'Cloned', stderr: '' });

      await gitCloneTool.execute({ 
        url: 'https://github.com/user/repo.git',
        path: '/custom/path'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('/custom/path'), expect.any(Object));
    });

    it('should clone specific branch', async () => {
      mockExec.mockResolvedValue({ stdout: 'Cloned', stderr: '' });

      await gitCloneTool.execute({ 
        url: 'https://github.com/user/repo.git',
        branch: 'develop'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('-b "develop"'), expect.any(Object));
    });

    it('should support shallow clone', async () => {
      mockExec.mockResolvedValue({ stdout: 'Cloned', stderr: '' });

      await gitCloneTool.execute({ 
        url: 'https://github.com/user/repo.git',
        depth: 1
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('--depth 1'), expect.any(Object));
    });
  });

  describe('gitCommitTool', () => {
    it('should commit all changes', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: '[main abc123] Test commit', stderr: '' });

      const result = await gitCommitTool.execute({ 
        path: '/valid/repo',
        message: 'Test commit'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('add -A'), expect.any(Object));
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('commit'), expect.any(Object));
    });

    it('should commit specific files', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'Committed', stderr: '' });

      await gitCommitTool.execute({ 
        path: '/valid/repo',
        message: 'Test commit',
        files: ['file1.txt', 'file2.txt']
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('add "file1.txt"'), expect.any(Object));
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('add "file2.txt"'), expect.any(Object));
    });

    it('should amend last commit', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'Amended', stderr: '' });

      await gitCommitTool.execute({ 
        path: '/valid/repo',
        message: 'Amended commit',
        amend: true
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('--amend'), expect.any(Object));
    });
  });

  describe('gitRemoteTool', () => {
    it('should list remotes', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ 
        stdout: 'origin  https://github.com/user/repo.git (fetch)\norigin  https://github.com/user/repo.git (push)', 
        stderr: '' 
      });

      const result = await gitRemoteTool.execute({ 
        path: '/valid/repo',
        action: 'list'
      });

      expect(result.data).toContain('origin');
    });

    it('should add remote', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: '', stderr: '' });

      await gitRemoteTool.execute({ 
        path: '/valid/repo',
        action: 'add',
        name: 'upstream',
        url: 'https://github.com/original/repo.git'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('remote add'), expect.any(Object));
    });

    it('should require name and url for add action', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await gitRemoteTool.execute({ 
        path: '/valid/repo',
        action: 'add'
      });

      expect(result.data).toContain('错误');
    });

    it('should remove remote', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: '', stderr: '' });

      await gitRemoteTool.execute({ 
        path: '/valid/repo',
        action: 'remove',
        name: 'upstream'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('remote remove'), expect.any(Object));
    });

    it('should set remote url', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: '', stderr: '' });

      await gitRemoteTool.execute({ 
        path: '/valid/repo',
        action: 'set-url',
        name: 'origin',
        url: 'https://new-url.com/repo.git'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('remote set-url'), expect.any(Object));
    });
  });

  describe('gitSyncTool', () => {
    it('should pull changes', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'Already up to date.', stderr: '' });

      const result = await gitSyncTool.execute({ 
        path: '/valid/repo',
        action: 'pull'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('git -C'), expect.any(Object));
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('pull'), expect.any(Object));
    });

    it('should push changes', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'Everything up-to-date', stderr: '' });

      await gitSyncTool.execute({ 
        path: '/valid/repo',
        action: 'push'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('push'), expect.any(Object));
    });

    it('should force push when specified', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'Forced update', stderr: '' });

      await gitSyncTool.execute({ 
        path: '/valid/repo',
        action: 'push',
        force: true
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('--force'), expect.any(Object));
    });

    it('should fetch changes', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'From origin', stderr: '' });

      await gitSyncTool.execute({ 
        path: '/valid/repo',
        action: 'fetch'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('fetch'), expect.any(Object));
    });

    it('should use custom remote and branch', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: 'Updated', stderr: '' });

      await gitSyncTool.execute({ 
        path: '/valid/repo',
        action: 'pull',
        remote: 'upstream',
        branch: 'main'
      });

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('upstream'), expect.any(Object));
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('main'), expect.any(Object));
    });
  });
});
