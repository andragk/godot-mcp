---
title: Testing-Leitfaden
description: Umfassende Testing-Strategie für Unit-, Integration- und End-to-End-Tests
outline: [2, 3]
---

# Testing-Leitfaden

Diese Anleitung deckt die Testing-Strategie für das Godot MCP Server-Projekt ab, einschließlich Unit-, Integration- und End-to-End-Tests über alle Komponenten hinweg.

## Testing-Philosophie

- **Test-Driven Development (TDD)**: Tests vor Implementierung schreiben
- **Hohe Coverage**: ≥80% Code-Coverage, 100% für kritische Pfade
- **Schnelle Tests**: Unit-Tests <100ms, Integration-Tests <1s
- **Isolierte Tests**: Keine Shared State zwischen Tests
- **Aussagekräftige Fehler**: Klare Fehlermeldungen mit Kontext

## Schritt 1: Test-Setup

### Vitest-Konfiguration

`vitest.config.ts` erstellen:

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
        '**/*.spec.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    testTimeout: 5000,
    hookTimeout: 10000,
  },
});
```

### Test-Verzeichnisstruktur

```
tests/
├── unit/                    # Unit-Tests
│   ├── domain/
│   │   ├── tool-registry.test.ts
│   │   └── tools/
│   │       ├── list-scenes.test.ts
│   │       └── read-scene.test.ts
│   └── infrastructure/
│       ├── godot-client.test.ts
│       └── logger.test.ts
├── integration/            # Integration-Tests
│   ├── server.test.ts
│   ├── godot-bridge.test.ts
│   └── web-ui.test.ts
├── e2e/                    # End-to-End-Tests
│   └── full-flow.test.ts
└── fixtures/               # Test-Fixtures
    ├── scenes/
    │   └── test-scene.tscn
    └── responses/
        └── godot-responses.json
```

## Schritt 2: Unit-Tests

### Tool Registry Tests

`tests/unit/domain/tool-registry.test.ts` erstellen:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../../../src/domain/tool-registry';
import { GodotClient } from '../../../src/infrastructure/godot-client';
import { z } from 'zod';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockGodotClient: GodotClient;

  beforeEach(() => {
    mockGodotClient = {
      call: vi.fn(),
      healthCheck: vi.fn(),
    } as any;
    
    registry = new ToolRegistry(mockGodotClient);
  });

  describe('register', () => {
    it('sollte Tool erfolgreich registrieren', () => {
      const tool = {
        name: 'test_tool',
        description: 'Test-Tool',
        inputSchema: z.object({ param: z.string() }),
        handler: vi.fn(),
      };

      registry.register(tool);
      const tools = registry.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test_tool');
    });

    it('sollte bei doppelter Registrierung werfen', () => {
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
    it('sollte Tool mit validierten Parametern ausführen', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      const tool = {
        name: 'test_tool',
        description: 'Test',
        inputSchema: z.object({ name: z.string() }),
        handler,
      };

      registry.register(tool);
      const result = await registry.execute('test_tool', { name: 'test' });

      expect(handler).toHaveBeenCalledWith({ name: 'test' });
      expect(result).toEqual({ success: true });
    });

    it('sollte bei ungültigen Parametern werfen', async () => {
      const tool = {
        name: 'test_tool',
        description: 'Test',
        inputSchema: z.object({ count: z.number() }),
        handler: vi.fn(),
      };

      registry.register(tool);
      
      await expect(
        registry.execute('test_tool', { count: 'invalid' })
      ).rejects.toThrow();
    });

    it('sollte bei nicht gefundenem Tool werfen', async () => {
      await expect(
        registry.execute('nonexistent', {})
      ).rejects.toThrow('not found');
    });
  });
});
```

### GodotClient Tests

`tests/unit/infrastructure/godot-client.test.ts` erstellen:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GodotClient } from '../../../src/infrastructure/godot-client';
import { request } from 'undici';

