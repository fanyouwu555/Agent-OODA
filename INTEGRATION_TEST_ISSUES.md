# OODA Agent 双端整合测试问题清单

测试日期: 2026-03-11
测试环境: Windows, Node.js

## 测试结果概览

| 测试项 | 状态 | 说明 |
|--------|------|------|
| 依赖安装 | ✅ 通过 | 所有依赖正确安装 |
| TypeScript 编译 | ✅ 通过 | 无编译错误 |
| 服务端启动 | ✅ 通过 | 端口3001运行 |
| 前端启动 | ✅ 通过 | 端口5175运行 |
| API 连通性 | ✅ 通过 | Health/Skills/Models 接口正常 |
| WebSocket | ✅ 通过 | 连接建立成功 |

---

## 问题清单

### 问题 1: 端口冲突导致前后端连接失败 (高优先级) ✅ 已修复

**现象:**
- 服务端启动时端口3000被占用，自动切换到3001
- 前端 Vite 代理配置硬编码指向 `http://localhost:3000`
- 前端无法正确代理请求到实际服务端端口

**影响:**
- 前端请求 `/api/*` 和 `/ws` 会失败
- WebSocket 连接无法建立

**解决方案:** ✅ 已实施
1. 修改 `packages/app/vite.config.ts`，使用环境变量配置代理目标
2. 创建 `packages/app/.env.example` 模板文件

**修复代码:**
```typescript
// packages/app/vite.config.ts
const apiPort = process.env.VITE_API_PORT || '3000';
const wsPort = process.env.VITE_WS_PORT || '3000';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${wsPort}`,
        ws: true,
      },
    },
  },
});
```

---

### 问题 2: 环境变量未设置 (中优先级)

**现象:**
```
[Config] Environment variable KIMI_API_KEY is not set
[Config] Environment variable LONGCAT_API_KEY is not set
```

**影响:**
- Kimi 和 LongCat 提供商无法正常工作
- 切换到这些模型时会失败

**解决方案:**
1. 确保 `.env` 文件中设置了正确的 API Key
2. 或在 `config/local-model.json` 中直接配置 API Key

**修复步骤:**
```bash
# 检查 .env 文件
KIMI_API_KEY=your-actual-kimi-api-key
LONGCAT_API_KEY=your-actual-longcat-api-key
```

---

### 问题 3: API 返回中文乱码 (中优先级) ✅ 已修复

**现象:**
- `/api/skills` 接口返回的中文描述显示为乱码
- 例如: `"description":"æä»¶æä½æè½"` 应为 `"文件操作技能"`

**影响:**
- 前端显示乱码
- 用户体验差

**原因分析:**
- 服务端响应未正确设置 Content-Type charset

**解决方案:** ✅ 已实施
修改 `packages/server/src/index.ts`，确保响应头包含正确的 charset:
```typescript
res.setHeader('Content-Type', 'application/json; charset=utf-8');
```

---

### 问题 4: TypeScript 配置过于宽松 (低优先级)

**现象:**
- `tsconfig.json` 中 `strict: false`
- 多个严格检查选项被禁用

**影响:**
- 可能存在潜在的类型错误
- 代码质量降低

**解决方案:**
逐步启用严格模式:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

---

### 问题 5: 跨包导入使用相对路径 (低优先级)

**现象:**
`packages/core/src/ooda/act.ts` 中:
```typescript
import { ToolRegistry } from '../../../tools/src/registry';
```

**影响:**
- 路径脆弱，重构时容易出错
- 不符合 monorepo 最佳实践

**解决方案:**
使用包名导入:
```typescript
import { ToolRegistry } from '@ooda-agent/tools';
```

---

### 问题 6: 前端端口自动切换未提示 (低优先级)

**现象:**
- 前端启动时端口5173、5174被占用，自动切换到5175
- 无明显警告提示

**影响:**
- 用户可能不知道实际访问地址

**解决方案:**
Vite 默认行为，无需修改。可在控制台输出更明显的提示。

---

## 功能验证清单

### 已验证功能
- [x] 服务端健康检查 `/health`
- [x] 技能列表 `/api/skills`
- [x] 模型列表 `/api/models`
- [x] 会话创建 `POST /api/session`
- [x] WebSocket 连接 `/ws`
- [x] 前端页面加载

### 待验证功能
- [ ] 消息发送完整流程
- [ ] OODA 循环执行
- [ ] 工具调用
- [ ] 权限确认
- [ ] 模型切换
- [ ] 会话历史
- [ ] 会话归档/恢复

---

## 修复优先级建议

1. **已完成**: 问题1 (端口冲突), 问题3 (中文乱码)
2. **尽快修复**: 问题2 (环境变量)
3. **计划修复**: 问题4 (TypeScript配置), 问题5 (导入路径)

---

## 测试命令参考

```powershell
# 启动服务端
npm run dev:server

# 启动前端
npm run dev:app

# 测试 API
Invoke-WebRequest -Uri http://localhost:3001/health
Invoke-WebRequest -Uri http://localhost:3001/api/skills
Invoke-WebRequest -Uri http://localhost:3001/api/models

# 创建会话
$body = '{"message":"你好"}'
Invoke-WebRequest -Uri http://localhost:3001/api/session -Method POST -ContentType 'application/json' -Body $body
```
