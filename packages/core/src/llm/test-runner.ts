/**
 * LLM 测试运行器
 * 用于快速运行 LLM 测试
 */

import { getLLMTester, LLMTestResult } from './test-llm.js';

/**
 * 运行 LLM 测试
 */
export async function runLLMTests(): Promise<LLMTestResult[]> {
  const tester = getLLMTester();
  return tester.runAllTests();
}

/**
 * 快速测试连接
 */
export async function quickTest(): Promise<boolean> {
  const tester = getLLMTester();
  const result = await tester.testConnection();
  return result.success;
}

// 如果直接运行此文件
if (require.main === module) {
  runLLMTests()
    .then((results) => {
      const allPassed = results.every(r => r.success);
      process.exit(allPassed ? 0 : 1);
    })
    .catch((error) => {
      console.error('测试运行失败:', error);
      process.exit(1);
    });
}
