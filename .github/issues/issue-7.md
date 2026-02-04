## Problem Description

Implement comprehensive security hardening across all components and establish a complete testing suite to ensure the MCP server meets production-ready security and quality standards. This cross-cutting concern runs parallel with other Phase 1 issues and must be completed before MVP release.

**Why this matters:**
- Security vulnerabilities could compromise user systems and projects
- Comprehensive testing ensures reliability and prevents regressions
- Code coverage provides confidence in system behavior
- Security best practices protect against common attack vectors

## Acceptance Criteria

- [ ] Zero critical security vulnerabilities detected by automated scanning
- [ ] Path traversal prevention blocks all malicious path attempts
- [ ] Command injection protection validates all shell inputs
- [ ] Input validation with Zod schemas covers all tool parameters
- [ ] Rate limiting middleware prevents abuse
- [ ] Test suite achieves >85% code coverage
- [ ] All tests pass consistently on CI/CD pipeline
- [ ] Security audit documented and reviewed

## Technical Requirements

### Security Hardening

#### 1. Path Traversal Prevention

**Vulnerability:**
- Malicious paths like `../../../etc/passwd`
- Symlink attacks
- Absolute path injection
- UNC path exploits (Windows)

**Mitigation:**
```typescript
// Path validation utility
function validateProjectPath(basePath: string, relativePath: string): string {
  const normalized = path.normalize(relativePath);
  const absolute = path.resolve(basePath, normalized);
  
  // Ensure resolved path is within base directory
  if (!absolute.startsWith(basePath)) {
    throw new SecurityError('Path traversal attempt detected');
  }
  
  // Check for symlink attacks
  const realPath = fs.realpathSync(absolute);
  if (!realPath.startsWith(basePath)) {
    throw new SecurityError('Symlink escape attempt detected');
  }
  
  return absolute;
}
```

**Implementation:**
- Centralized path validation module
- Applied to all file read/write operations
- Whitelist allowed project directories
- Reject absolute paths in user input
- Log all path validation failures

#### 2. Command Injection Protection

**Vulnerability:**
- Shell command injection via parameters
- Argument injection in spawned processes
- Environment variable manipulation

**Mitigation:**
```typescript
// Safe process execution
function executeGodot(args: string[], options: SpawnOptions): ChildProcess {
  // Whitelist allowed arguments
  const allowedArgs = ['--version', '--headless', '--path', '--export'];
  
  // Validate each argument
  args.forEach(arg => {
    const argName = arg.split('=')[0];
    if (!allowedArgs.includes(argName)) {
      throw new SecurityError(`Disallowed argument: ${argName}`);
    }
  });
  
  // Use spawn with argument array (not shell)
  return spawn('godot', args, { shell: false, ...options });
}
```

**Implementation:**
- Never use `shell: true` in child_process
- Whitelist allowed commands and arguments
- Escape/validate all user-provided arguments
- Sanitize environment variables
- Log all process executions with parameters

#### 3. Input Validation (Zod Schemas)

**All tool parameters must be validated:**

```typescript
// Example: create_scene tool schema
const CreateSceneSchema = z.object({
  scene_path: z.string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9_\-\/\.]+$/, 'Invalid characters in path'),
  root_node_type: z.enum(['Node', 'Node2D', 'Node3D', 'Control', 'CharacterBody2D', /* ... */]),
  node_structure: z.array(NodeDefinitionSchema).optional(),
  properties: z.record(z.unknown()).optional(),
  force: z.boolean().default(false)
});
```

**Requirements:**
- Zod schema for every tool
- Type inference from schemas
- Runtime validation before execution
- Detailed error messages for invalid input
- Schema documentation generation

#### 4. Rate Limiting Middleware

**Prevent abuse and DoS:**

```typescript
// Rate limiting configuration
const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

// Apply to HTTP bridge
app.use('/api/', rateLimiter);

// Stricter limits for write operations
const writeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20 // 20 writes per minute
});

app.use('/api/tools/create_*', writeRateLimiter);
app.use('/api/tools/modify_*', writeRateLimiter);
```

**Features:**
- Per-IP rate limiting
- Different limits for read vs. write operations
- Exponential backoff for repeated violations
- Whitelist for trusted clients
- Rate limit headers in responses

#### 5. Additional Security Measures

- **CORS Configuration:**
  - Strict origin validation
  - No wildcard origins in production
  - Credential handling

- **Content Security:**
  - Input sanitization for log outputs
  - XSS prevention in Web UI
  - CSRF tokens for state-changing operations

