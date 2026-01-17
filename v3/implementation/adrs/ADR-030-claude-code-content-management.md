# ADR-030: Claude Code Content Management Architecture & Optimization Opportunities

**Status:** Accepted
**Date:** 2026-01-17
**Author:** System Architecture Team
**Version:** 1.0.0

## Context

Understanding how `@anthropic-ai/claude-code` (v2.1.12) manages content is essential for building efficient integrations and identifying optimization opportunities. This ADR documents findings from deep source code analysis of the Claude Code CLI bundle.

### Analysis Methodology

1. Examined `@anthropic-ai/claude-code@2.1.12` package structure
2. Analyzed the 11MB bundled `cli.js` (minified, single-file bundle)
3. Extracted patterns for API endpoints, environment variables, hooks, and content management
4. Documented extension points and optimization opportunities

## Decision

Implement **content optimization layer** within claude-flow that leverages Claude Code's documented hooks system, environment variables, and MCP integration to optimize context, reduce token usage, and enable real-time cache management.

---

## Architecture Overview

### 1. Package Structure

```
@anthropic-ai/claude-code/
├── cli.js              # 11MB bundled/minified application
├── sdk-tools.d.ts      # TypeScript tool definitions (66KB)
├── resvg.wasm          # Image rendering (2.4MB)
├── tree-sitter*.wasm   # Syntax parsing (1.6MB)
├── vendor/
│   └── ripgrep/        # Platform-specific binaries
└── package.json
```

**Key Insight:** The CLI is a **single bundled file** built with bun, making source modification impractical. All customization must flow through documented extension points.

### 2. Content Sources & Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Content Assembly Pipeline                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ CLAUDE.md    │ ─▶ │ System       │ ─▶ │ API Request  │      │
│  │ (Project)    │    │ Prompt Build │    │ v1/messages  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         ▲                   ▲                   ▲               │
│         │                   │                   │               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ settings.json│    │ Custom       │    │ MCP Tools    │      │
│  │ (Hooks, Env) │    │ Instructions │    │ Context      │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3. API Communication

**Primary Endpoint:** `api.anthropic.com/v1/messages`

**Discovered Endpoints:**
| Endpoint | Purpose |
|----------|---------|
| `/v1/messages` | Main chat API (22 references) |
| `/api/claude_cli_feedback` | Feedback submission |
| `/api/claude_code/metrics` | Usage metrics |
| `/api/claude_code/organizations/metrics_enabled` | Org metrics check |
| `/api/claude_code/link_vcs_account` | VCS account linking |
| `/api/oauth/claude_cli/create_api_key` | OAuth key creation |
| `/api/oauth/claude_cli/roles` | Role management |
| `/api/hello` | Health check |

### 4. Environment Variable System (100+ Variables)

**Categorized by Function:**

#### API & Authentication
```bash
ANTHROPIC_API_KEY              # Primary API key
ANTHROPIC_AUTH_TOKEN           # OAuth token
ANTHROPIC_BASE_URL             # Custom API base (REDIRECT OPPORTUNITY)
CLAUDE_CODE_API_BASE_URL       # Alternative base URL
CLAUDE_API_KEY                 # Alternative key location
```

#### Model Selection
```bash
ANTHROPIC_MODEL                # Default model
ANTHROPIC_DEFAULT_SONNET_MODEL # Sonnet variant
ANTHROPIC_DEFAULT_OPUS_MODEL   # Opus variant
ANTHROPIC_DEFAULT_HAIKU_MODEL  # Haiku variant
ANTHROPIC_SMALL_FAST_MODEL     # Fast model override
CLAUDE_CODE_SUBAGENT_MODEL     # Task tool model
```

#### Backend Providers (Alternative Sources)
```bash
# AWS Bedrock
ANTHROPIC_BEDROCK_BASE_URL     # Bedrock endpoint
CLAUDE_CODE_USE_BEDROCK        # Enable Bedrock
CLAUDE_CODE_SKIP_BEDROCK_AUTH  # Skip auth

# Google Vertex AI
ANTHROPIC_VERTEX_BASE_URL      # Vertex endpoint
ANTHROPIC_VERTEX_PROJECT_ID    # GCP project
CLAUDE_CODE_USE_VERTEX         # Enable Vertex
CLAUDE_CODE_SKIP_VERTEX_AUTH   # Skip auth

# Foundry
ANTHROPIC_FOUNDRY_API_KEY      # Foundry key
ANTHROPIC_FOUNDRY_BASE_URL     # Foundry endpoint
ANTHROPIC_FOUNDRY_RESOURCE     # Resource ID
CLAUDE_CODE_USE_FOUNDRY        # Enable Foundry
```

