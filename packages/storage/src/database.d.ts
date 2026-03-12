import { Database as SqlJsDatabase } from 'sql.js';
export declare class DatabaseManager {
    private db;
    private SQL;
    private dbPath;
    private initialized;
    private pendingWrites;
    private flushTimer;
    private autoSave;
    private flushIntervalMs;
    private maxPendingWrites;
    constructor(dbPath: string);
    private startFlushTimer;
    private stopFlushTimer;
    initialize(): Promise<void>;
    getDatabase(): SqlJsDatabase | null;
    save(): void;
    close(): void;
    run(sql: string, params?: any[]): {
        changes: number;
    };
    runImmediate(sql: string, params?: any[]): {
        changes: number;
    };
    flush(): void;
    get(sql: string, params?: any[]): any | undefined;
    all(sql: string, params?: any[]): any[];
}
//# sourceMappingURL=database.d.ts.map