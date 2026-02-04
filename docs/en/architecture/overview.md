# Architecture Overview

High-level system design and component interactions.

---

## System Architecture

The Godot MCP Server uses a **layered architecture** with clear separation of concerns and **sidecar deployment** support:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                             │
│  VS Code, Claude Desktop, Custom MCP Clients                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ stdio (MCP Protocol)
┌────────────────────────▼────────────────────────────────────────┐
│                    Node.js MCP Server                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Presentation Layer  (MCP Protocol Adapter)              │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │  Application Layer   (Tool Handlers, Validation)         │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │  Domain Layer        (Business Logic, Tool Registry)     │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │  Infrastructure      (HTTP Client, Cache, Logging)       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP POST (JSON-RPC 2.0)
                         │ localhost:7777
                         │
       ┌─────────────────┴──────────────────────────┐
       │                                            │
       ▼                                            ▼
┌──────────────────────────────┐   ┌──────────────────────────────────┐
│  Web UI (Sidecar, Optional)  │   │  Godot Bridge (Addon)            │
│  ┌────────────────────────┐  │   │  ┌────────────────────────────┐ │
│  │  Express Server       │  │   │  │  HTTPServer    (Port 7777) │ │
│  │  (Port 3000)          │  │   │  └────────────┬───────────────┘ │
│  └──────────┬─────────────┘  │   │  ┌────────────▼───────────────┐ │
│  ┌──────────▼─────────────┐  │   │  │  Request Router           │ │
│  │  Dashboard (Alpine.js)│  │   │  └────────────┬───────────────┘ │
│  └──────────┬─────────────┘  │   │  ┌────────────▼───────────────┐ │
│  ┌──────────▼─────────────┐  │   │  │  Tool Manager             │ │
│  │  SSE Log Streaming    │  │   │  └────────────┬───────────────┘ │
│  └──────────┬─────────────┘  │   │  ┌────────────▼───────────────┐ │
│             │                 │   │  │  Godot API                │ │
│             ├─────────────────┼───┤  └───────────────────────────┘ │
│             │ HTTP Requests   │   │                                │
│             └─────────────────┘   └────────────┬───────────────────┘
└──────────────────────────────────┘             │ File I/O
                                   ┌─────────────▼───────────────────┐
                                   │  File System                    │
                                   │  *.tscn, *.gd, *.tres, *.res    │
                                   └─────────────────────────────────┘
```

---

## Deployment Modes

### 1. MCP Only (Production)
**Entry Point**: `index.ts`  
**Command**: `npm start`  
**Use Case**: AI assistant integration (Claude Desktop, VS Code)  
**Components**: MCP Server (stdio) ↔ Godot Bridge

### 2. Web UI Only (Sidecar)
**Entry Point**: `web-ui.ts`  
**Command**: `npm run web-ui`  
**Use Case**: Standalone monitoring, separate deployment  
**Components**: Web Dashboard (HTTP 3000) ↔ Godot Bridge

### 3. Combined (Development)
**Entry Points**: Both `index.ts` + `web-ui.ts`  
**Commands**: `npm start` + `npm run web-ui` (separate terminals)  
**Use Case**: Local development with full observability  
**Components**: MCP Server + Web UI + Godot Bridge

---

## Architectural Principles

### 1. Separation of Concerns

Each layer has a single, well-defined responsibility:

- **Presentation**: Protocol translation (MCP ↔ internal format)
- **Application**: Request orchestration, cross-cutting concerns
- **Domain**: Core business logic, tool implementations
- **Infrastructure**: External integrations (Godot, cache, logs)

**Benefits**:
- Easy to test (mock dependencies)
- Easy to replace (swap HTTP for WebSocket)
- Easy to understand (clear boundaries)

### 2. Dependency Inversion

Higher layers depend on abstractions, not concrete implementations:

```typescript
// ❌ Tight coupling
class ToolHandler {
  constructor() {
    this.httpClient = new HttpClient();  // Concrete dependency
  }
}

// ✅ Loose coupling
interface GodotBridge {
  invoke(method: string, params: any): Promise<any>;
}

class ToolHandler {
  constructor(private bridge: GodotBridge) {}  // Abstract dependency
}

