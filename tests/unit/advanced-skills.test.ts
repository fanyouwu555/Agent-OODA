// tests/unit/advanced-skills.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  DataAnalysisSkill, 
  ImageProcessingSkill, 
  PDFProcessingSkill, 
  CodeAnalysisSkill, 
  APITestSkill, 
  DatabaseQuerySkill 
} from '../../packages/tools/src/skills/advanced-skills';

describe('Advanced Skills Tests', () => {
  const mockContext = {
    workingDirectory: '/test/workspace',
    sessionId: 'test-session',
    maxExecutionTime: 30000,
    resources: {
      memory: 1024 * 1024 * 1024,
      cpu: 1,
    },
  };

  describe('DataAnalysisSkill', () => {
    let skill: DataAnalysisSkill;

    beforeEach(() => {
      skill = new DataAnalysisSkill();
    });

    it('should generate summary analysis', async () => {
      const result = await skill.execute({
        data: [1, 2, 3, 4, 5],
        analysisType: 'summary',
      }, mockContext);

      expect(result.success).toBeUndefined();
      expect(result.count).toBe(5);
      expect(result.summary).toBeDefined();
    });

    it('should analyze trend', async () => {
      const result = await skill.execute({
        data: [1, 2, 3, 4, 5],
        analysisType: 'trend',
      }, mockContext);

      expect(result.trend).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should analyze correlation', async () => {
      const result = await skill.execute({
        data: [1, 2, 3, 4, 5],
        analysisType: 'correlation',
      }, mockContext);

      expect(result.correlation).toBeDefined();
      expect(result.significance).toBeDefined();
    });
  });

  describe('ImageProcessingSkill', () => {
    let skill: ImageProcessingSkill;

    beforeEach(() => {
      skill = new ImageProcessingSkill();
    });

    it('should process image with resize operation', async () => {
      const result = await skill.execute({
        imagePath: '/test/workspace/test.jpg',
        operation: 'resize',
        params: { width: 100, height: 100 },
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.operation).toBe('resize');
    });

    it('should reject files outside working directory', async () => {
      await expect(skill.execute({
        imagePath: '/outside/test.jpg',
        operation: 'resize',
      }, mockContext)).rejects.toThrow('权限不足');
    });
  });

  describe('PDFProcessingSkill', () => {
    let skill: PDFProcessingSkill;

    beforeEach(() => {
      skill = new PDFProcessingSkill();
    });

    it('should extract text from PDF', async () => {
      const result = await skill.execute({
        pdfPath: '/test/workspace/test.pdf',
        operation: 'extract_text',
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.text).toBeDefined();
    });

    it('should merge PDFs', async () => {
      const result = await skill.execute({
        pdfPath: '/test/workspace/test.pdf',
        operation: 'merge',
        params: { files: ['file1.pdf', 'file2.pdf'] },
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.outputPath).toBeDefined();
    });

    it('should split PDF', async () => {
      const result = await skill.execute({
        pdfPath: '/test/workspace/test.pdf',
        operation: 'split',
        params: { page: 5 },
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.outputPaths).toHaveLength(2);
    });
  });

  describe('CodeAnalysisSkill', () => {
    let skill: CodeAnalysisSkill;

    beforeEach(() => {
      skill = new CodeAnalysisSkill();
    });

    it('should analyze code quality', async () => {
      const result = await skill.execute({
        codePath: '/test/workspace/src/index.ts',
        language: 'typescript',
        analysisType: 'quality',
      }, mockContext);

      expect(result.score).toBeDefined();
      expect(result.issues).toBeDefined();
    });

    it('should analyze security vulnerabilities', async () => {
      const result = await skill.execute({
        codePath: '/test/workspace/src/index.ts',
        language: 'typescript',
        analysisType: 'security',
      }, mockContext);

      expect(result.vulnerabilities).toBeDefined();
    });

    it('should analyze code complexity', async () => {
      const result = await skill.execute({
        codePath: '/test/workspace/src/index.ts',
        language: 'typescript',
        analysisType: 'complexity',
      }, mockContext);

      expect(result.cyclomaticComplexity).toBeDefined();
      expect(result.maintainabilityIndex).toBeDefined();
    });
  });

  describe('APITestSkill', () => {
    let skill: APITestSkill;

    beforeEach(() => {
      skill = new APITestSkill();
    });

    it('should test GET API endpoint', async () => {
      const result = await skill.execute({
        url: 'https://api.example.com/users',
        method: 'GET',
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('should test POST API endpoint with body', async () => {
      const result = await skill.execute({
        url: 'https://api.example.com/users',
        method: 'POST',
        body: { name: 'Test User' },
        expectedStatus: 201,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(201);
    });
  });

  describe('DatabaseQuerySkill', () => {
    let skill: DatabaseQuerySkill;

    beforeEach(() => {
      skill = new DatabaseQuerySkill();
    });

    it('should execute SELECT query', async () => {
      const result = await skill.execute({
        query: 'SELECT * FROM users WHERE id = ?',
        database: 'test_db',
        params: [1],
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.rows).toBeDefined();
    });

    it('should reject dangerous DROP query', async () => {
      await expect(skill.execute({
        query: 'DROP TABLE users',
        database: 'test_db',
      }, mockContext)).rejects.toThrow('禁止执行危险操作');
    });

    it('should reject dangerous DELETE query', async () => {
      await expect(skill.execute({
        query: 'DELETE FROM users',
        database: 'test_db',
      }, mockContext)).rejects.toThrow('禁止执行危险操作');
    });
  });
});