vi.mock('undici');

describe('GodotClient', () => {
  let client: GodotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GodotClient('http://localhost:7777');
  });

  describe('call', () => {
    it('sollte erfolgreichen JSON-RPC-Aufruf durchführen', async () => {
      vi.mocked(request).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: { data: 'test' },
          }),
        },
      } as any);

      const result = await client.call('test.method', { param: 'value' });

      expect(result).toEqual({ data: 'test' });
      expect(request).toHaveBeenCalledWith(
        'http://localhost:7777/rpc',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('sollte bei Godot-Fehler werfen', async () => {
      vi.mocked(request).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            error: { code: 404, message: 'Not found' },
          }),
        },
      } as any);

      await expect(client.call('test.method', {})).rejects.toThrow('Not found');
    });

    it('sollte bei Netzwerkfehler wiederholen', async () => {
      vi.mocked(request)
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValueOnce({
          statusCode: 200,
          body: {
            json: async () => ({
              jsonrpc: '2.0',
              id: 1,
              result: { success: true },
            }),
          },
        } as any);

      const result = await client.call('test.method', {});

      expect(result).toEqual({ success: true });
      expect(request).toHaveBeenCalledTimes(3);
    });
  });

  describe('healthCheck', () => {
    it('sollte true bei erfolgreicher Verbindung zurückgeben', async () => {
      vi.mocked(request).mockResolvedValueOnce({
        statusCode: 200,
      } as any);

      const healthy = await client.healthCheck();
      expect(healthy).toBe(true);
    });

    it('sollte false bei Verbindungsfehler zurückgeben', async () => {
      vi.mocked(request).mockRejectedValueOnce(new Error('Connection failed'));

      const healthy = await client.healthCheck();
      expect(healthy).toBe(false);
    });
  });
});
```

## Schritt 3: Integration-Tests

### Server Integration Test

`tests/integration/server.test.ts` erstellen:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('MCP Server Integration', () => {
  let serverProcess: ChildProcess;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Server-Prozess starten
    serverProcess = spawn('node', ['dist/server.js'], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    // MCP-Client verbinden
    transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/server.js'],
    });

    client = new Client({
      name: 'test-client',
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    await client.close();
    serverProcess.kill();
  });

  it('sollte verfügbare Tools auflisten', async () => {
    const response = await client.request(
      { method: 'tools/list' },
      { method: 'tools/list', params: {} }
    );

    expect(response.tools).toBeDefined();
    expect(response.tools.length).toBeGreaterThan(0);
    
    const toolNames = response.tools.map((t: any) => t.name);
    expect(toolNames).toContain('list_scenes');
    expect(toolNames).toContain('read_scene');
  });

  it('sollte Tool erfolgreich aufrufen', async () => {
    const response = await client.request(
      { method: 'tools/call' },
      {
        method: 'tools/call',
        params: {
          name: 'list_scenes',
          arguments: { directory: 'res://' },
        },
      }
    );

    expect(response.content).toBeDefined();
    expect(response.content[0].type).toBe('text');
  });
});
```

## Schritt 4: Godot-Tests (GDScript)

### GDScript Unit-Test

`addons/mcp_bridge/tests/test_scene_handler.gd` erstellen:

```gdscript
extends GutTest

const SceneHandler = preload("res://addons/mcp_bridge/handlers/scene_handler.gd")

var handler: SceneHandler

func before_each():
	handler = SceneHandler.new()
	add_child_autofree(handler)

func test_list_scenes_returns_array():
	var result = handler.list_scenes({})
	
	assert_has(result, "scenes", "Sollte 'scenes'-Feld haben")
	assert_has(result, "count", "Sollte 'count'-Feld haben")
	assert_typeof(result.scenes, TYPE_ARRAY, "scenes sollte Array sein")

func test_list_scenes_filters_by_directory():
	var result = handler.list_scenes({"directory": "res://scenes/"})
	
	for scene_path in result.scenes:
		assert_true(
			scene_path.begins_with("res://scenes/"),
			"Alle Scenes sollten im angegebenen Verzeichnis sein"
		)

func test_read_scene_returns_error_for_nonexistent():
	var result = handler.read_scene({"path": "res://nonexistent.tscn"})
	
	assert_has(result, "_error", "Sollte Fehler für nicht existierende Datei zurückgeben")
	assert_eq(result._error.code, 404, "Sollte 404-Code zurückgeben")
```

