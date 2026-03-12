// tests/diagnose/ollama-check.ts
// Ollama 服务诊断工具

import { getEmbeddingService, EmbeddingConfig } from '../../packages/core/src/memory/embedding';

interface OllamaModel {
  name: string;
  model: string;
  size: number;
  parameter_size?: string;
  quantization_level?: string;
}

/**
 * 检查 Ollama 服务状态
 */
async function checkOllamaService(baseUrl: string = 'http://localhost:11434'): Promise<{
  available: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${baseUrl}/api/version`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return {
        available: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json() as { version: string };
    return {
      available: true,
      version: data.version,
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 获取已安装的模型列表
 */
async function listOllamaModels(baseUrl: string = 'http://localhost:11434'): Promise<{
  success: boolean;
  models?: OllamaModel[];
  error?: string;
}> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json() as { models: OllamaModel[] };
    return {
      success: true,
      models: data.models,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 测试 embedding 功能
 */
async function testEmbedding(
  baseUrl: string = 'http://localhost:11434',
  model: string = 'nomic-embed-text'
): Promise<{
  success: boolean;
  embedding?: number[];
  dimensions?: number;
  error?: string;
}> {
  try {
    // 首先尝试新的 /api/embed 端点
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: 'Hello, world!',
      }),
    });

    if (response.ok) {
      const data = await response.json() as { embeddings: number[][] };
      return {
        success: true,
        embedding: data.embeddings[0],
        dimensions: data.embeddings[0].length,
      };
    }

    // 如果失败，尝试旧的 /api/embeddings 端点
    if (response.status === 404) {
      const legacyResponse = await fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: 'Hello, world!',
        }),
      });

      if (legacyResponse.ok) {
        const data = await legacyResponse.json() as { embedding: number[] };
        return {
          success: true,
          embedding: data.embedding,
          dimensions: data.embedding.length,
        };
      }

      return {
        success: false,
        error: `Legacy API also failed: HTTP ${legacyResponse.status}`,
      };
    }

    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 运行完整诊断
 */
async function runDiagnostics() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Ollama 服务诊断工具                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  console.log(`检查地址: ${baseUrl}\n`);

  // 1. 检查服务状态
  console.log('1. 检查 Ollama 服务状态...');
  const serviceStatus = await checkOllamaService(baseUrl);
  if (serviceStatus.available) {
    console.log(`   ✅ 服务正常运行 (版本: ${serviceStatus.version})`);
  } else {
    console.log(`   ❌ 服务不可用: ${serviceStatus.error}`);
    console.log('\n   建议:');
    console.log('   • 确认 Ollama 已安装: https://ollama.com/download');
    console.log('   • 启动 Ollama 服务: ollama serve');
    console.log('   • 检查端口 11434 是否被占用');
    return;
  }

  // 2. 获取模型列表
  console.log('\n2. 获取已安装的模型列表...');
  const modelsResult = await listOllamaModels(baseUrl);
  if (modelsResult.success && modelsResult.models) {
    if (modelsResult.models.length === 0) {
      console.log('   ⚠️  没有安装任何模型');
    } else {
      console.log(`   ✅ 找到 ${modelsResult.models.length} 个模型:`);
      modelsResult.models.forEach((model) => {
        const sizeGB = (model.size / 1024 / 1024 / 1024).toFixed(2);
        console.log(`      • ${model.name} (${sizeGB} GB)`);
        if (model.parameter_size) {
          console.log(`        参数量: ${model.parameter_size}`);
        }
      });
    }
  } else {
    console.log(`   ❌ 获取模型列表失败: ${modelsResult.error}`);
  }

  // 3. 检查 embedding 模型
  console.log('\n3. 检查 Embedding 模型...');
  const embeddingModels = ['nomic-embed-text', 'all-minilm', 'mxbai-embed-large'];
  let hasEmbeddingModel = false;

  for (const model of embeddingModels) {
    const testResult = await testEmbedding(baseUrl, model);
    if (testResult.success) {
      console.log(`   ✅ ${model} 可用 (${testResult.dimensions} 维)`);
      hasEmbeddingModel = true;
      break;
    } else {
      console.log(`   ❌ ${model}: ${testResult.error}`);
    }
  }

  if (!hasEmbeddingModel) {
    console.log('\n   建议:');
    console.log('   • 安装 embedding 模型:');
    console.log('     ollama pull nomic-embed-text');
    console.log('     或');
    console.log('     ollama pull all-minilm');
  }

  // 4. 测试 EmbeddingService
  console.log('\n4. 测试 EmbeddingService...');
  try {
    const embeddingService = getEmbeddingService({
      provider: 'ollama',
      baseUrl,
      model: 'nomic-embed-text',
    });

    const embedding = await embeddingService.getEmbedding('测试文本');
    console.log(`   ✅ EmbeddingService 正常工作`);
    console.log(`   📊 生成 embedding 维度: ${embedding.length}`);
  } catch (error) {
    console.log(`   ❌ EmbeddingService 测试失败: ${error}`);
  }

  // 5. 提供解决方案
  console.log('\n5. 解决方案和建议');
  console.log('   ──────────────────────────────────────────');
  console.log('   如果遇到 404 错误，可能的原因:');
  console.log('   • Ollama 版本过旧，不支持 /api/embed 端点');
  console.log('     解决方案: 升级 Ollama 到最新版本');
  console.log('       ollama --version');
  console.log('       # 访问 https://ollama.com/download 下载最新版');
  console.log('');
  console.log('   • Embedding 模型未安装');
  console.log('     解决方案: 安装 embedding 模型');
  console.log('       ollama pull nomic-embed-text');
  console.log('');
  console.log('   • 服务未启动或端口错误');
  console.log('     解决方案:');
  console.log('       # 启动服务');
  console.log('       ollama serve');
  console.log('       # 或指定端口');
  console.log('       OLLAMA_HOST=0.0.0.0:11434 ollama serve');
  console.log('');
  console.log('   • 环境变量配置');
  console.log('     解决方案: 设置 OLLAMA_BASE_URL');
  console.log('       # Windows PowerShell');
  console.log('       $env:OLLAMA_BASE_URL="http://localhost:11434"');
  console.log('       # Linux/Mac');
  console.log('       export OLLAMA_BASE_URL=http://localhost:11434');
  console.log('');
  console.log('   代码已自动适配:');
  console.log('   • 优先使用 /api/embed (新版 API)');
  console.log('   • 失败时回退到 /api/embeddings (旧版 API)');
  console.log('   • 服务不可用时使用后备 embedding 生成');

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                     诊断完成                               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

// 运行诊断
if (import.meta.url === `file://${process.argv[1]}`) {
  runDiagnostics().catch(console.error);
}

export {
  checkOllamaService,
  listOllamaModels,
  testEmbedding,
  runDiagnostics,
};
