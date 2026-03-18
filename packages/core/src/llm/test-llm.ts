/**
 * LLM 测试模块
 * 用于测试和诊断 LLM 服务的连接和响应
 */

import { getLLMService, setLLMService } from './service';
import { getConfigManager } from '../config';
import { LLMProviderConfig } from './provider';

export interface LLMTestResult {
  success: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  testType: string;
  duration: number;
  response?: string;
  responseLength?: number;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * 获取配置信息
 */
function getConfigInfo(config: LLMProviderConfig | null): { provider: string; model: string; baseUrl: string } {
  if (!config) {
    return { provider: 'unknown', model: 'unknown', baseUrl: 'unknown' };
  }

  const provider = config.type;
  const model = config.model;
  const baseUrl = 'baseUrl' in config ? (config.baseUrl || 'default') : 'default';

  return { provider, model, baseUrl };
}

/**
 * LLM 测试器
 */
export class LLMTester {
  private results: LLMTestResult[] = [];

  /**
   * 获取当前配置信息
   */
  getCurrentConfig(): LLMProviderConfig | null {
    try {
      const configManager = getConfigManager();
      return configManager.getActiveProviderConfig();
    } catch (error) {
      console.error('[LLMTester] 获取配置失败:', error);
      return null;
    }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<LLMTestResult> {
    const startTime = Date.now();
    const config = this.getCurrentConfig();
    const configInfo = getConfigInfo(config);

    if (!config) {
      return {
        success: false,
        provider: configInfo.provider,
        model: configInfo.model,
        baseUrl: configInfo.baseUrl,
        testType: 'connection',
        duration: Date.now() - startTime,
        error: '无法获取 LLM 配置，请检查环境变量或配置文件',
      };
    }

    console.log('[LLMTester] ========================================');
    console.log('[LLMTester] 开始连接测试');
    console.log(`[LLMTester] Provider: ${configInfo.provider}`);
    console.log(`[LLMTester] Model: ${configInfo.model}`);
    console.log(`[LLMTester] BaseUrl: ${configInfo.baseUrl}`);
    console.log('[LLMTester] ----------------------------------------');

    try {
      // 测试简单连接
      const llmService = getLLMService();
      const testPrompt = 'Hello, this is a connection test. Please respond with "OK".';
      
      console.log('[LLMTester] 发送测试请求...');
      const response = await llmService.generate(testPrompt, {
        maxTokens: 50,
        temperature: 0.1,
      });

      const duration = Date.now() - startTime;
      
      console.log(`[LLMTester] 响应耗时: ${duration}ms`);
      console.log(`[LLMTester] 响应长度: ${response.text?.length || 0} 字符`);
      console.log(`[LLMTester] 响应内容: ${response.text?.substring(0, 200)}`);

      if (!response.text || response.text.trim().length === 0) {
        const result: LLMTestResult = {
          success: false,
          provider: configInfo.provider,
          model: configInfo.model,
          baseUrl: configInfo.baseUrl,
          testType: 'connection',
          duration,
          error: 'LLM 返回空响应',
          details: {
            tokens: response.tokens,
            time: response.time,
            hasError: !!response.error,
            errorMessage: response.error,
          },
        };
        this.results.push(result);
        console.log('[LLMTester] ❌ 测试失败: 空响应');
        console.log('[LLMTester] ========================================');
        return result;
      }

      const result: LLMTestResult = {
        success: true,
        provider: configInfo.provider,
        model: configInfo.model,
        baseUrl: configInfo.baseUrl,
        testType: 'connection',
        duration,
        response: response.text,
        responseLength: response.text.length,
        details: {
          tokens: response.tokens,
          time: response.time,
        },
      };
      this.results.push(result);
      console.log('[LLMTester] ✅ 测试成功');
      console.log('[LLMTester] ========================================');
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('[LLMTester] ❌ 测试失败:', errorMessage);
      console.log('[LLMTester] ========================================');

      const result: LLMTestResult = {
        success: false,
        provider: configInfo.provider,
        model: configInfo.model,
        baseUrl: configInfo.baseUrl,
        testType: 'connection',
        duration,
        error: errorMessage,
      };
      this.results.push(result);
      return result;
    }
  }

  /**
   * 测试 JSON 响应
   */
  async testJSONResponse(): Promise<LLMTestResult> {
    const startTime = Date.now();
    const config = this.getCurrentConfig();
    const configInfo = getConfigInfo(config);

    if (!config) {
      return {
        success: false,
        provider: configInfo.provider,
        model: configInfo.model,
        baseUrl: configInfo.baseUrl,
        testType: 'json',
        duration: Date.now() - startTime,
        error: '无法获取 LLM 配置',
      };
    }

    console.log('[LLMTester] ========================================');
    console.log('[LLMTester] 开始 JSON 响应测试');
    console.log('[LLMTester] ----------------------------------------');

    try {
      const llmService = getLLMService();
      const testPrompt = `请分析以下用户输入并返回 JSON 格式：
用户输入: "今日金价"

请返回以下格式的 JSON：
{
  "intentType": "search",
  "parameters": {"query": "今日金价"},
  "confidence": 0.9
}

只返回 JSON，不要其他文字。`;

      console.log('[LLMTester] 发送 JSON 测试请求...');
      const response = await llmService.generate(testPrompt, {
        maxTokens: 500,
        temperature: 0.1,
      });

      const duration = Date.now() - startTime;
      
      console.log(`[LLMTester] 响应耗时: ${duration}ms`);
      console.log(`[LLMTester] 响应内容:\n${response.text}`);

      if (!response.text || response.text.trim().length === 0) {
        const result: LLMTestResult = {
          success: false,
          provider: configInfo.provider,
          model: configInfo.model,
          baseUrl: configInfo.baseUrl,
          testType: 'json',
          duration,
          error: 'LLM 返回空响应',
        };
        this.results.push(result);
        console.log('[LLMTester] ❌ JSON 测试失败: 空响应');
        console.log('[LLMTester] ========================================');
        return result;
      }

      // 尝试解析 JSON
      let parsedJSON = null;
      let parseError = null;
      
      try {
        // 尝试直接解析
        parsedJSON = JSON.parse(response.text);
      } catch (e) {
        // 尝试提取 JSON
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedJSON = JSON.parse(jsonMatch[0]);
          } catch (e2) {
            parseError = e2 instanceof Error ? e2.message : String(e2);
          }
        } else {
          parseError = '无法从响应中提取 JSON';
        }
      }

      const result: LLMTestResult = {
        success: !!parsedJSON,
        provider: configInfo.provider,
        model: configInfo.model,
        baseUrl: configInfo.baseUrl,
        testType: 'json',
        duration,
        response: response.text,
        responseLength: response.text.length,
        details: {
          parsedJSON,
          parseError,
          tokens: response.tokens,
        },
      };
      this.results.push(result);

      if (parsedJSON) {
        console.log('[LLMTester] ✅ JSON 测试成功');
        console.log(`[LLMTester] 解析结果:`, JSON.stringify(parsedJSON, null, 2));
      } else {
        console.log('[LLMTester] ❌ JSON 测试失败:', parseError);
      }
      console.log('[LLMTester] ========================================');
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('[LLMTester] ❌ JSON 测试失败:', errorMessage);
      console.log('[LLMTester] ========================================');

      const result: LLMTestResult = {
        success: false,
        provider: configInfo.provider,
        model: configInfo.model,
        baseUrl: configInfo.baseUrl,
        testType: 'json',
        duration,
        error: errorMessage,
      };
      this.results.push(result);
      return result;
    }
  }

