// packages/core/src/config/index.ts
import { PermissionConfig, PermissionMode } from '../permission';
import { LLMProviderConfig } from '../llm/provider';
import { EmbeddingConfig } from '../memory/embedding';

// 统一常量配置
export const CONSTANTS = {
  TIMEOUT: {
    CONFIRMATION: parseInt(process.env.CONFIRMATION_TIMEOUT_MS || '60000', 10),
    AGENT_DEFAULT: parseInt(process.env.AGENT_TIMEOUT_MS || '300000', 10),
    AGENT_CODER: 600000,
    AGENT_RESEARCHER: 300000,
    AGENT_WRITER: 300000,
    AGENT_ARCHITECT: 600000,
  },
  CACHE: {
    DEFAULT_TTL: 60000,
    DEFAULT_MAX_SIZE: 100,
  },
  HISTORY: {
    MAX_SIZE: 100,
    COMPRESS_THRESHOLD: 20,
    KEEP_RECENT: 10,
  },
  LLM: {
    DEFAULT_MODEL: process.env.DEFAULT_MODEL || 'qwen3:8b',
    DEFAULT_PROVIDER: process.env.DEFAULT_PROVIDER || 'ollama',
  },
} as const;

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      console.warn(`[Config] Environment variable ${envVar} is not set`);
      return '';
    }
    return envValue;
  });
}

function resolveConfigEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return resolveEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveConfigEnvVars);
  }
  if (obj && typeof obj === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      resolved[key] = resolveConfigEnvVars(value);
    }
    return resolved;
  }
  return obj;
}

export interface AgentModelConfig {
  name: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  model: AgentModelConfig;
}

export interface ProviderConfig {
  npm?: string;
  name?: string;
  type?: 'ollama' | 'kimi' | 'openai-compatible' | 'local';
  options?: Record<string, unknown>;
  models?: Record<string, AgentModelConfig>;
  apiKey?: string;
  baseUrl?: string;
}

export interface OODAAgentConfig {
  $schema?: string;
  activeProvider?: string;
  activeModel?: string;
  provider?: Record<string, ProviderConfig>;
  permission?: PermissionConfig;
  agent?: {
    default?: string;
    available?: string[];
    configs?: Record<string, AgentConfig>;
  };
  // tools 和 mcp 配置已移除 - 工具直接注册到注册表
  embedding?: {
    provider?: 'ollama' | 'openai-compatible';
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    dimensions?: number;
  };
}

export const DEFAULT_CONFIG: OODAAgentConfig = {
  $schema: 'https://ooda-agent.ai/config.json',
  activeProvider: process.env.LONGCAT_API_KEY ? 'longcat' : 'local-ollama',
  provider: {
    'local-ollama': {
      type: 'ollama',
      npm: '@ai-sdk/openai-compatible',
      name: 'ollama',
      options: {
        baseURL: 'http://localhost:11434',
        apiKey: 'token-unused'
      },
      models: {
        'qwen3:4b': {  // 改用更小的模型
          name: 'qwen3:4b',
          temperature: 0.7,
          maxTokens: 1024  // 减少 maxTokens
        }
      }
    },
    'longcat': {
      type: 'openai-compatible',
      name: 'LongCat',
      options: {
        baseURL: 'https://api.longcat.chat/openai',
        apiKey: process.env.LONGCAT_API_KEY || ''
      },
      models: {
        'LongCat-Flash-Chat': {
          name: 'LongCat-Flash-Chat',
          temperature: 0.7,
          maxTokens: 4000
        }
      }
    }
  },
  permission: {
    'read': PermissionMode.ALLOW,
    'grep': PermissionMode.ALLOW,
    'glob': PermissionMode.ALLOW,
    'list': PermissionMode.ALLOW,
    'write': PermissionMode.ASK,
    'edit': PermissionMode.ASK,
    'bash': PermissionMode.ASK,
    'webfetch': PermissionMode.ASK,
    'web_search': PermissionMode.ASK,
    'web_fetch': PermissionMode.ASK,
    'get_time': PermissionMode.ALLOW,
    'calculator': PermissionMode.ALLOW,
    'weather': PermissionMode.ASK,
    'translate': PermissionMode.ASK,
    'timer': PermissionMode.ALLOW,
    'currency': PermissionMode.ASK,
    'uuid': PermissionMode.ALLOW,
    'base64': PermissionMode.ALLOW,
    'hash': PermissionMode.ALLOW,
    'random_number': PermissionMode.ALLOW,
    'color': PermissionMode.ALLOW,
    'question': PermissionMode.ALLOW,
    'todowrite': PermissionMode.ALLOW,
    'todoread': PermissionMode.ALLOW
  },
  agent: {
    default: 'build',
    available: ['build', 'plan', 'general', 'explore'],
    configs: {
      build: {
        name: 'build',
        description: '构建agent，用于代码编写',
        systemPrompt: '你是一个专业的代码编写助手，擅长编写高质量、可维护的代码。',
        tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'list', 'web_search', 'web_fetch', 'get_time', 'calculator', 'uuid', 'base64', 'hash'],
        model: {
          name: 'qwen3:8b',
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 2000
        }
      },
      plan: {
        name: 'plan',
        description: '规划agent，用于任务规划',
        systemPrompt: '你是一个任务规划专家，擅长分析需求并制定详细的执行计划。',
        tools: ['read', 'grep', 'glob', 'list', 'web_search', 'get_time', 'calculator', 'timer'],
        model: {
          name: 'qwen3:8b',
          temperature: 0.5,
          topP: 0.8,
          maxTokens: 1500
        }
      },
      general: {
        name: 'general',
        description: '通用agent，用于一般任务',
        systemPrompt: '你是一个通用的AI助手，可以处理各种任务。',
        tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'list', 'web_search', 'web_fetch', 'webfetch', 'get_time', 'calculator', 'weather', 'translate', 'timer', 'currency', 'uuid', 'base64', 'hash', 'random_number', 'color'],
        model: {
          name: 'qwen3:8b',
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 2000
        }
      },
      explore: {
        name: 'explore',
        description: '探索agent，用于代码探索',
        systemPrompt: '你是一个代码探索专家，擅长分析代码结构和理解项目。',
        tools: ['read', 'grep', 'glob', 'list', 'web_search', 'get_time'],
        model: {
          name: 'qwen3:8b',
          temperature: 0.6,
          topP: 0.85,
          maxTokens: 1500
        }
      }
    }
  }
};

