# 技能 (Skill) 扩展指南

本文档说明如何创建自定义技能 (Skill) 并将其集成到 OODA Agent 系统中。

## 技能系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Skill 系统                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────────────────┐   │
│  │   BaseSkill     │    │     SkillRegistry           │   │
│  │   (抽象类)      │    │  ┌─────────────────────┐   │   │
│  │                 │    │  │ register(skill)      │   │   │
│  │ - name          │    │  │ get(name)           │   │   │
│  │ - description   │    │  │ list()              │   │   │
│  │ - category      │    │  │ execute(name, input)│   │   │
│  │ - version       │    │  └─────────────────────┘   │   │
│  │ - schema        │    └─────────────────────────────┘   │
│  │ - permissions   │                                      │
│  │ - execute()    │    ┌─────────────────────────────┐   │
│  │ - initialize()  │    │     SkillContext            │   │
│  │ - shutdown()    │    │  - workingDirectory         │   │
│  └─────────────────┘    │  - sessionId               │   │
│                         │  - maxExecutionTime        │   │
│                         │  - resources              │   │
│                         │  - skillRegistry           │   │
│                         │  - mcp                    │   │
│                         └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 创建自定义技能

### 1. 继承 BaseSkill 类

```typescript
import { z } from 'zod';
import { Skill, SkillContext, Permission } from '@ooda-agent/core';

// 方式一：继承 BaseSkill（推荐）
export class MyCustomSkill extends BaseSkill {
  name = 'my_custom_skill';        // 技能唯一名称
  description = '我的自定义技能';   // 技能描述
  category = 'custom';              // 分类
  version = '1.0.0';                // 版本号
  dependencies: string[] = [];     // 依赖的其他技能
  
  // 输入参数验证 Schema
  schema = z.object({
    action: z.enum(['action1', 'action2']),
    param1: z.string(),
    param2: z.number().optional(),
  });
  
  // 权限要求
  permissions: Permission[] = [
    { type: 'file_read', pattern: '**/*' },
  ];
  
  async execute(input: unknown, context: SkillContext): Promise<unknown> {
    const { action, param1, param2 } = input as {
      action: 'action1' | 'action2';
      param1: string;
      param2?: number;
    };
    
    switch (action) {
      case 'action1':
        return await this.handleAction1(param1);
      case 'action2':
        return await this.handleAction2(param1, param2);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
  
  private async handleAction1(param: string): Promise<unknown> {
    // 实现你的逻辑
    return { result: `处理: ${param}` };
  }
  
  private async handleAction2(param: string, num?: number): Promise<unknown> {
    // 实现你的逻辑
    return { result: param, num };
  }
}

// 方式二：直接实现 Skill 接口
export const myToolSkill: Skill = {
  name: 'my_tool_skill',
  description: '工具型技能',
  category: 'tool',
  version: '1.0.0',
  dependencies: [],
  schema: z.object({
    input: z.string(),
  }),
  permissions: [],
  
  async initialize() {
    console.log('技能初始化');
  },
  
  async execute(input, context) {
    return { output: input };
  },
  
  async shutdown() {
    console.log('技能关闭');
  },
};
```

### 2. 注册技能

```typescript
import { getSkillRegistry } from '@ooda-agent/core';
import { MyCustomSkill } from './my-custom-skill';

// 获取全局技能注册器
const skillRegistry = getSkillRegistry();

// 注册技能
skillRegistry.register(new MyCustomSkill());

// 或者使用简写
skillRegistry.register(myToolSkill);

// 列出所有已注册的技能
console.log(skillRegistry.list());
```

### 3. 在应用启动时初始化

```typescript
// 在你的应用入口文件中
import { initializeSkills } from '@ooda-agent/tools';

initializeSkills();  // 初始化所有内置技能
```

## 技能示例

### 文件操作技能