- **Authentication (Future):**
  - API key support
  - Token-based authentication
  - Permission levels (read-only, read-write, admin)

- **Audit Logging:**
  - Log all security-relevant events
  - Include timestamps, IP addresses, user agents
  - Tamper-proof log storage
  - Retention policy

### Comprehensive Test Suite

#### Test Coverage Targets

**Overall Coverage:** >85%
- **Unit Tests:** >90%
- **Integration Tests:** >70%
- **E2E Tests:** Critical paths only

#### Test Structure

```
tests/
├── unit/
│   ├── tools/
│   │   ├── editor-control.test.ts
│   │   ├── read-tools.test.ts
│   │   ├── node-operations.test.ts
│   │   ├── scene-operations.test.ts
│   │   └── script-operations.test.ts
│   ├── security/
│   │   ├── path-validation.test.ts
│   │   ├── command-injection.test.ts
│   │   └── input-validation.test.ts
│   ├── cache/
│   │   └── lru-cache.test.ts
│   └── utils/
│       ├── parsers.test.ts
│       └── validators.test.ts
├── integration/
│   ├── mcp-protocol.test.ts
│   ├── http-bridge.test.ts
│   ├── web-ui-api.test.ts
│   └── end-to-end.test.ts
├── performance/
│   ├── scene-parsing.bench.ts
│   ├── cache-performance.bench.ts
│   └── concurrent-requests.bench.ts
└── security/
    ├── penetration-tests.ts
    └── vulnerability-scan.ts
```

#### Testing Requirements

**Unit Tests:**
- [ ] All tools with happy path and error cases
- [ ] Security utilities (path validation, input sanitization)
- [ ] Cache eviction and hit/miss logic
- [ ] File parsers (scenes, scripts, project config)
- [ ] Validation logic

**Integration Tests:**
- [ ] MCP protocol compliance
- [ ] HTTP bridge request/response cycle
- [ ] Web UI SSE streaming
- [ ] End-to-end tool invocation
- [ ] Database/file system interactions

**Security Tests:**
- [ ] Path traversal attempts (50+ malicious paths)
- [ ] Command injection attempts (SQL injection style)
- [ ] Malformed input fuzzing
- [ ] Rate limit enforcement
- [ ] XSS and CSRF prevention

**Performance Tests:**
- [ ] Scene parsing benchmark suite
- [ ] Cache performance under load
- [ ] Concurrent request handling (100+ simultaneous)
- [ ] Memory leak detection
- [ ] CPU profiling for hot paths

**CI/CD Integration:**
- GitHub Actions workflow
- Run on every pull request
- Coverage report generation
- Failed test blocking merges
- Performance regression detection

## Test Requirements

### Security Audit
- [ ] Automated vulnerability scanning (npm audit, Snyk)
- [ ] Manual security review of all tools
- [ ] Penetration testing scenarios documented
- [ ] OWASP Top 10 checklist completed
- [ ] Dependency audit (no known CVEs)

### Code Quality
- [ ] ESLint with strict rules
- [ ] Prettier formatting enforced
- [ ] TypeScript strict mode enabled
- [ ] No console.log in production code
- [ ] All public APIs documented

### Test Execution
- [ ] Unit tests complete in <30 seconds
- [ ] Integration tests complete in <2 minutes
- [ ] All tests pass on Windows, macOS, Linux
- [ ] No flaky tests (must pass 10 consecutive runs)
- [ ] Coverage report generated and published

## Documentation Requirements

- [ ] Security best practices guide
- [ ] Threat model documentation
- [ ] Testing strategy overview
- [ ] Test writing guidelines
- [ ] CI/CD pipeline documentation
- [ ] Security incident response plan
- [ ] Vulnerability disclosure policy

## Estimated Effort

**Story Points:** 21

**Breakdown:**
- Path traversal prevention: 2 points
- Command injection protection: 2 points
- Input validation schemas: 3 points
- Rate limiting: 2 points
- Security audit: 2 points
- Unit test suite: 5 points
- Integration tests: 3 points
- Security tests: 2 points

**Dependencies:**
- Runs parallel with: #2, #3, #4, #5, #6
- Depends on: #1 (Foundation) for infrastructure
- Blocks: Phase 1 completion (must finish before MVP release)

**Timeline:** Ongoing throughout Sprints 2-6, completion by end of Sprint 6

**Risk Mitigation:**
- Early security review prevents late-stage discoveries
- Continuous testing catches regressions immediately
- Automated scanning reduces manual review burden
- High coverage provides confidence for refactoring
