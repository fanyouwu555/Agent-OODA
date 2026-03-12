// packages/core/src/multimodal/types.ts

export interface ImageContent {
  type: 'image_url' | 'image_base64';
  url?: string;
  base64?: string;
  mimeType?: string;
  detail?: 'low' | 'high' | 'auto';
}

export interface MultimodalMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | (TextContent | ImageContent)[];
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageAnalysisRequest {
  image: ImageContent;
  prompt?: string;
  options?: ImageAnalysisOptions;
}

export interface ImageAnalysisOptions {
  detail?: 'low' | 'high' | 'auto';
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface ImageAnalysisResult {
  description: string;
  objects: DetectedObject[];
  text: DetectedText[];
  scenes: string[];
  attributes: ImageAttributes;
  rawResponse?: unknown;
  tokens: number;
  time: number;
}

export interface DetectedObject {
  label: string;
  confidence: number;
  boundingBox?: BoundingBox;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedText {
  content: string;
  confidence: number;
  location?: BoundingBox;
}

export interface ImageAttributes {
  colors: string[];
  style?: string;
  quality: 'low' | 'medium' | 'high';
  orientation: 'portrait' | 'landscape' | 'square';
  hasPeople: boolean;
  hasText: boolean;
}

export interface VisionProviderConfig {
  type: 'openai' | 'gemini' | 'ollama' | 'custom';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface VisionProvider {
  name: string;
  model: string;
  analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResult>;
  supportsDetailLevel(): boolean;
}

export interface MultimodalCapabilities {
  supportsVision: boolean;
  supportsAudio: boolean;
  supportsVideo: boolean;
  maxImageSize: number;
  supportedFormats: string[];
}

export interface BatchImageAnalysisRequest {
  images: ImageContent[];
  prompt?: string;
  options?: ImageAnalysisOptions;
  concurrency?: number;
}

export interface BatchImageAnalysisResult {
  results: ImageAnalysisResult[];
  failed: { index: number; error: Error }[];
  totalTime: number;
}
