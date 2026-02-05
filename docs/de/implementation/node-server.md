---
title: Node.js MCP Server erstellen
description: Schritt-für-Schritt-Anleitung zur Implementierung des Node.js MCP Servers mit Tools, Validierung und HTTP-Kommunikation
outline: [2, 3]
---

# Node.js MCP Server erstellen

Diese Anleitung führt durch die Implementierung der Node.js MCP Server-Komponente, einschließlich Tool-Registrierung, HTTP-Kommunikation mit Godot und Presentation Layer für MCP-Clients.

## Projektinitialisierung

Folgen Sie zuerst der [Entwicklungsumgebung einrichten](/de/implementation/setup)-Anleitung, dann mit der Implementierung fortfahren.

## Schritt 1: Kern-Server-Implementierung

### Haupt-Server-Einstiegspunkt

`src/server.ts` erstellen:

```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from './domain/tool-registry.js';
import { GodotClient } from './infrastructure/godot-client.js';
import { logger } from './infrastructure/logger.js';
import { WebUIServer } from './presentation/web-server.js';

async function main() {
  logger.info('Starting Godot MCP Server...');

  // Godot HTTP-Client initialisieren
  const godotClient = new GodotClient('http://localhost:7777');
  
  // Godot-Verbindung prüfen
  const godotHealthy = await godotClient.healthCheck();
  if (!godotHealthy) {
    logger.warn('Godot Bridge antwortet nicht. Server wird Verbindungen wiederholen.');
  }

  // Tool-Registry initialisieren
  const toolRegistry = new ToolRegistry(godotClient);
  await toolRegistry.registerBuiltInTools();

  // MCP-Server erstellen
  const server = new Server(
    {
      name: 'godot-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Tool-Handler registrieren
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolRegistry.listTools() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      const result = await toolRegistry.execute(name, args || {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error({ tool: name, error }, 'Tool execution failed');
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Web-UI starten (Sidecar)
  const webServer = new WebUIServer();
  await webServer.start(3000);
  logger.info('Web UI verfügbar unter http://localhost:3000');

  // stdio-Transport verbinden
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.info('MCP Server bereit');
}

main().catch((error) => {
  logger.error({ error }, 'Fataler Fehler');
  process.exit(1);
});
```

## Schritt 2: Domain Layer - Tool Registry

### Tool Registry

`src/domain/tool-registry.ts` erstellen:

```typescript
import { z } from 'zod';
import { GodotClient } from '../infrastructure/godot-client.js';
import { logger } from '../infrastructure/logger.js';

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  handler: (params: any) => Promise<any>;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  constructor(private godotClient: GodotClient) {}

  async registerBuiltInTools() {
    // Scene-Tools
    this.register(await import('./tools/list-scenes.js').then(m => m.listScenesTool(this.godotClient)));
    this.register(await import('./tools/read-scene.js').then(m => m.readSceneTool(this.godotClient)));
    this.register(await import('./tools/create-scene.js').then(m => m.createSceneTool(this.godotClient)));
    
    // Script-Tools
    this.register(await import('./tools/list-scripts.js').then(m => m.listScriptsTool(this.godotClient)));
    this.register(await import('./tools/read-script.js').then(m => m.readScriptTool(this.godotClient)));
    
    // Projekt-Tools
    this.register(await import('./tools/get-project-structure.js').then(m => m.getProjectStructureTool(this.godotClient)));
    this.register(await import('./tools/search-nodes.js').then(m => m.searchNodesTool(this.godotClient)));

    logger.info({ count: this.tools.size }, 'Eingebaute Tools registriert');
  }

  register(tool: Tool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    logger.debug({ tool: tool.name }, 'Tool registriert');
  }

  async execute(toolName: string, params: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Eingabe validieren
    const validated = tool.inputSchema.parse(params);

    // Handler ausführen
    const startTime = Date.now();
    try {
      const result = await tool.handler(validated);
      const latencyMs = Date.now() - startTime;
      
      logger.info({ tool: toolName, latencyMs }, 'Tool erfolgreich ausgeführt');
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      logger.error({ tool: toolName, latencyMs, error }, 'Tool-Ausführung fehlgeschlagen');
      throw error;
    }
  }

  listTools() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    }));
  }
}

// Hilfsfunktion: Zod-Schema zu JSON-Schema konvertieren
function zodToJsonSchema(schema: z.ZodObject<any>): any {
  // Vereinfachte Implementierung - zod-to-json-schema-Paket in Produktion verwenden
  const shape = schema._def.shape();
  const properties: any = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    properties[key] = {
      type: getJsonType(zodType),
      description: zodType.description || '',
    };
    
    if (!zodType.isOptional()) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

function getJsonType(zodType: z.ZodTypeAny): string {
  if (zodType instanceof z.ZodString) return 'string';
  if (zodType instanceof z.ZodNumber) return 'number';
  if (zodType instanceof z.ZodBoolean) return 'boolean';
  if (zodType instanceof z.ZodArray) return 'array';
  if (zodType instanceof z.ZodObject) return 'object';
  return 'string';
}
```

## Schritt 3: Tool-Implementierungen

### Scenes auflisten-Tool

`src/domain/tools/list-scenes.ts` erstellen:

