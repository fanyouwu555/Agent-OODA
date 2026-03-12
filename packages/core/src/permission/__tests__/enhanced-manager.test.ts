import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnhancedPermissionManagerImpl,
  createEnhancedPermissionManager
} from '../enhanced-manager';
import {
  EnhancedPermissionConfig,
  DEFAULT_ENHANCED_PERMISSION_CONFIG,
  checkCondition
} from '../enhanced';
import { PermissionMode } from '../index';

describe('EnhancedPermissionManager', () => {
  let manager: EnhancedPermissionManagerImpl;

  beforeEach(() => {
    manager = createEnhancedPermissionManager();
  });

  describe('constructor', () => {
    it('should create manager with default config', () => {
      const globalConfig = manager.getGlobalConfig();
      
      expect(globalConfig.defaultMode).toBe(PermissionMode.ASK);
      expect(globalConfig.tools.read).toBe(PermissionMode.ALLOW);
      expect(globalConfig.tools.write).toBe(PermissionMode.ASK);
    });

    it('should create manager with custom config', () => {
      const customConfig: EnhancedPermissionConfig = {
        global: {
          defaultMode: PermissionMode.DENY,
          tools: { read: PermissionMode.ALLOW },
          skills: {}
        },
        agents: {},
        groups: {}
      };
      
      const customManager = createEnhancedPermissionManager(customConfig);
      const globalConfig = customManager.getGlobalConfig();
      
      expect(globalConfig.defaultMode).toBe(PermissionMode.DENY);
    });
  });

  describe('checkPermission', () => {
    it('should return ALLOW for allowed tools', async () => {
      const result = await manager.checkPermission('read', 'default');
      
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe(PermissionMode.ALLOW);
    });

    it('should return ASK for tools requiring confirmation', async () => {
      const result = await manager.checkPermission('write', 'default');
      
      expect(result.allowed).toBe(false);
      expect(result.mode).toBe(PermissionMode.ASK);
    });

    it('should return default mode for unknown tools', async () => {
      const result = await manager.checkPermission('unknown_tool', 'default');
      
      expect(result.mode).toBe(PermissionMode.ASK);
    });
  });

  describe('checkPermissionSync', () => {
    it('should return permission result synchronously', () => {
      const result = manager.checkPermissionSync('read', 'default');
      
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe(PermissionMode.ALLOW);
    });
  });

  describe('agent-level permissions', () => {
    beforeEach(() => {
      manager.loadConfig({
        global: {
          defaultMode: PermissionMode.ASK,
          tools: {
            read: PermissionMode.ALLOW,
            write: PermissionMode.ASK,
            bash: PermissionMode.ASK
          },
          skills: {}
        },
        agents: {
          'restricted-agent': {
            inherit: true,
            tools: {
              bash: PermissionMode.DENY
            }
          },
          'isolated-agent': {
            inherit: false,
            tools: {
              read: PermissionMode.ALLOW
            }
          }
        },
        groups: {}
      });
    });

    it('should inherit global permissions', async () => {
      const result = await manager.checkPermission('read', 'restricted-agent');
      
      expect(result.allowed).toBe(true);
    });

    it('should override global permissions at agent level', async () => {
      const result = await manager.checkPermission('bash', 'restricted-agent');
      
      expect(result.allowed).toBe(false);
      expect(result.mode).toBe(PermissionMode.DENY);
    });

    it('should not inherit when inherit is false', async () => {
      const result = await manager.checkPermission('write', 'isolated-agent');
      
      expect(result.mode).toBe(PermissionMode.ASK);
    });
  });

  describe('pattern matching', () => {
    beforeEach(() => {
      manager.loadConfig({
        global: {
          defaultMode: PermissionMode.ASK,
          tools: {},
          skills: {}
        },
        agents: {
          'pattern-agent': {
            inherit: false,
            tools: {},
            patterns: [
              { pattern: 'bash:rm*', mode: PermissionMode.DENY },
              { pattern: 'read:*', mode: PermissionMode.ALLOW },
              { pattern: '*', mode: PermissionMode.ASK }
            ]
          }
        },
        groups: {}
      });
    });

    it('should match pattern with wildcard', async () => {
      const result = await manager.checkPermission('bash:rm', 'pattern-agent');
      
      expect(result.mode).toBe(PermissionMode.DENY);
    });

    it('should match pattern with prefix', async () => {
      const result = await manager.checkPermission('read:file', 'pattern-agent');
      
      expect(result.mode).toBe(PermissionMode.ALLOW);
    });

    it('should match catch-all pattern', async () => {
      const result = await manager.checkPermission('unknown', 'pattern-agent');
      
      expect(result.mode).toBe(PermissionMode.ASK);
    });
  });

  describe('update permissions', () => {
    it('should update global permission', () => {
      manager.updateGlobalPermission('custom_tool', PermissionMode.ALLOW);
      
      const globalConfig = manager.getGlobalConfig();
      expect(globalConfig.tools.custom_tool).toBe(PermissionMode.ALLOW);
    });

    it('should update agent permission', () => {
      manager.updateAgentPermission('test-agent', 'write', PermissionMode.DENY);
      
      const agentConfig = manager.getAgentConfig('test-agent');
      expect(agentConfig?.tools?.write).toBe(PermissionMode.DENY);
    });
  });

  describe('user confirmation callback', () => {
    it('should call callback for ASK mode', async () => {
      let callbackCalled = false;
      
      manager.setUserConfirmationCallback(async (toolName, args, agentName) => {
        callbackCalled = true;
        expect(toolName).toBe('write');
        expect(agentName).toBe('default');
        return true;
      });
      
      const result = await manager.checkPermission('write', 'default');
      
      expect(callbackCalled).toBe(true);
      expect(result.allowed).toBe(true);
    });

    it('should deny when callback returns false', async () => {
      manager.setUserConfirmationCallback(async () => false);
      
      const result = await manager.checkPermission('write', 'default');
      
      expect(result.allowed).toBe(false);
    });
  });

  describe('getEffectivePermissions', () => {
    it('should return merged permissions', () => {
      manager.loadConfig({
        global: {
          defaultMode: PermissionMode.ASK,
          tools: {
            read: PermissionMode.ALLOW,
            write: PermissionMode.ASK
          },
          skills: {}
        },
        agents: {
          'test-agent': {
            inherit: true,
            tools: {
              write: PermissionMode.DENY
            }
          }
        },
        groups: {}
      });
      
      const perms = manager.getEffectivePermissions('test-agent');
      
      expect(perms.read).toBe(PermissionMode.ALLOW);
      expect(perms.write).toBe(PermissionMode.DENY);
    });
  });

  describe('reset', () => {
    it('should reset to default config', () => {
      manager.updateGlobalPermission('custom', PermissionMode.ALLOW);
      manager.reset();
      
      const globalConfig = manager.getGlobalConfig();
      expect(globalConfig.tools.custom).toBeUndefined();
    });
  });
});

describe('checkCondition', () => {
  it('should check path condition with equals', () => {
    const result = checkCondition(
      { type: 'path', operator: 'equals', value: '/safe/path' },
      { path: '/safe/path' }
    );
    
    expect(result).toBe(true);
  });

  it('should check command condition with contains', () => {
    const result = checkCondition(
      { type: 'command', operator: 'contains', value: 'rm' },
      { command: 'rm -rf /' }
    );
    
    expect(result).toBe(true);
  });

  it('should check path condition with startsWith', () => {
    const result = checkCondition(
      { type: 'path', operator: 'startsWith', value: '/safe' },
      { path: '/safe/path/file.txt' }
    );
    
    expect(result).toBe(true);
  });

  it('should check condition with matches regex', () => {
    const result = checkCondition(
      { type: 'path', operator: 'matches', value: '^/safe/.*' },
      { path: '/safe/path/file.txt' }
    );
    
    expect(result).toBe(true);
  });

  it('should return false when context is missing', () => {
    const result = checkCondition(
      { type: 'path', operator: 'equals', value: '/safe' },
      {}
    );
    
    expect(result).toBe(false);
  });
});
