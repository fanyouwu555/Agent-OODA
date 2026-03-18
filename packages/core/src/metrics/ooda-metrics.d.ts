import { Counter, Histogram, Gauge } from 'prom-client';
export declare const oodaMetrics: {
    stageTotal: Counter<"result" | "stage">;
    stageDuration: Histogram<"stage">;
    activeCycles: Gauge<string>;
    knowledgeGapDetected: Counter<"gap_type" | "confidence_bucket">;
    toolUsage: Counter<"result" | "tool_name">;
    cycleTotal: Counter<"result">;
    cycleDuration: Histogram<never>;
};
export declare function initializeOodaMetrics(): void;
export declare function getOodaMetrics(): Promise<string>;
export declare function getConfidenceBucket(confidence: number): string;
//# sourceMappingURL=ooda-metrics.d.ts.map