// Can inject HttpBridge, WebSocketBridge, or MockBridge
```

### 3. Fail-Safe Defaults

Operations are safe unless explicitly opted out:

- **Backups**: Enabled by default for all writes
- **Validation**: All inputs validated before execution
- **Localhost-only**: No remote access without `--bind` flag
- **Read-only**: No delete operations in MVP
- **Timeouts**: Prevent hanging indefinitely

### 4. Observable by Design

Every operation emits structured logs and metrics:

```typescript
logger.info('Tool invoked', {
  tool: 'read_scene',
  params: { path: 'scenes/Player.tscn' },
  requestId: 'req-abc123',
  timestamp: new Date().toISOString()
});

// Later...
logger.info('Tool completed', {
  tool: 'read_scene',
  requestId: 'req-abc123',
  latencyMs: 45,
  cacheHit: true
});
```

**Benefits**:
- Easy debugging (trace requests end-to-end)
- Performance analysis (identify bottlenecks)
- Audit compliance (who did what when)

---

## Component Interaction Patterns

### Request/Response Flow

#### Successful Read Operation

```
┌──────────┐
│ AI Client│  1. "Read Player.tscn"
└────┬─────┘
     │ stdio: tools/call
     ▼
┌─────────────────────────────────────────────────────────┐
│ Node.js: MCP Server                                     │
│                                                         │
│  2. Parse MCP request                                   │
│  3. Validate tool name & parameters                     │
│  4. Check cache (miss)                                  │
│  5. Transform to JSON-RPC:                              │
│     {                                                   │
│       "method": "scene.read",                           │
│       "params": {"path": "res://scenes/Player.tscn"}    │
│     }                                                   │
│  6. HTTP POST to localhost:7777/rpc                     │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP (10-20ms)
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Godot: Bridge Addon                                     │
│                                                         │
│  7. Receive HTTP request                                │
│  8. Parse JSON-RPC                                      │
│  9. Route to SceneManager.read()                        │
│  10. Open file with FileAccess                          │
│  11. Parse .tscn format                                 │
│  12. Convert to JSON                                    │
│  13. Return JSON-RPC response                           │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP 200 OK (15-80ms)
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Node.js: MCP Server                                     │
│                                                         │
│  14. Receive response                                   │
│  15. Cache result (5min TTL)                            │
│  16. Transform to MCP format                            │
│  17. Send to client via stdio                           │
└─────────────────────┬───────────────────────────────────┘
                      │ stdio
                      ▼
┌──────────┐
│ AI Client│  18. Display: "The Player scene has..."
└──────────┘

Total Latency: 45-150ms
```

#### Error Handling Flow

```
┌──────────┐
│ AI Client│  "Read nonexistent_scene.tscn"
└────┬─────┘
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ Node.js: MCP Server                                     │
│  Validation passes (valid .tscn extension)              │
│  HTTP POST to Godot                                     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Godot: Bridge Addon                                     │
│  FileAccess.open() fails                                │
│  Return JSON-RPC error:                                 │
│  {                                                      │
│    "error": {                                           │
│      "code": -32602,                                    │
│      "message": "File not found",                       │
│      "data": {"path": "...", "errno": "ENOENT"}         │
│    }                                                    │
│  }                                                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Node.js: MCP Server                                     │
│  Detect error response                                  │
│  Log error (level: warn, not error)                     │
│  Transform to MCP error format                          │
│  Return to client                                       │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌──────────┐
│ AI Client│  Display: "File not found: nonexistent_scene.tscn"
└──────────┘         "Would you like me to create it?"
```

### Caching Strategy

**Cache Key Format**: `{type}:{path}:{checksum}`

Example: `scene:scenes/Player.tscn:a3f8c2...`

**Cache Operations**:

```
┌─────────────────────────────────────────────────────────┐
│ Request: read_scene("scenes/Player.tscn")               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
              ┌──────────────┐
              │ Check Cache? │
              └──────┬───────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    Cache Hit              Cache Miss
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌──────────────────┐
│ 1. Verify TTL   │    │ 1. Fetch from    │
│ 2. Verify       │    │    Godot         │
│    checksum     │    │ 2. Parse/Convert │
│    (file mtime) │    │ 3. Store in      │
│ 3. Return       │    │    cache         │
│    cached data  │    │ 4. Return result │
└─────────────────┘    └──────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
                     ▼
              Return to Client
        (Cache hit: 5-10ms)
        (Cache miss: 45-150ms)
