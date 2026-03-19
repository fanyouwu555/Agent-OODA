// 健康检查和诊断路由

import { Hono } from 'hono';
import { getDiagnosticsEngine } from '@ooda-agent/core';
import { getPerformanceMonitor } from '@ooda-agent/core';

const app = new Hono();

// 基础健康检查
app.get('/', async (c) => {
  const engine = getDiagnosticsEngine();
  const health = await engine.getHealthStatus();

  return c.json({
    status: health.status,
    uptime: health.uptime,
    version: health.version,
    timestamp: Date.now(),
  });
});

// 详细健康检查
app.get('/detailed', async (c) => {
  const engine = getDiagnosticsEngine();
  const health = await engine.getHealthStatus();

  return c.json({
    status: health.status,
    uptime: health.uptime,
    version: health.version,
    timestamp: Date.now(),
    checks: health.checks,
  });
});

// 系统状态 - 性能指标
app.get('/status/performance', async (c) => {
  try {
    const monitor = getPerformanceMonitor();
    const summary = monitor.getMetricsSummary();
    const health = monitor.getSystemHealth();

    return c.json({
      success: true,
      data: {
        summary,
        health,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: String(error),
    }, 500);
  }
});

// 系统状态 - 意图识别统计
app.get('/status/intents', async (c) => {
  try {
    const { getIntentTracker } = await import('@ooda-agent/core');
    const tracker = getIntentTracker();
    const stats = tracker.getStats();

    return c.json({
      success: true,
      data: {
        stats,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: String(error),
    }, 500);
  }
});

// 系统状态 - 记忆状态
app.get('/status/memory', async (c) => {
  try {
    const { getMemoryIntegrator } = await import('@ooda-agent/core');
    const integrator = getMemoryIntegrator();

    return c.json({
      success: true,
      data: {
        hasIntegrator: !!integrator,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: String(error),
    }, 500);
  }
});

// 系统状态概览
app.get('/status', async (c) => {
  try {
    const { getDiagnosticsEngine } = await import('@ooda-agent/core');
    const { getPerformanceMonitor } = await import('@ooda-agent/core');

    const engine = getDiagnosticsEngine();
    const health = await engine.getHealthStatus();
    const monitor = getPerformanceMonitor();
    const perfSummary = monitor.getMetricsSummary();

    return c.json({
      success: true,
      data: {
        status: health.status,
        uptime: health.uptime,
        version: health.version,
        performance: {
          totalRequests: perfSummary.totalRequests,
          avgResponseTime: perfSummary.avgResponseTime,
          p95ResponseTime: perfSummary.p95ResponseTime,
          errorRate: perfSummary.totalErrors / Math.max(1, perfSummary.totalRequests),
        },
        topIntents: perfSummary.topIntents,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: String(error),
    }, 500);
  }
});

// 运行诊断检查
app.post('/diagnose', async (c) => {
  const body = await c.req.json<{ autoFix?: boolean }>().catch(() => ({ autoFix: false })) as { autoFix?: boolean };
  const engine = getDiagnosticsEngine();

  const report = await engine.runDiagnostics({
    autoFix: body.autoFix ?? false,
  });

  return c.json(report);
});

// 获取诊断报告（只读）
app.get('/diagnose', async (c) => {
  const engine = getDiagnosticsEngine();
  const report = await engine.runDiagnostics({ autoFix: false });

  return c.json(report);
});

export default app;
