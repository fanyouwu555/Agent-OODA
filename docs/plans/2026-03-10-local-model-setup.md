# 本地模型接入指南

## 安装步骤

### 1. 安装Ollama

**已下载**: `ollama-setup.exe`

**安装方法**:
1. 双击运行 `ollama-setup.exe`
2. 按照安装向导完成安装
3. 安装完成后，Ollama会自动启动

**验证安装**:
```bash
ollama --version
```

### 2. 启动Ollama服务

如果Ollama没有自动启动，可以手动启动：

```bash
ollama serve
```

**验证服务**:
```bash
# 检查服务状态
curl http://localhost:11434/api/tags

# 或使用PowerShell
Invoke-WebRequest -Uri http://localhost:11434/api/tags
```

### 3. 下载Qwen模型

**推荐模型**: `qwen2.5:7b` (约4.7GB)

```bash
# 下载模型
ollama pull qwen2.5:7b

# 查看已下载模型
ollama list

# 测试模型
ollama run qwen2.5:7b
```

**其他可用模型**:
- `qwen2.5:0.5b` - 最小模型，速度快
- `qwen2.5:1.5b` - 小模型，平衡性能
- `qwen2.5:7b` - 推荐模型，性能好 ⭐
- `qwen2.5:14b` - 大模型，性能更好
- `qwen2.5:32b` - 最大模型，性能最佳

### 4. 配置项目

**配置文件已创建**: `config/local-model.json`

**环境变量配置** (创建 `.env` 文件):
```bash
# Ollama配置
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b

# 服务器配置
PORT=3000
NODE_ENV=development
```

### 5. 测试模型连接

**测试脚本已创建**: `test-local-model.mjs`

**运行测试**:
```bash
node test-local-model.mjs
```

**预期结果**:
```
========================================
OODA Agent 本地模型测试
========================================

========================================
测试1: Ollama连接
========================================

✅ Ollama服务状态: 正常
✅ 可用模型数量: 1
✅ 已安装模型:
   - qwen2.5:7b (4.7 GB)

========================================
测试2: 模型生成
========================================

正在测试模型: qwen2.5:7b
提示词: 你好，请用一句话介绍你自己。

✅ 模型响应成功
✅ 响应时间: 1234ms
✅ 响应内容: 你好！我是Qwen，一个由阿里云开发的大语言模型...

========================================
测试报告
========================================

总测试数: 4
通过测试: 4
失败测试: 0
通过率: 100.00%

✅ 所有测试通过！本地模型已成功接入。
```

## 使用方法

### 1. 启动服务器

```bash
npx tsx packages/server/src/index.ts
```

### 2. 测试API

```bash
# 健康检查
curl http://localhost:3000/health

# 技能列表
curl http://localhost:3000/api/skills

# 创建会话
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"message": "你好，请介绍一下你自己"}'
```

### 3. 在代码中使用

```typescript
import { OODALoop } from '@ooda-agent/core';

const oodaLoop = new OODALoop();
const result = await oodaLoop.run('你好，请帮我分析一下这个项目');
console.log(result.output);
```

## 故障排除

### 问题1: Ollama服务无法启动

**症状**: `ollama serve` 命令失败

**解决方案**:
1. 检查端口11434是否被占用:
   ```bash
   netstat -ano | findstr :11434
   ```
2. 如果被占用，终止占用进程或更改Ollama端口
3. 检查防火墙设置，确保允许Ollama通过

### 问题2: 模型下载失败

**症状**: `ollama pull` 命令失败

**解决方案**:
1. 检查网络连接
2. 使用镜像源:
   ```bash
   export OLLAMA_MIRRORS="https://mirror.example.com"
   ollama pull qwen2.5:7b
   ```
3. 手动下载模型文件

### 问题3: 模型响应慢

**症状**: 响应时间过长

**解决方案**:
1. 检查系统资源使用情况
2. 使用更小的模型 (如 qwen2.5:1.5b)
3. 启用GPU加速 (如果有NVIDIA GPU)
4. 增加Ollama内存限制

### 问题4: 内存不足

**症状**: 系统内存不足错误

**解决方案**:
1. 使用更小的模型
2. 增加系统虚拟内存
3. 关闭其他占用内存的程序
4. 调整Ollama内存限制

## 性能优化

### 1. GPU加速

如果有NVIDIA GPU，可以启用CUDA加速:

```bash
# 检查CUDA是否可用
nvidia-smi

# 启用GPU加速
export OLLAMA_GPU=1
ollama serve
```

### 2. 内存优化

```bash
# 设置内存限制
export OLLAMA_MAX_MEMORY=8GB
ollama serve
```

### 3. 并发优化

```bash
# 设置并发请求数
export OLLAMA_MAX_CONCURRENT=4
ollama serve
```

## 高级配置

### 1. 自定义模型参数

```json
{
  "provider": {
    "local-ollama": {
      "models": {
        "qwen2.5:7b": {
          "name": "qwen2.5",
          "temperature": 0.7,
          "topP": 0.9,
          "topK": 40,
          "maxTokens": 2000,
          "repeatPenalty": 1.1,
          "seed": 42
        }
      }
    }
  }
}
```

### 2. 多模型配置

```json
{
  "provider": {
    "local-ollama": {
      "models": {
        "qwen2.5:7b": {
          "name": "qwen2.5",
          "temperature": 0.7,
          "maxTokens": 2000
        },
        "qwen2.5:14b": {
          "name": "qwen2.5",
          "temperature": 0.5,
          "maxTokens": 3000
        }
      }
    }
  }
}
```

## 监控和日志

### 1. 查看Ollama日志

```bash
# Windows
Get-EventLog -LogName Application -Source Ollama

# Linux/Mac
journalctl -u ollama -f
```

### 2. 监控资源使用

```bash
# Windows
Get-Process ollama

# Linux/Mac
top -p $(pgrep ollama)
```

## 安全建议

1. **本地使用**: Ollama默认只监听localhost，不建议暴露到公网
2. **访问控制**: 如果需要远程访问，使用反向代理和认证
3. **资源限制**: 设置合理的内存和CPU限制
4. **定期更新**: 保持Ollama和模型版本更新

## 下一步

完成安装后，您可以:

1. **测试模型**: 运行 `node test-local-model.mjs`
2. **启动服务器**: 运行 `npx tsx packages/server/src/index.ts`
3. **开始使用**: 访问 http://localhost:3000/health

---

**准备好后，请按照上述步骤操作，然后运行测试脚本验证安装。**