```typescript
import { z } from 'zod';
import { BaseSkill, SkillContext } from '@ooda-agent/core';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FileManagerSkill extends BaseSkill {
  name = 'file_manager';
  description = '高级文件管理技能';
  category = 'file';
  version = '1.0.0';
  dependencies = [];
  
  schema = z.object({
    operation: z.enum(['copy', 'move', 'delete', 'rename']),
    source: z.string(),
    destination: z.string().optional(),
  });
  
  permissions = [
    { type: 'file_read', pattern: '**/*' },
    { type: 'file_write', pattern: '**/*' },
  ];
  
  async execute(input, context: SkillContext) {
    const { operation, source, destination } = input;
    const sourcePath = path.resolve(context.workingDirectory, source);
    
    // 安全检查
    if (!sourcePath.startsWith(context.workingDirectory)) {
      throw new Error('权限不足：无法操作工作目录外的文件');
    }
    
    switch (operation) {
      case 'copy':
        await fs.copyFile(sourcePath, path.resolve(context.workingDirectory, destination!));
        break;
      case 'move':
        await fs.rename(sourcePath, path.resolve(context.workingDirectory, destination!));
        break;
      case 'delete':
        await fs.unlink(sourcePath);
        break;
      case 'rename':
        await fs.rename(sourcePath, path.resolve(context.workingDirectory, destination!));
        break;
    }
    
    return { success: true, operation, source };
  }
}
```

### API 调用技能

```typescript
import { z } from 'zod';
import { BaseSkill, SkillContext } from '@ooda-agent/core';

export class APICallSkill extends BaseSkill {
  name = 'api_call';
  description = '调用外部 API';
  category = 'network';
  version = '1.0.0';
  dependencies = [];
  
  schema = z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
    headers: z.record(z.string()).optional(),
    body: z.unknown().optional(),
  });
  
  permissions = [{ type: 'network', pattern: '**' }];
  
  async execute(input, context: SkillContext) {
    const { url, method, headers, body } = input;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const data = await response.json();
    
    return {
      status: response.status,
      data,
      headers: Object.fromEntries(response.headers),
    };
  }
}
```

## 技能最佳实践

### 1. 错误处理

```typescript
async execute(input, context) {
  try {
    // 业务逻辑
    return { success: true, data: 'result' };
  } catch (error) {
    // 返回结构化的错误信息
    return {
      success: false,
      error: {
        message: error.message,
        code: 'ERROR_CODE',
      }
    };
  }
}
```

### 2. 安全检查

```typescript
async execute(input, context) {
  // 检查路径是否在工作目录内
  const resolvedPath = path.resolve(context.workingDirectory, input.path);
  if (!resolvedPath.startsWith(context.workingDirectory)) {
    throw new Error('权限不足：禁止访问工作目录外的路径');
  }
  
  // 检查超时
  if (context.maxExecutionTime < 1000) {
    throw new Error('执行时间不足');
  }
  
  // 检查资源
  if (context.resources.cpu < 0.5) {
    throw new Error('CPU 资源不足');
  }
}
```

### 3. 使用 MCP 进行事件通信

```typescript
async execute(input, context) {
  // 发布进度事件
  await context.mcp.publishEvent('skill.progress', {
    skill: this.name,
    progress: 50,
  });
  
  // 执行操作
  const result = await this.doWork(input);
  
  // 发布完成事件
  await context.mcp.publishEvent('skill.complete', {
    skill: this.name,
    result,
  });
  
  return result;
}
```

### 4. 生命周期管理

```typescript
// 初始化时加载资源
async initialize() {
  this.cache = new Map();
  this.db = await connectToDatabase();
}

// 关闭时释放资源
async shutdown() {
  this.cache.clear();
  await this.db.close();
}
```

## 测试技能

```typescript
import { describe, it, expect } from 'vitest';
import { MyCustomSkill } from './my-custom-skill';

describe('技能测试', () => {
  const context = {
    workingDirectory: '/test',
    sessionId: 'test',
    maxExecutionTime: 30000,
    resources: { memory: 1e9, cpu: 1 },
    skillRegistry: {} as any,
    mcp: {} as any,
  };
  
  it('应该正确执行', async () => {
    const skill = new MyCustomSkill();
    const result = await skill.execute(
      { action: 'action1', param1: 'test' },
      context
    );
    
    expect(result).toBeDefined();
  });
});
```

## 注册位置

将你的自定义技能放在以下位置：

```
packages/
└── tools/
    └── src/
        └── skills/
            ├── base-skill.ts      # 基础技能
            ├── advanced-skills.ts # 高级技能
            └── my-skills/         # 你的自定义技能
                ├── index.ts
                ├── custom-skill-1.ts
                └── custom-skill-2.ts
```

然后在 `packages/tools/src/index.ts` 中导入并注册：

```typescript
export function initializeSkills(): void {
  const skillRegistry = getSkillRegistry();
  
  // 内置技能
  skillRegistry.register(new FileSkill());
  // ...
  
  // 你的自定义技能
  skillRegistry.register(new MyCustomSkill());
}
```
