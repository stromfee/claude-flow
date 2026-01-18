#!/usr/bin/env npx tsx
/**
 * Drift Stress Test
 *
 * Forces high utilization with topic drift to demonstrate:
 * - Hyperbolic drift detection and correction
 * - Historical pattern learning
 * - Geometric pruning improvements
 */

import { CacheOptimizer } from '../src/core/orchestrator.js';
import type { CacheOptimizerConfig, CacheEntryType, ScoringContext } from '../src/types.js';

process.env.CLAUDE_FLOW_HEADLESS = 'true';

// Very small context window to force high utilization
const CONTEXT_WINDOW = 8000;

const CONFIG: Partial<CacheOptimizerConfig> = {
  contextWindowSize: CONTEXT_WINDOW,
  targetUtilization: 0.50, // Low target to force aggressive optimization
  pruning: {
    softThreshold: 0.35,    // Trigger early
    hardThreshold: 0.45,
    emergencyThreshold: 0.55,
    minRelevanceScore: 0.15,
    strategy: 'adaptive',
    preservePatterns: ['system_prompt'],
    preserveRecentCount: 2,
  },
  temporal: {
    tiers: {
      hot: { maxAge: 50, compressionRatio: 1.0 },
      warm: { maxAge: 150, compressionRatio: 0.25 },
      cold: { maxAge: Infinity, compressionRatio: 0.03 },
    },
    compressionStrategy: 'hybrid',
    promoteOnAccess: true,
    decayRate: 0.4, // Aggressive decay
  },
};

// Generate content that drifts significantly over time
function generateDriftingContent(phase: number, index: number): {
  content: string;
  type: CacheEntryType;
  file: string;
} {
  // Different phases have completely different topics
  const phases = [
    {
      topic: 'authentication',
      files: ['src/auth/login.ts', 'src/auth/session.ts', 'src/auth/jwt.ts'],
      keywords: ['JWT', 'OAuth', 'session', 'token', 'authenticate'],
    },
    {
      topic: 'database',
      files: ['src/db/schema.ts', 'src/db/migrations.ts', 'src/db/queries.ts'],
      keywords: ['SELECT', 'INSERT', 'schema', 'migration', 'transaction'],
    },
    {
      topic: 'api',
      files: ['src/api/routes.ts', 'src/api/handlers.ts', 'src/api/middleware.ts'],
      keywords: ['REST', 'endpoint', 'request', 'response', 'middleware'],
    },
    {
      topic: 'testing',
      files: ['tests/unit.ts', 'tests/integration.ts', 'tests/e2e.ts'],
      keywords: ['expect', 'assert', 'mock', 'stub', 'coverage'],
    },
  ];

  const p = phases[phase % phases.length];
  const file = p.files[index % p.files.length];
  const keywords = p.keywords.join(', ');

  const types: CacheEntryType[] = ['file_read', 'tool_result', 'bash_output', 'assistant_message'];
  const type = types[index % types.length];

  let content: string;
  switch (type) {
    case 'file_read':
      content = `// ${file} - ${p.topic} module (phase ${phase})
export class ${p.topic.charAt(0).toUpperCase() + p.topic.slice(1)}Manager {
  private ${p.keywords[0].toLowerCase()}: string;

  constructor() {
    this.${p.keywords[0].toLowerCase()} = '${p.keywords[1]}';
    // Working with: ${keywords}
  }

  async process${p.keywords[2]}(): Promise<void> {
    // Implementation for ${p.topic} phase ${phase}
    console.log('Processing: ${p.keywords.join(' -> ')}');
  }
}`;
      break;
    case 'tool_result':
      content = JSON.stringify({
        tool: 'search',
        phase,
        topic: p.topic,
        results: p.keywords.map((k, i) => ({
          file: p.files[i % p.files.length],
          match: k,
          line: i * 15 + index,
        })),
      }, null, 2);
      break;
    case 'bash_output':
      content = `$ npm run test:${p.topic}
Running ${p.topic} tests...
  ✓ ${p.keywords[0]} test (${Math.random() * 100 | 0}ms)
  ✓ ${p.keywords[1]} validation (${Math.random() * 100 | 0}ms)
  ✓ ${p.keywords[2]} integration (${Math.random() * 100 | 0}ms)
Tests passed: 3/3`;
      break;
    default:
      content = `Working on ${p.topic}: ${p.keywords.join(', ')}.
This is phase ${phase}, focusing on ${file}.
Key concepts: ${keywords}`;
  }

  return { content, type, file };
}

interface StressResult {
  name: string;
  hyperbolic: boolean;
  phases: number[];
  finalUtilization: number;
  peakUtilization: number;
  tokensSaved: number;
  pruneEvents: number;
  driftEvents: number;
  driftCorrections: number;
  avgPruningTime: number;
  entriesRemaining: number;
  phaseRetention: Record<number, number>; // How many entries from each phase remain
}

