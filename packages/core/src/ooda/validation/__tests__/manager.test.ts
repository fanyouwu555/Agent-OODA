import { ValidationManager } from '../manager';
import { SchemaValidator } from '../validators';
import { z } from 'zod';

describe('ValidationManager', () => {
  describe('rule matching', () => {
    it('should match rule by exact tool name', () => {
      const manager = new ValidationManager();
      manager.addRule({
        id: 'test-rule',
        name: 'Test Rule',
        toolPattern: 'read_file',
        validator: 'rule',
        rule: () => true,
      });

      const rules = manager.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should match rule by array of tool names', () => {
      const manager = new ValidationManager();
      manager.addRule({
        id: 'search-rule',
        name: 'Search Rule',
        toolPattern: ['web_search', 'search_web', 'search'],
        validator: 'rule',
        rule: () => true,
      });

      const rules = manager.getRules();
      const searchRule = rules.find(r => r.id === 'search-rule');
      expect(searchRule).toBeDefined();
    });

    it('should match rule by regex pattern', () => {
      const manager = new ValidationManager();
      manager.addRule({
        id: 'file-rule',
        name: 'File Rule',
        toolPattern: /^file_/,
        validator: 'rule',
        rule: () => true,
      });

      const rules = manager.getRules();
      const fileRule = rules.find(r => r.id === 'file-rule');
      expect(fileRule).toBeDefined();
    });
  });

  describe('validation execution', () => {
    it('should skip validation for unknown tools', async () => {
      const manager = new ValidationManager();

      const result = await manager.validate(
        'unknown_tool',
        { data: 'test' },
        { userInput: 'test', toolName: 'unknown_tool', toolArgs: {}, timestamp: Date.now() }
      );

      expect(result.isValid).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('should execute rule validator', async () => {
      const manager = new ValidationManager();
      manager.addRule({
        id: 'pass-rule',
        name: 'Pass Rule',
        toolPattern: 'test_tool',
        validator: 'rule',
        rule: () => true,
      });

      const result = await manager.validate(
        'test_tool',
        { data: 'test' },
        { userInput: 'test', toolName: 'test_tool', toolArgs: {}, timestamp: Date.now() }
      );

      expect(result.isValid).toBe(true);
    });

    it('should fail rule validator when rule returns false', async () => {
      const manager = new ValidationManager();
      manager.addRule({
        id: 'fail-rule',
        name: 'Fail Rule',
        toolPattern: 'test_tool',
        validator: 'rule',
        rule: () => false,
      });

      const result = await manager.validate(
        'test_tool',
        { data: 'test' },
        { userInput: 'test', toolName: 'test_tool', toolArgs: {}, timestamp: Date.now() }
      );

      expect(result.isValid).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should execute schema validator', async () => {
      const manager = new ValidationManager();
      manager.addRule({
        id: 'schema-rule',
        name: 'Schema Rule',
        toolPattern: 'test_tool',
        validator: 'schema',
        schema: z.object({
          success: z.boolean(),
          data: z.string(),
        }),
      });

      const result = await manager.validate(
        'test_tool',
        { success: true, data: 'test' },
        { userInput: 'test', toolName: 'test_tool', toolArgs: {}, timestamp: Date.now() }
      );

      expect(result.isValid).toBe(true);
    });

    it('should fail schema validator for invalid data', async () => {
      const manager = new ValidationManager();
      manager.addRule({
        id: 'schema-rule',
        name: 'Schema Rule',
        toolPattern: 'test_tool',
        validator: 'schema',
        schema: z.object({
          success: z.boolean(),
          data: z.string(),
        }),
      });

      const result = await manager.validate(
        'test_tool',
        { success: 'not a boolean' },
        { userInput: 'test', toolName: 'test_tool', toolArgs: {}, timestamp: Date.now() }
      );

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('rule management', () => {
    it('should add rules', () => {
      const manager = new ValidationManager();
      const initialCount = manager.getRules().length;

      manager.addRule({
        id: 'new-rule',
        name: 'New Rule',
        toolPattern: 'test',
        validator: 'rule',
        rule: () => true,
      });

      expect(manager.getRules().length).toBe(initialCount + 1);
    });

    it('should update existing rule', () => {
      const manager = new ValidationManager();
      manager.addRule({
        id: 'update-rule',
        name: 'Original Rule',
        toolPattern: 'test',
        validator: 'rule',
        rule: () => true,
        priority: 1,
      });

      manager.addRule({
        id: 'update-rule',
        name: 'Updated Rule',
        toolPattern: 'test',
        validator: 'rule',
        rule: () => false,
        priority: 10,
      });

      const rules = manager.getRules();
      const updatedRule = rules.find(r => r.id === 'update-rule');
      expect(updatedRule?.name).toBe('Updated Rule');
      expect(updatedRule?.priority).toBe(10);
    });

    it('should remove rules', () => {
      const manager = new ValidationManager();
      manager.addRule({
        id: 'remove-rule',
        name: 'Remove Rule',
        toolPattern: 'test',
        validator: 'rule',
        rule: () => true,
      });

      const removed = manager.removeRule('remove-rule');
      expect(removed).toBe(true);

      const rule = manager.getRules().find(r => r.id === 'remove-rule');
      expect(rule).toBeUndefined();
    });

    it('should enable rules', () => {
      const manager = new ValidationManager();
      manager.addRule({
        id: 'disable-rule',
        name: 'Disable Rule',
        toolPattern: 'test',
        validator: 'rule',
        rule: () => true,
        enabled: false,
      });

      const enabled = manager.enableRule('disable-rule');
      expect(enabled).toBe(true);

      const rule = manager.getRules().find(r => r.id === 'disable-rule');
      expect(rule?.enabled).toBe(true);
    });

    it('should disable rules', () => {
      const manager = new ValidationManager();
      manager.addRule({
        id: 'enable-rule',
        name: 'Enable Rule',
        toolPattern: 'test',
        validator: 'rule',
        rule: () => true,
        enabled: true,
      });

      const disabled = manager.disableRule('enable-rule');
      expect(disabled).toBe(true);

      const rule = manager.getRules().find(r => r.id === 'enable-rule');
      expect(rule?.enabled).toBe(false);
    });

    it('should reset to default rules', () => {
      const manager = new ValidationManager();
      const initialCount = manager.getRules().length;

      manager.addRule({
        id: 'custom-rule',
        name: 'Custom Rule',
        toolPattern: 'test',
        validator: 'rule',
        rule: () => true,
      });

      manager.resetToDefaultRules();

      expect(manager.getRules().length).toBe(initialCount);
    });
  });
});

describe('SchemaValidator', () => {
  it('should validate correct data', async () => {
    const validator = new SchemaValidator();
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const result = await validator.validate(
      { name: 'John', age: 30 },
      { userInput: '', toolName: '', toolArgs: {}, timestamp: Date.now() },
      { id: 'test', name: 'Test', toolPattern: 'test', validator: 'schema', schema, enabled: true, priority: 1 }
    );

    expect(result.isValid).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('should fail validation for incorrect data', async () => {
    const validator = new SchemaValidator();
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const result = await validator.validate(
      { name: 'John', age: 'not a number' },
      { userInput: '', toolName: '', toolArgs: {}, timestamp: Date.now() },
      { id: 'test', name: 'Test', toolPattern: 'test', validator: 'schema', schema, enabled: true, priority: 1 }
    );

    expect(result.isValid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('should require schema', async () => {
    const validator = new SchemaValidator();

    const result = await validator.validate(
      { data: 'test' },
      { userInput: '', toolName: '', toolArgs: {}, timestamp: Date.now() },
      { id: 'test', name: 'Test', toolPattern: 'test', validator: 'schema', enabled: true, priority: 1 }
    );

    expect(result.isValid).toBe(false);
    expect(result.issues[0]).toContain('schema');
  });
});
