// packages/core/src/permission/index.ts
export enum PermissionMode {
  ALLOW = 'allow',
  DENY = 'deny',
  ASK = 'ask'
}

export interface PermissionConfig {
  [toolName: string]: PermissionMode;
}

export interface PermissionResult {
  allowed: boolean;
  mode: PermissionMode;
  message?: string;
}

export class PermissionManager {
  private config: PermissionConfig;
  private userConfirmationCallback?: (toolName: string, args: unknown) => Promise<boolean>;
  
  constructor(config: PermissionConfig = {}) {
    this.config = config;
  }
  
  setUserConfirmationCallback(callback: (toolName: string, args: unknown) => Promise<boolean>): void {
    this.userConfirmationCallback = callback;
  }
  
  checkPermission(toolName: string): PermissionMode {
    for (const [pattern, mode] of Object.entries(this.config)) {
      if (this.matchPattern(toolName, pattern)) {
        return mode;
      }
    }
    return PermissionMode.ASK;
  }
  
  async requestPermission(toolName: string, args: unknown): Promise<PermissionResult> {
    const mode = this.checkPermission(toolName);
    
    switch (mode) {
      case PermissionMode.ALLOW:
        return {
          allowed: true,
          mode: PermissionMode.ALLOW,
          message: `Tool ${toolName} is allowed`
        };
        
      case PermissionMode.DENY:
        return {
          allowed: false,
          mode: PermissionMode.DENY,
          message: `Tool ${toolName} is denied`
        };
        
      case PermissionMode.ASK:
        if (this.userConfirmationCallback) {
          const confirmed = await this.userConfirmationCallback(toolName, args);
          return {
            allowed: confirmed,
            mode: PermissionMode.ASK,
            message: confirmed 
              ? `User confirmed tool ${toolName}` 
              : `User denied tool ${toolName}`
          };
        }
        return {
          allowed: false,
          mode: PermissionMode.ASK,
          message: `Tool ${toolName} requires user confirmation but no callback is set`
        };
        
      default:
        return {
          allowed: false,
          mode: PermissionMode.ASK,
          message: `Unknown permission mode for tool ${toolName}`
        };
    }
  }
  
  private matchPattern(toolName: string, pattern: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(toolName);
  }
  
  updateConfig(config: PermissionConfig): void {
    this.config = { ...this.config, ...config };
  }
  
  getConfig(): PermissionConfig {
    return { ...this.config };
  }
  
  resetConfig(): void {
    this.config = {};
  }
}

export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  'read': PermissionMode.ALLOW,
  'grep': PermissionMode.ALLOW,
  'glob': PermissionMode.ALLOW,
  'list': PermissionMode.ALLOW,
  'write': PermissionMode.ASK,
  'edit': PermissionMode.ASK,
  'bash': PermissionMode.ASK,
  'webfetch': PermissionMode.ASK,
  'question': PermissionMode.ALLOW,
  'todowrite': PermissionMode.ALLOW,
  'todoread': PermissionMode.ALLOW,
};

let permissionManager: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!permissionManager) {
    permissionManager = new PermissionManager(DEFAULT_PERMISSION_CONFIG);
  }
  return permissionManager;
}

export function initializePermissionManager(config: PermissionConfig): PermissionManager {
  permissionManager = new PermissionManager(config);
  return permissionManager;
}
