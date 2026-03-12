import { z } from 'zod';
import type { MemoryRepository, MemoryRecord, CreateMemoryInput } from '@ooda-agent/storage';
import { getEmbeddingService, cosineSimilarity, findMostSimilar } from './embedding';

export interface Memory {
  id: string;
  content: string;
  embedding: number[];
  metadata: MemoryMetadata;
  createdAt: number;
  lastAccessed: number;
  importance: number;
}

export interface MemoryMetadata {
  type: 'fact' | 'experience' | 'skill' | 'preference';
  source: string;
  tags: string[];
  related: string[];
}

export interface LongTermMemoryConfig {
  repository: MemoryRepository;
  enableEmbedding?: boolean;
  similarityThreshold?: number;
  defaultImportance?: number;
}

export interface SearchOptions {
  useVectorSearch?: boolean;
  limit?: number;
  threshold?: number;
  types?: MemoryMetadata['type'][];
}

export class LongTermMemory {
  private repository: MemoryRepository;
  private enableEmbedding: boolean;
  private similarityThreshold: number;
  private defaultImportance: number;
  private memoryCache: Map<string, Memory> = new Map();

  constructor(config: LongTermMemoryConfig) {
    this.repository = config.repository;
    this.enableEmbedding = config.enableEmbedding ?? true;
    this.similarityThreshold = config.similarityThreshold ?? 0.5;
    this.defaultImportance = config.defaultImportance ?? 0.5;
  }

  async store(memory: Omit<Memory, 'id' | 'createdAt' | 'lastAccessed'>): Promise<string> {
    let embedding = memory.embedding;
    
    if (this.enableEmbedding && (!embedding || embedding.length === 0)) {
      try {
        const embeddingService = getEmbeddingService();
        embedding = await embeddingService.getEmbedding(memory.content);
      } catch (error) {
        console.warn('[LongTermMemory] Failed to generate embedding:', error);
        embedding = [];
      }
    }

    const input: CreateMemoryInput = {
      content: memory.content,
      embedding,
      type: memory.metadata.type,
      source: memory.metadata.source,
      tags: memory.metadata.tags,
      relatedIds: memory.metadata.related,
      importance: memory.importance,
    };

    const id = this.repository.store(input);

    const storedMemory: Memory = {
      id,
      content: memory.content,
      embedding,
      metadata: memory.metadata,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      importance: memory.importance,
    };

    this.memoryCache.set(id, storedMemory);

    return id;
  }

  async retrieve(id: string): Promise<Memory | undefined> {
    if (this.memoryCache.has(id)) {
      const cached = this.memoryCache.get(id)!;
      cached.lastAccessed = Date.now();
      return cached;
    }

    const record = this.repository.retrieve(id);
    if (!record) return undefined;

    const memory = this.recordToMemory(record);
    this.memoryCache.set(id, memory);
    
    return memory;
  }

  async search(query: string, options: SearchOptions = {}): Promise<Memory[]> {
    const {
      useVectorSearch = true,
      limit = 5,
      threshold = this.similarityThreshold,
      types,
    } = options;

    if (useVectorSearch && this.enableEmbedding) {
      return this.vectorSearch(query, limit, threshold, types);
    }

    return this.keywordSearch(query, limit, types);
  }

  private async vectorSearch(
    query: string,
    limit: number,
    threshold: number,
    types?: MemoryMetadata['type'][]
  ): Promise<Memory[]> {
    let queryEmbedding: number[];
    
    try {
      const embeddingService = getEmbeddingService();
      queryEmbedding = await embeddingService.getEmbedding(query);
    } catch (error) {
      console.warn('[LongTermMemory] Failed to generate query embedding, falling back to keyword search:', error);
      return this.keywordSearch(query, limit, types);
    }

    const allRecords = this.getAllRecords(types);
    
    const recordsWithEmbeddings = allRecords.filter(r => r.embedding && r.embedding.length > 0);
    
    if (recordsWithEmbeddings.length === 0) {
      return this.keywordSearch(query, limit, types);
    }

    const similarities = findMostSimilar(
      queryEmbedding,
      recordsWithEmbeddings.map(r => ({ id: r.id, embedding: r.embedding! })),
      limit,
      threshold
    );

    const matchedIds = new Set(similarities.map(s => s.id));
    
    const results = allRecords
      .filter(r => matchedIds.has(r.id))
      .sort((a, b) => {
        const simA = similarities.find(s => s.id === a.id)?.similarity || 0;
        const simB = similarities.find(s => s.id === b.id)?.similarity || 0;
        return simB - simA;
      });

    return results.map(r => this.recordToMemory(r));
  }

