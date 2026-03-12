// packages/core/src/multimodal/providers/ollama-vision.ts
import { VisionProvider, ImageAnalysisRequest, ImageAnalysisResult, VisionProviderConfig, ImageContent } from '../types';

export class OllamaVisionProvider implements VisionProvider {
  name = 'ollama-vision';
  model: string;
  private baseUrl: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: VisionProviderConfig) {
    this.model = config.model;
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.maxTokens = config.maxTokens || 2048;
    this.temperature = config.temperature ?? 0.7;
  }

  supportsDetailLevel(): boolean {
    return false;
  }

  async analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResult> {
    const startTime = Date.now();
    
    const imageData = await this.prepareImageData(request.image);
    const prompt = request.prompt || 'Describe this image in detail.';
    
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          images: [imageData],
          stream: false,
          options: {
            temperature: request.options?.temperature ?? this.temperature,
            num_predict: request.options?.maxTokens || this.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama Vision API error: ${error}`);
      }

      const data = await response.json();
      const content = data.response || '';
      
      const endTime = Date.now();
      
      return this.parseAnalysisResult(content, data, endTime - startTime);
    } catch (error) {
      throw new Error(`Failed to analyze image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async prepareImageData(image: ImageContent): Promise<string> {
    if (image.type === 'image_base64') {
      return image.base64 || '';
    }
    
    if (image.type === 'image_url' && image.url) {
      // Fetch image from URL and convert to base64
      try {
        const response = await fetch(image.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        return Buffer.from(buffer).toString('base64');
      } catch (error) {
        throw new Error(`Failed to fetch image from URL: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    throw new Error('Invalid image content: must provide base64 or valid URL');
  }

  private parseAnalysisResult(content: string, rawResponse: unknown, time: number): ImageAnalysisResult {
    const hasPeople = /person|people|human|man|woman|child|face/i.test(content);
    const hasText = /text|word|letter|writing|sign/i.test(content);
    
    // Extract objects
    const objects: { label: string; confidence: number }[] = [];
    const objectMatches = content.match(/(?:see|contains?|shows?|has|with|including)\s+([^,.]+)/gi);
    if (objectMatches) {
      objectMatches.forEach(match => {
        const obj = match.replace(/(?:see|contains?|shows?|has|with|including)\s+/i, '').trim();
        if (obj && obj.length > 2) {
          objects.push({ label: obj, confidence: 0.7 });
        }
      });
    }

    // Extract colors
    const colors: string[] = [];
    const colorMatches = content.match(/\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey|brown|beige|cyan|magenta|teal|navy|maroon|olive)\b/gi);
    if (colorMatches) {
      colors.push(...colorMatches.map(c => c.toLowerCase()));
    }

    // Extract scenes
    const scenes: string[] = [];
    const sceneMatches = content.match(/(?:scene|setting|background|environment|location)\s*(?:is|shows?|depicts?)?\s*:?\s*([^,.]+)/gi);
    if (sceneMatches) {
      sceneMatches.forEach(match => {
        const scene = match.replace(/(?:scene|setting|background|environment|location)\s*(?:is|shows?|depicts?)?\s*:?\s*/i, '').trim();
        if (scene && scene.length > 3) {
          scenes.push(scene);
        }
      });
    }

    return {
      description: content,
      objects,
      text: [],
      scenes: [...new Set(scenes)],
      attributes: {
        colors: [...new Set(colors)],
        quality: 'medium',
        orientation: 'landscape',
        hasPeople,
        hasText,
      },
      rawResponse,
      tokens: this.estimateTokens(content),
      time,
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
