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
    /** Embedding provider: openai | qianwen | jina | cohere | ollama | openai-compat | minimax */
    provider: 'openai' | 'qianwen' | 'jina' | 'cohere' | 'ollama' | 'openai-compat' | 'minimax';
    apiKey: string;
    model: string;
    baseURL: string;
    dimensions: number;
    /** HTTP(S) proxy URL, e.g. "http://192.168.1.109:10808" — also read from HAWK_PROXY env var */
    proxy?: string;
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
    rerankEnabled?: boolean;
    rerankModel?: string;
  };
  logging: {
    level: string;   // 'debug' | 'info' | 'warn' | 'error'
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
  /** 主动回顾提醒配置 */
  review?: {
    enabled: boolean;
    intervalDays: number;     // 多少天回顾一次
    minReliability: number;  // 只回顾低于此可靠性的记忆
    batchSize: number;        // 每次回顾多少条
  };
  /** 团队作用域配置 */
  team?: {
    enabled: boolean;
    teamId?: string;
  };
  python: {
    pythonPath: string;
    hawkDir: string;
    /** Use hawk-memory-api HTTP server instead of spawning subprocess for extraction */
    httpMode?: boolean;
    /** Base URL of hawk-memory-api server (default: http://127.0.0.1:18789) */
    httpBase?: string;
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
  /** 国际化配置 */
  i18n?: {
    lang?: 'zh' | 'en';
  };
}

export interface MemoryEntry {
  id: string;
  /** Short name for dual-selector header scanning */
  name: string;
  /** One-line description used by the LLM selector to decide relevance */
  description: string;
  text: string;
  vector: number[];
  category: 'fact' | 'preference' | 'decision' | 'entity' | 'other';
  importance: number;
  timestamp: number;
  expiresAt: number;  // 0 = never expire
  accessCount: number;
  lastAccessedAt: number;
  /** 软删除标记：非 null = 已遗忘 */
  deletedAt: number | null;
  /** 可信度 0-1，初始 0.5 */
  reliability: number;
  /** 被验证次数 */
  verificationCount: number;
  /** 最后验证时间 */
  lastVerifiedAt: number | null;
  /** 锁定标记：true = 忽略 decay，永不过期 */
  locked: boolean;
  /** 纠正历史：每次纠正记录 { ts, oldText, newText } */
  correctionHistory: Array<{ ts: number; oldText: string; newText: string }>;
  /** 所属对话 session ID（用于追溯来源） */
  sessionId: string | null;
  /** 记录创建时间 */
  createdAt: number;
  /** 最后修改时间 */
  updatedAt: number;
  /** 记忆作用域：personal | team | project */
  scope: string;
  /** 用户手动指定的重要性倍数（覆盖 capture 时的 LLM 判断） */
  importanceOverride: number;
  /** 冷启动保护截止时间：此时间前 decay 免疫 */
  coldStartUntil: number | null;
  metadata: Record<string, unknown>;
  /** 记忆来源类型: text | audio | video */
  source_type: SourceType;
  /** 记忆来源：capture | evolution-success | evolution-failure | user-import */
  source: string;
  /** Drift note: what might be stale (filled by dream consolidation) */
  driftNote: string | null;
  /** When drift was last detected */
  driftDetectedAt: number | null;
  /** Timestamp of last recall (feedback loop) */
  last_used_at: number | null;
  /** Usefulness score 0.0–1.0, set by user feedback */
  usefulness_score: number | null;
  /** How many times this memory was recalled */
  recall_count: number;
  /** 记忆来源平台: openclaw | hermes | 其他标识 */
  platform: string;
}

export interface RetrievedMemory {
  id: string;
    text: string;
  vector: number[];
  score: number;
  category: string;
  metadata: Record<string, unknown>;
  /** 记忆来源类型 */
  source_type: SourceType;
  /** 记忆来源：capture | evolution-success | evolution-failure | user-import */
  source: string;
  /** 可信度 0-1（含时间衰减后） */
  reliability: number;
  /** 可信度标签 */
  reliabilityLabel: '✅' | '⚠️' | '❌';
  /** 是否被锁定 */
  locked: boolean;
  /** 纠正次数 */
  correctionCount: number;
  /** 初始 reliability（未经时间衰减） */
  baseReliability: number;
  /** 所属 session */
  sessionId: string | null;
  /** 创建时间 */
  createdAt: number;
  /** 最后修改时间 */
  updatedAt: number;
  /** 记忆作用域 */
  scope: string;
  /** 用户指定的重要性倍数 */
  importanceOverride: number;
  /** 冷启动保护截止时间 */
  coldStartUntil: number | null;
  /** 命中原因（用于召回解释） */
  matchReason?: string;
  /** Timestamp of last recall */
  last_used_at: number | null;
  /** Usefulness score 0.0–1.0 */
  usefulness_score: number | null;
  /** How many times this memory was recalled */
  recall_count: number;
  /** 记忆来源平台: openclaw | hermes | 其他标识 */
  platform: string;
}

/** 检索结果（不含 vector 字段） */
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
