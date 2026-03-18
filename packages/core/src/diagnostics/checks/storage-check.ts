// 存储自检 - 检查数据库和文件系统

import { DiagnosticCheck, CheckResult, FixResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class StorageCheck implements DiagnosticCheck {
  name = 'Storage Check';
  description = '验证存储系统（数据库和文件系统）';
  category = 'storage' as const;

  async check(): Promise<CheckResult> {
    const issues: string[] = [];
    const details: Record<string, unknown> = {};

    // 检查数据目录
    const dataPaths = [
      path.join(process.cwd(), 'data'),
      path.join(process.cwd(), '..', 'server', 'data'),
    ];

    let dataDirFound = false;
    for (const dataPath of dataPaths) {
      if (fs.existsSync(dataPath)) {
        dataDirFound = true;
        details['dataPath'] = dataPath;

        // 检查目录权限
        try {
          const testFile = path.join(dataPath, '.write_test');
          fs.writeFileSync(testFile, 'test', 'utf-8');
          fs.unlinkSync(testFile);
          details['writable'] = true;
        } catch (e) {
          issues.push(`数据目录无写入权限: ${dataPath}`);
          details['writable'] = false;
        }

        // 检查数据库文件
        const dbFiles = ['agent.db', 'ooda-agent.db'];
        const foundDbFiles: string[] = [];
        for (const dbFile of dbFiles) {
          const dbPath = path.join(dataPath, dbFile);
          if (fs.existsSync(dbPath)) {
            foundDbFiles.push(dbFile);
            const stats = fs.statSync(dbPath);
            details[`${dbFile}Size`] = stats.size;
          }
        }
        details['dbFiles'] = foundDbFiles;

        break;
      }
    }

    if (!dataDirFound) {
      issues.push('未找到数据目录');
    }

    // 检查日志目录
    const logPaths = [
      path.join(process.cwd(), 'logs'),
      path.join(process.cwd(), '..', 'server', 'logs'),
    ];

    let logDirFound = false;
    for (const logPath of logPaths) {
      if (fs.existsSync(logPath)) {
        logDirFound = true;
        details['logPath'] = logPath;
        break;
      }
    }

    if (!logDirFound) {
      issues.push('未找到日志目录');
    }

    if (issues.length === 0) {
      return {
        status: 'pass',
        message: '存储检查通过',
        details,
      };
    } else if (issues.length <= 1) {
      return {
        status: 'warning',
        message: `存储检查发现问题: ${issues.join(', ')}`,
        details,
      };
    } else {
      return {
        status: 'fail',
        message: `存储检查失败: ${issues.join(', ')}`,
        details,
      };
    }
  }

  async fix(): Promise<FixResult> {
    const fixes: string[] = [];

    // 尝试创建数据目录
    const dataPath = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataPath)) {
      try {
        fs.mkdirSync(dataPath, { recursive: true });
        fixes.push(`创建数据目录: ${dataPath}`);
      } catch (e) {
        return {
          status: 'failed',
          message: `创建数据目录失败: ${e}`,
          error: e as Error,
        };
      }
    }

    // 尝试创建日志目录
    const logPath = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logPath)) {
      try {
        fs.mkdirSync(logPath, { recursive: true });
        fixes.push(`创建日志目录: ${logPath}`);
      } catch (e) {
        return {
          status: 'failed',
          message: `创建日志目录失败: ${e}`,
          error: e as Error,
        };
      }
    }

    if (fixes.length > 0) {
      return {
        status: 'fixed',
        message: `已修复存储问题: ${fixes.join(', ')}`,
        action: fixes.join(', '),
      };
    }

    return {
      status: 'skipped',
      message: '存储目录已存在，无需修复',
    };
  }
}
