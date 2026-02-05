---
title: Building the Node.js MCP Server
description: Step-by-step guide to implementing the Node.js MCP server with tools, validation, and HTTP communication
outline: [2, 3]
---

# Building the Node.js MCP Server

This guide walks through implementing the Node.js MCP server component, including tool registration, HTTP communication with Godot, and the presentation layer for MCP clients.

## Project Initialization

Follow the [Development Setup](/en/implementation/setup) guide first, then proceed with implementation.

## Step 1: Core Server Implementation

### Main Server Entry Point

Create `src/server.ts`:

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

  // Initialize Godot HTTP client
  const godotClient = new GodotClient('http://localhost:7777');
  
  // Check Godot connection
  const godotHealthy = await godotClient.healthCheck();
  if (!godotHealthy) {
    logger.warn('Godot Bridge not responding. Server will retry connections.');
  }

  // Initialize tool registry
  const toolRegistry = new ToolRegistry(godotClient);
  await toolRegistry.registerBuiltInTools();

  // Create MCP server
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

  // Register tool handlers
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

  // Start Web UI (Sidecar)
  const webServer = new WebUIServer();
  await webServer.start(3000);
  logger.info('Web UI available at http://localhost:3000');

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.info('MCP Server ready');
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
```

## Step 2: Domain Layer - Tool Registry

### Tool Registry

Create `src/domain/tool-registry.ts`:

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
    // Scene tools
    this.register(await import('./tools/list-scenes.js').then(m => m.listScenesTool(this.godotClient)));
    this.register(await import('./tools/read-scene.js').then(m => m.readSceneTool(this.godotClient)));
    this.register(await import('./tools/create-scene.js').then(m => m.createSceneTool(this.godotClient)));
    
    // Script tools
    this.register(await import('./tools/list-scripts.js').then(m => m.listScriptsTool(this.godotClient)));
    this.register(await import('./tools/read-script.js').then(m => m.readScriptTool(this.godotClient)));
    
    // Project tools
    this.register(await import('./tools/get-project-structure.js').then(m => m.getProjectStructureTool(this.godotClient)));
    this.register(await import('./tools/search-nodes.js').then(m => m.searchNodesTool(this.godotClient)));

    logger.info({ count: this.tools.size }, 'Built-in tools registered');
  }

  register(tool: Tool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    logger.debug({ tool: tool.name }, 'Tool registered');
  }

  async execute(toolName: string, params: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Validate input
    const validated = tool.inputSchema.parse(params);

    // Execute handler
    const startTime = Date.now();
    try {
      const result = await tool.handler(validated);
      const latencyMs = Date.now() - startTime;
      
      logger.info({ tool: toolName, latencyMs }, 'Tool executed successfully');
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      logger.error({ tool: toolName, latencyMs, error }, 'Tool execution failed');
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

// Helper: Convert Zod schema to JSON Schema
function zodToJsonSchema(schema: z.ZodObject<any>): any {
  // Simplified implementation - use zod-to-json-schema package in production
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

## Step 3: Tool Implementations

### List Scenes Tool

Create `src/domain/tools/list-scenes.ts`:

```typescript
import { z } from 'zod';
import type { Tool } from '../tool-registry.js';
import type { GodotClient } from '../../infrastructure/godot-client.js';

export function listScenesTool(godotClient: GodotClient): Tool {
  return {
    name: 'list_scenes',
    description: 'Lists all scene files (.tscn) in the Godot project',
    inputSchema: z.object({
      directory: z.string().optional().default('').describe('Directory to search (relative to project root)'),
      recursive: z.boolean().optional().default(true).describe('Search subdirectories'),
      include_metadata: z.boolean().optional().default(false).describe('Include file metadata'),
    }),
    handler: async (params) => {
      return await godotClient.call('scene.list', params);
    },
  };
}
```

### Read Scene Tool

Create `src/domain/tools/read-scene.ts`:

```typescript
import { z } from 'zod';
import type { Tool } from '../tool-registry.js';
import type { GodotClient } from '../../infrastructure/godot-client.js';

