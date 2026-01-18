/**
 * @claude-flow/cache-optimizer - Handoff Module
 *
 * Background process model handoffs for requesting other AI models
 * (local via Ollama or remote via API) and injecting responses back.
 *
 * Features:
 * - Multi-provider support (Ollama, Anthropic, OpenAI, OpenRouter, Custom)
 * - Streaming SSE responses
 * - Circuit breaker pattern for resilience
 * - Rate limiting with token bucket
 * - Persistent queue and metrics storage
 * - Webhook callbacks with retry logic
 */

// Core handlers
export {
  HandoffManager,
  handoff,
  DEFAULT_HANDOFF_CONFIG,
} from './handoff-manager.js';

export {
  BackgroundHandler,
  createHandoffChain,
} from './background-handler.js';

// Circuit breaker
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  defaultCircuitBreakerRegistry,
  type CircuitBreakerConfig,
  type CircuitState,
  type CircuitStats,
} from './circuit-breaker.js';

// Rate limiter
export {
  RateLimiter,
  RateLimiterRegistry,
  defaultRateLimiterRegistry,
  type RateLimiterConfig,
  type RateLimitStatus,
} from './rate-limiter.js';

// Persistent storage
export {
  PersistentStore,
  createPersistentStore,
  type PersistentStoreConfig,
} from './persistent-store.js';

// Webhook handler
export {
  WebhookHandler,
  createWebhookHandler,
  defaultWebhookHandler,
  type WebhookConfig,
  type WebhookEvent,
  type WebhookPayload,
  type WebhookResult,
} from './webhook.js';

// Streaming handler
export {
  StreamingHandler,
  createStreamingHandler,
  defaultStreamingHandler,
  type StreamChunk,
  type StreamOptions,
} from './streaming.js';

// Re-export types
export type {
  HandoffConfig,
  HandoffProviderConfig,
  HandoffProviderType,
  BackgroundProcessConfig,
  HandoffRetryConfig,
  HandoffTimeoutConfig,
  HandoffRequest,
  HandoffContext,
  HandoffMetadata,
  HandoffRequestOptions,
  HandoffResponse,
  HandoffTokenUsage,
  HandoffStatus,
  HandoffQueueItem,
  HandoffMetrics,
} from '../types.js';