export class ConfigManager {
  private config: OODAAgentConfig;

  constructor(config: OODAAgentConfig = DEFAULT_CONFIG) {
    // 深度合并配置
    this.config = resolveConfigEnvVars(this.deepMerge(DEFAULT_CONFIG, config)) as OODAAgentConfig;

    // 如果用户没有指定 activeProvider，根据环境变量动态选择
    if (!config.activeProvider) {
      if (process.env.LONGCAT_API_KEY) {
        this.config.activeProvider = 'longcat';
        this.config.activeModel = config.activeModel || 'LongCat-Flash-Lite';
        console.log('[ConfigManager] Auto-selected provider: longcat (LONGCAT_API_KEY found)');
      } else if (process.env.KIMI_API_KEY) {
        this.config.activeProvider = 'kimi';
        this.config.activeModel = config.activeModel || 'moonshot-v1-8k';
        console.log('[ConfigManager] Auto-selected provider: kimi (KIMI_API_KEY found)');
      }
    }
  }
  
  private deepMerge(target: any, source: any): any {
    if (!source) return target;
    if (!target) return source;
    
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }
  
  getConfig(): OODAAgentConfig {
    return { ...this.config };
  }
  
  updateConfig(config: Partial<OODAAgentConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  getPermissionConfig(): PermissionConfig {
    return this.config.permission || {};
  }
  
  getProviderConfig(providerName: string): ProviderConfig | undefined {
    return this.config.provider?.[providerName];
  }
  
  getActiveProviderName(): string {
    return this.config.activeProvider || 'local-ollama';
  }
  
  setActiveProvider(providerName: string): void {
    this.config.activeProvider = providerName;
  }
  
  getActiveProviderConfig(): LLMProviderConfig | null {
    const providerName = this.getActiveProviderName();
    return this.getProviderConfigByName(providerName);
  }

  /**
   * 获取指定 provider 和 model 的配置
   * 用于 OODA 各阶段使用不同模型
   */
  getProviderConfigByName(providerName: string, modelName?: string): LLMProviderConfig | null {
    const providerConfig = this.config.provider?.[providerName];

    if (!providerConfig) {
      console.error(`[Config] Provider ${providerName} not found`);
      return null;
    }

    const activeModelName = modelName || this.config.activeModel || (providerConfig.models ? Object.keys(providerConfig.models)[0] : undefined);
    const modelConfig = activeModelName && providerConfig.models ? providerConfig.models[activeModelName] : undefined;
    const model = modelConfig?.name || activeModelName || 'unknown';
    const temperature = modelConfig?.temperature || 0.7;
    const maxTokens = modelConfig?.maxTokens || 2000;

    const type = providerConfig.type || 'ollama';

    // 获取 apiKey 和 baseUrl
    const apiKey = (providerConfig.options?.apiKey as string) || providerConfig.apiKey || '';
    const baseUrl = (providerConfig.options?.baseURL as string) || providerConfig.baseUrl || '';

    console.log(`[Config] Provider: ${providerName}, Type: ${type}, Model: ${model}`);
    console.log(`[Config] API Key present: ${apiKey ? 'Yes (length: ' + apiKey.length + ')' : 'No'}`);
    console.log(`[Config] Base URL: ${baseUrl}`);

    switch (type) {
      case 'kimi':
        return {
          type: 'kimi',
          model,
          apiKey,
          baseUrl: baseUrl || 'https://api.moonshot.cn/v1',
          temperature,
          maxTokens,
        };

      case 'openai-compatible':
        return {
          type: 'openai-compatible',
          model,
          apiKey,
          baseUrl,
          temperature,
          maxTokens,
        };

      case 'ollama':
      default:
        let ollamaBaseUrl = (providerConfig.options?.baseURL as string) || providerConfig.baseUrl || 'http://localhost:11434';
        if (ollamaBaseUrl.endsWith('/v1')) {
          ollamaBaseUrl = ollamaBaseUrl.slice(0, -3);
        }
        if (ollamaBaseUrl.endsWith('/api')) {
          ollamaBaseUrl = ollamaBaseUrl.slice(0, -4);
        }
        return {
          type: 'ollama',
          model,
          baseUrl: ollamaBaseUrl,
          temperature,
          maxTokens,
        };
    }
  }
  
  getAllProviders(): { name: string; type: string; models: { name: string; temperature?: number; maxTokens?: number }[] }[] {
    const providers: { name: string; type: string; models: { name: string; temperature?: number; maxTokens?: number }[] }[] = [];
    
    if (this.config.provider) {
      for (const [name, config] of Object.entries(this.config.provider)) {
        const models = config.models 
          ? Object.values(config.models).map(m => ({ name: m.name, temperature: m.temperature, maxTokens: m.maxTokens }))
          : [];
        providers.push({
          name,
          type: config.type || 'ollama',
          models
        });
      }
    }
    
    return providers;
  }
  
  getActiveModelInfo(): { provider: string; model: string; temperature: number; maxTokens: number } {
    const providerName = this.getActiveProviderName();
    const providerConfig = this.config.provider?.[providerName];
    
    if (!providerConfig || !providerConfig.models) {
      return { provider: providerName, model: 'unknown', temperature: 0.7, maxTokens: 2000 };
    }
    
    const activeModelName = this.config.activeModel || Object.keys(providerConfig.models)[0];
    const modelConfig = providerConfig.models[activeModelName];
    return {
      provider: providerName,
      model: modelConfig?.name || activeModelName || 'unknown',
      temperature: modelConfig?.temperature || 0.7,
      maxTokens: modelConfig?.maxTokens || 2000
    };
  }
  
  setActiveModel(providerName: string, modelName: string): boolean {
    const providerConfig = this.config.provider?.[providerName];
    if (!providerConfig) {
      return false;
    }
    
    if (!providerConfig.models || !providerConfig.models[modelName]) {
      return false;
    }
    
    this.config.activeProvider = providerName;
    this.config.activeModel = modelName;
    
    return true;
  }
  
  getAgentConfig(agentName: string): AgentConfig | undefined {
    return this.config.agent?.configs?.[agentName];
  }
  
  getDefaultAgent(): string {
    return this.config.agent?.default || 'build';
  }
  
  getAvailableAgents(): string[] {
    return this.config.agent?.available || ['build', 'plan', 'general', 'explore'];
  }
  
  // 工具配置已移除 - 工具直接注册到 ToolRegistry
  // @deprecated 此方法不再使用
  getToolConfig(_toolName: string): undefined {
    return undefined;
  }
  
  // MCP 配置已移除 - 外部 MCP 服务器不再支持
  // @deprecated 此方法不再使用  
  getMCPServers(): Record<string, never> {
    return {};
  }
  
  getEmbeddingConfig(): { provider: 'ollama' | 'openai-compatible'; model: string; baseUrl?: string; apiKey?: string; dimensions?: number } | null {
    const emb = this.config.embedding;
    if (!emb) {
      return null;
    }
    return {
      provider: emb.provider || 'ollama',
      model: emb.model || 'nomic-embed-text',
      baseUrl: emb.baseUrl,
      apiKey: emb.apiKey,
      dimensions: emb.dimensions || 768,
    };
  }
  
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (this.config.provider) {
      for (const [name, provider] of Object.entries(this.config.provider)) {
        if (!provider.models || Object.keys(provider.models).length === 0) {
          errors.push(`Provider ${name} has no models configured`);
        }
      }
    }
    
    if (this.config.agent?.configs) {
      for (const [name, agent] of Object.entries(this.config.agent.configs)) {
        if (!agent.tools || agent.tools.length === 0) {
          errors.push(`Agent ${name} has no tools configured`);
        }
        if (!agent.model) {
          errors.push(`Agent ${name} has no model configured`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

let configManager: ConfigManager | null = null;

export function getConfigManager(): ConfigManager {
  if (!configManager) {
    configManager = new ConfigManager();
  }
  return configManager;
}

export function initializeConfigManager(config: OODAAgentConfig): ConfigManager {
  configManager = new ConfigManager(config);
  return configManager;
}
