# ADR-031: Security Doctor Command

## Status
**Planned** - Not yet implemented

## Context

The cache optimizer handoff system interfaces with external LLM providers and executes background processes, creating potential security attack surfaces. While ADR-030 addresses specific vulnerabilities (SSRF, command injection, path traversal, header injection), a comprehensive security diagnostic tool is needed to:

1. Continuously validate security configurations
2. Detect misconfigured or insecure settings
3. Scan for common vulnerabilities in configuration
4. Audit API key exposure and secrets management
5. Validate endpoint security
6. Check file permissions and access controls
7. Report compliance status

## Decision

Implement a `security doctor` command that performs comprehensive security audits of the cache-optimizer configuration and deployment.

### 1. Command Interface

```bash
# Basic security check
npx @claude-flow/cache-optimizer doctor --security

# Full security audit with remediation
npx @claude-flow/cache-optimizer doctor --security --full --fix

# Generate compliance report
npx @claude-flow/cache-optimizer doctor --security --report json > security-audit.json

# Specific security checks
npx @claude-flow/cache-optimizer doctor --security --check secrets
npx @claude-flow/cache-optimizer doctor --security --check endpoints
npx @claude-flow/cache-optimizer doctor --security --check permissions
```

### 2. Security Check Categories

#### 2.1 Secrets & API Keys

| Check | Description | Severity |
|-------|-------------|----------|
| `secrets.env-exposure` | API keys in environment variables properly scoped | Critical |
| `secrets.config-files` | No secrets in `.cache-optimizer.json` | Critical |
| `secrets.git-history` | No secrets in git history | Critical |
| `secrets.hardcoded` | No hardcoded credentials in source | Critical |
| `secrets.rotation` | API key rotation recommendations | Warning |

#### 2.2 Endpoint Security

| Check | Description | Severity |
|-------|-------------|----------|
| `endpoints.ssrf-protection` | SSRF validation enabled | Critical |
| `endpoints.tls-only` | All endpoints use HTTPS | High |
| `endpoints.localhost` | Local endpoints properly restricted | Medium |
| `endpoints.cloud-metadata` | Cloud metadata endpoints blocked | Critical |
| `endpoints.private-networks` | Private network access controlled | High |

#### 2.3 File & Process Security

| Check | Description | Severity |
|-------|-------------|----------|
| `files.permissions` | Config files not world-readable | High |
| `files.paths` | Path traversal protection enabled | Critical |
| `files.temp` | Temp files in secure locations | Medium |
| `process.spawn-env` | Minimal environment in spawned processes | High |
| `process.timeout` | Timeouts configured for all operations | Medium |

#### 2.4 Authentication & Authorization

| Check | Description | Severity |
|-------|-------------|----------|
| `auth.webhook-signatures` | Webhooks use HMAC signatures | High |
| `auth.provider-auth` | All providers have authentication | Critical |
| `auth.rate-limiting` | Rate limiting enabled per provider | Medium |
| `auth.circuit-breakers` | Circuit breakers configured | Medium |

#### 2.5 Input Validation

| Check | Description | Severity |
|-------|-------------|----------|
| `input.request-ids` | Request ID validation enabled | High |
| `input.headers` | Header injection prevention enabled | High |
| `input.content-length` | Max content length enforced | Medium |
| `input.sanitization` | Input sanitization in place | High |

### 3. Remediation Actions

The `--fix` flag enables automatic remediation where possible:

| Issue | Auto-Fix Action |
|-------|-----------------|
| Missing TLS | Update endpoints to HTTPS |
| Weak permissions | Set 600 on config files |
| Missing rate limits | Apply default rate limits |
| No circuit breakers | Enable default breakers |
| Missing timeouts | Apply default timeouts |

Non-automatable issues generate actionable recommendations:
- Secrets in config → "Move to environment variables"
- Git history exposure → "Rotate keys, run git-filter-branch"
- Hardcoded credentials → "Extract to .env file"

### 4. Report Format

```typescript
interface SecurityReport {
  timestamp: string;
  version: string;
  profile: string;

  summary: {
    passed: number;
    failed: number;
    warnings: number;
    critical: number;
  };

  checks: Array<{
    id: string;
    category: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    status: 'pass' | 'fail' | 'warn' | 'skip';
    message: string;
    remediation?: string;
    autoFixable: boolean;
  }>;

  recommendations: string[];
  compliance: {
    owasp: boolean;
    cve: string[];  // Mitigated CVEs
  };
}
```

### 5. Integration Points

```typescript
// Programmatic API
import { securityDoctor } from '@claude-flow/cache-optimizer';

const report = await securityDoctor.run({
  checks: ['secrets', 'endpoints', 'files'],
  fix: false,
  verbose: true,
});

if (report.summary.critical > 0) {
  throw new Error('Critical security issues found');
}

// Hook integration
hooks: {
  PreCompact: [
    {
      command: 'npx @claude-flow/cache-optimizer doctor --security --quick',
      timeout: 2000,
    }
  ]
}
```

### 6. CI/CD Integration

```yaml
# GitHub Actions
- name: Security Audit
  run: |
    npx @claude-flow/cache-optimizer doctor --security --full
    if [ $? -ne 0 ]; then
      echo "Security audit failed"
      exit 1
    fi

# Exit codes
# 0 - All checks passed
# 1 - Critical issues found
# 2 - High severity issues found
# 3 - Configuration error
```

## Implementation Plan

### Phase 1: Core Scanner (Priority: High)
- [ ] Secrets scanner (env, config, git)
- [ ] Endpoint validator (SSRF, TLS, metadata)
- [ ] File permission checker
- [ ] Report generator (JSON, table)

### Phase 2: Remediation (Priority: Medium)
- [ ] Auto-fix framework
- [ ] Permission fixes
- [ ] Config migration
- [ ] Recommendation engine

### Phase 3: Integration (Priority: Medium)
- [ ] CI/CD exit codes
- [ ] Hook integration
- [ ] Programmatic API
- [ ] Watch mode

### Phase 4: Compliance (Priority: Low)
- [ ] OWASP mapping
- [ ] CVE tracking
- [ ] Compliance reports
- [ ] Audit trail

## TODO

- [ ] Implement core security scanner framework
- [ ] Add secrets detection (regex patterns for API keys)
- [ ] Implement endpoint SSRF validation check
- [ ] Add file permission scanner
- [ ] Create JSON/table report formatters
- [ ] Implement `--fix` remediation actions
- [ ] Add CI/CD integration with exit codes
- [ ] Write comprehensive tests for each check category
- [ ] Document all checks in user guide

## Consequences

### Positive
- Proactive security issue detection
- Automated remediation reduces manual work
- CI/CD integration catches issues early
- Compliance reporting for enterprise
- Comprehensive audit trail

### Negative
- Additional complexity in CLI
- False positives may require tuning
- Some checks may be slow (git history scan)
- Auto-fix may have unintended effects

### Mitigations
- Configurable check sets
- `--quick` mode for fast checks
- `--dry-run` for fix preview
- Manual approval for critical fixes

## Related

- ADR-030: Cache Optimizer Architecture (security hardening section)
- ADR-006: Unified Memory Service
- ADR-026: Intelligent Model Routing

## References

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- CWE/SANS Top 25: https://cwe.mitre.org/top25/
- Claude Code Security Model: https://docs.anthropic.com/claude-code/security
