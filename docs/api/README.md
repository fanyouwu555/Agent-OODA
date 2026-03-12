# API 文档

本文档介绍 OODA Agent 提供的 REST API 和 WebSocket 接口。

## 基础信息

- **基础 URL**: `http://localhost:3000`
- **WebSocket URL**: `ws://localhost:3000/ws`
- **内容类型**: `application/json`

## 认证

部分接口需要 JWT 认证。在请求头中添加：

```
Authorization: Bearer <token>
```

## 接口列表

### 健康检查

检查服务运行状态。

```http
GET /health
```

**响应示例：**

```json
{
  "status": "ok",
  "timestamp": 1234567890,
  "skills": 9,
  "mcp": "active"
}
```

---

### 获取技能列表

获取所有可用的技能列表。

```http
GET /api/skills
```

**响应示例：**

```json
[
  {
    "name": "file_operation",
    "description": "文件操作技能",
    "category": "file",
    "version": "1.0.0"
  },
  {
    "name": "web_search",
    "description": "网络搜索技能",
    "category": "network",
    "version": "1.0.0"
  }
]
```

---

### 获取模型列表

获取所有配置的 LLM 提供商和模型。

```http
GET /api/models
```

**响应示例：**

```json
{
  "providers": [
    {
      "id": "local-ollama",
      "name": "Local Ollama",
      "type": "ollama",
      "models": [
        { "id": "qwen3:8b", "name": "Qwen3 8B" }
      ]
    }
  ]
}
```

---

### 创建会话

创建新的对话会话。

```http
POST /api/session
Content-Type: application/json

{
  "message": "你好"
}
```

**响应示例：**

```json
{
  "sessionId": "session-123",
  "status": "created"
}
```

---

### 获取会话详情

获取指定会话的详细信息。

```http
GET /api/session/{sessionId}
```

**响应示例：**

```json
{
  "id": "session-123",
  "createdAt": 1234567890,
  "updatedAt": 1234567891,
  "messageCount": 5
}
```

---

### 获取会话列表

获取所有会话的列表。

```http
GET /api/sessions
```

**响应示例：**

```json
{
  "sessions": [
    {
      "id": "session-123",
      "createdAt": 1234567890,
      "messageCount": 5
    }
  ]
}
```

---

### 发送消息

向指定会话发送消息。

```http
POST /api/session/{sessionId}/message
Content-Type: application/json

{
  "message": "读取文件：test.txt"
}
```

**响应：** Server-Sent Events (SSE) 流

**事件类型：**

| 事件 | 说明 |
|------|------|
| `phase_start` | 阶段开始 |
| `thinking` | 思考过程 |
| `tool_call` | 工具调用 |
| `tool_result` | 工具执行结果 |
| `content` | 内容输出 |
| `complete` | 处理完成 |
| `error` | 错误信息 |

---

### 获取会话历史

获取指定会话的历史消息。

```http
GET /api/session/{sessionId}/history
```

**响应示例：**

```json
[
  {
    "id": "initial",
    "role": "user",
    "content": "读取文件：test.txt",
    "timestamp": 1234567890
  },
  {
    "id": "step-0",
    "role": "assistant",
    "content": "正在读取文件...",
    "timestamp": 1234567891
  }
]
```

---

### 删除会话

删除指定的会话。

```http
DELETE /api/session/{sessionId}
```

**响应示例：**

```json
{
  "success": true
}
```

---

## WebSocket 接口

### 连接

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
```

### 消息格式

**客户端发送：**

```json
{
  "type": "message",
  "sessionId": "session-123",
  "content": "你好"
}
```

**服务端推送：**

```json
{
  "type": "phase_start",
  "phase": "observe",
  "content": "正在观察和理解您的请求...",
  "timestamp": 1234567890
}
```

### 事件类型

| 类型 | 说明 |
|------|------|
| `phase_start` | OODA 阶段开始 |
| `phase_complete` | OODA 阶段完成 |
| `thinking` | 思考过程 |
| `tool_call` | 工具调用 |
| `tool_result` | 工具结果 |
| `content` | 内容输出 |
| `error` | 错误 |
| `complete` | 完成 |

---

## 错误处理

### 错误响应格式

```json
{
  "error": {
    "type": "permission_denied",
    "message": "权限不足：无法访问工作目录外的文件",
    "timestamp": 1234567890
  }
}
```

### 错误类型

| 类型 | 说明 | HTTP 状态码 |
|------|------|-------------|
| `permission_denied` | 权限不足 | 403 |
| `not_found` | 资源不存在 | 404 |
| `validation_error` | 参数验证失败 | 400 |
| `timeout` | 请求超时 | 408 |
| `internal_error` | 内部错误 | 500 |

---

## 限流

API 请求有速率限制：

- 普通接口：100 请求/分钟
- 认证接口：1000 请求/分钟

超过限制会返回 429 状态码。

---

## 代码示例

### JavaScript/Fetch

```javascript
// 创建会话
const response = await fetch('http://localhost:3000/api/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '你好' })
});
const { sessionId } = await response.json();

// 发送消息（SSE）
const eventSource = new EventSource(
  `http://localhost:3000/api/session/${sessionId}/message`,
  { headers: { 'Content-Type': 'application/json' } }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

### Python/Requests

```python
import requests

# 创建会话
response = requests.post(
    'http://localhost:3000/api/session',
    json={'message': '你好'}
)
session_id = response.json()['sessionId']

# 获取技能列表
response = requests.get('http://localhost:3000/api/skills')
skills = response.json()
```

### cURL

```bash
# 健康检查
curl http://localhost:3000/health

# 创建会话
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'

# 获取历史记录
curl http://localhost:3000/api/session/{session-id}/history
```
