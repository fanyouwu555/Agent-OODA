// packages/core/src/metrics/ooda-metrics.ts
import { Counter, Histogram, Gauge, register } from 'prom-client';
// OODA循环指标
export const oodaMetrics = {
    // 阶段执行计数器
    stageTotal: new Counter({
        name: 'ooda_stage_total',
        help: 'Total number of OODA stage executions',
        labelNames: ['stage', 'result'] // stage: observe|orient|decide|act, result: success|failure
    }),
    // 阶段执行耗时直方图
    stageDuration: new Histogram({
        name: 'ooda_stage_duration_seconds',
        help: 'Duration of OODA stage executions in seconds',
        labelNames: ['stage'],
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    }),
    // 当前活跃循环数
    activeCycles: new Gauge({
        name: 'ooda_active_cycles',
        help: 'Number of currently active OODA cycles'
    }),
    // 知识缺口检测结果
    knowledgeGapDetected: new Counter({
        name: 'ooda_knowledge_gap_detected_total',
        help: 'Total number of detected knowledge gaps by type',
        labelNames: ['gap_type', 'confidence_bucket'] // gap_type: realtime_info|web_search|etc, confidence_bucket: 0-0.3|0.3-0.6|0.6-0.9|0.9-1.0
    }),
    // 工具使用统计
    toolUsage: new Counter({
        name: 'ooda_tool_usage_total',
        help: 'Total usage of tools by tool name and result',
        labelNames: ['tool_name', 'result'] // result: success|failure|timeout
    }),
    // OODA循环总数
    cycleTotal: new Counter({
        name: 'ooda_cycle_total',
        help: 'Total number of OODA cycles completed',
        labelNames: ['result'] // result: success|failure|timeout
    }),
    // 循环耗时直方图
    cycleDuration: new Histogram({
        name: 'ooda_cycle_duration_seconds',
        help: 'Duration of OODA cycle executions in seconds',
        labelNames: [],
        buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300]
    })
};
// 初始化函数（在应用启动时调用）
export function initializeOodaMetrics() {
    // 注册所有指标到默认注册表
    register.registerMetric(oodaMetrics.stageTotal);
    register.registerMetric(oodaMetrics.stageDuration);
    register.registerMetric(oodaMetrics.activeCycles);
    register.registerMetric(oodaMetrics.knowledgeGapDetected);
    register.registerMetric(oodaMetrics.toolUsage);
    register.registerMetric(oodaMetrics.cycleTotal);
    register.registerMetric(oodaMetrics.cycleDuration);
}
// 获取Prometheus格式的指标
export async function getOodaMetrics() {
    return await register.metrics();
}
// 辅助方法：将置信度转换为bucket
export function getConfidenceBucket(confidence) {
    if (confidence < 0.3)
        return '0-0.3';
    if (confidence < 0.6)
        return '0.3-0.6';
    if (confidence < 0.9)
        return '0.6-0.9';
    return '0.9-1.0';
}
//# sourceMappingURL=ooda-metrics.js.map