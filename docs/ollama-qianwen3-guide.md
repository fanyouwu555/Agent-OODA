# Ollama 与 Qianwen3 模型部署指南

## 1. 安装 Ollama

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
1. 打开终端
2. 运行命令：`curl -fsSL https://ollama.com/install.sh | sh`
3. 安装完成后，Ollama 服务会自动启动

## 2. 部署 Qianwen3 模型

### 拉取模型
打开终端或命令提示符，运行以下命令：

```bash
# 拉取 8B 版本（适合大多数设备）
ollama pull qwen3:8b

# 拉取 72B 版本（需要更多内存）
ollama pull qwen3:72b
```

### 验证模型
运行以下命令检查模型是否成功拉取：

```bash
ollama list
```

你应该看到类似以下输出：
```
NAME            SIZE    MODIFIEDwen3:8b         4.8 GB  10 minutes ago
```

## 3. 配置项目使用 Qianwen3

### 更新配置文件
修改 `packages/core/src/config/index.ts` 文件，将 LLM 配置改为使用 Ollama：

```typescript
export const defaultConfig: AgentConfig = {
  llm: {
    type: 'ollama',  // 改为 ollama
    model: 'qwen3:8b',  // 使用 qianwen3 8B 模型
    baseUrl: 'http://localhost:11434',  // Ollama 默认地址
    temperature: 0.7,
    maxTokens: 1000,
  },
  // 其他配置保持不变...
};
```

### 测试集成
运行以下命令测试 Ollama 集成：

```bash
node simple-ollama-test.js
```

## 4. 启动项目

### 启动服务端
```bash
npm run dev:server
```

### 启动前端
```bash
npm run dev:app
```

### 访问应用
打开浏览器访问：http://localhost:5173

## 5. 故障排除

### Ollama 服务未运行
- 检查 Ollama 服务是否启动
- 尝试重启 Ollama 服务
- 检查端口 11434 是否被占用

### 模型拉取失败
- 检查网络连接
- 尝试使用代理
- 检查磁盘空间是否足够

### API 调用失败
- 确认 Ollama 服务正在运行
- 检查模型名称是否正确
- 检查端口配置是否正确

## 6. 性能优化

### 内存要求
- qwen3:8b：至少 16GB 内存
- qwen3:72b：至少 32GB 内存

### 速度优化
- 使用 SSD 存储模型
- 关闭其他占用资源的应用
- 考虑使用 GPU 加速（如果可用）

## 7. 高级配置

### 自定义模型参数
在 `config/index.ts` 中可以调整以下参数：

```typescript
llm: {
  type: 'ollama',
  model: 'qwen3:8b',
  baseUrl: 'http://localhost:11434',
  temperature: 0.7,  // 温度，控制输出多样性
  maxTokens: 1000,   // 最大 token 数
}
```

### 模型微调
如果需要，可以使用 Ollama 进行模型微调：

```bash
ollama create my-qwen3 -f Modelfile
```

## 8. 替代方案

### 其他本地模型
如果 Qianwen3 模型不适合你的设备，可以考虑以下模型：
- Llama 3 8B
- Mistral 7B
- Gemma 7B

### 云服务
如果本地部署有困难，可以考虑使用云服务：
- OpenAI API
- Anthropic API
- 百度文心一言 API

## 9. 参考资料

- [Ollama 官方文档](https://ollama.com/docs)
- [Qianwen3 模型文档](https://modelscope.cn/models/qwen/Qwen3-8B)
- [Ollama GitHub 仓库](https://github.com/ollama/ollama)