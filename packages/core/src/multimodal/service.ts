// packages/core/src/multimodal/service.ts
import { 
  VisionProvider, 
  VisionProviderConfig, 
  ImageAnalysisRequest, 
  ImageAnalysisResult,
  BatchImageAnalysisRequest,
  BatchImageAnalysisResult,
  ImageContent,
  MultimodalCapabilities,
} from './types';
import { OpenAIVisionProvider } from './providers/openai-vision';
import { OllamaVisionProvider } from './providers/ollama-vision';

export class MultimodalService {
  private provider: VisionProvider | null = null;
  private config: VisionProviderConfig | null = null;

  constructor(config?: VisionProviderConfig) {
    if (config) {
      this.initialize(config);
    }
  }

  initialize(config: VisionProviderConfig): void {
    this.config = config;
    this.provider = this.createProvider(config);
  }

  private createProvider(config: VisionProviderConfig): VisionProvider {
    switch (config.type) {
      case 'openai':
        return new OpenAIVisionProvider(config);
      case 'ollama':
        return new OllamaVisionProvider(config);
      case 'gemini':
        // For now, use OpenAI compatible provider for Gemini
        return new OpenAIVisionProvider({
          ...config,
          baseUrl: config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
        });
      case 'custom':
        return new OpenAIVisionProvider(config);
      default:
        throw new Error(`Unsupported vision provider type: ${config.type}`);
    }
  }

  isInitialized(): boolean {
    return this.provider !== null;
  }

  async analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResult> {
    if (!this.provider) {
      throw new Error('Multimodal service not initialized. Call initialize() first.');
    }

    return this.provider.analyzeImage(request);
  }

