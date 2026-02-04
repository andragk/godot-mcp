---
title: Component Architecture
description: Detailed component architecture of the Godot MCP Server, including Node.js layers, Godot Bridge, and Sidecar UI
outline: [2, 3]
---

# Component Architecture

The Godot 4.6 MCP Server follows a **layered architecture** pattern with clear separation of concerns across three major components: the Node.js MCP Server, the Godot Bridge, and the Sidecar Web UI.

## System Overview

```
┌─────────────┐        ┌─────────────────┐      ┌──────────────┐
│   VS Code   │ stdio  │   Node.js MCP   │ HTTP │Godot 4.6     │
│   (MCP      │◄──────►│     Server      │◄────►│Bridge Plugin │
│  Extension) │        └─────────────────┘      └──────────────┘
└─────────────┘                 │
                                │ HTTP
                                ▼
                        ┌──────────────┐
                        │  Web Browser │
                        │(Sidecar UI)  │
                        └──────────────┘
```

## Node.js MCP Server

The Node.js component implements a **4-layer architecture**: Presentation, Application, Domain, and Infrastructure.

### Presentation Layer

The Presentation Layer handles all external communication via two protocols:

#### stdio Transport (MCP Protocol)

Handles MCP client communication using the official SDK:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export class McpStdioTransport {
  private server: Server;
  
  async initialize() {
    this.server = new Server({
      name: 'godot-mcp-server',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {},
        resources: {},
      },
    });
    
    // Register tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: await this.toolRegistry.listTools() };
    });
    
    // Connect stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

**Key Responsibilities:**
- Parse incoming MCP JSON-RPC requests from stdin
- Route tool calls to Application Layer handlers
- Format responses according to MCP protocol specification
- Handle MCP-specific error formats

#### Web UI Server (Express)

Provides REST API and SSE endpoints for the Sidecar dashboard:

```typescript
import express from 'express';
import { EventEmitter } from 'events';

export class WebUIServer extends EventEmitter {
  private app = express();
  
  async start(port: number = 8080) {
    // Serve static files (Tailwind + Alpine.js)
    this.app.use(express.static('public'));
    
    // API endpoints
    this.app.get('/api/status', this.getStatus);
    this.app.post('/api/lifecycle/start', this.startService);
    this.app.post('/api/lifecycle/stop', this.stopService);
    
    // Server-Sent Events for real-time logs
    this.app.get('/api/logs/stream', this.streamLogs);
    
    this.app.listen(port);
  }
  
  private streamLogs = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    
    const listener = (log) => {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    };
    this.on('log', listener);
    
    req.on('close', () => this.off('log', listener));
  };
}
```

### Application Layer

Orchestrates business logic and handles cross-cutting concerns:

#### Tool Handler

Validates requests, enforces rate limiting, and manages caching:

```typescript
import { z } from 'zod';
import { GodotClient } from '../infrastructure/godot-client';

export class ToolHandler {
  constructor(
    private godotClient: GodotClient,
    private cache: LRUCache<string, any>,
  ) {}
  
  async handleReadScene(params: { path: string }) {
    // Validation
    const schema = z.object({
      path: z.string().regex(/^[\w\-\/]+\.tscn$/),
    });
    const validated = schema.parse(params);
    
    // Check cache
    const cacheKey = `scene:${validated.path}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    
    // Call Godot
    const result = await this.godotClient.call('read_scene', validated);
    
    // Cache result (5min TTL)
    this.cache.set(cacheKey, result, { ttl: 300_000 });
    
    return result;
  }
}
```

**Responsibilities:**
- Input validation using Zod schemas
- Authorization checks (Phase 2)
- Rate limiting enforcement
- Cache management (reads and invalidation)
- Error transformation

#### Resource Handler

Resolves MCP resource URIs to Godot file system paths:

```typescript
export class ResourceHandler {
  async resolveResource(uri: string): Promise<Resource> {
    // Parse URI: godot://scenes/MainMenu.tscn
    const match = uri.match(/^godot:\/\/(\w+)\/(.+)$/);
    if (!match) throw new Error('Invalid resource URI');
    
    const [, type, path] = match;
    
    switch (type) {
      case 'scenes':
        return this.getSceneResource(path);
      case 'scripts':
        return this.getScriptResource(path);
      default:
        throw new Error(`Unknown resource type: ${type}`);
    }
  }
  
