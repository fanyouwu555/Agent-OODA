// LLM连接自检 - 测试API连通性和响应

import { DiagnosticCheck, CheckResult, FixResult } from '../types';
import { getConfigManager } from '../../config';
import { createLLMProvider } from '../../llm/provider';

export class LLMCheck implements DiagnosticCheck {
  name = 'LLM Connection Check';
  description = '验证LLM API连接和响应';
  category = 'llm' as const;

  async check(): Promise<CheckResult> {
    const configManager = getConfigManager();
    const activeProvider = configManager.getActiveProviderName();
    const providerConfig = configManager.getActiveProviderConfig();

    if (!providerConfig) {
      return {
        status: 'fail',
        message: `未找到活跃的Provider配置: ${activeProvider}`,
      };
    }

    const details: Record<string, unknown> = {
      provider: activeProvider,
      type: providerConfig.type,
      model: providerConfig.model,
    };

    try {
      const provider = createLLMProvider(providerConfig);

      // 测试简单的流式调用
      const startTime = Date.now();
      let chunkCount = 0;
      let hasContent = false;

      for await (const chunk of provider.stream('你好')) {
        chunkCount++;
        if (chunk && chunk.trim().length > 0) {
          hasContent = true;
        }
        // 只测试前几个chunk
        if (chunkCount >= 3) break;
      }

      const responseTime = Date.now() - startTime;
      details['responseTime'] = responseTime;
      details['chunkCount'] = chunkCount;
      details['hasContent'] = hasContent;

      if (!hasContent) {
        return {
          status: 'warning',
          message: `LLM API响应但内容为空 (${responseTime}ms)`,
          details,
        };
      }

      return {
        status: 'pass',
        message: `LLM API连接正常，响应时间: ${responseTime}ms`,
        details,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 分析错误类型
      if (errorMessage.includes('429')) {
        details['errorType'] = 'rate_limit';
        return {
          status: 'warning',
          message: `LLM API速率限制: ${errorMessage}`,
          details,
          error: error as Error,
        };
      } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
        details['errorType'] = 'auth';
        return {
          status: 'fail',
          message: `LLM API认证失败: ${errorMessage}`,
          details,
          error: error as Error,
        };
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
        details['errorType'] = 'connection';
        return {
          status: 'fail',
          message: `LLM API连接失败: ${errorMessage}`,
          details,
          error: error as Error,
        };
      }

      return {
        status: 'fail',
        message: `LLM API错误: ${errorMessage}`,
        details,
        error: error as Error,
      };
    }
  }

  async fix(): Promise<FixResult> {
    // LLM连接问题通常无法自动修复，需要用户介入
    return {
      status: 'skipped',
      message: 'LLM连接问题需要手动修复，请检查API密钥和网络连接',
    };
  }
}