  /**
   * 测试流式响应
   */
  async testStreamResponse(): Promise<LLMTestResult> {
    const startTime = Date.now();
    const config = this.getCurrentConfig();
    const configInfo = getConfigInfo(config);

    if (!config) {
      return {
        success: false,
        provider: configInfo.provider,
        model: configInfo.model,
        baseUrl: configInfo.baseUrl,
        testType: 'stream',
        duration: Date.now() - startTime,
        error: '无法获取 LLM 配置',
      };
    }

    console.log('[LLMTester] ========================================');
    console.log('[LLMTester] 开始流式响应测试');
    console.log('[LLMTester] ----------------------------------------');

    try {
      const llmService = getLLMService();
      const testPrompt = '请用一句话介绍自己。';

      console.log('[LLMTester] 发送流式测试请求...');
      const tokens: string[] = [];
      
      for await (const token of llmService.stream(testPrompt, {
        maxTokens: 100,
        temperature: 0.7,
      })) {
        tokens.push(token);
        if (tokens.length <= 10) {
          console.log(`[LLMTester] Token ${tokens.length}: "${token}"`);
        }
      }

      const duration = Date.now() - startTime;
      const fullResponse = tokens.join('');
      
      console.log(`[LLMTester] 流式响应耗时: ${duration}ms`);
      console.log(`[LLMTester] Token 数量: ${tokens.length}`);
      console.log(`[LLMTester] 完整响应: ${fullResponse.substring(0, 200)}`);

      const result: LLMTestResult = {
        success: tokens.length > 0,
        provider: configInfo.provider,
        model: configInfo.model,
        baseUrl: configInfo.baseUrl,
        testType: 'stream',
        duration,
        response: fullResponse,
        responseLength: fullResponse.length,
        details: {
          tokenCount: tokens.length,
        },
      };
      this.results.push(result);

      if (tokens.length > 0) {
        console.log('[LLMTester] ✅ 流式测试成功');
      } else {
        console.log('[LLMTester] ❌ 流式测试失败: 未收到任何 token');
      }
      console.log('[LLMTester] ========================================');
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('[LLMTester] ❌ 流式测试失败:', errorMessage);
      console.log('[LLMTester] ========================================');

      const result: LLMTestResult = {
        success: false,
        provider: configInfo.provider,
        model: configInfo.model,
        baseUrl: configInfo.baseUrl,
        testType: 'stream',
        duration,
        error: errorMessage,
      };
      this.results.push(result);
      return result;
    }
  }

