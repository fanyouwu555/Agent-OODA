declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export class Database {
    constructor(data?: Uint8Array);
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): Array<{
      columns: string[];
      values: unknown[][];
    }>;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export class Statement {
    bind(values: unknown[]): boolean;
    step(): boolean;
    get(): unknown[];
    getAsObject(): Record<string, unknown>;
    reset(): void;
    free(): void;
  }

  export default function initSqlJs(options?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
}
