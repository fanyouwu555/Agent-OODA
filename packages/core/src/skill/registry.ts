// packages/core/src/skill/registry.ts
import { Skill, SkillContext, SkillRegistry } from './interface';

export class SkillRegistryImpl implements SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  
  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }
  
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }
  
  list(): Skill[] {
    return Array.from(this.skills.values());
  }
  
  async execute(name: string, input: unknown, context: SkillContext): Promise<unknown> {
    const skill = this.get(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }
    
    // 验证输入
    const validatedInput = skill.schema.parse(input);
    
    // 执行技能
    return skill.execute(validatedInput, context);
  }
  
  async initializeAll(): Promise<void> {
    for (const skill of this.skills.values()) {
      await skill.initialize();
    }
  }
  
  async shutdownAll(): Promise<void> {
    for (const skill of this.skills.values()) {
      await skill.shutdown();
    }
  }
}

// 全局技能注册器实例
let skillRegistry: SkillRegistryImpl | null = null;

export function getSkillRegistry(): SkillRegistry {
  if (!skillRegistry) {
    skillRegistry = new SkillRegistryImpl();
  }
  return skillRegistry;
}

export function setSkillRegistry(registry: SkillRegistryImpl): void {
  skillRegistry = registry;
}