  /**
   * 运行所有测试
   */
  async runAllTests(): Promise<LLMTestResult[]> {
    this.results = [];
    
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║              LLM 服务全面测试开始                      ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('\n');

    // 测试 1: 连接测试
    await this.testConnection();
    console.log('\n');

    // 测试 2: JSON 响应测试
    await this.testJSONResponse();
    console.log('\n');

    // 测试 3: 流式响应测试
    await this.testStreamResponse();
    console.log('\n');

    // 打印测试报告
    this.printReport();

    return this.results;
  }

  /**
   * 打印测试报告
   */
  printReport(): void {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║                   LLM 测试报告                         ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('\n');

    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;

    console.log(`总测试数: ${this.results.length}`);
    console.log(`✅ 通过: ${passed}`);
    console.log(`❌ 失败: ${failed}`);
    console.log('\n');

    this.results.forEach((result, index) => {
      console.log(`测试 ${index + 1}: ${result.testType}`);
      console.log(`  Provider: ${result.provider}`);
      console.log(`  Model: ${result.model}`);
      console.log(`  BaseUrl: ${result.baseUrl}`);
      console.log(`  状态: ${result.success ? '✅ 通过' : '❌ 失败'}`);
      console.log(`  耗时: ${result.duration}ms`);
      
      if (result.responseLength !== undefined) {
        console.log(`  响应长度: ${result.responseLength} 字符`);
      }
      
      if (result.error) {
        console.log(`  错误: ${result.error}`);
      }
      
      console.log('');
    });

    console.log('╔════════════════════════════════════════════════════════╗');
    console.log(`║  测试结果: ${passed === this.results.length ? '全部通过 ✅' : '存在失败 ❌'}                    ║`);
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('\n');
  }

  /**
   * 获取测试结果
   */
  getResults(): LLMTestResult[] {
    return this.results;
  }
}

// 导出单例
let llmTester: LLMTester | null = null;

export function getLLMTester(): LLMTester {
  if (!llmTester) {
    llmTester = new LLMTester();
  }
  return llmTester;
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  const tester = getLLMTester();
  tester.runAllTests().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });
}