export function readSceneTool(godotClient: GodotClient): Tool {
  return {
    name: 'read_scene',
    description: 'Reads and parses a scene file, returning its node structure',
    inputSchema: z.object({
      path: z.string()
        .regex(/^[\w\-\/]+\.tscn$/, 'Must be a .tscn file')
        .refine(p => !p.includes('..'), 'Path traversal not allowed')
        .describe('Path to scene file (e.g., scenes/MainMenu.tscn)'),
      include_children: z.boolean().optional().default(true).describe('Include child nodes'),
      include_connections: z.boolean().optional().default(true).describe('Include signal connections'),
      max_depth: z.number().int().min(1).max(20).optional().default(20).describe('Max node depth'),
    }),
    handler: async (params) => {
      return await godotClient.call('scene.read', params);
    },
  };
}
```

## Step 4: Infrastructure Layer

### HTTP Client (Godot Communication)

Create `src/infrastructure/godot-client.ts`:

```typescript
import { request, Agent } from 'undici';
import { logger } from './logger.js';

export class GodotClient {
  private agent: Agent;
  private requestId = 0;
  private baseUrl: string;
  private retryAttempts = 3;
  private retryDelay = 1000; // 1s initial delay

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
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.warn({ method, attempt, delay, error }, 'Retrying request');
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw new Error('Max retry attempts exceeded');
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
    // Retry on network errors, not on application errors
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

### Structured Logger

Create `src/infrastructure/logger.ts`:

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

### LRU Cache

Create `src/infrastructure/cache.ts`:

```typescript
import { LRUCache } from 'lru-cache';

export const cache = new LRUCache<string, any>({
  max: 100,
  ttl: 300_000, // 5min default
  updateAgeOnGet: true,
  updateAgeOnHas: false,
});

export function getCacheTTL(key: string): number {
  if (key.startsWith('list:') || key.startsWith('search:')) {
    return 60_000; // 1min for lists/searches
  }
  return 300_000; // 5min for everything else
}

export function invalidateCache(pattern: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(pattern)) {
      cache.delete(key);
    }
  }
}
```

## Step 5: Presentation Layer - Web UI Server

Create `src/presentation/web-server.ts`:

```typescript
import express from 'express';
import { EventEmitter } from 'events';
import { logger } from '../infrastructure/logger.js';

export class WebUIServer extends EventEmitter {
  private app = express();

  async start(port: number = 3000) {
    // Middleware
    this.app.use(express.json());
    this.app.use(express.static('public'));

    // CORS (localhost only)
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', 'http://localhost:*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    // API routes
    this.app.get('/api/status', this.getStatus.bind(this));
    this.app.post('/api/lifecycle/start', this.startService.bind(this));
    this.app.post('/api/lifecycle/stop', this.stopService.bind(this));
    this.app.get('/api/logs/stream', this.streamLogs.bind(this));

    // Start server
    this.app.listen(port, () => {
      logger.info({ port }, 'Web UI server started');
    });
  }

  private async getStatus(req: express.Request, res: express.Response) {
    res.json({
      status: 'running',
      uptime_ms: process.uptime() * 1000,
      version: '1.0.0',
    });
  }

  private async startService(req: express.Request, res: express.Response) {
    res.json({ success: true, message: 'Already running' });
  }

  private async stopService(req: express.Request, res: express.Response) {
    res.json({ success: true, message: 'Stopping...' });
    setTimeout(() => process.exit(0), 1000);
  }

  private streamLogs(req: express.Request, res: express.Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const listener = (log: any) => {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    };

    this.on('log', listener);

    req.on('close', () => {
      this.off('log', listener);
    });
  }
}
```

## Step 6: Build and Run

### Build Project

```powershell
npm run build
```

### Run in Development

```powershell
npm run dev
```

### Run Tests

```powershell
npm test
```

## Testing

### Unit Test Example

Create `tests/unit/godot-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GodotClient } from '../../src/infrastructure/godot-client';

// Mock undici
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

  it('should make successful JSON-RPC call', async () => {
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

  it('should throw on Godot error', async () => {
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

## Next Steps

- [Godot Bridge Implementation](/en/implementation/godot-bridge) - Build the GDScript HTTP server
- [Testing Guide](/en/implementation/testing) - Write comprehensive tests
- [Deployment Guide](/en/implementation/deployment) - Package and distribute

:::tip Best Practices
- Use TypeScript strict mode for type safety
- Log all operations with structured context
- Handle errors gracefully with retries
- Cache aggressively for performance
- Write tests before implementation (TDD)
:::
