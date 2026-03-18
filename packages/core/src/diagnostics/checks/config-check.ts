// 配置自检 - 检查环境变量和配置文件

import { DiagnosticCheck, CheckResult, FixResult } from '../types';
import { getConfigManager } from '../../config';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigCheck implements DiagnosticCheck {
  name = 'Config Check';
  description = '验证环境变量和配置文件';
  category = 'config' as const;

  async check(): Promise<CheckResult> {
    const issues: string[] = [];
    const details: Record<string, unknown> = {};

    // 检查 .env 文件
    const envPaths = [
      path.join(process.cwd(), '.env'),
      path.join(process.cwd(), '..', '..', '.env'),
    ];

    let envFound = false;
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        envFound = true;
        details['envPath'] = envPath;
        break;
      }
    }

    if (!envFound) {
      issues.push('未找到 .env 文件');
    }

    // 检查关键环境变量
    const requiredEnvVars = ['LONGCAT_API_KEY', 'KIMI_API_KEY'];
    const optionalEnvVars = ['PORT', 'DEFAULT_PROVIDER', 'OLLAMA_URL'];

    const envStatus: Record<string, boolean> = {};
    for (const envVar of requiredEnvVars) {
      const value = process.env[envVar];
      envStatus[envVar] = !!value;
      if (!value) {
        issues.push(`环境变量 ${envVar} 未设置`);
      }
    }

    for (const envVar of optionalEnvVars) {
      envStatus[envVar] = !!process.env[envVar];
    }

    details['envStatus'] = envStatus;

    // 检查配置文件
    const configPaths = [
      path.join(process.cwd(), 'config', 'local-model.json'),
      path.join(process.cwd(), 'config', 'longcat-config.json'),
      path.join(process.cwd(), '..', '..', 'config', 'local-model.json'),
    ];

    let configFound = false;
    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        configFound = true;
        details['configPath'] = configPath;
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          details['activeProvider'] = config.activeProvider;
          details['availableProviders'] = Object.keys(config.provider || {});
        } catch (e) {
          issues.push(`配置文件解析失败: ${configPath}`);
        }
        break;
      }
    }

    if (!configFound) {
      issues.push('未找到配置文件');
    }

    // 检查 ConfigManager
    try {
      const configManager = getConfigManager();
      const config = configManager.getConfig();
      details['configManagerActiveProvider'] = config.activeProvider;
      details['configManagerProviders'] = Object.keys(config.provider || {});
    } catch (e) {
      issues.push(`ConfigManager 初始化失败: ${e}`);
    }

    if (issues.length === 0) {
      return {
        status: 'pass',
        message: '配置检查通过',
        details,
      };
    } else if (issues.length <= 2) {
      return {
        status: 'warning',
        message: `配置检查发现问题: ${issues.join(', ')}`,
        details,
      };
    } else {
      return {
        status: 'fail',
        message: `配置检查失败: ${issues.join(', ')}`,
        details,
        error: new Error(issues.join(', ')),
      };
    }
  }

  async fix(): Promise<FixResult> {
    // 尝试创建默认的 .env 文件
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      try {
        const defaultEnv = `# OODA Agent 环境变量配置
PORT=3000

# LongCat API
LONGCAT_API_KEY=your_longcat_api_key_here

# Kimi API
KIMI_API_KEY=your_kimi_api_key_here

# Ollama 配置
OLLAMA_URL=http://localhost:11434
DEFAULT_PROVIDER=ollama
`;
        fs.writeFileSync(envPath, defaultEnv, 'utf-8');
        return {
          status: 'fixed',
          message: `已创建默认 .env 文件: ${envPath}`,
          action: 'create_env_file',
        };
      } catch (e) {
        return {
          status: 'failed',
          message: `创建 .env 文件失败: ${e}`,
          error: e as Error,
        };
      }
    }

    return {
      status: 'skipped',
      message: '.env 文件已存在，无需修复',
    };
  }
}
