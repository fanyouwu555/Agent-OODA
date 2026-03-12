# Ollama 与本地模型部署指南

本文档介绍如何使用 Ollama 部署本地 LLM 模型。

## 安装 Ollama

### Windows

1. 访问 [Ollama 官网](https://ollama.com/download)
2. 下载 Windows 版本安装包
3. 运行安装程序并按照提示完成安装
4. 安装完成后，Ollama 服务会自动启动

### macOS

1. 访问 [Ollama 官网](https://ollama.com/download)
2. 下载 macOS 版本安装包
3. 运行安装程序并按照提示完成安装
4. 安装完成后，Ollama 服务会自动启动

### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

## 部署模型

### 拉取模型

```bash
# 拉取 Qwen3 8B 版本（适合大多数设备）
ollama pull qwen3:8b

# 拉取 Qwen3 72B 版本（需要更多内存）
ollama pull qwen3:72b

# 其他可选模型
ollama pull llama3:8b
ollama pull mistral:7b
ollama pull gemma:7b
```

### 验证模型

```bash
ollama list
```

预期输出：
```
NAME            SIZE    MODIFIED
qwen3:8b        4.8 GB  10 minutes ago
```

## 配置项目

### 1. 编辑配置文件

修改 `config/local-model.json`：

```json
{
  "providers": [
    {
      "id": "local-ollama",
      "name": "Local Ollama",
      "type": "ollama",
      "baseUrl": "http://localhost:11434",
      "models": [
        {
          "id": "qwen3:8b",
          "name": "Qwen3 8B"
        }
      ]
    }
  ]
}
```

### 2. 配置环境变量（可选）

```bash
# .env 文件
OLLAMA_BASE_URL=http://localhost:11434
```

### 3. 测试集成

```bash
# 运行测试脚本
node scripts/simple-ollama-test.js
```

## 启动项目

### 启动 Ollama 服务

确保 Ollama 服务正在运行：

```bash
ollama serve
```

### 启动 OODA Agent

```bash
# 启动服务端
npm run dev:server

# 启动前端
npm run dev:app
```

### 访问应用

打开浏览器访问：http://localhost:5173

## 故障排除

### Ollama 服务未运行

**问题：** 无法连接到 Ollama 服务

**解决方案：**
```bash
# 检查 Ollama 服务状态
ollama list

# 重启 Ollama 服务
ollama serve

# 检查端口 11434 是否被占用
lsof -i :11434
```

### 模型拉取失败

**问题：** 模型下载失败或中断

**解决方案：**
- 检查网络连接
- 尝试使用代理
- 检查磁盘空间是否足够
- 重新拉取模型：`ollama pull qwen3:8b`

### API 调用失败

**问题：** 无法调用 Ollama API

**解决方案：**
- 确认 Ollama 服务正在运行
- 检查模型名称是否正确
- 检查端口配置是否正确
- 测试 API：
  ```bash
  curl http://localhost:11434/api/tags
  ```

## 性能优化

### 内存要求

| 模型 | 最低内存 | 推荐内存 |
|------|----------|----------|
| qwen3:8b | 8GB | 16GB |
| qwen3:72b | 32GB | 64GB |
| llama3:8b | 8GB | 16GB |

### 速度优化

- 使用 SSD 存储模型
- 关闭其他占用资源的应用
- 考虑使用 GPU 加速（如果可用）

### 模型参数调优

在配置文件中调整参数：

```json
{
  "providers": [
    {
      "id": "local-ollama",
      "name": "Local Ollama",
      "type": "ollama",
      "baseUrl": "http://localhost:11434",
      "options": {
        "temperature": 0.7,
        "num_ctx": 4096,
        "num_thread": 4
      },
      "models": [...]
    }
  ]
}
```

参数说明：
- `temperature`: 温度，控制输出多样性 (0-1)
- `num_ctx`: 上下文窗口大小
- `num_thread`: 使用的线程数

## 模型微调（高级）

如需自定义模型，可以创建 Modelfile：

```dockerfile
FROM qwen3:8b

PARAMETER temperature 0.7
PARAMETER num_ctx 4096

SYSTEM """你是一个专业的编程助手，擅长 TypeScript 和 React 开发。"""
```

然后创建自定义模型：

```bash
ollama create my-assistant -f Modelfile
```

## 替代方案

如果本地部署有困难，可以考虑：

### 云服务
- OpenAI API
- Anthropic API
- 百度文心一言 API

### 其他本地方案
- LM Studio
- LocalAI
- text-generation-webui

## 参考资料

- [Ollama 官方文档](https://ollama.com/docs)
- [Qwen3 模型文档](https://modelscope.cn/models/qwen/Qwen3-8B)
- [Ollama GitHub](https://github.com/ollama/ollama)