async function runStressTest(useHyperbolic: boolean): Promise<StressResult> {
  const optimizer = new CacheOptimizer(CONFIG, { useHyperbolic });

  let tokensSaved = 0;
  let pruneEvents = 0;
  let peakUtilization = 0;
  const pruningTimes: number[] = [];

  // Add system prompt
  await optimizer.add('You are a code assistant.', 'system_prompt', {
    source: 'system',
    sessionId: 'stress-test',
  });

  const phaseCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const ENTRIES_PER_PHASE = 25;
  const TOTAL_PHASES = 4;

  // Run through phases with topic drift
  for (let phase = 0; phase < TOTAL_PHASES; phase++) {
    console.log(`  Phase ${phase + 1}/${TOTAL_PHASES}: ${['auth', 'database', 'api', 'testing'][phase]}...`);

    for (let i = 0; i < ENTRIES_PER_PHASE; i++) {
      const { content, type, file } = generateDriftingContent(phase, i);

      await optimizer.add(content, type, {
        source: `phase-${phase}:${type}`,
        filePath: file,
        sessionId: 'stress-test',
        tags: [`phase-${phase}`],
      });

      phaseCounts[phase]++;

      // Brief delay
      await new Promise(r => setTimeout(r, 10));

      // Trigger optimization frequently
      if ((i + 1) % 3 === 0) {
        const context: ScoringContext = {
          currentQuery: `Working on ${['auth', 'db', 'api', 'tests'][phase]} task ${i}`,
          activeFiles: [file],
          activeTools: ['search', 'grep'],
          sessionId: 'stress-test',
          timestamp: Date.now(),
        };

        await optimizer.scoreAll(context);

        const startPrune = performance.now();
        const result = await optimizer.onUserPromptSubmit(`Phase ${phase} query ${i}`, 'stress-test');
        pruningTimes.push(performance.now() - startPrune);

        if (result.tokensFreed > 0) {
          tokensSaved += result.tokensFreed;
          pruneEvents++;
        }

        // Tier transitions
        const transResult = await optimizer.transitionTiers();
        tokensSaved += transResult.tokensSaved;

        const metrics = optimizer.getMetrics();
        peakUtilization = Math.max(peakUtilization, metrics.utilization);
      }
    }

    // Record successful state for hyperbolic learning (if enabled)
    if (useHyperbolic) {
      optimizer.recordSuccessfulState({
        hitRate: 0.85,
        compressionRatio: 0.7,
        evictionAccuracy: 0.9,
      });
    }
  }

  // Count remaining entries by phase
  const entries = optimizer.getEntries();
  const phaseRetention: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const entry of entries) {
    const phaseMatch = entry.metadata.source.match(/phase-(\d)/);
    if (phaseMatch) {
      phaseRetention[parseInt(phaseMatch[1])]++;
    }
  }

  const finalMetrics = optimizer.getMetrics();
  const hyperbolicStats = optimizer.getHyperbolicStats();

  return {
    name: useHyperbolic ? 'WITH Hyperbolic' : 'WITHOUT Hyperbolic',
    hyperbolic: useHyperbolic,
    phases: [0, 1, 2, 3],
    finalUtilization: finalMetrics.utilization,
    peakUtilization,
    tokensSaved,
    pruneEvents,
    driftEvents: hyperbolicStats.driftEvents,
    driftCorrections: hyperbolicStats.driftCorrections,
    avgPruningTime: pruningTimes.length > 0
      ? pruningTimes.reduce((a, b) => a + b, 0) / pruningTimes.length
      : 0,
    entriesRemaining: entries.length,
    phaseRetention,
  };
}

