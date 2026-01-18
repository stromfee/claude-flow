#!/usr/bin/env node
/**
 * Session Pruner CLI
 *
 * Starts an MCP server that provides session pruning tools to Claude.
 *
 * Tools provided:
 * - session_stats: Check current session size
 * - session_prune: Remove old messages, keep recent
 * - session_summarize_and_prune: Summarize old messages then remove
 *
 * Usage:
 *   claude mcp add session-pruner npx tsx session-pruner-cli.ts
 */

import { SessionPrunerServer } from './session-pruner.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Session Pruner - Let Claude prune its own session memory

Usage:
  As MCP server:
    claude mcp add session-pruner npx tsx pruner-cli.ts

  Direct pruning (without MCP):
    npx tsx pruner-cli.ts --prune
    npx tsx pruner-cli.ts --prune --keep 100
    npx tsx pruner-cli.ts --stats

Options:
  --stats          Show current session stats
  --prune          Prune the current session
  --keep <n>       Keep last n messages (default: 50)
  --dry-run        Preview without making changes
  --help, -h       Show this help

When running as MCP server, Claude can call:
  - session_stats: Check session size
  - session_prune: Prune old messages
  - session_summarize_and_prune: Summarize then prune
`);
    process.exit(0);
  }

  // Direct CLI mode
  if (args.includes('--stats') || args.includes('--prune')) {
    const { findCurrentSession, pruneSession } = await import('./session-pruner.js');

    const session = findCurrentSession();
    if (!session) {
      console.log('No session found');
      process.exit(1);
    }

    if (args.includes('--stats')) {
      console.log(`
Session Stats:
  Path: ${session.path}
  Size: ${(session.size / 1024).toFixed(1)} KB (${(session.size / 1024 / 1024).toFixed(2)} MB)
  Messages: ${session.messageCount}
  Last Modified: ${session.lastModified.toISOString()}
`);
      process.exit(0);
    }

    if (args.includes('--prune')) {
      const keepIndex = args.indexOf('--keep');
      const keep = keepIndex !== -1 ? parseInt(args[keepIndex + 1]) : 50;
      const dryRun = args.includes('--dry-run');

      console.log(`Pruning session (keep last ${keep} messages)...`);

      const result = pruneSession(session, {
        keepRecentMessages: keep,
        keepSummaries: true,
        keepToolPairs: true,
        dryRun,
      });

      console.log(`
Prune Result:
  Original: ${(result.originalSize / 1024).toFixed(1)} KB (${result.originalMessages} messages)
  Pruned: ${(result.prunedSize / 1024).toFixed(1)} KB (${result.prunedMessages} messages)
  Reduction: ${result.reductionPercent.toFixed(1)}%
  ${dryRun ? '(Dry run - no changes made)' : `Backup: ${result.backupPath}`}
  ${!dryRun ? '\n⚠️  Restart Claude to load the pruned session' : ''}
`);
      process.exit(0);
    }
  }

  // MCP server mode
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  const server = new SessionPrunerServer();
  await server.start();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
