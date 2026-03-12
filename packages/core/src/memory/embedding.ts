import { getConfigManager } from '../config';

export interface EmbeddingConfig {
  provider: 'ollama' | 'openai-compatible';
  model: string;
  baseUrl?: string;
  apiKey?: string;
  dimensions?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
}

export class EmbeddingService {
  private config: EmbeddingConfig;
  private cache: Map<string, number[]> = new Map();
  private maxCacheSize = 1000;

  constructor(config?: Partial<EmbeddingConfig>) {
    const configManager = getConfigManager();
    const providerConfig = configManager.getActiveProviderConfig();
    
    this.config = {
      provider: config?.provider || (providerConfig?.type === 'ollama' ? 'ollama' : 'openai-compatible'),
      model: config?.model || 'nomic-embed-text',
      baseUrl: config?.baseUrl,
      apiKey: config?.apiKey,
      dimensions: config?.dimensions || 768,
    };

    if (!this.config.baseUrl) {
      if (this.config.provider === 'ollama') {
        this.config.baseUrl = 'http://localhost:11434';
      }
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    const cacheKey = this.getCacheKey(text);
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    let embedding: number[];

    try {
      if (this.config.provider === 'ollama') {
        embedding = await this.getOllamaEmbedding(text);
      } else {
        embedding = await this.getOpenAICompatibleEmbedding(text);
      }
    } catch (error) {
      console.warn('[EmbeddingService] Failed to get embedding, using fallback:', error);
      // 使用简单的哈希作为后备 embedding
      embedding = this.generateFallbackEmbedding(text);
    }

    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * 生成后备 embedding（当服务不可用时使用）
   * 使用简单的文本特征哈希
   */
  private generateFallbackEmbedding(text: string): number[] {
    const dimensions = this.config.dimensions || 768;
    const embedding = new Array(dimensions).fill(0);
    
    // 使用字符编码分布生成伪 embedding
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const index = i % dimensions;
      embedding[index] += (charCode % 100) / 100;
    }
    
    // 归一化
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimensions; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  }

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.getEmbedding(text)));
  }

  private async getOllamaEmbedding(text: string): Promise<number[]> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';
    
    // Ollama embedding API 端点是 /api/embed (不是 /api/embeddings)
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        input: text,
      }),
    });

    if (!response.ok) {
      // 如果 /api/embed 失败，尝试旧的 /api/embeddings 端点
      if (response.status === 404) {
        return this.getOllamaEmbeddingLegacy(text);
      }
      throw new Error(`Ollama embedding failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { embeddings: number[][] };
    return data.embeddings[0];
  }

  /**
   * 兼容旧版 Ollama API (/api/embeddings)
   */
  private async getOllamaEmbeddingLegacy(text: string): Promise<number[]> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';
    
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  }

  private async getOpenAICompatibleEmbedding(text: string): Promise<number[]> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const apiKey = this.config.apiKey;
    
    if (!apiKey) {
      throw new Error('API key is required for OpenAI-compatible embedding');
    }

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: text,
        dimensions: this.config.dimensions,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };
    
    return data.data[0].embedding;
  }

  private getCacheKey(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${this.config.model}-${hash}`;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function findMostSimilar(
  queryEmbedding: number[],
  embeddings: Array<{ id: string; embedding: number[] }>,
  topK: number = 5,
  threshold: number = 0.5
): Array<{ id: string; similarity: number }> {
  const similarities = embeddings.map(({ id, embedding }) => ({
    id,
    similarity: cosineSimilarity(queryEmbedding, embedding),
  }));

  return similarities
    .filter(item => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(config?: Partial<EmbeddingConfig>): EmbeddingService {
  if (!embeddingService || config) {
    embeddingService = new EmbeddingService(config);
  }
  return embeddingService;
}

export function resetEmbeddingService(): void {
  embeddingService = null;
}
