# V3 Architecture Decision Records (ADRs)

This directory contains all Architecture Decision Records for Claude-Flow v3.

## ADR Index

| ADR | Title | Status | File |
|-----|-------|--------|------|
| ADR-001 | Adopt agentic-flow as Core Foundation | ✅ Implemented | [ADR-001-AGENT-IMPLEMENTATION.md](./ADR-001-AGENT-IMPLEMENTATION.md) |
| ADR-002 | Implement Domain-Driven Design Structure | ✅ Implemented | [ADR-002-DDD-STRUCTURE.md](./ADR-002-DDD-STRUCTURE.md) |
| ADR-003 | Single Coordination Engine | ✅ Implemented | [ADR-003-CONSOLIDATION-COMPLETE.md](./ADR-003-CONSOLIDATION-COMPLETE.md) |
| ADR-004 | Plugin-Based Architecture | ✅ Implemented | [ADR-004-PLUGIN-ARCHITECTURE.md](./ADR-004-PLUGIN-ARCHITECTURE.md) |
| ADR-005 | MCP-First API Design | ✅ Implemented | [ADR-005-implementation-summary.md](./ADR-005-implementation-summary.md) |
| ADR-006 | Unified Memory Service | ✅ Implemented | [ADR-006-UNIFIED-MEMORY.md](./ADR-006-UNIFIED-MEMORY.md) |
| ADR-007 | Event Sourcing for State Changes | ✅ Implemented | [ADR-007-EVENT-SOURCING.md](./ADR-007-EVENT-SOURCING.md) |
| ADR-008 | Vitest Over Jest | ✅ Implemented | [ADR-008-VITEST.md](./ADR-008-VITEST.md) |
| ADR-009 | Hybrid Memory Backend as Default | ✅ Implemented | [ADR-009-IMPLEMENTATION.md](./ADR-009-IMPLEMENTATION.md) |
| ADR-010 | Remove Deno Support | ✅ Implemented | [ADR-010-NODE-ONLY.md](./ADR-010-NODE-ONLY.md) |
| ADR-011 | LLM Provider System | ✅ Implemented | [ADR-011-llm-provider-system.md](./ADR-011-llm-provider-system.md) |
| ADR-012 | MCP Security Features | ✅ Implemented | [ADR-012-mcp-security-features.md](./ADR-012-mcp-security-features.md) |
| ADR-013 | Core Security Module | ✅ Implemented | [ADR-013-core-security-module.md](./ADR-013-core-security-module.md) |
| ADR-014 | Workers System | ✅ Implemented | [ADR-014-workers-system.md](./ADR-014-workers-system.md) (Node.js Daemon 2026-01-07) |
| ADR-015 | Unified Plugin System | ✅ Implemented | [ADR-015-unified-plugin-system.md](./ADR-015-unified-plugin-system.md) |
| ADR-016 | Collaborative Issue Claims | ✅ Implemented | [ADR-016-collaborative-issue-claims.md](./ADR-016-collaborative-issue-claims.md) |

## Implementation Progress

| Component | Status | Details |
|-----------|--------|---------|
| DDD Modules | ✅ 100% | 16 modules, 833 files, ~240K lines |
| Test Coverage | ● In Progress | 85+ test files, target: >90% (ADR-008) |
| Service Integration | ✅ Complete | agentic-flow@alpha integration |
| Performance Benchmarks | ✅ Complete | Full benchmark suite in @claude-flow/performance |

## Quick Summary

### Core Decisions

1. **ADR-001**: Build on agentic-flow@alpha instead of duplicating (eliminates 10,000+ lines)
2. **ADR-002**: Domain-Driven Design with bounded contexts for clean architecture
3. **ADR-003**: Single UnifiedSwarmCoordinator as canonical coordination engine
4. **ADR-004**: Microkernel with plugins for optional features (HiveMind, Neural, etc.)
5. **ADR-005**: MCP tools as primary API, CLI as thin wrapper

### Technical Decisions

6. **ADR-006**: Single MemoryService with SQLite, AgentDB, or Hybrid backends
7. **ADR-007**: Event sourcing for audit trail and state reconstruction
8. **ADR-008**: Vitest for 10x faster testing with native ESM
9. **ADR-009**: Hybrid backend (SQLite + AgentDB) as default for best performance
10. **ADR-010**: Node.js 20+ only, removing Deno complexity

## Additional Files

- [v3-adrs.md](./v3-adrs.md) - Complete ADR master document with all decisions
- [ADR-003-implementation-status.md](./ADR-003-implementation-status.md) - Detailed implementation tracking

## Performance Targets (from ADRs)

| Metric | Target | ADR Reference |
|--------|--------|---------------|
| Code reduction | <5,000 lines vs 15,000+ | ADR-001 |
| HNSW search | 150x-12,500x faster | ADR-009 |
| Flash Attention | 2.49x-7.47x speedup | ADR-001 |
| Test execution | <5s (10x improvement) | ADR-008 |
| Startup time | <500ms | ADR-004 |
| Query latency | <100ms | ADR-006 |

## Security Improvements

All ADRs consider security:
- CVE-1: Command injection prevention (ADR-005 input validation)
- CVE-2: Path traversal prevention (ADR-006 memory sandboxing)
- CVE-3: Credential generation (secure random with rejection sampling)

---

**Last Updated:** 2026-01-07
**Project:** Claude-Flow V3
**Version:** 3.0.0-alpha.7

### Recent Updates (2026-01-07)

#### Release: @claude-flow/cli@3.0.0-alpha.7
- **Hive-Mind CLI**: All MCP tools now exposed via CLI subcommands:
  - `hive-mind join <agent-id>` - Join agent to hive
  - `hive-mind leave <agent-id>` - Remove agent from hive
  - `hive-mind consensus` - Manage consensus proposals and voting
  - `hive-mind broadcast -m <msg>` - Broadcast messages to workers
  - `hive-mind memory` - Access shared memory (get/set/delete/list)
- **Bug Fix**: Fixed positional argument parsing for subcommands in CLI parser
- **File Persistence**: All MCP tools use file-based persistence in `.claude-flow/` directories
- **ADR-014**: Node.js Worker Daemon - cross-platform TypeScript daemon replaces shell helpers
- **CLI**: `daemon` command with start/stop/status/trigger/enable subcommands
- **Session Integration**: Auto-start daemon on SessionStart, auto-stop on SessionEnd

#### CLI MCP Tool Coverage
| Category | Tools | CLI Status |
|----------|-------|------------|
| Agent | spawn, terminate, status, list, pool, health, update | ✅ Complete |
| Hive-Mind | init, spawn, status, task, join, leave, consensus, broadcast, memory, optimize-memory, shutdown | ✅ Complete |
| Task | create, status, list, complete, cancel | ✅ Complete |
| Session | save, restore, list, delete, export | ✅ Complete |
| Config | get, set, list, reset, export, import | ✅ Complete |
| Memory | store, retrieve, list, delete, search | ✅ Complete |
| Workflow | create, execute, list, status, delete | ✅ Complete |

#### Install
```bash
npx @claude-flow/cli@v3alpha --help
```
