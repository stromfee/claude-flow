/**
 * Session Pruner - MCP tool that allows Claude to prune its own session
 *
 * Adds tools:
 * - session_prune: Reduce session size by removing old messages
 * - session_stats: Get current session size and message count
 * - session_compact: Aggressive compression with summaries
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

interface SessionInfo {
  path: string;
  size: number;
  messageCount: number;
  lastModified: Date;
}

interface PruneOptions {
  keepRecentMessages?: number;
  keepSummaries?: boolean;
  keepToolPairs?: boolean;
  targetSizeKB?: number;
  dryRun?: boolean;
}

interface PruneResult {
  success: boolean;
  originalSize: number;
  prunedSize: number;
  originalMessages: number;
  prunedMessages: number;
  reductionPercent: number;
  backupPath?: string;
}

function findCurrentSession(): SessionInfo | null {
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
  const sessions: SessionInfo[] = [];

  function scanDir(dir: string): void {
    if (!fs.existsSync(dir)) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith('.jsonl') && !entry.name.startsWith('agent-')) {
          try {
            const stats = fs.statSync(fullPath);
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n').filter(l => l.trim());
            sessions.push({
              path: fullPath,
              size: stats.size,
              messageCount: lines.length,
              lastModified: stats.mtime,
            });
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  scanDir(claudeProjectsDir);

  if (sessions.length === 0) return null;

  // Return most recently modified
  return sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())[0];
}

function pruneSession(session: SessionInfo, options: PruneOptions): PruneResult {
  const {
    keepRecentMessages = 50,
    keepSummaries = true,
    keepToolPairs = true,
    targetSizeKB,
    dryRun = false,
  } = options;

  const content = fs.readFileSync(session.path, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const originalSize = content.length;
  const originalMessages = lines.length;

  // Parse messages
  const messages = lines.map((line, index) => {
    try {
      return { index, line, parsed: JSON.parse(line) };
    } catch {
      return { index, line, parsed: { type: 'unknown' } };
    }
  });

  // Build tool_use -> tool_result pairs
  const toolUseIdToIndex = new Map<string, number>();
  const toolPairs = new Map<number, number>(); // toolUse index -> toolResult index

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i].parsed;
    if (msg.message?.role === 'assistant' && Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        if (block?.type === 'tool_use' && block.id) {
          toolUseIdToIndex.set(block.id, i);
        }
      }
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i].parsed;
    if (msg.message?.role === 'user' && Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        if (block?.type === 'tool_result' && block.tool_use_id) {
          const toolUseIndex = toolUseIdToIndex.get(block.tool_use_id);
          if (toolUseIndex !== undefined) {
            toolPairs.set(toolUseIndex, i);
          }
        }
      }
    }
  }

  // Determine which messages to keep
  const keepIndices = new Set<number>();

  // Always keep summaries
  if (keepSummaries) {
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].parsed.type === 'summary') {
        keepIndices.add(i);
      }
    }
  }

  // Keep recent messages
  const recentStart = Math.max(0, messages.length - keepRecentMessages);
  for (let i = recentStart; i < messages.length; i++) {
    keepIndices.add(i);

    // If keeping tool pairs, include the pair
    if (keepToolPairs) {
      if (toolPairs.has(i)) {
        keepIndices.add(toolPairs.get(i)!);
      }
      // Check if this is a tool_result
      for (const [toolUseIdx, resultIdx] of toolPairs) {
        if (resultIdx === i) {
          keepIndices.add(toolUseIdx);
        }
      }
    }
  }

  // If target size specified, add more messages until target reached
  if (targetSizeKB) {
    const targetBytes = targetSizeKB * 1024;
    let currentSize = [...keepIndices].reduce((sum, i) => sum + messages[i].line.length + 1, 0);

    // Add older messages until target
    for (let i = messages.length - keepRecentMessages - 1; i >= 0 && currentSize < targetBytes; i--) {
      if (!keepIndices.has(i)) {
        keepIndices.add(i);
        currentSize += messages[i].line.length + 1;

        // Keep pairs together
        if (keepToolPairs) {
          if (toolPairs.has(i) && !keepIndices.has(toolPairs.get(i)!)) {
            keepIndices.add(toolPairs.get(i)!);
            currentSize += messages[toolPairs.get(i)!].line.length + 1;
          }
        }
      }
    }
  }

  // Build pruned content (maintain order)
  const prunedLines: string[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (keepIndices.has(i)) {
      prunedLines.push(messages[i].line);
    }
  }

  const prunedContent = prunedLines.join('\n') + '\n';
  const prunedSize = prunedContent.length;
  const prunedMessages = prunedLines.length;
  const reductionPercent = ((originalSize - prunedSize) / originalSize) * 100;

  if (!dryRun) {
    // Create backup
    const backupDir = path.join(os.homedir(), '.claude', 'session-backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupName = `${path.basename(session.path)}.${Date.now()}.backup`;
    const backupPath = path.join(backupDir, backupName);
    fs.writeFileSync(backupPath, content);

    // Write pruned content
    fs.writeFileSync(session.path, prunedContent);

    return {
      success: true,
      originalSize,
      prunedSize,
      originalMessages,
      prunedMessages,
      reductionPercent,
      backupPath,
    };
  }

  return {
    success: true,
    originalSize,
    prunedSize,
    originalMessages,
    prunedMessages,
    reductionPercent,
  };
}

export class SessionPrunerServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: "session-pruner", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "session_stats",
          description: "Get current session size and message count. Use this to check if pruning is needed.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "session_prune",
          description: "Prune the current session to reduce memory usage. Keeps recent messages and summaries. Use when context is running low.",
          inputSchema: {
            type: "object",
            properties: {
              keepRecentMessages: {
                type: "number",
                description: "Number of recent messages to keep (default: 50)",
              },
              targetSizeKB: {
                type: "number",
                description: "Target size in KB (optional, will keep more messages to reach target)",
              },
              dryRun: {
                type: "boolean",
                description: "Preview pruning without making changes",
              },
            },
          },
        },
        {
          name: "session_summarize_and_prune",
          description: "Create a summary of old messages then prune them. Best for major context reduction.",
          inputSchema: {
            type: "object",
            properties: {
              keepRecentMessages: {
                type: "number",
                description: "Number of recent messages to keep after summary (default: 30)",
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "session_stats":
            return this.handleStats();

          case "session_prune":
            return this.handlePrune(args as PruneOptions);

          case "session_summarize_and_prune":
            return this.handleSummarizeAndPrune(args as { keepRecentMessages?: number });

          default:
            return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    });
  }

  private handleStats() {
    const session = findCurrentSession();

    if (!session) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "No session found" }) }],
      };
    }

    const sizeKB = (session.size / 1024).toFixed(1);
    const sizeMB = (session.size / 1024 / 1024).toFixed(2);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          path: session.path,
          sizeBytes: session.size,
          sizeKB: parseFloat(sizeKB),
          sizeMB: parseFloat(sizeMB),
          messageCount: session.messageCount,
          lastModified: session.lastModified.toISOString(),
          recommendation: session.size > 5 * 1024 * 1024
            ? "Session is large (>5MB). Consider pruning."
            : session.size > 2 * 1024 * 1024
              ? "Session is moderate (2-5MB). Pruning optional."
              : "Session size is healthy (<2MB).",
        }),
      }],
    };
  }

  private handlePrune(options: PruneOptions) {
    const session = findCurrentSession();

    if (!session) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "No session found" }) }],
      };
    }

    const result = pruneSession(session, {
      keepRecentMessages: options.keepRecentMessages ?? 50,
      keepSummaries: true,
      keepToolPairs: true,
      targetSizeKB: options.targetSizeKB,
      dryRun: options.dryRun ?? false,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ...result,
          originalSizeKB: (result.originalSize / 1024).toFixed(1),
          prunedSizeKB: (result.prunedSize / 1024).toFixed(1),
          note: result.success && !options.dryRun
            ? "Session pruned. Restart Claude to load the smaller session."
            : options.dryRun
              ? "Dry run - no changes made."
              : "Pruning failed.",
        }),
      }],
    };
  }

  private handleSummarizeAndPrune(options: { keepRecentMessages?: number }) {
    const session = findCurrentSession();

    if (!session) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "No session found" }) }],
      };
    }

    // First, read and create a summary of old messages
    const content = fs.readFileSync(session.path, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const keepRecent = options.keepRecentMessages ?? 30;

    const oldMessages = lines.slice(0, -keepRecent);
    const recentMessages = lines.slice(-keepRecent);

    // Extract key information from old messages for summary
    const keyPoints: string[] = [];
    for (const line of oldMessages) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'summary' && parsed.summary) {
          keyPoints.push(parsed.summary);
        } else if (parsed.message?.role === 'user' && typeof parsed.message.content === 'string') {
          // Extract user requests
          const content = parsed.message.content;
          if (content.length > 20 && content.length < 200) {
            keyPoints.push(`User: ${content.slice(0, 100)}`);
          }
        }
      } catch {
        // Skip unparseable
      }
    }

    // Create a new summary entry
    const summaryEntry = {
      type: 'summary',
      summary: `Session history summary (${oldMessages.length} messages pruned):\n${keyPoints.slice(-10).join('\n')}`,
      timestamp: Date.now(),
      prunedCount: oldMessages.length,
    };

    // Build new content: summary + recent messages
    const newContent = [
      JSON.stringify(summaryEntry),
      ...recentMessages,
    ].join('\n') + '\n';

    // Backup and write
    const backupDir = path.join(os.homedir(), '.claude', 'session-backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupPath = path.join(backupDir, `${path.basename(session.path)}.${Date.now()}.backup`);
    fs.writeFileSync(backupPath, content);
    fs.writeFileSync(session.path, newContent);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          originalMessages: lines.length,
          prunedMessages: recentMessages.length + 1,
          summarizedMessages: oldMessages.length,
          originalSizeKB: (content.length / 1024).toFixed(1),
          newSizeKB: (newContent.length / 1024).toFixed(1),
          reductionPercent: (((content.length - newContent.length) / content.length) * 100).toFixed(1),
          backupPath,
          note: "Session summarized and pruned. Restart Claude to load the smaller session.",
        }),
      }],
    };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new SessionPrunerServer();
  server.start().catch(console.error);
}

export { findCurrentSession, pruneSession };
