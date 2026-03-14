// packages/core/src/event-bus/index.ts
// Event Bus - 统一事件总线，用于后端模块间的实时通信

export interface EventSubscription {
  id: string;
  namespaces: string[];
  sessionId?: string;
  handler: EventHandler;
}

export type EventHandler = (event: BackendEvent) => void | Promise<void>;

export interface BackendEvent {
  id: string;
  namespace: EventNamespace;
  action: EventAction;
  sessionId?: string;
  payload: unknown;
  timestamp: number;
}

export type EventNamespace = 
  | 'session'    // 会话生命周期
  | 'message'    // 消息相关
  | 'tool'       // 工具调用
  | 'permission' // 权限请求
  | 'agent'      // Agent 状态
  | 'system';    // 系统事件

export type EventAction = 
  | 'created'    // 创建
  | 'updated'    // 更新
  | 'completed'  // 完成
  | 'failed'     // 失败
  | 'part';      // 部分（用于流式）

export interface EventBusOptions {
  enableLogging?: boolean;
}

export class EventBus {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private namespaceSubscriptions: Map<string, Set<string>> = new Map();
  private sessionSubscriptions: Map<string, Set<string>> = new Map();
  private options: EventBusOptions;

  constructor(options: EventBusOptions = {}) {
    this.options = options;
  }

  /**
   * 订阅事件
   * @param namespaces 感兴趣的事件命名空间
   * @param handler 事件处理函数
   * @param sessionId 可选：只订阅特定会话的事件
   * @returns 订阅 ID，用于取消订阅
   */
  subscribe(
    namespaces: string[], 
    handler: EventHandler, 
    sessionId?: string
  ): string {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const subscription: EventSubscription = {
      id: subscriptionId,
      namespaces,
      sessionId,
      handler,
    };
    
    this.subscriptions.set(subscriptionId, subscription);
    
    // 注册到命名空间索引
    for (const ns of namespaces) {
      if (!this.namespaceSubscriptions.has(ns)) {
        this.namespaceSubscriptions.set(ns, new Set());
      }
      this.namespaceSubscriptions.get(ns)!.add(subscriptionId);
    }
    
    // 注册到会话索引（如果指定了 sessionId）
    if (sessionId) {
      if (!this.sessionSubscriptions.has(sessionId)) {
        this.sessionSubscriptions.set(sessionId, new Set());
      }
      this.sessionSubscriptions.get(sessionId)!.add(subscriptionId);
    }
    
    if (this.options.enableLogging) {
      console.log(`[EventBus] Subscribed: ${subscriptionId} to [${namespaces.join(', ')}]` + (sessionId ? ` (session: ${sessionId})` : ''));
    }
    
    return subscriptionId;
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;
    
    // 从命名空间索引中移除
    for (const ns of subscription.namespaces) {
      this.namespaceSubscriptions.get(ns)?.delete(subscriptionId);
    }
    
    // 从会话索引中移除
    if (subscription.sessionId) {
      this.sessionSubscriptions.get(subscription.sessionId)?.delete(subscriptionId);
    }
    
    this.subscriptions.delete(subscriptionId);
    
    if (this.options.enableLogging) {
      console.log(`[EventBus] Unsubscribed: ${subscriptionId}`);
    }
  }

  /**
   * 发布事件
   */
  publish(event: BackendEvent): void {
    if (this.options.enableLogging) {
      console.log(`[EventBus] Publishing: ${event.namespace}.${event.action}`, 
        event.sessionId ? ` (session: ${event.sessionId})` : '');
    }
    
    // 获取该命名空间的所有订阅者
    const namespaceSubs = this.namespaceSubscriptions.get(event.namespace) || [];
    
    // 收集需要触发的订阅
    const toTrigger: EventSubscription[] = [];
    
    for (const subId of namespaceSubs) {
      const sub = this.subscriptions.get(subId);
      if (!sub) continue;
      
      // 检查会话过滤
      if (sub.sessionId && event.sessionId && sub.sessionId !== event.sessionId) {
        continue;
      }
      
      toTrigger.push(sub);
    }
    
    // 触发所有匹配的订阅
    for (const sub of toTrigger) {
      try {
        sub.handler(event);
      } catch (error) {
        console.error(`[EventBus] Error in handler for ${event.namespace}.${event.action}:`, error);
      }
    }
  }

  /**
   * 获取会话的所有订阅者数量
   */
  getSessionSubscriberCount(sessionId: string): number {
    return this.sessionSubscriptions.get(sessionId)?.size || 0;
  }

  /**
   * 获取命名空间的订阅者数量
   */
  getNamespaceSubscriberCount(namespace: string): number {
    return this.namespaceSubscriptions.get(namespace)?.size || 0;
  }

  /**
   * 创建带 ID 的事件
   */
  createEvent(
    namespace: EventNamespace,
    action: EventAction,
    payload: unknown,
    sessionId?: string
  ): BackendEvent {
    return {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      namespace,
      action,
      sessionId,
      payload,
      timestamp: Date.now(),
    };
  }

  /**
   * 发布便捷方法
   */
  emit(
    namespace: EventNamespace,
    action: EventAction,
    payload: unknown,
    sessionId?: string
  ): void {
    const event = this.createEvent(namespace, action, payload, sessionId);
    this.publish(event);
  }
}

// 全局单例
let eventBusInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus({ enableLogging: process.env.NODE_ENV !== 'production' });
  }
  return eventBusInstance;
}

export function setEventBus(bus: EventBus): void {
  eventBusInstance = bus;
}

// 便捷方法
export const eventBus = {
  subscribe: (...args: Parameters<EventBus['subscribe']>) => getEventBus().subscribe(...args),
  unsubscribe: (...args: Parameters<EventBus['unsubscribe']>) => getEventBus().unsubscribe(...args),
  publish: (...args: Parameters<EventBus['publish']>) => getEventBus().publish(...args),
  emit: (...args: Parameters<EventBus['emit']>) => getEventBus().emit(...args),
  getSessionSubscriberCount: (...args: Parameters<EventBus['getSessionSubscriberCount']>) => 
    getEventBus().getSessionSubscriberCount(...args),
};