### GUT (Godot Unit Testing) installieren

1. [GUT vom Asset Library](https://godotengine.org/asset-library/asset/54) herunterladen
2. In `addons/gut/` entpacken
3. Plugin in Projekt-Einstellungen aktivieren
4. Tests über **Bottom Panel → GUT** ausführen

## Schritt 5: End-to-End-Tests

### Vollständiger Workflow-Test

`tests/e2e/full-flow.test.ts` erstellen:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { GodotClient } from '../../src/infrastructure/godot-client';
import fetch from 'node-fetch';

describe('End-to-End Workflow', () => {
  let mcp: ChildProcess;
  let godot: ChildProcess;
  let godotClient: GodotClient;

  beforeAll(async () => {
    // Godot mit Plugin starten
    godot = spawn('godot', ['--headless', '--path', './test-project']);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // MCP-Server starten
    mcp = spawn('node', ['dist/server.js']);
    await new Promise(resolve => setTimeout(resolve, 2000));

    godotClient = new GodotClient();
  }, 60000);

  afterAll(() => {
    mcp?.kill();
    godot?.kill();
  });

  it('sollte kompletten Scene-Workflow ausführen', async () => {
    // 1. Scenes auflisten
    const scenes = await godotClient.call('scene.list', {});
    expect(scenes.scenes).toBeDefined();

    // 2. Scene lesen
    if (scenes.scenes.length > 0) {
      const sceneData = await godotClient.call('scene.read', {
        path: scenes.scenes[0],
      });
      expect(sceneData.root).toBeDefined();
    }

    // 3. Neue Scene erstellen
    const created = await godotClient.call('scene.create', {
      path: 'res://test_scene.tscn',
      root_type: 'Node2D',
    });
    expect(created.success).toBe(true);
  });

  it('sollte Web-UI-Endpunkte bedienen', async () => {
    const healthResponse = await fetch('http://localhost:8080/api/health');
    const health = await healthResponse.json();
    
    expect(health.status).toBe('healthy');
    expect(health.uptime).toBeGreaterThan(0);
  });
});
```

## Schritt 6: Tests ausführen

### Alle Tests ausführen

```powershell
npm test
```

### Mit Coverage

```powershell
npm run test:coverage
```

### Watch-Modus (Entwicklung)

```powershell
npm run test:watch
```

### Nur Unit-Tests

```powershell
npm run test:unit
```

### Nur Integration-Tests

```powershell
npm run test:integration
```

## CI/CD-Integration

### GitHub Actions Workflow

`.github/workflows/test.yml` erstellen:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

## Best Practices

:::tip Testing Best Practices
- **Arrange-Act-Assert**: Tests klar strukturieren
- **Ein Konzept pro Test**: Fokussierte Tests schreiben
- **Aussagekräftige Namen**: `test_function_scenario_expected()` verwenden
- **Fixtures nutzen**: Wiederholbare Test-Daten erstellen
- **Mocks sparsam**: Nur externe Dependencies mocken
- **Async testen**: Immer `await` bei Promises verwenden
- **Cleanup**: `beforeEach`/`afterEach` für Test-Isolation
:::

## Nächste Schritte

- [Bereitstellung](/de/implementation/deployment) - Produktions-Deployment
- [CI/CD](/de/implementation/deployment#cicd) - Automatisierte Pipelines
- [Monitoring](/de/architecture/overview#observability) - Produktions-Überwachung