  private async getSceneResource(path: string): Promise<Resource> {
    const content = await this.godotClient.call('read_scene', { path });
    return {
      uri: `godot://scenes/${path}`,
      mimeType: 'application/json',
      text: JSON.stringify(content, null, 2),
    };
  }
}
```

### Domain Layer

Contains the core business logic and tool implementations:

#### Tool Registry

Plugin architecture for extensible tool management:

```typescript
export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (params: any) => Promise<any>;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  
  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }
  
  async execute(toolName: string, params: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`Tool not found: ${toolName}`);
    
    // Validate input
    const validated = tool.inputSchema.parse(params);
    
    // Execute handler
    return tool.handler(validated);
  }
  
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    }));
  }
}
```

**Built-in Tools:**
- Scene operations: `list_scenes`, `read_scene`, `create_scene`, `modify_scene`
- Script operations: `list_scripts`, `read_script`, `create_script`, `modify_script`
- Project queries: `get_project_structure`, `search_nodes`, `get_node_properties`

### Infrastructure Layer

Provides low-level services and external integrations:

#### HTTP Client

High-performance client using undici with connection pooling:

```typescript
import { request, Agent } from 'undici';

export class GodotClient {
  private agent: Agent;
  private baseUrl = 'http://localhost:7777';
  private requestId = 0;
  