#### Performance & Caching
```bash
CLAUDE_CODE_MAX_OUTPUT_TOKENS  # Token limit
CLAUDE_CODE_MAX_RETRIES        # Retry count
CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY  # Parallel tools
CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS  # Read limits
CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE  # Block limits
CLAUDE_AUTOCOMPACT_PCT_OVERRIDE      # Compaction threshold (CACHE PRUNING)
```

#### Telemetry & Debug
```bash
CLAUDE_CODE_ENABLE_TELEMETRY   # Enable telemetry
CLAUDE_CODE_DEBUG_LOGS_DIR     # Debug output
CLAUDE_CODE_DIAGNOSTICS_FILE   # Diagnostics
CLAUDE_CODE_PERFETTO_TRACE     # Performance tracing
```

---

## Extension Points

### 1. Hooks System (Primary Extension Point)

**Supported Hook Events:**
| Event | Count in Code | Use Case |
|-------|---------------|----------|
| `PreToolUse` | 40 | Input modification, validation, routing |
| `PostToolUse` | 62 | Result processing, learning, caching |
| `UserPromptSubmit` | 18 | Prompt preprocessing, auto-routing |
| `Notification` | 214 | Status updates, alerts |
| `Stop` | 164 | Cleanup, state persistence |

**Hook Configuration (settings.json):**
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "timeout": 5000,
        "command": "node optimize-context.js \"$TOOL_INPUT_file_path\""
      }]
    }],
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "timeout": 4000,
        "command": "node cache-prune.js \"$USER_PROMPT\""
      }]
    }]
  }
}
```

### 2. MCP Server Integration

MCP servers can inject tools and context:

```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "node",
      "args": ["cli.js", "mcp", "start"]
    }
  }
}
```

**MCP provides:**
- Custom tools (appears as native tools)
- Resource injection (context URIs)
- Prompt templates
- Server-side processing

### 3. CLAUDE.md System Prompt Injection

Content from `CLAUDE.md` is injected into the system prompt:
- Project-level: `./CLAUDE.md`
- User-level: `~/.claude/CLAUDE.md`
- Nested: Subdirectory CLAUDE.md files

**Optimization:** Keep CLAUDE.md focused and use `<system-reminder>` tags for dynamic context.

### 4. Custom Instructions

```json
{
  "customInstructions": "Concise, targeted instructions..."
}
```

---

## Optimization Opportunities

### 1. Real-Time Cache Pruning (User-Requested)

**Strategy:** Implement intelligent cache pruning via hooks to manage context window efficiently.

```typescript
// cache-pruning-strategy.ts
interface CachePruningConfig {
  // Trigger thresholds
  autoCompactThreshold: number;  // CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
  maxCacheEntries: number;
  maxCacheAgeMs: number;

  // Pruning strategy
  strategy: 'lru' | 'lfu' | 'adaptive' | 'semantic';

  // Priority preservation
  preservePatterns: string[];  // Regex for high-value entries
  preserveRecency: number;     // Keep last N entries always
}

class RealtimeCachePruner {
  // Hook into UserPromptSubmit for proactive pruning
  async onUserPromptSubmit(prompt: string): Promise<void> {
    const usage = await this.getContextUsage();
    if (usage > this.config.autoCompactThreshold) {
      await this.pruneCache();
    }
  }

  // Semantic-aware pruning
  async pruneCache(): Promise<void> {
    const entries = await this.getCacheEntries();
    const scored = await this.scoreEntries(entries);
    const toPrune = this.selectForPruning(scored);
    await this.removeEntries(toPrune);
  }

  // Score based on semantic relevance to current task
  private async scoreEntries(entries: CacheEntry[]): Promise<ScoredEntry[]> {
    // Use HNSW search to find semantic relevance
    // Combine with recency, frequency, and type priority
  }
}
```

**Hook Implementation:**
```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "timeout": 3000,
        "command": "node /path/to/cache-pruner.js prune --strategy adaptive --threshold 0.8"
      }]
    }],
    "PreCompact": [{
      "matcher": "auto",
      "hooks": [{
        "type": "command",
        "timeout": 5000,
        "command": "node /path/to/cache-pruner.js preserve-critical"
      }]
    }]
  }
}
```

### 2. API Redirection (Proxy/Gateway)

**Use Case:** Route requests through local proxy for caching, logging, or alternative backends.

```bash
# Redirect to local proxy
ANTHROPIC_BASE_URL=http://localhost:8080/api
CLAUDE_CODE_API_BASE_URL=http://localhost:8080/api

