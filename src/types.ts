// hawk-bridge type definitions

/** 记忆来源类型 */
export type SourceType = 'text' | 'audio' | 'video';

/** 音频记忆元数据 */
export interface AudioMetadata {
  audio: {
    path: string;                    // 音频文件路径
    duration_ms: number;             // 时长（毫秒）
    speaker?: string;                 // 说话人
    emotion?: string;                // 情绪
    speech_rate?: number;            // 语速 (words/min)
    transcript_segments?: Array<{    // ASR 分段
      start: number;                 // 开始时间 (ms)
      end: number;                   // 结束时间 (ms)
      text: string;
    }>;
  };
}

/** 视频记忆元数据 */
export interface VideoMetadata {
  video: {
    path: string;                    // 视频文件路径
    duration_ms: number;             // 视频时长（毫秒）
    description: string;             // 视频整体描述
    keyframes?: Array<{              // 关键帧
      timestamp: number;             // 时间戳 (ms)
      description: string;           // 帧描述
    }>;
    scene_changes?: number[];        // 场景切换点 (ms)
  };
}

/** 文本记忆元数据 */
export interface TextMetadata {
  text: {
    channel?: string;               // 消息渠道 (feishu, discord, etc)
    user_id?: string;               // 用户 ID
    message_id?: string;            // 原始消息 ID
  };
}

export interface HawkConfig {
  embedding: {
    /** Embedding provider: openai | qianwen | jina | cohere | ollama | openai-compat */
    provider: 'openai' | 'qianwen' | 'jina' | 'cohere' | 'ollama' | 'openai-compat';
    apiKey: string;
    model: string;
    baseURL: string;
    dimensions: number;
  };
  llm: {
    provider: string;
    apiKey: string;
    model: string;
    baseURL: string;
  };
  recall: {
    topK: number;
    minScore: number;
    injectEmoji: string;
  };
  audit: {
    enabled: boolean;
  };
  capture: {
    enabled: boolean;
    maxChunks: number;
    importanceThreshold: number;
    ttlMs: number;         // 0 = never expire
    maxChunkSize: number;  // max chars per chunk
    minChunkSize: number;  // min chars for valid chunk
    dedupSimilarity: number;  // 0–1, skip similar memories
  };
  python: {
    pythonPath: string;
    hawkDir: string;
  };
  /** 多模态记忆配置 */
  multimodal?: {
    enabled: boolean;
    supportedTypes: SourceType[];          // 支持的记忆类型
    audioTranscriber: 'whisper' | 'azure' | 'jina-asr';  // ASR 引擎
    videoFrameRate: number;                // 每秒抽帧数
    maxVideoDuration: number;             // 最大处理视频时长 (秒)
    thumbnailStorage: 'local' | 's3';     // 缩略图存储方式
  };
}

export interface MemoryEntry {
  id: string;
  text: string;
  vector: number[];
  category: 'fact' | 'preference' | 'decision' | 'entity' | 'other';
  scope: string;
  importance: number;
  timestamp: number;
  expiresAt: number;  // 0 = never expire
  accessCount: number;
  lastAccessedAt: number;
  metadata: Record<string, unknown>;
  /** 记忆来源类型: text | audio | video */
  source_type: SourceType;
}

export interface RetrievedMemory {
  id: string;
  text: string;
  score: number;
  category: string;
  metadata: Record<string, unknown>;
  /** 记忆来源类型 */
  source_type: SourceType;
}

export interface ExtractionResult {
  memories: Array<{
    text: string;
    category: 'fact' | 'preference' | 'decision' | 'entity' | 'other';
    importance: number;
    abstract: string;
    overview: string;
  }>;
}

/** 多模态记忆内容（capture 时使用） */
export interface MultimodalContent {
  type: SourceType;
  data: string;                          // 文本内容或文件路径
  metadata?: AudioMetadata | VideoMetadata | TextMetadata;
}

/** 多模态检索请求 */
export interface MultimodalRecallRequest {
  query: string;
  types?: SourceType[];                   // 检索类型，默认 ["text", "audio", "video"]
  topK?: number;
  minScore?: number;
}