```

**Cache Invalidation**:

1. **Time-based**: After TTL expires (default: 5 minutes)
2. **Content-based**: File modification changes mtime/checksum
3. **Manual**: Write operations invalidate related entries

```typescript
// Example invalidation logic
async function modifyScene(path: string, operations: any[]) {
  // 1. Execute modification
  await godotBridge.invoke('scene.modify', { path, operations });
  
  // 2. Invalidate cache
  cache.delete(`scene:${path}:*`);  // Wildcard delete
  
  // 3. Invalidate dependent resources
  const dependencies = await getDependencies(path);
  dependencies.forEach(dep => cache.delete(`resource:${dep}:*`));
}
```

---

## Communication Protocol

### JSON-RPC 2.0 Specification

**Request Format**:

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "category.operation",
  "params": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

**Success Response**:

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "result": {
    "data": "...",
    "metadata": {...}
  }
}
```

**Error Response**:

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "field": "path",
      "reason": "Must be relative path"
    }
  }
}
```

**Standard Error Codes**:

| Code | Meaning | Usage |
|------|---------|-------|
| -32700 | Parse error | Malformed JSON |
| -32600 | Invalid request | Missing required fields |
| -32601 | Method not found | Unknown tool/operation |
| -32602 | Invalid params | Validation failed |
| -32603 | Internal error | Server-side exception |
| -32001 | File not found | Resource doesn't exist |
| -32002 | Permission denied | Path validation failed |
| -32003 | Timeout | Operation exceeded limit |

### HTTP Transport Layer

**Endpoint**: `POST http://localhost:7777/rpc`

**Headers**:

```http
POST /rpc HTTP/1.1
Host: localhost:7777
Content-Type: application/json
X-Request-ID: req-abc123
X-Client-Session: session-xyz789
Accept: application/json
```

**Connection Management**:

- **Keep-Alive**: Enabled (reuse connections)
- **Connection Pool**: 10 concurrent connections
- **Timeout**: 5s (read), 10s (write), 60s (long-running)
- **Retry**: Exponential backoff (max 3 retries for network errors)

**Response Headers**:

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-ID: req-abc123
X-Response-Time-Ms: 45
X-Cache-Status: miss
```

---

## Scalability Considerations

### Current Limitations (MVP)

1. **Single Godot instance**: One server per Godot project
2. **No horizontal scaling**: Can't distribute load across multiple servers
3. **In-memory cache**: Doesn't survive restarts
4. **Synchronous operations**: Tools execute sequentially

### Future Enhancements (Phase 2+)

#### Multi-Project Support

```typescript
// Server manages multiple Godot connections
const projects = {
  'project-a': { port: 7777, status: 'connected' },
  'project-b': { port: 7778, status: 'connected' }
};

// Client specifies project in request
{
  "method": "scene.read",
  "params": {
    "project": "project-a",
    "path": "scenes/Player.tscn"
  }
}
```

#### Persistent Cache

```typescript
// Redis-backed cache for multi-server deployments
const cache = new RedisCache({
  host: 'localhost',
  port: 6379,
  ttl: 300,
  keyPrefix: 'godot-mcp:'
});

// Shared across server instances
```

#### Async Tool Execution

```typescript
// Long-running operations return immediately with job ID
{
  "result": {
    "jobId": "job-abc123",
    "status": "pending",
    "statusUrl": "/api/jobs/job-abc123"
  }
}

// Client polls for completion
{
  "jobId": "job-abc123",
  "status": "completed",
  "result": {...}
}
```

---

## Security Architecture

### Defense in Depth

**Layer 1: Input Validation**

```typescript
// JSON Schema validation
const readSceneSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      pattern: "^[a-zA-Z0-9_/-]+\\.tscn$",
      maxLength: 255
    }
  },
  required: ["path"],
  additionalProperties: false
};

// Validate before processing
validate(params, readSceneSchema);
```

**Layer 2: Path Sanitization**

```typescript
// Resolve and normalize paths
const projectRoot = path.resolve('/path/to/project');
const requestedPath = path.resolve(projectRoot, params.path);

// Ensure within project boundary
if (!requestedPath.startsWith(projectRoot)) {
  throw new Error('Path traversal attempt detected');
}

// Check for symlink escape
const realPath = fs.realpathSync(requestedPath);
if (!realPath.startsWith(projectRoot)) {
  throw new Error('Symlink points outside project');
}
```

**Layer 3: Operation Allowlisting**

```typescript
// Only permitted operations
const allowedMethods = [
  'scene.list', 'scene.read', 'scene.create', 'scene.modify',
  'script.list', 'script.read', 'script.create', 'script.modify',
  'project.structure', 'node.search', 'node.properties'
];

