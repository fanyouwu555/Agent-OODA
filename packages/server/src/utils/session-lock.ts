// packages/server/src/utils/session-lock.ts
// 会话并发控制工具

/**
 * 会话锁管理器
 * 用于确保同一会话的请求串行执行，避免状态竞争
 */
export class SessionLockManager {
  private locks = new Map<string, Promise<void>>();
  private waitQueue = new Map<string, Array<() => void>>();

  /**
   * 获取会话锁
   * @param sessionId 会话 ID
   * @returns 释放函数
   */
  async acquire(sessionId: string): Promise<() => void> {
    // 等待该 session 的上一个请求完成
    const waitPromise = this.locks.get(sessionId);

    let releaseFn: (() => void) | undefined;
    const promise = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });

    if (waitPromise) {
      // 等待前一个请求完成后再获取锁
      await waitPromise;
    }

    this.locks.set(sessionId, promise);

    // 返回释放函数
    return () => {
      this.locks.delete(sessionId);
      // 处理等待队列中的下一个
      const nextResolve = this.waitQueue.get(sessionId)?.shift();
      if (nextResolve) {
        nextResolve();
      } else {
        this.waitQueue.delete(sessionId);
      }
      releaseFn!();
    };
  }

  /**
   * 使用锁执行函数
   * @param sessionId 会话 ID
   * @param fn 要执行的函数
   * @returns 函数返回值
   */
  async withLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire(sessionId);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * 检查会话是否被锁定
   */
  isLocked(sessionId: string): boolean {
    return this.locks.has(sessionId);
  }

  /**
   * 获取当前锁定的会话数量
   */
  getLockedCount(): number {
    return this.locks.size;
  }

  /**
   * 强制解锁（用于错误恢复）
   */
  forceRelease(sessionId: string): boolean {
    if (!this.locks.has(sessionId)) {
      return false;
    }
    this.locks.delete(sessionId);
    this.waitQueue.delete(sessionId);
    return true;
  }

  /**
   * 获取等待队列长度
   */
  getQueueLength(sessionId: string): number {
    return this.waitQueue.get(sessionId)?.length || 0;
  }
}

// 单例实例
export const sessionLock = new SessionLockManager();

export default SessionLockManager;