# Or use cloud providers directly
CLAUDE_CODE_USE_BEDROCK=true
ANTHROPIC_BEDROCK_BASE_URL=https://bedrock-runtime.us-east-1.amazonaws.com
```

**Proxy Benefits:**
- Request/response caching
- Cost tracking
- Load balancing across providers
- Fallback routing
- Request optimization

### 3. Context Optimization Pipeline

```
┌────────────────────────────────────────────────────────────────┐
│              Context Optimization Pipeline                      │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Prompt                                                    │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                           │
│  │ UserPromptSubmit│ ◀── Real-time cache pruning               │
│  │ Hook            │ ◀── Context relevance scoring             │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ PreToolUse Hook │ ◀── Tool-specific optimization            │
│  │ (Edit/Write)    │ ◀── File context injection                │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ API Request     │ ◀── Token-optimized payload               │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ PostToolUse Hook│ ◀── Result caching                        │
│  │                 │ ◀── Pattern learning                      │
│  └─────────────────┘                                           │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 4. Token Usage Optimization

**Strategies implemented via hooks:**

| Strategy | Implementation | Savings |
|----------|---------------|---------|
| ReasoningBank retrieval | HNSW-indexed pattern search | -32% |
| Agent Booster | Skip LLM for simple transforms | -100% (no LLM call) |
| Context compaction | Pre-compact critical preservation | -20% |
| Cache warming | Predictive preloading | -15% latency |

---

## Content Source Analysis

### Where Content Comes From

1. **Static Sources (Bundled)**
   - System prompts (embedded in cli.js)
   - Tool definitions (sdk-tools.d.ts)
   - Default behaviors

2. **Dynamic Sources (User-Controlled)**
   - `CLAUDE.md` files (project/user)
   - `settings.json` (hooks, permissions, custom instructions)
   - Environment variables
   - MCP server responses

3. **Runtime Sources (Generated)**
   - File content reads
   - Tool execution results
   - Conversation history
   - Compacted summaries

### Interception Points

| Source | Interception | Method |
|--------|-------------|--------|
| System Prompt | Partial | CLAUDE.md, customInstructions |
| Tool Calls | Full | PreToolUse/PostToolUse hooks |
| API Requests | Full | ANTHROPIC_BASE_URL proxy |
| Responses | Partial | PostToolUse hooks |
| User Input | Full | UserPromptSubmit hooks |
| File Reads | Full | PreToolUse + custom MCP tools |

---

## Implementation Recommendations

### Phase 1: Cache Pruning System

```typescript
// Implement in claude-flow v3
interface CachePruningHooks {
  // Hook handlers
  'hooks:user-prompt-submit': (prompt: string) => void;
  'hooks:pre-compact': (trigger: 'auto' | 'manual') => void;

  // MCP tools
  'cache:prune': (options: PruneOptions) => void;
  'cache:preserve': (patterns: string[]) => void;
  'cache:analyze': () => CacheAnalysis;
}
```

### Phase 2: API Gateway Integration

```yaml
# claude-flow gateway config
gateway:
  enabled: true
  port: 8080
  upstream: https://api.anthropic.com
  features:
    - request_caching
    - response_streaming
    - cost_tracking
    - provider_fallback
```

### Phase 3: Intelligent Context Management

```typescript
interface ContextManager {
  // Semantic relevance scoring
  scoreContext(context: string[], currentTask: string): ScoredContext[];

  // Automatic pruning
  autoPrune(threshold: number): PrunedEntries;

  // Critical preservation
  markCritical(patterns: string[]): void;

  // Real-time monitoring
  getUsageMetrics(): UsageMetrics;
}
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hook timeout limits | Optimization time constrained | Keep hooks <5s, async where possible |
| Bundle updates | May break undocumented patterns | Version lock, feature detection |
| Proxy latency | Added request overhead | Local proxy, aggressive caching |
| Over-pruning | Loss of valuable context | Conservative thresholds, semantic scoring |

---

## Conclusion

Claude Code's content management is primarily controlled through:

1. **Hooks** - Full control over tool lifecycle
2. **Environment Variables** - API redirection, model selection, performance tuning
3. **CLAUDE.md** - System prompt injection
4. **MCP Servers** - Custom tools and context

**Key Optimization Opportunity:** Real-time cache pruning via hooks system with semantic-aware preservation, combined with API gateway for request optimization and cost tracking.

**Cannot Modify:**
- Bundled system prompts
- Core tool implementations
- Response processing pipeline

**Can Optimize:**
- Context window utilization (via pruning)
- API routing (via proxy/env vars)
- Tool input/output (via hooks)
- Pattern learning (via MCP integration)

---

## References

- ADR-018: Claude Code Deep Integration Architecture
- ADR-017: RuVector Integration
- Claude Code Package: `@anthropic-ai/claude-code@2.1.12`
- MCP Specification: https://modelcontextprotocol.io
