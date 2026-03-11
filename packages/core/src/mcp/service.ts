// packages/core/src/mcp/service.ts
import { MCPMessage, MCPService } from '../skill/interface';
import { createMessage } from './message';

type SubscriptionHandler = (message: MCPMessage) => void;

interface Subscription {
  id: string;
  topic: string;
  handler: SubscriptionHandler;
}

export class MCPServiceImpl implements MCPService {
  private subscriptions: Map<string, Subscription> = new Map();
  private topicSubscriptions: Map<string, string[]> = new Map();
  
  async send(message: MCPMessage): Promise<void> {
    console.log(`MCP Send: ${message.type} - ${message.topic}`, message.payload);
    
    // 通知所有订阅者
    const topicSubs = this.topicSubscriptions.get(message.topic) || [];
    for (const subId of topicSubs) {
      const subscription = this.subscriptions.get(subId);
      if (subscription) {
        try {
          subscription.handler(message);
        } catch (error) {
          console.error(`Error in subscription handler: ${error}`);
        }
      }
    }
  }
  
  subscribe(topic: string, handler: SubscriptionHandler): string {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const subscription: Subscription = {
      id: subscriptionId,
      topic,
      handler,
    };
    
    this.subscriptions.set(subscriptionId, subscription);
    
    // 添加到主题订阅列表
    if (!this.topicSubscriptions.has(topic)) {
      this.topicSubscriptions.set(topic, []);
    }
    this.topicSubscriptions.get(topic)?.push(subscriptionId);
    
    return subscriptionId;
  }
  
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      // 从主题订阅列表中移除
      const topicSubs = this.topicSubscriptions.get(subscription.topic);
      if (topicSubs) {
        const index = topicSubs.indexOf(subscriptionId);
        if (index > -1) {
          topicSubs.splice(index, 1);
        }
      }
      
      this.subscriptions.delete(subscriptionId);
    }
  }
  
  async request(topic: string, payload: unknown): Promise<unknown> {
    // 创建请求消息
    const requestMessage = createMessage({
      type: 'command',
      topic,
      payload,
    });
    
    // 发送请求
    await this.send(requestMessage);
    
    // 这里可以实现请求-响应模式
    // 目前返回一个简单的响应
    return {
      status: 'ok',
      requestId: requestMessage.id,
      timestamp: Date.now(),
    };
  }
  
  publishEvent(topic: string, payload: unknown): Promise<void> {
    const eventMessage = createMessage({
      type: 'event',
      topic,
      payload,
    });
    
    return this.send(eventMessage);
  }
  
  publishStatus(topic: string, payload: unknown): Promise<void> {
    const statusMessage = createMessage({
      type: 'status',
      topic,
      payload,
    });
    
    return this.send(statusMessage);
  }
  
  publishError(topic: string, error: Error): Promise<void> {
    const errorMessage = createMessage({
      type: 'error',
      topic,
      payload: {
        message: error.message,
        stack: error.stack,
      },
    });
    
    return this.send(errorMessage);
  }
}

// 全局MCP服务实例
let mcpService: MCPServiceImpl | null = null;

export function getMCPService(): MCPService {
  if (!mcpService) {
    mcpService = new MCPServiceImpl();
  }
  return mcpService;
}

export function setMCPService(service: MCPServiceImpl): void {
  mcpService = service;
}