function printComparison(without: StressResult, withHyp: StressResult): void {
  console.log('\n' + '═'.repeat(80));
  console.log('                    DRIFT STRESS TEST - DETAILED COMPARISON');
  console.log('═'.repeat(80));

  console.log(`
  ┌───────────────────────────────────┬─────────────────┬─────────────────┐
  │ Metric                            │ WITHOUT Hyper.  │ WITH Hyperbolic │
  ├───────────────────────────────────┼─────────────────┼─────────────────┤
  │ Peak Utilization                  │ ${(without.peakUtilization * 100).toFixed(1).padStart(13)}% │ ${(withHyp.peakUtilization * 100).toFixed(1).padStart(13)}% │
  │ Final Utilization                 │ ${(without.finalUtilization * 100).toFixed(1).padStart(13)}% │ ${(withHyp.finalUtilization * 100).toFixed(1).padStart(13)}% │
  │ Tokens Saved                      │ ${without.tokensSaved.toString().padStart(15)} │ ${withHyp.tokensSaved.toString().padStart(15)} │
  │ Prune Events                      │ ${without.pruneEvents.toString().padStart(15)} │ ${withHyp.pruneEvents.toString().padStart(15)} │
  │ Entries Remaining                 │ ${without.entriesRemaining.toString().padStart(15)} │ ${withHyp.entriesRemaining.toString().padStart(15)} │
  │ Avg Pruning Time (ms)             │ ${without.avgPruningTime.toFixed(3).padStart(15)} │ ${withHyp.avgPruningTime.toFixed(3).padStart(15)} │
  │ Drift Events Detected             │ ${without.driftEvents.toString().padStart(15)} │ ${withHyp.driftEvents.toString().padStart(15)} │
  │ Drift Corrections Applied         │ ${without.driftCorrections.toString().padStart(15)} │ ${withHyp.driftCorrections.toString().padStart(15)} │
  └───────────────────────────────────┴─────────────────┴─────────────────┘`);

  // Phase retention comparison
  console.log('\n  📊 PHASE RETENTION (entries remaining from each phase):');
  console.log('  ' + '─'.repeat(60));
  console.log(`
  ┌────────────────────┬─────────────────┬─────────────────┐
  │ Phase              │ WITHOUT Hyper.  │ WITH Hyperbolic │
  ├────────────────────┼─────────────────┼─────────────────┤
  │ 0: Authentication  │ ${without.phaseRetention[0].toString().padStart(15)} │ ${withHyp.phaseRetention[0].toString().padStart(15)} │
  │ 1: Database        │ ${without.phaseRetention[1].toString().padStart(15)} │ ${withHyp.phaseRetention[1].toString().padStart(15)} │
  │ 2: API             │ ${without.phaseRetention[2].toString().padStart(15)} │ ${withHyp.phaseRetention[2].toString().padStart(15)} │
  │ 3: Testing         │ ${without.phaseRetention[3].toString().padStart(15)} │ ${withHyp.phaseRetention[3].toString().padStart(15)} │
  └────────────────────┴─────────────────┴─────────────────┘`);

  // Analysis
  console.log('\n  🔍 ANALYSIS:');
  console.log('  ' + '─'.repeat(60));

  const speedup = without.avgPruningTime / withHyp.avgPruningTime;
  console.log(`  • Pruning Speed: ${speedup.toFixed(2)}x faster with hyperbolic`);

  // Check if hyperbolic preserved more recent phase entries
  const withoutRecent = without.phaseRetention[2] + without.phaseRetention[3];
  const withRecent = withHyp.phaseRetention[2] + withHyp.phaseRetention[3];
  if (withRecent > withoutRecent) {
    console.log(`  • Context Preservation: Hyperbolic retained ${withRecent - withoutRecent} more recent entries`);
  }

  if (withHyp.driftEvents > 0) {
    console.log(`  • Drift Detection: ${withHyp.driftEvents} drift events detected, ${withHyp.driftCorrections} corrected`);
  }

  const utilizationDiff = without.peakUtilization - withHyp.peakUtilization;
  if (utilizationDiff > 0.01) {
    console.log(`  • Utilization Control: ${(utilizationDiff * 100).toFixed(1)}% lower peak with hyperbolic`);
  }
}

async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║             DRIFT STRESS TEST - HYPERBOLIC INTELLIGENCE           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('\nThis test simulates topic drift across 4 phases to demonstrate');
  console.log('hyperbolic cache intelligence with drift detection.\n');
  console.log('Configuration:');
  console.log(`  Context Window: ${CONTEXT_WINDOW} tokens (small to force optimization)`);
  console.log(`  Phases: Authentication → Database → API → Testing`);
  console.log(`  Entries per phase: 25 (100 total)`);
  console.log();

  console.log('🔄 Running WITHOUT hyperbolic intelligence...');
  const withoutResult = await runStressTest(false);

  console.log('\n🔄 Running WITH hyperbolic intelligence...');
  const withResult = await runStressTest(true);

  printComparison(withoutResult, withResult);

  console.log('\n' + '═'.repeat(80));
  console.log('                              CONCLUSION');
  console.log('═'.repeat(80));

  if (withResult.driftCorrections > 0 ||
      withResult.avgPruningTime < withoutResult.avgPruningTime * 0.9) {
    console.log(`
  ✅ HYPERBOLIC INTELLIGENCE PROVIDES CLEAR BENEFITS:

  The Poincaré ball model places entries geometrically:
  • System prompts near origin (central, preserved)
  • Old/irrelevant entries near boundary (peripheral, pruned first)
  • Hypergraph connections protect related entry clusters

  Drift detection identifies when cache structure diverges from
  successful historical patterns and applies corrections.
`);
  } else {
    console.log(`
  ℹ️ Both approaches performed similarly in this scenario.

  Hyperbolic intelligence benefits increase with:
  • More historical patterns (multi-session learning)
  • Larger context windows with more entries
  • More complex file/tool relationships
`);
  }

  console.log('═'.repeat(80));
}

main().catch(console.error);
