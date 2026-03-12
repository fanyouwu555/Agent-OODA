import type { MemoryRepository } from '@ooda-agent/storage';
import { LongTermMemory, Memory, MemoryMetadata } from './long-term';

export interface PresetMemory {
  id: string;
  content: string;
  type: MemoryMetadata['type'];
  tags?: string[];
  importance?: number;
  source?: string;
}

export interface AgentPersona {
  id: string;
  name: string;
  description: string;
  systemPrompt?: string;
  memories: PresetMemory[];
  defaultTags?: string[];
}

export interface PersonaConfig {
  personas: AgentPersona[];
  defaultPersona?: string;
}

export class PersonaManager {
  private repository: MemoryRepository;
  private longTermMemory: LongTermMemory;
  private loadedPersonas: Set<string> = new Set();
  private personas: Map<string, AgentPersona> = new Map();

  constructor(repository: MemoryRepository, config?: PersonaConfig) {
    this.repository = repository;
    this.longTermMemory = new LongTermMemory({ repository });

    if (config) {
      this.loadConfig(config);
    }
  }

  loadConfig(config: PersonaConfig): void {
    for (const persona of config.personas) {
      this.personas.set(persona.id, persona);
    }
  }

  async loadPersona(personaId: string): Promise<void> {
    const persona = this.personas.get(personaId);
    if (!persona) {
      throw new Error(`Persona not found: ${personaId}`);
    }

    if (this.loadedPersonas.has(personaId)) {
      console.log(`[PersonaManager] Persona ${personaId} already loaded`);
      return;
    }

    for (const memory of persona.memories) {
      try {
        await this.longTermMemory.store({
          content: memory.content,
          embedding: [],
          metadata: {
            type: memory.type,
            source: memory.source || `persona:${personaId}`,
            tags: [...(persona.defaultTags || []), ...(memory.tags || [])],
            related: [],
          },
          importance: memory.importance ?? 0.8,
        });
      } catch (error) {
        console.warn(`[PersonaManager] Failed to store memory for persona ${personaId}:`, error);
        // 继续加载其他记忆
      }
    }

    this.loadedPersonas.add(personaId);
    console.log(`[PersonaManager] Loaded persona ${personaId} with ${persona.memories.length} memories`);
  }

  async loadDefaultPersona(): Promise<void> {
    for (const [id, persona] of this.personas) {
      await this.loadPersona(id);
      break;
    }
  }

  async loadAllPersonas(): Promise<void> {
    for (const personaId of this.personas.keys()) {
      await this.loadPersona(personaId);
    }
  }

  isPersonaLoaded(personaId: string): boolean {
    return this.loadedPersonas.has(personaId);
  }

  getPersona(personaId: string): AgentPersona | undefined {
    return this.personas.get(personaId);
  }

  getAllPersonas(): AgentPersona[] {
    return Array.from(this.personas.values());
  }

  getLoadedPersonaIds(): string[] {
    return Array.from(this.loadedPersonas);
  }

  async addMemoryToPersona(
    personaId: string,
    memory: Omit<PresetMemory, 'id'>
  ): Promise<string> {
    const persona = this.personas.get(personaId);
    if (!persona) {
      throw new Error(`Persona not found: ${personaId}`);
    }

    const id = await this.longTermMemory.store({
      content: memory.content,
      embedding: [],
      metadata: {
        type: memory.type,
        source: memory.source || `persona:${personaId}`,
        tags: [...(persona.defaultTags || []), ...(memory.tags || [])],
        related: [],
      },
      importance: memory.importance ?? 0.8,
    });

    persona.memories.push({
      id,
      ...memory,
    });

    return id;
  }

  clearLoadedPersonas(): void {
    this.loadedPersonas.clear();
  }
}

export const DEFAULT_PERSONAS: PersonaConfig = {
  defaultPersona: 'assistant',
  personas: [
    {
      id: 'assistant',
      name: 'AI Assistant',
      description: 'A helpful AI assistant with general knowledge',
      systemPrompt: 'You are a helpful AI assistant.',
      defaultTags: ['core', 'assistant'],
      memories: [
        {
          id: 'assistant-role',
          content: '我是一个AI助手，致力于帮助用户解决问题和完成任务。我会提供准确、有帮助的回答。',
          type: 'fact',
          tags: ['role', 'identity'],
          importance: 0.9,
        },
        {
          id: 'assistant-behavior',
          content: '我会保持友好、专业的态度，在不确定时会承认并寻求澄清。我会优先考虑用户的需求和安全。',
          type: 'preference',
          tags: ['behavior', 'guidelines'],
          importance: 0.8,
        },
        {
          id: 'assistant-capabilities',
          content: '我可以帮助用户进行代码编写、文件操作、网络搜索、数据分析等任务。我能够理解多种编程语言和技术概念。',
          type: 'skill',
          tags: ['capabilities'],
          importance: 0.7,
        },
      ],
    },
    {
      id: 'coder',
      name: 'Code Expert',
      description: 'A coding expert specialized in software development',
      systemPrompt: 'You are an expert software developer.',
      defaultTags: ['core', 'coding'],
      memories: [
        {
          id: 'coder-role',
          content: '我是一名专业的软件工程师，擅长编写高质量、可维护的代码。我熟悉多种编程语言和开发框架。',
          type: 'fact',
          tags: ['role', 'identity'],
          importance: 0.9,
        },
        {
          id: 'coder-principles',
          content: '我遵循SOLID原则、DRY原则和KISS原则。我会编写清晰的代码注释和文档，注重代码的可读性和可测试性。',
          type: 'skill',
          tags: ['principles', 'best-practices'],
          importance: 0.8,
        },
        {
          id: 'coder-workflow',
          content: '在编写代码前，我会先理解需求，设计架构，然后逐步实现。我会进行代码审查和测试，确保代码质量。',
          type: 'experience',
          tags: ['workflow'],
          importance: 0.7,
        },
      ],
    },
  ],
};

let personaManager: PersonaManager | null = null;

export function getPersonaManager(
  repository?: MemoryRepository,
  config?: PersonaConfig
): PersonaManager {
  if (!personaManager && repository) {
    personaManager = new PersonaManager(repository, config);
  }
  
  if (!personaManager) {
    throw new Error('PersonaManager not initialized. Provide a MemoryRepository.');
  }
  
  return personaManager;
}

export function initializePersonaManager(
  repository: MemoryRepository,
  config?: PersonaConfig
): PersonaManager {
  personaManager = new PersonaManager(repository, config ?? DEFAULT_PERSONAS);
  return personaManager;
}

export function resetPersonaManager(): void {
  personaManager = null;
}