if (!allowedMethods.includes(method)) {
  throw new Error('Operation not permitted');
}
```

**Layer 4: Rate Limiting (Phase 2)**

```typescript
// Per-client rate limiter
const limiter = new RateLimiter({
  windowMs: 60000,      // 1 minute
  maxRequests: 100,     // 100 requests per minute
  keyGenerator: (req) => req.headers['x-client-session']
});
```

**Layer 5: Authentication (Phase 2)**

```typescript
// API key validation
const authKey = req.headers['authorization']?.replace('Bearer ', '');
if (authKey !== process.env.MCP_AUTH_KEY) {
  throw new Error('Invalid authentication');
}
```

---

## Technology Stack

### Node.js MCP Server

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | 20+ | JavaScript execution |
| Protocol | MCP SDK | 1.0+ | Model Context Protocol |
| HTTP Client | undici | 6.0+ | High-performance HTTP |
| Cache | lru-cache | 10.0+ | In-memory LRU cache |
| Validation | Zod | 3.0+ | Schema validation |
| Logging | Pino | 8.0+ | Structured JSON logging |
| Web UI | Express.js | 4.18+ | HTTP server |
| Frontend | Alpine.js | 3.13+ | Reactive UI |
| Styling | Tailwind CSS | 3.4+ | Utility-first CSS |

### Godot Bridge

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Godot Engine | 4.6+ | Game engine runtime |
| Language | GDScript | 2.0 | Bridge implementation |
| HTTP | HTTPServer | Built-in | JSON-RPC server |
| File I/O | FileAccess | Built-in | Read/write files |
| Directory | DirAccess | Built-in | Traverse directories |
| Config | ConfigFile | Built-in | Parse project.godot |

---

## Design Decisions

### Why HTTP over WebSocket?

**HTTP (Current)**:
- ✅ Simpler to debug (curl, Postman)
- ✅ Native Godot support (HTTPServer node)
- ✅ Stateless (no connection management)
- ❌ Higher latency (~10-20ms overhead)
- ❌ Unidirectional (request/response only)

**WebSocket (Phase 2)**:
- ✅ Lower latency (1-5ms)
- ✅ Bidirectional (Godot can push events)
- ❌ More complex to debug
- ❌ Requires GDExtension or addon

**Decision**: HTTP for MVP (simplicity), WebSocket for Phase 2 (performance).

### Why JSON-RPC over REST?

**JSON-RPC**:
- ✅ Single endpoint (`/rpc`)
- ✅ Explicit method names (`scene.read`)
- ✅ Standard error codes
- ✅ Batch requests (future)

**REST**:
- ❌ Many endpoints (`/scenes/:id`, `/scripts/:id`, ...)
- ❌ HTTP verbs less semantic for tools
- ✅ Cacheable with HTTP headers

**Decision**: JSON-RPC for tool-oriented operations, REST patterns could be added for resource endpoints.

### Why Node.js over Python/Rust?

**Node.js**:
- ✅ Native async I/O (perfect for MCP)
- ✅ Large ecosystem (MCP SDK, HTTP clients)
- ✅ Fast iteration (TypeScript)
- ✅ Easy to deploy (npm, Docker)

**Python**:
- ❌ GIL limits concurrency
- ✅ Strong in AI/ML space
- ❌ Slower async performance

**Rust**:
- ✅ Maximum performance
- ❌ Longer development time
- ❌ Smaller ecosystem for MCP

**Decision**: Node.js for MVP (velocity), Rust rewrite if performance becomes critical.

---

## Next Steps

Explore detailed component architectures:

- [Component Details](./components.md) - Deep dive into each layer
- [Data Flow](./data-flow.md) - Request/response timing diagrams
- [Design Decisions](./decisions.md) - ADRs (Architecture Decision Records)

---

::: tip Architecture Philosophy
The Godot MCP Server follows the **KISS principle** (Keep It Simple, Stupid):

1. Use standard protocols (HTTP, JSON-RPC)
2. Minimize dependencies
3. Make it easy to debug
4. Optimize for common cases
5. Don't over-engineer for future needs

Complexity is added incrementally as needs are validated.
:::