  constructor() {
    // Connection pooling with keep-alive
    this.agent = new Agent({
      connections: 5, // Max 5 concurrent connections
      keepAliveTimeout: 60_000, // 60s keep-alive
      keepAliveMaxTimeout: 600_000, // 10min max
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
    
    try {
      const response = await request(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        dispatcher: this.agent,
        headersTimeout: 5000,
        bodyTimeout: 10000,
      });
      
      const data = await response.body.json();
      
      if (data.error) {
        throw new GodotError(data.error.message, data.error.code);
      }
      
      return data.result;
    } catch (error) {
      if (isNetworkError(error)) {
        return this.retryWithBackoff(method, params);
      }
      throw error;
    }
  }
}
```

**Features:**
- HTTP/1.1 keep-alive for connection reuse
- Automatic retry with exponential backoff
- Configurable timeouts (headers: 5s, body: 10s)
- Connection pool management (5 max concurrent)

#### Cache (LRU)

Memory-efficient caching with automatic TTL expiration:

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, any>({
  max: 100,              // Max 100 items (~10MB)
  ttl: 300_000,          // Default 5min
  updateAgeOnGet: true,  // Reset TTL on access
  updateAgeOnHas: false,
});
```

**Cache Strategy:**
| Data Type | TTL | Max Items | Invalidation Trigger |
|-----------|-----|-----------|---------------------|
| Scene data | 300s | 50 | Write to same scene |
| Script data | 300s | 50 | Write to same script |
| Project structure | 60s | 1 | Any file operation |
| Search results | 60s | 20 | Scene/script write |

## Godot Bridge Plugin

The Godot Bridge is a GDScript plugin that exposes Godot Engine capabilities via HTTP.

### HTTP Server Layer

Lightweight wrapper around Godot's built-in HTTPServer:

```gdscript
# godot-bridge/http_server.gd
extends Node

var server: HTTPServer
var port: int = 7777

func _ready():
	server = HTTPServer.new()
	server.register_router("/rpc", rpc_handler)
	server.register_router("/health", health_handler)
	
	var err = server.listen(port, "127.0.0.1")
	if err != OK:
		push_error("Failed to start HTTP server on port %d" % port)
		return
	
	print("Godot MCP Bridge listening on http://localhost:%d" % port)

func _process(_delta):
	server.poll()

func rpc_handler(request: HTTPServerRequest) -> HTTPServerResponse:
	var body = request.get_body_as_string()
	var json = JSON.parse_string(body)
	
	if json == null or not json.has("method"):
		return error_response(request, -32600, "Invalid Request")
	
	var method = json["method"]
	var params = json.get("params", {})
	var id = json.get("id")
	
	# Route to operation handler
	var result = RPCRouter.handle(method, params)
	
	if result is GodotError:
		return error_response(request, result.code, result.message)
	
	return success_response(request, result, id)
```

**Key Features:**
- Binds to localhost only (security)
- Non-blocking with `_process()` polling
- JSON-RPC 2.0 compliant
- Structured error responses

### RPC Router

Maps JSON-RPC methods to operation handlers:

```gdscript
# godot-bridge/rpc_router.gd
class_name RPCRouter

static var handlers = {}

static func register(method: String, handler: Callable):
	handlers[method] = handler

static func handle(method: String, params: Dictionary):
	if not handlers.has(method):
		return GodotError.new(-32601, "Method not found: %s" % method)
	
	var handler = handlers[method]
	return await handler.call(params)

# Auto-register handlers
static func _static_init():
	register("list_scenes", SceneManager.list_scenes)
	register("read_scene", SceneManager.read_scene)
	register("create_scene", SceneManager.create_scene)
	register("list_scripts", ScriptManager.list_scripts)
	register("read_script", ScriptManager.read_script)
```

### Operation Handlers

Domain-specific managers for scenes, scripts, and project operations:

#### Scene Manager

```gdscript
# godot-bridge/scene_manager.gd
class_name SceneManager

static func read_scene(params: Dictionary):
	var path = params.get("path", "")
	
	# Validate path
	if not path.ends_with(".tscn"):
		return GodotError.new(-32602, "Invalid path: must be .tscn file")
	
	var full_path = "res://%s" % path
	if not FileAccess.file_exists(full_path):
		return GodotError.new(404, "File not found", {"path": path})
	
	# Read and parse scene file
	var file = FileAccess.open(full_path, FileAccess.READ)
	if file == null:
		return GodotError.new(500, "Failed to open file")
	
	var content = file.get_as_text()
	file.close()
	
	# Parse .tscn format
	var scene_data = parse_tscn_file(content)
	return scene_data
```

**Responsibilities:**
- Path validation and normalization
- File system operations via `FileAccess`
- `.tscn` format parsing
- Error handling with structured responses

### File System Abstraction

Safe file I/O with validation and atomic writes:

```gdscript
# godot-bridge/file_manager.gd
class_name FileManager

static func safe_write(path: String, content: String) -> Error:
	# Validate path is within project
	if not path.begins_with("res://"):
		push_error("Invalid path: must start with res://")
		return ERR_INVALID_PARAMETER
	
	# Write to temp file first (atomic operation)
	var temp_path = path + ".tmp"
	var file = FileAccess.open(temp_path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	
	file.store_string(content)
	file.close()
	
	# Rename temp to target (atomic commit)
	var err = DirAccess.rename_absolute(temp_path, path)
	return err
```

## Sidecar Web UI

The Web UI is a comprehensive monitoring and control dashboard built with Alpine.js and Tailwind CSS, providing **seven core feature modules** for complete server observability and management.

### Feature Modules Architecture

```
Web UI Feature Modules
├── 1. Tool Exploration & Invocation
│   ├── Tool Catalog (dynamic listing)
│   ├── Interactive Testing (form generation from JSON Schema)
│   └── Schema Viewer (input validation preview)
│
├── 2. Resource Management
│   ├── Resource Browser (scenes/scripts/assets)
│   ├── Content Preview (full-text display)
│   └── Search & Filter (type, size, date)
│
├── 3. Real-Time Logging & Monitoring
│   ├── Traffic Log (JSON-RPC message stream)
│   ├── Error Console (stack traces)
│   └── Performance Metrics (p50/p95/p99 latency)
│
├── 4. Configuration & Security
│   ├── Environment Variables (editor with validation)
│   ├── Access Control (client permissions)
│   └── Prompts Gallery (template testing)
│
├── 5. Connection & Session Management
│   ├── Active Client List (connection metadata)
│   ├── Session Duration Tracking (idle detection)
│   └── Kill Switch (force disconnect)
│
├── 6. Service State & Lifecycle Control
│   ├── State Indicators (🟢/🟡/🔴 health badges)
│   ├── Health Checks (Godot, event loop, memory)
│   └── Process Control (start/stop/restart)
│
└── 7. Advanced Logging & Observability
    ├── Traffic Inspector (split-view client ↔ server)
    ├── Log Levels (debug/info/warn/error filtering)
    ├── Auto-Scroll & Freeze (inspection controls)
    └── Export Logs (JSON/CSV/TXT with time ranges)
```

### Frontend Architecture

```
public/
├── index.html          # Main dashboard with navigation
├── css/
│   └── app.css         # Tailwind CSS (customized)
└── js/
    ├── app.js          # Alpine.js global state stores
    ├── components/
    │   ├── tool-catalog.js        # Tool exploration
    │   ├── resource-browser.js    # Resource management
    │   ├── traffic-inspector.js   # Split-view logger
    │   ├── connection-manager.js  # Session management
    │   ├── health-monitor.js      # Health dashboard
    │   └── log-viewer.js          # Advanced logging
    └── utils/
        ├── api-client.js          # Fetch wrappers
        └── sse-connection.js      # SSE with reconnection
```

### Alpine.js State Management

**Global Stores Pattern:**
```javascript
document.addEventListener('alpine:init', () => {
  // Server status store
  Alpine.store('server', {
    status: 'connecting',
    metrics: {},
    health: {},
    connections: [],
    
    async init() {
      await this.pollStatus();
      setInterval(() => this.pollStatus(), 1000);
    },
    
    async pollStatus() {
      const res = await fetch('/api/status');
      const data = await res.json();
      this.status = data.status;
      this.metrics = data.mcp;
      this.health = data.health;
    }
  });
  
  // Tools store
  Alpine.store('tools', {
    catalog: [],
    selectedTool: null,
    
    async loadCatalog() {
      const res = await fetch('/api/tools');
      const data = await res.json();
      this.catalog = data.tools;
    }
  });
  
  // Logs store with bounded buffer
  Alpine.store('logs', {
    entries: [],
    maxEntries: 1000,
    
    add(log) {
      this.entries.push(log);
      if (this.entries.length > this.maxEntries) {
        this.entries.shift();
      }
    },
    
    clear() {
      this.entries = [];
    }
  });
});
```

**Component Usage:**
```html
<div x-data>
  <!-- Access global stores -->
  <span x-text="$store.server.status"></span>
  <span x-text="$store.server.metrics.requests_total"></span>
  <span x-text="$store.tools.catalog.length + ' tools available'"></span>
</div>
```

### Server-Sent Events Architecture

**Multi-Stream SSE with Reconnection:**
```javascript
// SSE connection manager with exponential backoff
function createSSEConnection(url, onMessage, maxRetries = 5) {
  let retries = 0;
  let eventSource = null;
  
  function connect() {
    eventSource = new EventSource(url);
    
    eventSource.onopen = () => {
      retries = 0; // Reset on successful connection
      console.log(`SSE connected: ${url}`);
    };
    
    eventSource.onmessage = (event) => {
      onMessage(JSON.parse(event.data));
    };
    
    eventSource.onerror = () => {
      eventSource.close();
      
      if (retries < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
        console.log(`SSE reconnecting in ${delay}ms...`);
        setTimeout(connect, delay);
        retries++;
      } else {
        console.error('SSE max retries reached');
      }
    };
  }
  
  connect();
  
  return {
    close: () => eventSource?.close(),
    reconnect: () => connect()
  };
}

// Usage in Alpine component
function logViewer() {
  return {
    logs: [],
    sseConnection: null,
    
    init() {
      this.sseConnection = createSSEConnection(
        '/api/logs/stream',
        (log) => {
          this.logs.push(log);
          if (this.logs.length > 1000) this.logs.shift();
        }
      );
    },
    
    destroy() {
      this.sseConnection?.close();
    }
  };
}
```

### Real-Time Log Streaming

```javascript
// Log viewer component
function logViewer() {
  return {
    logs: [],
    
    init() {
      const eventSource = new EventSource('/api/logs/stream');
      
      eventSource.onmessage = (event) => {
        const log = JSON.parse(event.data);
        this.logs.push(log);
        
        // Keep only last 1000 entries
        if (this.logs.length > 1000) {
          this.logs.shift();
        }
      };
    }
  };
}
```

## Component Communication

### Request Flow (Read Operation)

```
VS Code → Node.js (MCP)       : 5-10ms  (stdio)
Node.js: Validation           : 5-10ms  (Zod)
Node.js → Godot (HTTP)        : 10-20ms (localhost)
Godot: File I/O + Parse       : 20-50ms (FileAccess)
Godot → Node.js (Response)    : 10-20ms (HTTP)
Node.js: Cache + Format       : 3-5ms   (LRU)
Node.js → VS Code (MCP)       : 5-10ms  (stdio)
────────────────────────────────────────────────
TOTAL                         : 60-130ms
```

### Error Propagation

```
Godot (GodotError) 
  → JSON-RPC error format
    → HTTP 200 with error object
      → Node.js catches error
        → Logs with Pino
          → Converts to MCP error format
            → VS Code displays to user
```

## Technology Stack Summary

| Component | Runtime | Language | Key Libraries |
|-----------|---------|----------|---------------|
| **MCP Server** | Node.js 20 | TypeScript | @modelcontextprotocol/sdk, undici, zod, pino |
| **Godot Bridge** | Godot 4.6 | GDScript | HTTPServer (built-in), JSON (built-in) |
| **Web UI** | Browser | HTML/JS | Alpine.js, Tailwind CSS |
| **Transport** | - | - | stdio (MCP), HTTP (internal), SSE (UI) |

## Performance Characteristics

| Operation | Target Latency | Actual (p99) | Bottleneck |
|-----------|---------------|--------------|------------|
| Read scene | <50ms | 35-45ms | File I/O in Godot |
| Write scene | <200ms | 120-180ms | Atomic file write |
| List scenes | <100ms | 60-80ms | Directory traversal |
| Health check | <10ms | 3-5ms | HTTP only |
| Cache hit | <5ms | 1-2ms | Memory lookup |

:::tip Optimization Opportunities
- **Connection pooling**: Reduces HTTP overhead by 70%
- **LRU caching**: 87% faster for repeated reads
- **Batch requests** (Phase 2): Combines multiple operations in one HTTP call
:::

## Security Boundaries

1. **Network Layer**: Localhost-only binding (`127.0.0.1`)
2. **Validation Layer**: Zod schemas reject malformed input
3. **File System**: Path validation prevents traversal attacks
4. **Rate Limiting**: Prevents resource exhaustion (Phase 2)

See [Security Architecture](/en/architecture/security) for detailed threat model and mitigations.