```typescript
import { z } from 'zod';
import type { Tool } from '../tool-registry.js';
import type { GodotClient } from '../../infrastructure/godot-client.js';

export function listScenesTool(godotClient: GodotClient): Tool {
  return {
    name: 'list_scenes',
    description: 'Listet alle Scene-Dateien (.tscn) im Godot-Projekt auf',
    inputSchema: z.object({
      directory: z.string().optional().default('').describe('Zu durchsuchendes Verzeichnis (relativ zum Projekt-Root)'),
      recursive: z.boolean().optional().default(true).describe('Unterverzeichnisse durchsuchen'),
      include_metadata: z.boolean().optional().default(false).describe('Datei-Metadaten einschließen'),
    }),
    handler: async (params) => {
      return await godotClient.call('scene.list', params);
    },
  };
}
```

### Scene lesen-Tool

`src/domain/tools/read-scene.ts` erstellen:

```typescript
import { z } from 'zod';
import type { Tool } from '../tool-registry.js';
import type { GodotClient } from '../../infrastructure/godot-client.js';

export function readSceneTool(godotClient: GodotClient): Tool {
  return {
    name: 'read_scene',
    description: 'Liest und parst eine Scene-Datei und gibt ihre Node-Struktur zurück',
    inputSchema: z.object({
      path: z.string()
        .regex(/^[\w\-\/]+\.tscn$/, 'Muss eine .tscn-Datei sein')
        .refine(p => !p.includes('..'), 'Pfad-Traversierung nicht erlaubt')
        .describe('Pfad zur Scene-Datei (z.B. scenes/MainMenu.tscn)'),
      include_children: z.boolean().optional().default(true).describe('Child-Nodes einschließen'),
      include_connections: z.boolean().optional().default(true).describe('Signal-Verbindungen einschließen'),
      max_depth: z.number().int().min(1).max(20).optional().default(20).describe('Maximale Node-Tiefe'),
    }),
    handler: async (params) => {
      return await godotClient.call('scene.read', params);
    },
  };
}
```

## Schritt 4: Infrastructure Layer

### HTTP-Client (Godot-Kommunikation)

`src/infrastructure/godot-client.ts` erstellen:

```typescript
import { request, Agent } from 'undici';
import { logger } from './logger.js';

export class GodotClient {
  private agent: Agent;
  private requestId = 0;
  private baseUrl: string;
  private retryAttempts = 3;
  private retryDelay = 1000; // 1s initiale Verzögerung

  constructor(baseUrl: string = 'http://localhost:7777') {
    this.baseUrl = baseUrl;
    this.agent = new Agent({
      connections: 5,
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 600_000,
    });
  }

  async call(method: string, params: any): Promise<any> {
    const id = ++this.requestId;
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await request(`${this.baseUrl}/rpc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          dispatcher: this.agent,
          headersTimeout: 5000,
          bodyTimeout: 10000,
        });

        if (response.statusCode !== 200) {
          throw new Error(`HTTP ${response.statusCode}`);
        }

        const data = await response.body.json() as any;

        if (data.error) {
          throw new GodotError(data.error.message, data.error.code, data.error.data);
        }

        return data.result;
      } catch (error) {
        const isLastAttempt = attempt === this.retryAttempts;
        const isRetryable = this.isRetryableError(error);

        if (isRetryable && !isLastAttempt) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          logger.warn({ method, attempt, delay, error }, 'Anfrage wird wiederholt');
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw new Error('Maximale Wiederholungsversuche überschritten');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await request(`${this.baseUrl}/health`, {
        method: 'GET',
        dispatcher: this.agent,
        headersTimeout: 2000,
      });
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }

  private isRetryableError(error: any): boolean {
    return error.code === 'ECONNREFUSED' || 
           error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT';
  }
}

export class GodotError extends Error {
  constructor(
    message: string,
    public code: number,
    public data?: any,
  ) {
    super(message);
    this.name = 'GodotError';
  }
}
```

### Strukturierter Logger

`src/infrastructure/logger.ts` erstellen:

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'HH:MM:ss',
    },
  } : undefined,
});
```

## Schritt 5: Erstellen und Ausführen

### Projekt erstellen

```powershell
npm run build
```

### In Entwicklung ausführen

```powershell
npm run dev
```

### Tests ausführen

```powershell
npm test
```

## Tests

### Unit-Test-Beispiel

`tests/unit/godot-client.test.ts` erstellen:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GodotClient } from '../../src/infrastructure/godot-client';

vi.mock('undici', () => ({
  request: vi.fn(),
  Agent: vi.fn(() => ({})),
}));

describe('GodotClient', () => {
  let client: GodotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GodotClient('http://localhost:7777');
  });

  it('sollte erfolgreichen JSON-RPC-Aufruf durchführen', async () => {
    const { request } = await import('undici');
    (request as any).mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { success: true },
        }),
      },
    });

    const result = await client.call('test.method', {});
    expect(result).toEqual({ success: true });
  });

  it('sollte bei Godot-Fehler werfen', async () => {
    const { request } = await import('undici');
    (request as any).mockResolvedValueOnce({
      statusCode: 200,
      body: {
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: { code: 404, message: 'Not found' },
        }),
      },
    });

    await expect(client.call('test.method', {})).rejects.toThrow('Not found');
  });
});
```

## Nächste Schritte

- [Godot Bridge-Implementierung](/de/implementation/godot-bridge) - GDScript HTTP-Server erstellen
- [Testleitfaden](/de/implementation/testing) - Umfassende Tests schreiben
- [Bereitstellungsleitfaden](/de/implementation/deployment) - Paketieren und verteilen

:::tip Best Practices
- TypeScript Strict Mode für Typsicherheit verwenden
- Alle Operationen mit strukturiertem Kontext loggen
- Fehler elegant mit Wiederholungen behandeln
- Aggressiv für Performance cachen
- Tests vor Implementierung schreiben (TDD)
:::
