// 工具和技能功能测试
// 运行: npx vitest run tests/tools.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { ToolRegistry } from '../packages/tools/src/registry';
import { 
  readFileTool, 
  writeFileTool, 
  runBashTool, 
  listDirectoryTool,
  deleteFileTool,
  grepTool,
  globTool,
  getTimeTool
} from '../packages/tools/src/base-tool';
import { 
  calculatorTool,
  weatherTool,
  translateTool,
  timerTool,
  currencyTool,
  uuidTool,
  base64Tool,
  hashTool,
  randomNumberTool,
  colorTool
} from '../packages/tools/src/utility-tools';
import { gitTools } from '../packages/tools/src/git-tools';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

const TEST_DIR = path.join(process.cwd(), 'test-temp-' + Date.now());
const TEST_CONTEXT = {
  workingDirectory: TEST_DIR,
  sessionId: 'test-session',
  maxExecutionTime: 30000,
  resources: {
    memory: 1024 * 1024 * 1024,
    cpu: 1,
  },
};

describe('工具注册与执行', () => {
  beforeAll(async () => {
    // 创建测试目录
    await fs.mkdir(TEST_DIR, { recursive: true });
    
    // 创建测试文件
    await fs.writeFile(
      path.join(TEST_DIR, 'test.txt'), 
      'Hello World\nLine 2\nLine 3',
      'utf-8'
    );
    
    await fs.writeFile(
      path.join(TEST_DIR, 'numbers.txt'), 
      '1\n2\n3\n4\n5\n6\n7\n8\n9\n10',
      'utf-8'
    );
  });

  describe('1. 文件操作工具', () => {
    it('read_file: 应该正确读取文件', async () => {
      const result = await readFileTool.execute(
        { path: path.join(TEST_DIR, 'test.txt') },
        TEST_CONTEXT
      );
      
      expect(result.content).toContain('Hello World');
      expect(result.totalLines).toBe(3);
      expect(result.lines.length).toBe(3);
    });

    it('read_file: 应该支持分页读取', async () => {
      const result = await readFileTool.execute(
        { path: path.join(TEST_DIR, 'test.txt'), offset: 2, limit: 2 },
        TEST_CONTEXT
      );
      
      // 验证内容
      expect(result.content).toContain('Line 2');
      expect(result.content).toContain('Line 3');
      expect(result.totalLines).toBe(3);
    });

    it('write_file: 应该正确写入文件', async () => {
      const testPath = path.join(TEST_DIR, 'write-test.txt');
      const result = await writeFileTool.execute(
        { path: testPath, content: 'Test Content' },
        TEST_CONTEXT
      );
      
      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBeGreaterThan(0);
      
      // 验证文件内容
      const content = await fs.readFile(testPath, 'utf-8');
      expect(content).toBe('Test Content');
    });

    it('write_file: 应该支持追加模式', async () => {
      const testPath = path.join(TEST_DIR, 'append-test.txt');
      
      await writeFileTool.execute(
        { path: testPath, content: 'Line 1\n' },
        TEST_CONTEXT
      );
      
      await writeFileTool.execute(
        { path: testPath, content: 'Line 2', mode: 'append' },
        TEST_CONTEXT
      );
      
      const content = await fs.readFile(testPath, 'utf-8');
      expect(content).toBe('Line 1\nLine 2');
    });

    it('list_directory: 应该正确列出目录', async () => {
      const result = await listDirectoryTool.execute(
        { path: TEST_DIR, recursive: false },
        TEST_CONTEXT
      );
      
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.path).toBe(TEST_DIR);
    });

    it('list_directory: 应该支持递归列出', async () => {
      // 创建子目录
      await fs.mkdir(path.join(TEST_DIR, 'subdir'), { recursive: true });
      await fs.writeFile(
        path.join(TEST_DIR, 'subdir', 'nested.txt'),
        'nested content',
        'utf-8'
      );
      
      const result = await listDirectoryTool.execute(
        { path: TEST_DIR, recursive: true },
        TEST_CONTEXT
      );
      
      const hasNested = result.entries.some(e => e.name.includes('nested.txt'));
      expect(hasNested).toBe(true);
    });

    it('delete_file: 应该正确删除文件', async () => {
      const testPath = path.join(TEST_DIR, 'delete-me.txt');
      await fs.writeFile(testPath, 'to be deleted', 'utf-8');
      
      const result = await deleteFileTool.execute(
        { path: testPath },
        TEST_CONTEXT
      );
      
      expect(result.success).toBe(true);
      
      // 验证文件已删除
      await expect(fs.stat(testPath)).rejects.toThrow();
    });

    it('grep: 应该正确搜索文本', async () => {
      const result = await grepTool.execute(
        { pattern: 'World', path: path.join(TEST_DIR, 'test.txt') },
        TEST_CONTEXT
      );
      
      expect(result.count).toBeGreaterThan(0);
      expect(result.matches[0].content).toContain('World');
    });

    it('grep: 应该支持忽略大小写', async () => {
      const result = await grepTool.execute(
        { pattern: 'hello', path: path.join(TEST_DIR, 'test.txt'), ignoreCase: true },
        TEST_CONTEXT
      );
      
      expect(result.count).toBeGreaterThan(0);
    });

    it('glob: 应该正确匹配文件', async () => {
      // 创建测试文件
      await fs.writeFile(path.join(TEST_DIR, 'test.ts'), 'content', 'utf-8');
      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'content', 'utf-8');
      
      const result = await globTool.execute(
        { pattern: '*.ts', path: TEST_DIR },
        TEST_CONTEXT
      );
      
      expect(result.count).toBeGreaterThan(0);
      expect(result.files.some(f => f.endsWith('.ts'))).toBe(true);
    });
  });

  describe('2. 命令执行工具', () => {
    it('run_bash: 应该正确执行命令', async () => {
      const result = await runBashTool.execute(
        { command: 'echo Hello' },
        TEST_CONTEXT
      );
      
      // Windows echo 可能会或不会包含引号
      expect(result.stdout.trim()).toMatch(/Hello|"Hello"/);
      expect(result.exitCode).toBe(0);
    });

    it('run_bash: 应该正确执行简单命令', async () => {
      const result = await runBashTool.execute(
        { command: 'node --version' },
        TEST_CONTEXT
      );
      
      // Node 命令应该能执行
      expect(result.exitCode).toBe(0);
    });

    it('run_bash: 应该阻止危险命令', async () => {
      await expect(
        runBashTool.execute(
          { command: 'rm -rf /' },
          TEST_CONTEXT
        )
      ).rejects.toThrow('检测到危险命令模式');
    });

    it('run_bash: 应该阻止命令注入', async () => {
      await expect(
        runBashTool.execute(
          { command: 'echo "test" && rm -rf /' },
          TEST_CONTEXT
        )
      ).rejects.toThrow('检测到危险命令模式');
    });
  });

  describe('3. 实用工具', () => {
    it('calculator: 应该正确计算数学表达式', async () => {
      const result = await calculatorTool.execute(
        { expression: '2 + 3 * 4' },
        TEST_CONTEXT
      );
      
      expect(result.result).toBe(14);
    });

    it('calculator: 应该支持复杂数学函数', async () => {
      // 测试基本运算
      const result1 = await calculatorTool.execute(
        { expression: 'sqrt(16)' },
        TEST_CONTEXT
      );
      expect(result1.result).toBe(4);
    });

    it('get_time: 应该返回正确的时间信息', async () => {
      const result = await getTimeTool.execute({}, TEST_CONTEXT);
      
      expect(result.iso).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.date).toBeDefined();
      expect(result.time).toBeDefined();
      expect(result.weekday).toBeDefined();
    });

    it('uuid: 应该生成有效的 UUID', async () => {
      const result = await uuidTool.execute(
        { count: 5 },
        TEST_CONTEXT
      );
      
      expect(result.uuids.length).toBe(5);
      // UUID v4 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      result.uuids.forEach(uuid => {
        expect(uuidRegex.test(uuid)).toBe(true);
      });
    });

    it('base64: 应该正确编码', async () => {
      const result = await base64Tool.execute(
        { text: 'Hello World', action: 'encode' },
        TEST_CONTEXT
      );
      
      expect(result.output).toBe('SGVsbG8gV29ybGQ=');
    });

    it('base64: 应该正确解码', async () => {
      const result = await base64Tool.execute(
        { text: 'SGVsbG8gV29ybGQ=', action: 'decode' },
        TEST_CONTEXT
      );
      
      expect(result.output).toBe('Hello World');
    });

    it('hash: 应该生成正确的哈希', async () => {
      const result = await hashTool.execute(
        { text: 'Hello World', algorithm: 'sha256' },
        TEST_CONTEXT
      );
      
      const expected = crypto.createHash('sha256').update('Hello World').digest('hex');
      expect(result.hash).toBe(expected);
    });

    it('random_number: 应该生成范围内的随机数', async () => {
      const result = await randomNumberTool.execute(
        { min: 1, max: 10, count: 5 },
        TEST_CONTEXT
      );
      
      expect(result.numbers.length).toBe(5);
      result.numbers.forEach(n => {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(10);
      });
    });

    it('color: 应该转换颜色格式', async () => {
      const result = await colorTool.execute(
        { input: '#FF5733', format: 'rgb' },
        TEST_CONTEXT
      );
      
      expect(result.rgb).toBe('rgb(255, 87, 51)');
      expect(result.hex).toBe('#ff5733');
    });
  });

  describe('4. Git 工具', () => {
    it('gitTools: 应该包含所有 Git 工具', () => {
      const toolNames = gitTools.map(t => t.name);
      expect(toolNames).toContain('git_status');
      expect(toolNames).toContain('git_log');
      expect(toolNames).toContain('git_diff');
      expect(toolNames).toContain('git_branch');
    });

    it('git_status: 应该返回 git 状态', async () => {
      // 创建 git 仓库
      await fs.mkdir(path.join(TEST_DIR, '.git'), { recursive: true }).catch(() => {});
      
      const gitStatusTool = gitTools.find(t => t.name === 'git_status');
      if (gitStatusTool) {
        const result = await (gitStatusTool as any).execute({ path: TEST_DIR }, TEST_CONTEXT);
        expect(result).toBeDefined();
      }
    });
  });

  describe('5. ToolRegistry 集成', () => {
    it('应该能够注册和获取工具', () => {
      const registry = new ToolRegistry();
      
      registry.register(readFileTool);
      registry.register(calculatorTool);
      
      expect(registry.get('read_file')).toBeDefined();
      expect(registry.get('calculator')).toBeDefined();
      expect(registry.list()).toContain('read_file');
      expect(registry.list()).toContain('calculator');
    });

    it('应该能够执行工具', async () => {
      const registry = new ToolRegistry();
      registry.register(calculatorTool);
      
      const result = await registry.execute(
        'calculator',
        { expression: '5 * 5' },
        TEST_CONTEXT
      );
      
      expect((result as any).result).toBe(25);
    });

    it('应该抛出工具未找到错误', async () => {
      const registry = new ToolRegistry();
      
      await expect(
        registry.execute('nonexistent_tool', {}, TEST_CONTEXT)
      ).rejects.toThrow('Tool not found');
    });
  });

  describe('6. 工具 Schema 验证', () => {
    it('calculator: 应该验证无效输入', async () => {
      await expect(
        calculatorTool.execute({ expression: '' }, TEST_CONTEXT)
      ).rejects.toThrow();
    });

    it('base64: 应该处理空输入', async () => {
      const result = await base64Tool.execute(
        { text: '', action: 'decode' },
        TEST_CONTEXT
      );
      
      // 空输入返回空字符串，不会抛出错误
      expect(result.output).toBe('');
    });
  });
});