  private keywordSearch(
    query: string,
    limit: number,
    types?: MemoryMetadata['type'][]
  ): Memory[] {
    const records = this.getAllRecords(types);
    
    const results = records.filter(r => 
      r.content.toLowerCase().includes(query.toLowerCase())
    );

    return results
      .sort((a, b) => {
        const scoreA = a.importance * 0.7 + (1 - (Date.now() - a.lastAccessed) / (7 * 24 * 60 * 60 * 1000)) * 0.3;
        const scoreB = b.importance * 0.7 + (1 - (Date.now() - b.lastAccessed) / (7 * 24 * 60 * 60 * 1000)) * 0.3;
        return scoreB - scoreA;
      })
      .slice(0, limit)
      .map(r => this.recordToMemory(r));
  }

  private getAllRecords(types?: MemoryMetadata['type'][]): MemoryRecord[] {
    if (types && types.length > 0) {
      return types.flatMap(type => this.repository.findByType(type));
    }
    
    return this.repository.findAll();
  }

  async update(id: string, updates: Partial<Memory>): Promise<boolean> {
    const updateData: Partial<MemoryRecord> = {};
    
    if (updates.content !== undefined) {
      updateData.content = updates.content;
      
      if (this.enableEmbedding) {
        try {
          const embeddingService = getEmbeddingService();
          updateData.embedding = await embeddingService.getEmbedding(updates.content);
        } catch (error) {
          console.warn('[LongTermMemory] Failed to regenerate embedding:', error);
        }
      }
    }
    
    if (updates.importance !== undefined) {
      updateData.importance = updates.importance;
    }
    
    if (updates.metadata?.tags !== undefined) {
      updateData.tags = updates.metadata.tags;
    }

    const success = this.repository.update(id, updateData);
    
    if (success && this.memoryCache.has(id)) {
      const cached = this.memoryCache.get(id)!;
      this.memoryCache.set(id, { ...cached, ...updates, lastAccessed: Date.now() });
    }
    
    return success;
  }

  async delete(id: string): Promise<boolean> {
    const success = this.repository.delete(id);
    if (success) {
      this.memoryCache.delete(id);
    }
    return success;
  }

  async findByType(type: MemoryMetadata['type']): Promise<Memory[]> {
    const records = this.repository.findByType(type);
    return records.map(r => this.recordToMemory(r));
  }

  size(): number {
    return this.repository.size();
  }

  clearCache(): void {
    this.memoryCache.clear();
  }

  private recordToMemory(record: MemoryRecord): Memory {
    return {
      id: record.id,
      content: record.content,
      embedding: record.embedding || [],
      metadata: {
        type: record.type,
        source: record.source,
        tags: record.tags,
        related: record.relatedIds,
      },
      createdAt: record.createdAt,
      lastAccessed: record.lastAccessed,
      importance: record.importance,
    };
  }
}

export class MemoryCompressor {
  static compress(memories: Memory[], maxTokens: number = 1000): Memory {
    const combinedContent = memories.map(m => m.content).join('\n');
    
    const compressedContent = combinedContent.length > maxTokens * 4 
      ? combinedContent.substring(0, maxTokens * 4) + '...' 
      : combinedContent;
    
    return {
      id: `compressed-${Date.now()}`,
      content: compressedContent,
      embedding: [],
      metadata: {
        type: 'experience',
        source: 'compression',
        tags: ['compressed'],
        related: memories.map(m => m.id),
      },
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      importance: memories.reduce((sum, m) => sum + m.importance, 0) / memories.length,
    };
  }
}

export interface PersistentLongTermMemory extends LongTermMemory {}
