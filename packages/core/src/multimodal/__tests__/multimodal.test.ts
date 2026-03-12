// packages/core/src/multimodal/__tests__/multimodal.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  MultimodalService, 
  getMultimodalService, 
  setMultimodalService, 
  resetMultimodalService,
  OpenAIVisionProvider,
  OllamaVisionProvider,
} from '../index';
import type { ImageAnalysisRequest, VisionProviderConfig, ImageAnalysisResult } from '../types';

describe('MultimodalService', () => {
  beforeEach(() => {
    resetMultimodalService();
  });

  describe('initialization', () => {
    it('should create service without config', () => {
      const service = new MultimodalService();
      expect(service.isInitialized()).toBe(false);
    });

    it('should create service with config', () => {
      const config: VisionProviderConfig = {
        type: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
      };
      const service = new MultimodalService(config);
      expect(service.isInitialized()).toBe(true);
    });

    it('should initialize later', () => {
      const service = new MultimodalService();
      expect(service.isInitialized()).toBe(false);
      
      service.initialize({
        type: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
      });
      
      expect(service.isInitialized()).toBe(true);
    });

    it('should throw error when analyzing without initialization', async () => {
      const service = new MultimodalService();
      
      await expect(service.analyzeImage({
        image: { type: 'image_url', url: 'https://example.com/image.jpg' },
      })).rejects.toThrow('Multimodal service not initialized');
    });
  });

  describe('singleton', () => {
    it('should return same instance from getMultimodalService', () => {
      const service1 = getMultimodalService();
      const service2 = getMultimodalService();
      expect(service1).toBe(service2);
    });

    it('should reset singleton', () => {
      setMultimodalService({
        type: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
      });
      
      expect(getMultimodalService().isInitialized()).toBe(true);
      
      resetMultimodalService();
      
      expect(getMultimodalService().isInitialized()).toBe(false);
    });
  });

  describe('capabilities', () => {
    it('should return capabilities for gpt-4o', () => {
      const service = new MultimodalService({
        type: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
      });

      const caps = service.getCapabilities();
      expect(caps.supportsVision).toBe(true);
      expect(caps.maxImageSize).toBe(20 * 1024 * 1024);
      expect(caps.supportedFormats).toContain('png');
      expect(caps.supportedFormats).toContain('jpeg');
    });

    it('should return capabilities for llava', () => {
      const service = new MultimodalService({
        type: 'ollama',
        model: 'llava',
      });

      const caps = service.getCapabilities();
      expect(caps.supportsVision).toBe(true);
      expect(caps.maxImageSize).toBe(100 * 1024 * 1024);
    });

    it('should return default capabilities for unknown model', () => {
      const service = new MultimodalService({
        type: 'openai',
        model: 'unknown-model',
        apiKey: 'test-key',
      });

      const caps = service.getCapabilities();
      expect(caps.supportsVision).toBe(true);
      expect(caps.maxImageSize).toBe(20 * 1024 * 1024);
    });
  });

  describe('image validation', () => {
    let service: MultimodalService;

    beforeEach(() => {
      service = new MultimodalService({
        type: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
      });
    });

    it('should validate URL image', () => {
      const result = service.validateImage({
        type: 'image_url',
        url: 'https://example.com/image.jpg',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid URL', () => {
      const result = service.validateImage({
        type: 'image_url',
        url: 'not-a-valid-url',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid image URL');
    });

    it('should reject empty URL', () => {
      const result = service.validateImage({
        type: 'image_url',
        url: '',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should validate base64 image', () => {
      const result = service.validateImage({
        type: 'image_base64',
        base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject oversized base64 image', () => {
      const largeBase64 = 'A'.repeat(30 * 1024 * 1024); // ~22MB when decoded
      const result = service.validateImage({
        type: 'image_base64',
        base64: largeBase64,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });
  });

  describe('provider support', () => {
    it('should support detail level for OpenAI', () => {
      const service = new MultimodalService({
        type: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
      });
      expect(service.supportsDetailLevel()).toBe(true);
    });

    it('should not support detail level for Ollama', () => {
      const service = new MultimodalService({
        type: 'ollama',
        model: 'llava',
      });
      expect(service.supportsDetailLevel()).toBe(false);
    });
  });
});

describe('OpenAIVisionProvider', () => {
  const mockConfig: VisionProviderConfig = {
    type: 'openai',
    model: 'gpt-4o',
    apiKey: 'test-api-key',
    baseUrl: 'https://api.openai.com/v1',
  };

  it('should create provider with correct name', () => {
    const provider = new OpenAIVisionProvider(mockConfig);
    expect(provider.name).toBe('openai-vision');
    expect(provider.model).toBe('gpt-4o');
  });

  it('should support detail level', () => {
    const provider = new OpenAIVisionProvider(mockConfig);
    expect(provider.supportsDetailLevel()).toBe(true);
  });

  it('should use default base URL', () => {
    const provider = new OpenAIVisionProvider({
      ...mockConfig,
      baseUrl: undefined,
    });
    expect(provider.name).toBe('openai-vision');
  });
});

describe('OllamaVisionProvider', () => {
  const mockConfig: VisionProviderConfig = {
    type: 'ollama',
    model: 'llava',
    baseUrl: 'http://localhost:11434',
  };

  it('should create provider with correct name', () => {
    const provider = new OllamaVisionProvider(mockConfig);
    expect(provider.name).toBe('ollama-vision');
    expect(provider.model).toBe('llava');
  });

  it('should not support detail level', () => {
    const provider = new OllamaVisionProvider(mockConfig);
    expect(provider.supportsDetailLevel()).toBe(false);
  });

  it('should use default base URL', () => {
    const provider = new OllamaVisionProvider({
      ...mockConfig,
      baseUrl: undefined,
    });
    expect(provider.name).toBe('ollama-vision');
  });
});

describe('Image Analysis Types', () => {
  it('should create valid image analysis request', () => {
    const request: ImageAnalysisRequest = {
      image: {
        type: 'image_url',
        url: 'https://example.com/image.jpg',
        detail: 'high',
      },
      prompt: 'What is in this image?',
      options: {
        maxTokens: 1000,
        temperature: 0.5,
      },
    };

    expect(request.image.type).toBe('image_url');
    expect(request.image.detail).toBe('high');
    expect(request.options?.maxTokens).toBe(1000);
  });

  it('should create valid image analysis result', () => {
    const result: ImageAnalysisResult = {
      description: 'A beautiful landscape with mountains',
      objects: [
        { label: 'mountain', confidence: 0.95 },
        { label: 'sky', confidence: 0.98 },
      ],
      text: [],
      scenes: ['landscape', 'nature'],
      attributes: {
        colors: ['blue', 'green', 'white'],
        quality: 'high',
        orientation: 'landscape',
        hasPeople: false,
        hasText: false,
      },
      tokens: 150,
      time: 1200,
    };

    expect(result.objects).toHaveLength(2);
    expect(result.attributes.hasPeople).toBe(false);
  });
});
