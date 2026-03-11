import { promises as fs } from 'fs';
import * as path from 'path';
import { OODAAgentConfig, DEFAULT_CONFIG } from './index';
import { PermissionMode } from '../permission';

export interface ConfigLoadOptions {
  configPath?: string;
  schemaPath?: string;
  validate?: boolean;
}

export class ConfigLoader {
  private configPath: string;
  private schemaPath: string;
  
  constructor(options: ConfigLoadOptions = {}) {
    this.configPath = options.configPath || this.getDefaultConfigPath();
    this.schemaPath = options.schemaPath || this.getDefaultSchemaPath();
  }
  
  getDefaultConfigPath(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.config', 'ooda-agent', 'config.json');
  }
  
  getDefaultSchemaPath(): string {
    return path.join(process.cwd(), 'config', 'schema.json');
  }
  
  getDefaultConfig(): OODAAgentConfig {
    return { ...DEFAULT_CONFIG };
  }
  
  async loadConfig(): Promise<OODAAgentConfig> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configContent) as OODAAgentConfig;
      
      if (this.schemaPath) {
        await this.validateConfig(config);
      }
      
      return config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.getDefaultConfig();
      }
      throw new Error(`Failed to load config: ${(error as Error).message}`);
    }
  }
  
  async loadSchema(): Promise<object> {
    try {
      const schemaContent = await fs.readFile(this.schemaPath, 'utf-8');
      return JSON.parse(schemaContent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw new Error(`Failed to load schema: ${(error as Error).message}`);
    }
  }
  
  async validateConfig(config: OODAAgentConfig): Promise<void> {
    if (!this.schemaPath) {
      return;
    }
    
    try {
      const schema = await this.loadSchema();
      this.validateAgainstSchema(config, schema);
    } catch (error) {
      console.warn(`Schema validation skipped: ${(error as Error).message}`);
    }
  }
  
  validateAgainstSchema(config: OODAAgentConfig, schema: any): void {
    if (schema && schema.$schema) {
      console.log('Schema validation would be performed here');
    }
  }
  
  async saveConfig(config: OODAAgentConfig): Promise<void> {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      const configContent = JSON.stringify(config, null, 2);
      await fs.writeFile(this.configPath, configContent, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save config: ${(error as Error).message}`);
    }
  }
  
  async loadFromEnvironment(): Promise<Partial<OODAAgentConfig>> {
    const envConfig: Partial<OODAAgentConfig> = {};
    
    if (process.env.PORT) {
      envConfig.provider = envConfig.provider || {};
      envConfig.provider = {
        ...envConfig.provider,
        'local-ollama': {
          ...envConfig.provider?.['local-ollama'],
          options: {
            ...(envConfig.provider?.['local-ollama'] as any)?.options,
            ...(process.env.OLLAMA_BASE_URL ? { baseURL: process.env.OLLAMA_BASE_URL } : {}),
          },
        },
      };
    }
    
    if (process.env.PERMISSION_MODE) {
      envConfig.permission = {};
      const permissionMode = process.env.PERMISSION_MODE.toLowerCase();
      
      if (permissionMode === 'strict') {
        envConfig.permission = {
          'bash': PermissionMode.DENY,
          'edit': PermissionMode.DENY,
          'write': PermissionMode.DENY,
          'webfetch': PermissionMode.DENY,
        };
      } else if (permissionMode === 'permissive') {
        envConfig.permission = {
          'bash': PermissionMode.ALLOW,
          'edit': PermissionMode.ALLOW,
          'write': PermissionMode.ALLOW,
          'webfetch': PermissionMode.ALLOW,
        };
      }
    }
    
    if (process.env.DEFAULT_AGENT) {
      envConfig.agent = envConfig.agent || {};
      envConfig.agent.default = process.env.DEFAULT_AGENT;
    }
    
    return envConfig;
  }
  
  mergeConfigs(...configs: Partial<OODAAgentConfig>[]): OODAAgentConfig {
    return configs.reduce((acc, config) => {
      return this.deepMerge(acc, config);
    }, {} as OODAAgentConfig);
  }
  
  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    
    for (const key in source) {
      if (source[key] !== undefined && source[key] !== null) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
          output[key] = this.deepMerge(output[key] || {}, source[key]);
        } else {
          output[key] = source[key];
        }
      }
    }
    
    return output;
  }
}
