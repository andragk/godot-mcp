---
title: Testing Strategy
description: Comprehensive testing guide covering unit tests, integration tests, E2E tests, and performance benchmarks
outline: [2, 3]
---

# Testing Strategy

This guide provides a comprehensive testing approach for the Godot MCP Server, ensuring reliability, performance, and correctness.

## Test Pyramid

```
         ┌────────────┐
         │  E2E Tests │  5% - Full workflows
         └────────────┘
       ┌────────────────┐
       │ Integration    │  15% - Component contracts
       │ Tests          │
       └────────────────┘
   ┌──────────────────────┐
   │    Unit Tests        │  80% - Pure logic
   │                      │
   └──────────────────────┘
```

**Target Coverage:** >80% overall, 100% for critical paths

## Setup

### Install Test Dependencies

```powershell
cd mcp-server

# Install Vitest
npm install -D vitest @vitest/ui

# Install test utilities
npm install -D @types/node

# Install Godot test framework (GUT)
# Download from: https://github.com/bitwes/Gut
```

### Configure Vitest

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/types/**',
      ],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
    testTimeout: 10000,
  },
});
```

## Unit Tests (Node.js)

### HTTP Client Tests

Create `tests/unit/infrastructure/godot-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GodotClient, GodotError } from '../../../src/infrastructure/godot-client';
import { request } from 'undici';

vi.mock('undici');

describe('GodotClient', () => {
  let client: GodotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GodotClient('http://localhost:7777');
  });

  describe('call', () => {
    it('should make successful JSON-RPC request', async () => {
      vi.mocked(request).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: { success: true },
          }),
        },
      } as any);

      const result = await client.call('test.method', { param: 'value' });

      expect(result).toEqual({ success: true });
      expect(request).toHaveBeenCalledWith(
        'http://localhost:7777/rpc',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"method":"test.method"'),
        })
      );
    });

    it('should throw GodotError on error response', async () => {
      vi.mocked(request).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            error: {
              code: 404,
              message: 'File not found',
              data: { path: 'test.tscn' },
            },
          }),
        },
      } as any);

      await expect(client.call('read_scene', { path: 'test.tscn' }))
        .rejects
        .toThrow(GodotError);
    });

    it('should retry on network errors', async () => {
      vi.mocked(request)
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValueOnce({
          statusCode: 200,
          body: {
            json: async () => ({
              jsonrpc: '2.0',
              id: 1,
              result: {},
            }),
          },
        } as any);

      await client.call('test.method', {});

      expect(request).toHaveBeenCalledTimes(3);
    });

    it('should not retry on application errors', async () => {
      vi.mocked(request).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32602, message: 'Invalid params' },
          }),
        },
      } as any);

      await expect(client.call('test.method', {})).rejects.toThrow();
      expect(request).toHaveBeenCalledTimes(1);
    });
  });

  describe('healthCheck', () => {
    it('should return true when server responds', async () => {
      vi.mocked(request).mockResolvedValueOnce({
        statusCode: 200,
      } as any);

      const healthy = await client.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false on connection failure', async () => {
      vi.mocked(request).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const healthy = await client.healthCheck();
      expect(healthy).toBe(false);
    });
  });
});
```

### Tool Registry Tests

Create `tests/unit/domain/tool-registry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../../../src/domain/tool-registry';
import { z } from 'zod';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      call: vi.fn().mockResolvedValue({ success: true }),
    };
    registry = new ToolRegistry(mockClient);
  });

  describe('register', () => {
    it('should register a tool', () => {
      const tool = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: z.object({ param: z.string() }),
        handler: vi.fn(),
      };

      registry.register(tool);

      const tools = registry.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test_tool');
    });

    it('should throw on duplicate registration', () => {
      const tool = {
        name: 'test_tool',
        description: 'Test',
        inputSchema: z.object({}),
        handler: vi.fn(),
      };

      registry.register(tool);

      expect(() => registry.register(tool)).toThrow('already registered');
    });
  });

  describe('execute', () => {
    it('should validate and execute tool', async () => {
      const handler = vi.fn().mockResolvedValue({ result: 'success' });
      const tool = {
        name: 'test_tool',
        description: 'Test',
        inputSchema: z.object({ param: z.string() }),
        handler,
      };

      registry.register(tool);

      const result = await registry.execute('test_tool', { param: 'value' });

      expect(handler).toHaveBeenCalledWith({ param: 'value' });
      expect(result).toEqual({ result: 'success' });
    });

    it('should throw on validation error', async () => {
      const tool = {
        name: 'test_tool',
        description: 'Test',
        inputSchema: z.object({ param: z.string() }),
        handler: vi.fn(),
      };

      registry.register(tool);

      await expect(
        registry.execute('test_tool', { param: 123 })
      ).rejects.toThrow();
    });

    it('should throw on unknown tool', async () => {
      await expect(
        registry.execute('unknown_tool', {})
      ).rejects.toThrow('Tool not found');
    });
  });
});
```

### Run Unit Tests

```powershell
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test godot-client.test.ts
```

## Integration Tests (Node.js ↔ Godot)

### Setup Test Godot Instance

Create `tests/integration/setup.ts`:

```typescript
import { GodotClient } from '../../src/infrastructure/godot-client';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

export class TestGodotServer {
  private process: ChildProcess | null = null;
  public client: GodotClient;

  constructor() {
    this.client = new GodotClient('http://localhost:7777');
  }

  async start() {
    // Start Godot in headless mode
    this.process = spawn('godot', [
      '--headless',
      '--path', './test-project'
    ]);

    // Wait for server to be ready
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      if (await this.client.healthCheck()) {
        return;
      }
    }

    throw new Error('Godot server failed to start');
  }

  async stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
```

### Integration Test Example

Create `tests/integration/scene-operations.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestGodotServer } from './setup';

describe('Scene Operations (Integration)', () => {
  let server: TestGodotServer;

  beforeAll(async () => {
    server = new TestGodotServer();
    await server.start();
  }, 60000); // 60s timeout for startup

  afterAll(async () => {
    await server.stop();
  });

  it('should list scenes', async () => {
    const result = await server.client.call('scene.list', {
      directory: 'scenes',
      recursive: true,
    });

    expect(result).toHaveProperty('scenes');
    expect(result).toHaveProperty('total_count');
    expect(Array.isArray(result.scenes)).toBe(true);
  });

  it('should read scene file', async () => {
    const result = await server.client.call('scene.read', {
      path: 'scenes/test.tscn',
    });

    expect(result).toHaveProperty('root_node');
    expect(result).toHaveProperty('connections');
    expect(result.root_node).toHaveProperty('name');
    expect(result.root_node).toHaveProperty('type');
  });

  it('should handle file not found error', async () => {
    await expect(
      server.client.call('scene.read', { path: 'scenes/missing.tscn' })
    ).rejects.toThrow('File not found');
  });
});
```

## GDScript Tests (Godot)

### Setup GUT (Godot Unit Testing)

1. Download GUT from [GitHub](https://github.com/bitwes/Gut)
2. Extract to `addons/gut/`
3. Enable in Project Settings → Plugins

### GDScript Test Example

Create `tests/gdscript/test_scene_manager.gd`:

```gdscript
extends GutTest

var scene_manager

func before_all():
	scene_manager = SceneManager.new()

func test_list_scenes_returns_array():
	var result = scene_manager.list_scenes({})
	
	assert_not_null(result, "Result should not be null")
	assert_true(result.has("scenes"), "Result should have scenes key")
	assert_true(result.has("total_count"), "Result should have total_count")
	assert_typeof(result["scenes"], TYPE_ARRAY, "scenes should be an array")

func test_read_scene_returns_structure():
	var result = scene_manager.read_scene({"path": "scenes/test.tscn"})
	
	assert_not_null(result, "Result should not be null")
	assert_true(result.has("root_node"), "Should have root_node")
	assert_true(result.has("connections"), "Should have connections")

func test_read_missing_scene_returns_error():
	var result = scene_manager.read_scene({"path": "scenes/missing.tscn"})
	
	assert_is(result, GodotError, "Should return GodotError")
	assert_eq(result.code, 404, "Error code should be 404")

func test_path_traversal_blocked():
	var result = scene_manager.read_scene({"path": "../../etc/passwd"})
	
	assert_is(result, GodotError, "Should return error on path traversal")
```

### Run GDScript Tests

```powershell
# Run from Godot Editor
# Bottom panel → GUT → Run All Tests

# Or via command line
godot --path . --script addons/gut/gut_cmdln.gd
```

## E2E Tests (Full Workflow)

### Playwright Setup (Optional)

```powershell
npm install -D @playwright/test
npx playwright install
```

### E2E Test Example

Create `tests/e2e/full-workflow.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Full MCP Workflow', () => {
  test('should show server status on dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Wait for status to load
    await page.waitForSelector('.status-badge');

    // Verify status badge exists
    const status = await page.textContent('.status-badge');
    expect(status).toContain('running');
  });

  test('should stream logs in real-time', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Initial log count
    const initialLogs = await page.locator('.log-line').count();

    // Wait for new logs (should appear from polling)
    await page.waitForTimeout(2000);

    const newLogs = await page.locator('.log-line').count();
    expect(newLogs).toBeGreaterThanOrEqual(initialLogs);
  });
});
```

## Performance Benchmarks

### Latency Benchmark

Create `tests/performance/latency.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GodotClient } from '../../src/infrastructure/godot-client';

describe('Performance Benchmarks', () => {
  const client = new GodotClient();

  it('should meet latency targets for read operations', async () => {
    const iterations = 100;
    const latencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await client.call('scene.read', { path: 'scenes/test.tscn' });
      latencies.push(Date.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(iterations * 0.5)];
    const p95 = latencies[Math.floor(iterations * 0.95)];
    const p99 = latencies[Math.floor(iterations * 0.99)];

    expect(p50).toBeLessThan(50); // p50 < 50ms
    expect(p95).toBeLessThan(100); // p95 < 100ms
    expect(p99).toBeLessThan(150); // p99 < 150ms
  }, 120000);
});
```

## CI/CD Integration

### GitHub Actions Workflow

Create `.github/workflows/test.yml`:

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        working-directory: ./mcp-server

      - name: Run unit tests
        run: npm test -- --coverage
        working-directory: ./mcp-server

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./mcp-server/coverage/coverage-final.json
```

## Test Coverage Report

```powershell
# Generate coverage report
npm test -- --coverage

# View HTML report
start coverage/index.html
```

**Target Coverage:**
- **Overall:** ≥80%
- **Critical paths** (validation, HTTP client): 100%
- **Tools:** ≥90%
- **Infrastructure:** ≥85%

## Next Steps

- [Deployment Guide](/en/implementation/deployment) - Package for production
- [Best Practices](/en/best-practices) - Development guidelines
- [Implementation Roadmap](/en/implementation/roadmap) - Sprint-by-sprint testing milestones

:::tip Testing Best Practices
- Write tests before implementation (TDD)
- Mock external dependencies (HTTP, filesystem)
- Use descriptive test names
- Test edge cases and error paths
- Keep tests fast (<100ms per test)
- Run tests in CI/CD pipeline
:::

---

## Quality Gates & Release Criteria

### Pre-Merge Quality Gate

Required for all Pull Requests:

- ✅ **All tests pass** (unit, integration, E2E)
- ✅ **Coverage ≥80%** overall, 100% for critical paths
- ✅ **No new ESLint warnings** (enforce with `--max-warnings 0`)
- ✅ **No security vulnerabilities** (npm audit, Snyk scan)
- ✅ **Performance benchmarks** don't regress by >10%
- ✅ **Manual code review** approved by 1+ maintainer

### Pre-Release Quality Gate

Required before tagging a release:

- ✅ **Full E2E test suite passes** (all critical workflows)
- ✅ **Load testing validates performance** (p99 <50ms read, <200ms write)
- ✅ **Security scan clean** (no high/critical vulnerabilities)
- ✅ **Documentation updated** (CHANGELOG, API docs)
- ✅ **Version bumped** (SemVer compliance)
- ✅ **Staging deployment successful** (manual smoke test)

### Test Pyramid Metrics

**Target Distribution:**

| Layer | Test Count | Execution Time | Coverage Target |
|-------|-----------|----------------|-----------------|
| Unit Tests | 80% | <30s | ≥80% overall |
| Integration Tests | 15% | <90s | 100% API contracts |
| E2E Tests | 5% | <2min | Critical paths only |
| **Total** | **~1,000 tests** | **<5min** | **≥80%** |

### Reliability Metrics

**Target Metrics:**

- **Flaky Test Rate**: <0.1% (max 1 flaky test per 1,000 runs)
- **Build Success Rate**: >99% (excluding external failures)
- **Mean Time to Detect (MTTD)**: <5min (CI pipeline catches failures)
- **Mean Time to Repair (MTTR)**: <1hr (critical test failures fixed within 1 hour)

**Flaky Test Management:**

```typescript
// Mark flaky tests for retry
describe.concurrent.retry(3)('Flaky integration test', () => {
  it('should handle network timeout gracefully', async () => {
    // Test with retry logic
  });
});
```

---

## Security Testing

### Security Test Categories

1. **Input Validation Tests** (100% coverage required):
   - Path traversal attempts (`../../etc/passwd`)
   - Absolute paths (`/etc/passwd`, `C:\Windows\System32`)
   - Special characters (null bytes, Unicode exploits)
   - Command injection patterns

2. **Authentication Tests**:
   - Invalid API keys
   - Expired API keys
   - Missing authentication headers
   - Brute force protection (rate limiting)

3. **Fuzz Testing**:
   - Random input generation for all tool parameters
   - Boundary value testing (min/max integers, empty strings)

### Example Security Test

```typescript
describe('Security: Path Traversal Protection', () => {
  const attackVectors = [
    '../../../etc/passwd',
    '..\\..\\..\\Windows\\System32\\config\\sam',
    'scenes/../../../etc/passwd',
    'scenes/%2e%2e%2f%2e%2e%2fetc/passwd',
  ];

  attackVectors.forEach(path => {
    it(`should reject path traversal: ${path}`, async () => {
      const result = await validatePath(path);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('path traversal');
    });
  });

  it('should reject absolute paths', () => {
    expect(validatePath('/etc/passwd').valid).toBe(false);
    expect(validatePath('C:\\Windows\\System32').valid).toBe(false);
  });

  it('should allow valid relative paths', () => {
    expect(validatePath('scenes/main_menu.tscn').valid).toBe(true);
    expect(validatePath('scripts/player.gd').valid).toBe(true);
  });
});
```

---

## Test Data Management

### Test Fixtures

Create reusable test data:

```typescript
// tests/fixtures/scenes.ts
export const MOCK_SCENE = {
  path: 'scenes/test_scene.tscn',
  nodes: [
    { name: 'Root', type: 'Node2D', properties: {} },
    { name: 'Player', type: 'CharacterBody2D', parent: 'Root' }
  ],
  connections: []
};

export const MOCK_SCRIPT = {
  path: 'scripts/player.gd',
  content: 'extends CharacterBody2D\n\nfunc _ready():\n\tpass'
};
```

---

## Related Documentation

- [Security Architecture](/en/architecture/security) - Security testing requirements
- [Setup Guide](/en/implementation/setup) - Development environment setup
- [Deployment Guide](/en/implementation/deployment) - CI/CD pipeline configuration
- [Best Practices](/en/best-practices) - Testing best practices
