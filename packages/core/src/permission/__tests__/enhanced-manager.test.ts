import { describe, it, expect, beforeEach } from 'vitest';
import {
  PermissionManagerImpl,
  createPermissionManager,
  DEFAULT_PERMISSION_CONFIG,
  DEFAULT_GLOBAL_PERMISSION_CONFIG,
  PermissionMode
} from '../index';

describe('PermissionManager', () => {
  let manager: PermissionManagerImpl;

  beforeEach(() => {
    manager = createPermissionManager();
  });

  describe('constructor', () => {
    it('should create manager with default config', () => {
      const globalConfig = manager.getGlobalConfig();
      
      expect(globalConfig.defaultMode).toBe(PermissionMode.ALLOW);
      expect(globalConfig.tools.read).toBe(PermissionMode.ALLOW);
      expect(globalConfig.tools.web_search).toBe(PermissionMode.ALLOW);
    });
  });

  describe('checkPermission', () => {
    it('should allow read operations by default', async () => {
      const result = await manager.checkPermission('read', 'default');
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe(PermissionMode.ALLOW);
    });

    it('should allow web_search by default', async () => {
      const result = await manager.checkPermission('web_search', 'default');
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe(PermissionMode.ALLOW);
    });

    it('should allow write operations by default', async () => {
      const result = await manager.checkPermission('write', 'default');
      expect(result.mode).toBe(PermissionMode.ALLOW);
    });
  });

  describe('agent permissions', () => {
    it('should inherit global permissions by default', async () => {
      const result = await manager.checkPermission('read', 'default');
      expect(result.allowed).toBe(true);
    });

    it('should allow setting agent-specific permissions', () => {
      manager.updateAgentPermission('custom-agent', 'web_search', PermissionMode.DENY);
      const agentConfig = manager.getAgentConfig('custom-agent');
      expect(agentConfig?.tools?.web_search).toBe(PermissionMode.DENY);
    });
  });
});
