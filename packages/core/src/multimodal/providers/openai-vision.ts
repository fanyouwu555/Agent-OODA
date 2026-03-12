// packages/core/src/multimodal/providers/openai-vision.ts
import { VisionProvider, ImageAnalysisRequest, ImageAnalysisResult, VisionProviderConfig, ImageContent } from '../types';

export class OpenAIVisionProvider implements VisionProvider {
  name = 'openai-vision';
  model: string;
  private apiKey: string;
  private baseUrl: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: VisionProviderConfig) {
    this.model = config.model;
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.maxTokens = config.maxTokens || 2048;
    this.temperature = config.temperature ?? 0.7;
  }

  supportsDetailLevel(): boolean {
    return true;
  }

  async analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResult> {
    const startTime = Date.now();
    
    const messages = this.buildMessages(request);
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: request.options?.maxTokens || this.maxTokens,
          temperature: request.options?.temperature ?? this.temperature,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI Vision API error: ${error}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      
      const endTime = Date.now();
      
      return this.parseAnalysisResult(content, data, endTime - startTime);
    } catch (error) {
      throw new Error(`Failed to analyze image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildMessages(request: ImageAnalysisRequest): unknown[] {
    const prompt = request.prompt || 'Describe this image in detail. Include objects, text, scenes, and overall context.';
    
    const imageContent = this.buildImageContent(request.image);
    
    return [
      {
        role: 'system',
        content: 'You are a helpful assistant that analyzes images. Provide detailed descriptions including objects, text, scenes, colors, and context.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          imageContent,
        ],
      },
    ];
  }

  private buildImageContent(image: ImageContent): unknown {
    if (image.type === 'image_url') {
      return {
        type: 'image_url',
        image_url: {
          url: image.url,
          detail: image.detail || 'auto',
        },
      };
    } else {
      const mimeType = image.mimeType || 'image/jpeg';
      return {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${image.base64}`,
          detail: image.detail || 'auto',
        },
      };
    }
  }

  private parseAnalysisResult(content: string, rawResponse: unknown, time: number): ImageAnalysisResult {
    // Try to parse structured JSON response
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Not JSON, treat as plain text description
    }

    if (parsed) {
      return {
        description: String(parsed.description || parsed.summary || content),
        objects: Array.isArray(parsed.objects) ? parsed.objects.map((obj: Record<string, unknown>) => ({
          label: String(obj.label || obj.name || 'unknown'),
          confidence: Number(obj.confidence || 0.8),
          boundingBox: obj.boundingBox as { x: number; y: number; width: number; height: number },
        })) : [],
        text: Array.isArray(parsed.text) ? parsed.text.map((t: Record<string, unknown>) => ({
          content: String(t.content || t.text || ''),
          confidence: Number(t.confidence || 0.8),
        })) : [],
        scenes: Array.isArray(parsed.scenes) ? parsed.scenes.map(String) : 
                Array.isArray(parsed.scene) ? parsed.scene.map(String) : [],
        attributes: {
          colors: Array.isArray(parsed.colors) ? parsed.colors.map(String) : [],
          style: String(parsed.style || ''),
          quality: this.parseQuality(parsed.quality),
          orientation: this.parseOrientation(parsed.orientation),
          hasPeople: Boolean(parsed.hasPeople),
          hasText: Boolean(parsed.hasText),
        },
        rawResponse,
        tokens: this.estimateTokens(content),
        time,
      };
    }

    // Fallback: parse from plain text
    return this.parseFromPlainText(content, rawResponse, time);
  }

  private parseFromPlainText(content: string, rawResponse: unknown, time: number): ImageAnalysisResult {
    const hasPeople = /person|people|human|man|woman|child/i.test(content);
    const hasText = /text|word|letter|character|writing/i.test(content);
    
    // Extract objects (simple heuristic)
    const objects: { label: string; confidence: number }[] = [];
    const objectMatches = content.match(/(?:see|contains?|shows?|has|with)\s+([^,.]+)/gi);
    if (objectMatches) {
      objectMatches.forEach(match => {
        const obj = match.replace(/(?:see|contains?|shows?|has|with)\s+/i, '').trim();
        if (obj && obj.length > 2) {
          objects.push({ label: obj, confidence: 0.7 });
        }
      });
    }

    // Extract colors
    const colors: string[] = [];
    const colorMatches = content.match(/\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey|brown|beige|cyan|magenta)\b/gi);
    if (colorMatches) {
      colors.push(...colorMatches.map(c => c.toLowerCase()));
    }

    return {
      description: content,
      objects,
      text: [],
      scenes: [],
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

  private parseQuality(quality: unknown): 'low' | 'medium' | 'high' {
    if (quality === 'low' || quality === 'medium' || quality === 'high') {
      return quality;
    }
    return 'medium';
  }

  private parseOrientation(orientation: unknown): 'portrait' | 'landscape' | 'square' {
    if (orientation === 'portrait' || orientation === 'landscape' || orientation === 'square') {
      return orientation;
    }
    return 'landscape';
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