  async analyzeImagesBatch(request: BatchImageAnalysisRequest): Promise<BatchImageAnalysisResult> {
    if (!this.provider) {
      throw new Error('Multimodal service not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    const results: ImageAnalysisResult[] = [];
    const failed: { index: number; error: Error }[] = [];
    const concurrency = request.concurrency || 3;

    // Process images in batches with concurrency limit
    for (let i = 0; i < request.images.length; i += concurrency) {
      const batch = request.images.slice(i, i + concurrency);
      const batchPromises = batch.map(async (image, batchIndex) => {
        const globalIndex = i + batchIndex;
        try {
          const result = await this.analyzeImage({
            image,
            prompt: request.prompt,
            options: request.options,
          });
          return { index: globalIndex, result, error: null };
        } catch (error) {
          return { 
            index: globalIndex, 
            result: null, 
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const { index, result, error } of batchResults) {
        if (result) {
          results[index] = result;
        } else if (error) {
          failed.push({ index, error });
        }
      }
    }

    const endTime = Date.now();

    return {
      results,
      failed,
      totalTime: endTime - startTime,
    };
  }

  async analyzeImageFromUrl(url: string, prompt?: string, options?: ImageAnalysisRequest['options']): Promise<ImageAnalysisResult> {
    return this.analyzeImage({
      image: {
        type: 'image_url',
        url,
      },
      prompt,
      options,
    });
  }

  async analyzeImageFromBase64(base64: string, mimeType?: string, prompt?: string, options?: ImageAnalysisRequest['options']): Promise<ImageAnalysisResult> {
    return this.analyzeImage({
      image: {
        type: 'image_base64',
        base64,
        mimeType,
      },
      prompt,
      options,
    });
  }

  getCapabilities(): MultimodalCapabilities {
    const capabilities: Record<string, MultimodalCapabilities> = {
      'gpt-4o': {
        supportsVision: true,
        supportsAudio: false,
        supportsVideo: false,
        maxImageSize: 20 * 1024 * 1024, // 20MB
        supportedFormats: ['png', 'jpeg', 'jpg', 'gif', 'webp'],
      },
      'gpt-4o-mini': {
        supportsVision: true,
        supportsAudio: false,
        supportsVideo: false,
        maxImageSize: 20 * 1024 * 1024,
        supportedFormats: ['png', 'jpeg', 'jpg', 'gif', 'webp'],
      },
      'claude-3-opus': {
        supportsVision: true,
        supportsAudio: false,
        supportsVideo: false,
        maxImageSize: 10 * 1024 * 1024, // 10MB
        supportedFormats: ['png', 'jpeg', 'jpg', 'gif', 'webp'],
      },
      'llava': {
        supportsVision: true,
        supportsAudio: false,
        supportsVideo: false,
        maxImageSize: 100 * 1024 * 1024, // 100MB
        supportedFormats: ['png', 'jpeg', 'jpg'],
      },
    };

    const model = this.config?.model || '';
    
    // Find matching capability
    for (const [key, caps] of Object.entries(capabilities)) {
      if (model.includes(key)) {
        return caps;
      }
    }

    // Default capabilities
    return {
      supportsVision: true,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 20 * 1024 * 1024,
      supportedFormats: ['png', 'jpeg', 'jpg', 'gif', 'webp'],
    };
  }

  supportsDetailLevel(): boolean {
    return this.provider?.supportsDetailLevel() ?? false;
  }

  getProvider(): VisionProvider | null {
    return this.provider;
  }

  getConfig(): VisionProviderConfig | null {
    return this.config;
  }

  /**
   * Validate image before analysis
   */
  validateImage(image: ImageContent): { valid: boolean; error?: string } {
    const capabilities = this.getCapabilities();

    if (image.type === 'image_url') {
      if (!image.url) {
        return { valid: false, error: 'Image URL is required' };
      }
      
      try {
        new URL(image.url);
      } catch {
        return { valid: false, error: 'Invalid image URL' };
      }
    }

    if (image.type === 'image_base64') {
      if (!image.base64) {
        return { valid: false, error: 'Base64 image data is required' };
      }
      
      // Check base64 size (rough estimate)
      const sizeInBytes = (image.base64.length * 3) / 4;
      if (sizeInBytes > capabilities.maxImageSize) {
        return { 
          valid: false, 
          error: `Image size exceeds maximum allowed (${capabilities.maxImageSize / 1024 / 1024}MB)` 
        };
      }
    }

    return { valid: true };
  }

  /**
   * Convert image to base64 from various sources
   */
  async convertToBase64(source: string | Buffer, mimeType?: string): Promise<{ base64: string; mimeType: string }> {
    if (typeof source === 'string') {
      // Check if it's already base64
      if (source.match(/^[A-Za-z0-9+/]*={0,2}$/)) {
        return { base64: source, mimeType: mimeType || 'image/jpeg' };
      }

      // Assume it's a URL or file path
      try {
        new URL(source);
        // It's a URL, fetch it
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const detectedMimeType = blob.type || mimeType || 'image/jpeg';
        return { 
          base64: Buffer.from(buffer).toString('base64'),
          mimeType: detectedMimeType,
        };
      } catch {
        // Try as file path
        try {
          const fs = await import('fs');
          const path = await import('path');
          const buffer = fs.readFileSync(source);
          const ext = path.extname(source).toLowerCase();
          const detectedMimeType = mimeType || this.getMimeTypeFromExtension(ext);
          return {
            base64: buffer.toString('base64'),
            mimeType: detectedMimeType,
          };
        } catch (error) {
          throw new Error(`Failed to read image file: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Buffer input
    return {
      base64: source.toString('base64'),
      mimeType: mimeType || 'image/jpeg',
    };
  }

  private getMimeTypeFromExtension(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
    };
    return mimeTypes[ext] || 'image/jpeg';
  }
}

// Singleton instance
let multimodalService: MultimodalService | null = null;

export function getMultimodalService(): MultimodalService {
  if (!multimodalService) {
    multimodalService = new MultimodalService();
  }
  return multimodalService;
}

export function setMultimodalService(config: VisionProviderConfig): void {
  multimodalService = new MultimodalService(config);
}

export function resetMultimodalService(): void {
  multimodalService = null;
}
