# Technical Implementation Plan: Issue #2 - Foundation & Communication Layer

**Status:** Phase 1, Sprint 1 (Weeks 1-2) - CRITICAL PATH
**Depends On:** None
**Blocks:** All other Phase 1 issues (#3, #4, #5, #6, #7)

---

## 1. Architecture Design

### Component Structure

```
godot-mcp/
├── src/
│   ├── server/
│   │   ├── mcp-server.ts           # Main MCP protocol handler (stdio transport)
│   │   ├── lifecycle.ts            # Server start/stop/restart logic
│   │   └── tool-registry.ts        # Tool registration and management
│   ├── bridge/
│   │   ├── http-client.ts          # Node.js → Godot HTTP client (undici Pool)
│   │   ├── json-rpc.ts             # JSON-RPC 2.0 request/response builders
│   │   └── connection-pool.ts      # Connection pool management with health checks
│   ├── presentation/
│   │   ├── web-server.ts           # Express server for Web UI
│   │   ├── sse-handler.ts          # Server-Sent Events for log streaming
│   │   ├── api/
│   │   │   ├── lifecycle-api.ts    # POST /api/lifecycle/{start,stop,restart}
│   │   │   ├── status-api.ts       # GET /api/status
│   │   │   └── logs-api.ts         # GET /api/logs/stream (SSE)
│   │   └── public/
│   │       ├── index.html          # Main dashboard
│   │       ├── css/
│   │       │   └── styles.css      # Custom styles (minimal, Tailwind CDN)
│   │       └── js/
│   │           └── dashboard.js    # Alpine.js components
│   ├── types/
│   │   ├── mcp.ts                  # MCP protocol types
│   │   ├── bridge.ts               # Bridge request/response types
│   │   └── web-ui.ts               # Web UI API types
│   └── utils/
│       ├── logger.ts               # Winston structured logging
│       ├── config.ts               # Environment configuration
│       └── errors.ts               # Custom error classes
├── addons/
│   └── godot-mcp-bridge/
│       ├── plugin.cfg              # Godot plugin manifest
│       ├── plugin.gd               # EditorPlugin entry point
│       ├── http_server.gd          # HTTPServer implementation (port 7777)
│       ├── rpc_handler.gd          # JSON-RPC 2.0 request handler
│       ├── health_monitor.gd       # Health check and metrics
│       └── logger.gd               # Structured logging utility
├── tests/
│   └── integration/
│       ├── communication.test.ts   # HTTP bridge integration tests
│       └── health-check.test.ts    # Health endpoint tests
├── package.json
├── tsconfig.json
└── .env.example
```

### Key Classes and Responsibilities

#### Node.js Side

**1. MCPServer (src/server/mcp-server.ts)**
- Initialize MCP SDK with stdio transport
- Register tools via ToolRegistry
- Handle MCP protocol requests (tools/list, tools/call, resources/list, resources/read)
- Delegate tool execution to Bridge
- Return JSON-RPC 2.0 responses

**2. HTTPClient (src/bridge/http-client.ts)**
- Manage undici connection pool (10 concurrent connections)
- Send JSON-RPC requests to Godot HTTPServer
- Handle timeouts (30s default)
- Retry logic with exponential backoff (1s, 2s, 4s)
- Circuit breaker pattern for connection failures
- Metrics: request count, latency histogram, error rate

**3. WebUIServer (src/presentation/web-server.ts)**
- Express server on port 8080
- Serve static files from public/
- Lifecycle API endpoints (start/stop/restart)
- SSE log streaming
- CORS configuration (localhost only)
- Process state tracking (running/stopped/error)

**4. Logger (src/utils/logger.ts)**
- Winston transports: console (dev), file rotation (prod)
- Log levels: debug, info, warn, error
- Structured format: JSON with timestamp, level, component, message, metadata
- SSE broadcast for log events

#### Godot Side

**1. HTTPServer (addons/godot-mcp-bridge/http_server.gd)**
```gdscript
class_name MCPHTTPServer
extends Node

const PORT := 7777
const MAX_CONNECTIONS := 10

var server: TCPServer
var clients: Array[StreamPeerTCP] = []
var rpc_handler: RPCHandler

func _ready() -> void:
    server = TCPServer.new()
    server.listen(PORT)
    Logger.info("HTTPServer", "Listening on port %d" % PORT)
    set_process(true)

func _process(_delta: float) -> void:
    # Accept new connections
    if server.is_connection_available():
        var peer := server.take_connection()
        clients.append(peer)
    
    # Process client requests
    for client in clients:
        if client.get_available_bytes() > 0:
            var request := _parse_http_request(client)
            var response := _handle_request(request)
            _send_http_response(client, response)

func _handle_request(request: Dictionary) -> Dictionary:
    match request.path:
        "/rpc":
            return rpc_handler.handle(request.body)
        "/health":
            return { "status": "ok", "uptime": Time.get_ticks_msec() / 1000.0 }
        "/version":
            return { "version": "0.1.0", "godot": Engine.get_version_info() }
        _:
            return { "error": "Not Found", "code": 404 }
```

**2. RPCHandler (addons/godot-mcp-bridge/rpc_handler.gd)**
- Parse JSON-RPC 2.0 requests
- Validate: jsonrpc version, id, method, params
- Route to appropriate tool handlers (Phase 1+)
- Return JSON-RPC responses with id matching
- Error handling: -32600 (Invalid Request), -32601 (Method Not Found), -32603 (Internal Error)

**3. Logger (addons/godot-mcp-bridge/logger.gd)**
```gdscript
class_name Logger
extends Node

enum Level { DEBUG, INFO, WARN, ERROR }

static func info(component: String, message: String, metadata: Dictionary = {}) -> void:
    _log(Level.INFO, component, message, metadata)

static func _log(level: Level, component: String, message: String, metadata: Dictionary) -> void:
    var entry := {
        "timestamp": Time.get_datetime_string_from_system(),
        "level": Level.keys()[level],
        "component": component,
        "message": message,
        "metadata": metadata
    }
    print(JSON.stringify(entry))
```

### Data Flow and Communication Patterns

**Request Flow (MCP Client → Godot):**
```
1. Claude Desktop → stdio → MCPServer.handleToolCall()
2. MCPServer → HTTPClient.sendRequest(method, params)
3. HTTPClient → HTTP POST → Godot HTTPServer (port 7777)
4. HTTPServer._handle_request() → RPCHandler.handle()
5. RPCHandler → ToolHandler (e.g., LaunchEditorTool)
6. ToolHandler executes, returns result
7. RPCHandler → JSON-RPC response
8. HTTPServer → HTTP 200 + JSON body
9. HTTPClient receives response
10. MCPServer → stdio → Claude Desktop
```

**Web UI Lifecycle Control Flow:**
```
1. Browser → POST /api/lifecycle/start
2. WebUIServer.handleStart()
3. spawn('node', ['dist/server/mcp-server.js'])
4. Track child process PID
5. Monitor process state
6. SSE broadcast: { event: "lifecycle", state: "running" }
7. Return 200 { success: true, pid: 12345 }
```

**Log Streaming Flow:**
```
1. Browser → GET /api/logs/stream (SSE connection)
2. WebUIServer adds client to SSE subscribers
3. Logger emits log event
4. SSEHandler broadcasts to all clients
5. Client receives: data: {"level":"info","message":"..."}\n\n
6. Alpine.js updates UI reactively
```

### Integration Points

- **MCP SDK:** stdio transport, tool handlers, resource providers
- **undici:** HTTP client library with connection pooling
- **Express:** Web server framework
- **Alpine.js:** Reactive UI components
- **Tailwind CSS:** Utility-first styling (CDN for MVP)
- **Winston:** Structured logging

---

## 2. Technology Stack

### Dependencies

**Core Dependencies:**
```json
{
  "@modelcontextprotocol/sdk": "^1.0.0",
  "undici": "^6.0.0",
  "express": "^4.18.0",
  "cors": "^2.8.5",
  "winston": "^3.11.0",
  "dotenv": "^16.3.0",
  "zod": "^3.22.0"
}
```

**Development Dependencies:**
```json
{
  "typescript": "^5.3.0",
  "@types/node": "^20.10.0",
  "@types/express": "^4.17.21",
  "@types/cors": "^2.8.17",
  "jest": "^29.7.0",
  "ts-jest": "^29.1.0",
  "@typescript-eslint/eslint-plugin": "^6.0.0",
  "@typescript-eslint/parser": "^6.0.0",
  "eslint": "^8.55.0",
  "prettier": "^3.1.0",
  "nodemon": "^3.0.0"
}
```

### Configuration Files

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**package.json Scripts:**
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "nodemon --watch src --exec 'npm run build && node dist/server/mcp-server.js'",
    "web-ui": "node dist/presentation/web-server.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  }
}
```

### GDScript Addon Structure

**plugin.cfg:**
```ini
[plugin]
name="Godot MCP Bridge"
description="HTTP server for Model Context Protocol communication"
author="godot-mcp"
version="0.1.0"
script="plugin.gd"
```

**plugin.gd:**
```gdscript
@tool
extends EditorPlugin

var http_server: MCPHTTPServer

func _enter_tree() -> void:
    http_server = MCPHTTPServer.new()
    add_child(http_server)
    print("MCP Bridge enabled on port 7777")

func _exit_tree() -> void:
    if http_server:
        http_server.queue_free()
    print("MCP Bridge disabled")
```

### Web UI Framework Usage

**index.html (Alpine.js + Tailwind CSS):**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Godot MCP - Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body class="bg-gray-900 text-gray-100 p-6">
    <div x-data="dashboard()" x-init="init()">
        <!-- Status Card -->
        <div class="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 class="text-2xl font-bold mb-4">Server Status</h2>
            <div class="flex items-center gap-4">
                <span 
                    class="px-3 py-1 rounded-full text-sm font-semibold"
                    :class="{
                        'bg-green-600': status === 'running',
                        'bg-yellow-600': status === 'starting',
                        'bg-red-600': status === 'stopped'
                    }"
                    x-text="status.toUpperCase()">
                </span>
                <span x-text="'Uptime: ' + formatUptime(uptime)"></span>
                <span x-text="'Clients: ' + clientCount"></span>
            </div>
        </div>
        
        <!-- Control Panel -->
        <div class="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 class="text-xl font-bold mb-4">Controls</h2>
            <div class="flex gap-4">
                <button 
                    @click="startServer()"
                    :disabled="status === 'running'"
                    class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded">
                    Start
                </button>
                <button 
                    @click="stopServer()"
                    :disabled="status !== 'running'"
                    class="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded">
                    Stop
                </button>
                <button 
                    @click="restartServer()"
                    :disabled="status !== 'running'"
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded">
                    Restart
                </button>
            </div>
        </div>
        
        <!-- Log Viewer -->
        <div class="bg-gray-800 rounded-lg p-6">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold">Logs</h2>
                <button 
                    @click="autoScroll = !autoScroll"
                    class="px-3 py-1 text-sm rounded"
                    :class="autoScroll ? 'bg-green-600' : 'bg-gray-600'">
                    Auto-scroll: <span x-text="autoScroll ? 'ON' : 'OFF'"></span>
                </button>
            </div>
            <div class="bg-gray-900 rounded p-4 h-96 overflow-y-auto font-mono text-sm" x-ref="logContainer">
                <template x-for="log in logs" :key="log.timestamp">
                    <div 
                        class="mb-1"
                        :class="{
                            'text-gray-400': log.level === 'debug',
                            'text-blue-400': log.level === 'info',
                            'text-yellow-400': log.level === 'warn',
                            'text-red-400': log.level === 'error'
                        }">
                        <span x-text="log.timestamp"></span>
                        <span x-text="'[' + log.level.toUpperCase() + ']'"></span>
                        <span x-text="log.message"></span>
                    </div>
                </template>
            </div>
        </div>
    </div>
    
    <script src="/js/dashboard.js"></script>
</body>
</html>
```

**dashboard.js (Alpine.js Component):**
```javascript
function dashboard() {
    return {
        status: 'stopped',
        uptime: 0,
        clientCount: 0,
        logs: [],
        autoScroll: true,
        sseConnection: null,
        
        init() {
            this.fetchStatus();
            this.connectLogs();
            setInterval(() => this.fetchStatus(), 1000);
        },
        
        async fetchStatus() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                this.status = data.status;
                this.uptime = data.uptime;
                this.clientCount = data.clients;
            } catch (error) {
                console.error('Failed to fetch status:', error);
                this.status = 'error';
            }
        },
        
        connectLogs() {
            this.sseConnection = new EventSource('/api/logs/stream');
            
            this.sseConnection.onmessage = (event) => {
                const log = JSON.parse(event.data);
                this.logs.push(log);
                if (this.logs.length > 1000) {
                    this.logs.shift();
                }
                
                if (this.autoScroll) {
                    this.$nextTick(() => {
                        const container = this.$refs.logContainer;
                        container.scrollTop = container.scrollHeight;
                    });
                }
            };
            
            this.sseConnection.onerror = () => {
                console.error('SSE connection lost, reconnecting...');
                setTimeout(() => this.connectLogs(), 5000);
            };
        },
        
        async startServer() {
            const response = await fetch('/api/lifecycle/start', { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                this.status = 'starting';
            }
        },
        
        async stopServer() {
            const response = await fetch('/api/lifecycle/stop', { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                this.status = 'stopped';
            }
        },
        
        async restartServer() {
            await this.stopServer();
            setTimeout(() => this.startServer(), 2000);
        },
        
        formatUptime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            return `${hours}h ${minutes}m ${secs}s`;
        }
    };
}
```

---

## 3. Implementation Approach

### Step-by-Step Implementation Sequence

**Week 1: Core Infrastructure**

**Day 1-2: Node.js Setup**
1. Initialize npm project: `npm init -y`
2. Install dependencies (see Technology Stack)
3. Configure TypeScript with strict mode
4. Setup ESLint and Prettier
5. Create folder structure
6. Implement basic Logger utility with Winston
7. Create Config module for environment variables
8. Write first test: Logger outputs structured JSON

**Day 3-4: MCP Server Skeleton**
1. Import MCP SDK
2. Create MCPServer class with stdio transport
3. Implement tool registry (empty for now)
4. Add health check tool (returns server version and status)
5. Test with MCP Inspector: `npx @modelcontextprotocol/inspector node dist/server/mcp-server.js`
6. Verify tool listing works

**Day 5: HTTP Bridge - Client Side**
1. Implement HTTPClient with undici Pool
2. Connection pool configuration: 10 connections, 30s timeout
3. Create JSONRPCBuilder for request formatting
4. Implement retry logic with exponential backoff
5. Add metrics tracking (request count, latency)
6. Unit tests: mock HTTP responses, test retry logic

**Week 2: Godot Bridge & Web UI**

**Day 6-7: Godot HTTPServer**
1. Create addon folder structure
2. Implement plugin.cfg and plugin.gd
3. Create MCPHTTPServer class with TCPServer
4. Parse HTTP requests (headers + body)
5. Implement /health endpoint
6. Test with curl: `curl http://localhost:7777/health`
7. Verify JSON response

**Day 8: JSON-RPC Handler**
1. Implement RPCHandler in GDScript
2. Parse JSON-RPC 2.0 requests
3. Validate: jsonrpc, id, method, params
4. Route to placeholder tool handlers
5. Return JSON-RPC responses
6. Test with Node.js client: send {"jsonrpc":"2.0","method":"health","id":1}
7. Verify response: {"jsonrpc":"2.0","result":{"status":"ok"},"id":1}

**Day 9: Integration Testing**
1. Connect Node.js HTTPClient to Godot HTTPServer
2. Send test requests, verify responses
3. Benchmark latency: 1000 requests, measure p99
4. Test reconnection: stop Godot, verify client retries
5. Test concurrent requests: 10 simultaneous calls
6. Document integration setup for developers

**Day 10: Web UI MVP**
1. Create Express server in web-server.ts
2. Implement /api/status endpoint (mock data)
3. Implement /api/lifecycle/{start,stop,restart} endpoints
4. Setup SSE handler for /api/logs/stream
5. Create public/index.html with Alpine.js dashboard
6. Implement dashboard.js component
7. Test in browser: http://localhost:8080
8. Verify SSE connection in Network tab

### Critical Path Items (Must-Haves First)

**P0 (Blocking):**
1. MCP stdio transport working
2. HTTP bridge communication (Node.js ↔ Godot)
3. JSON-RPC 2.0 request/response parsing
4. Health check endpoint functional

**P1 (Essential for MVP):**
5. Connection pooling with retry logic
6. Web UI server with lifecycle controls
7. SSE log streaming
8. Basic dashboard UI

**P2 (Nice-to-Have):**
9. Circuit breaker pattern
10. Advanced metrics (request histograms)
11. Web UI dark mode toggle
12. Log filtering by level

### Module Boundaries and Interfaces

**MCPServer Interface:**
```typescript
interface IMCPServer {
    start(): Promise<void>;
    stop(): Promise<void>;
    registerTool(tool: Tool): void;
    registerResource(resource: Resource): void;
}
```

**HTTPClient Interface:**
```typescript
interface IHTTPClient {
    sendRequest(method: string, params: unknown): Promise<JSONRPCResponse>;
    healthCheck(): Promise<boolean>;
    getMetrics(): ClientMetrics;
}

interface ClientMetrics {
    requestCount: number;
    errorCount: number;
    averageLatency: number;
    p99Latency: number;
}
```

**WebUIServer Interface:**
```typescript
interface IWebUIServer {
    start(port: number): Promise<void>;
    stop(): Promise<void>;
    broadcastLog(log: LogEntry): void;
    getServerStatus(): ServerStatus;
}

interface ServerStatus {
    status: 'running' | 'stopped' | 'error';
    uptime: number;
    clients: number;
}
```

### Error Handling and Validation Strategies

**HTTP Client Errors:**
```typescript
class BridgeError extends Error {
    constructor(
        message: string,
        public code: string,
        public recoverable: boolean
    ) {
        super(message);
    }
}

// Usage
try {
    const response = await httpClient.sendRequest('method', params);
} catch (error) {
    if (error instanceof BridgeError && error.recoverable) {
        // Retry with backoff
        await delay(1000);
        return httpClient.sendRequest('method', params);
    } else {
        // Fatal error, propagate to MCP client
        throw new MCPError(-32603, 'Bridge connection failed');
    }
}
```

**JSON-RPC Validation:**
```gdscript
func validate_request(request: Dictionary) -> Result:
    if not request.has("jsonrpc") or request.jsonrpc != "2.0":
        return Result.error(-32600, "Invalid Request: missing jsonrpc version")
    
    if not request.has("method"):
        return Result.error(-32600, "Invalid Request: missing method")
    
    if request.has("id") and typeof(request.id) not in [TYPE_INT, TYPE_STRING]:
        return Result.error(-32600, "Invalid Request: id must be string or number")
    
    return Result.ok()
```

**Graceful Degradation:**
- If Godot is not running, queue requests and retry
- If Web UI can't connect to MCP server, show "disconnected" state
- If SSE connection drops, auto-reconnect after 5s
- Log all errors with context for debugging

---

## 4. Performance Considerations

### Caching Strategies
- **Connection Pool Cache:** Reuse HTTP connections (undici Pool)
- **No data caching yet:** Phase 1 establishes communication only
- **Future:** LRU cache for scene/script reads (Issue #3)

### Connection Pooling
```typescript
const pool = new Pool('http://localhost:7777', {
    connections: 10,              // Max concurrent connections
    keepAliveTimeout: 60000,      // 60s keep-alive
    keepAliveMaxTimeout: 600000,  // 10min max
    pipelining: 1,                // Disable pipelining for simplicity
    headersTimeout: 30000,        // 30s header timeout
    bodyTimeout: 30000            // 30s body timeout
});
```

### Async/Await Patterns
- All I/O operations use async/await
- No blocking operations in event loop
- Promise.allSettled() for parallel requests (future optimization)

### Memory Management
- **Log Buffer:** Max 1000 entries in memory (ring buffer)
- **SSE Clients:** Track connections, cleanup on disconnect
- **Process Management:** Proper cleanup on server shutdown

---

## 5. Security Design

### Input Validation (Zod Schemas)
```typescript
import { z } from 'zod';

const HealthCheckParamsSchema = z.object({}).strict();

const JSONRPCRequestSchema = z.object({
    jsonrpc: z.literal('2.0'),
    method: z.string().min(1),
    params: z.unknown().optional(),
    id: z.union([z.string(), z.number()]).optional()
});
```

### Path Traversal Prevention
- Not applicable yet (no file operations in Phase 1)
- Will be implemented in Issue #3 (Read Tools)

### Command Injection Mitigation
- No shell commands executed in Phase 1
- Will be implemented in Issue #2 (Editor Control)

### CORS Configuration
```typescript
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:8080'],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS']
}));
```

### Rate Limiting (Future - Issue #7)
- Not implemented in Phase 1
- Will be added in Security Hardening sprint

---

## 6. Testing Strategy

### Unit Tests

**Node.js Tests (Jest):**
```typescript
// tests/unit/bridge/http-client.test.ts
describe('HTTPClient', () => {
    let client: HTTPClient;
    let mockPool: MockPool;
    
    beforeEach(() => {
        mockPool = new MockPool();
        client = new HTTPClient(mockPool);
    });
    
    test('sendRequest - successful response', async () => {
        mockPool.mockResponse({ jsonrpc: '2.0', result: 'ok', id: 1 });
        
        const response = await client.sendRequest('test', {});
        
        expect(response.result).toBe('ok');
    });
    
    test('sendRequest - network error with retry', async () => {
        mockPool.mockError(new Error('ECONNREFUSED'));
        mockPool.mockResponse({ jsonrpc: '2.0', result: 'ok', id: 1 });
        
        const response = await client.sendRequest('test', {});
        
        expect(mockPool.callCount).toBe(2); // Initial + 1 retry
        expect(response.result).toBe('ok');
    });
    
    test('sendRequest - timeout', async () => {
        mockPool.mockTimeout(35000); // Exceeds 30s timeout
        
        await expect(client.sendRequest('test', {}))
            .rejects.toThrow('Request timeout');
    });
});
```

**GDScript Tests (GdUnit4):**
```gdscript
extends GdUnitTestSuite

func test_parse_http_request():
    var raw_request = "POST /rpc HTTP/1.1\r\nContent-Type: application/json\r\nContent-Length: 45\r\n\r\n{\"jsonrpc\":\"2.0\",\"method\":\"test\",\"id\":1}"
    
    var request = HTTPServer._parse_http_request(raw_request)
    
    assert_str(request.method).is_equal("POST")
    assert_str(request.path).is_equal("/rpc")
    assert_object(request.body).contains_key("jsonrpc")

func test_rpc_handler_valid_request():
    var handler = RPCHandler.new()
    var request = {"jsonrpc": "2.0", "method": "health", "id": 1}
    
    var response = handler.handle(request)
    
    assert_str(response.jsonrpc).is_equal("2.0")
    assert_int(response.id).is_equal(1)
    assert_object(response).contains_key("result")

func test_rpc_handler_invalid_request():
    var handler = RPCHandler.new()
    var request = {"method": "test"} # Missing jsonrpc
    
    var response = handler.handle(request)
    
    assert_object(response).contains_key("error")
    assert_int(response.error.code).is_equal(-32600)
```

### Integration Tests

**HTTP Bridge Integration:**
```typescript
// tests/integration/communication.test.ts
describe('HTTP Bridge Integration', () => {
    let godotProcess: ChildProcess;
    let httpClient: HTTPClient;
    
    beforeAll(async () => {
        // Start Godot with test project
        godotProcess = spawn('godot', ['--headless', '--path', 'test-project']);
        await waitForPort(7777, 10000);
        httpClient = new HTTPClient();
    });
    
    afterAll(() => {
        godotProcess.kill();
    });
    
    test('health check returns 200', async () => {
        const response = await httpClient.healthCheck();
        expect(response).toBe(true);
    });
    
    test('JSON-RPC request/response cycle', async () => {
        const response = await httpClient.sendRequest('health', {});
        expect(response.result).toHaveProperty('status', 'ok');
        expect(response.result).toHaveProperty('uptime');
    });
    
    test('concurrent requests', async () => {
        const requests = Array(10).fill(null).map(() => 
            httpClient.sendRequest('health', {})
        );
        
        const responses = await Promise.all(requests);
        
        expect(responses).toHaveLength(10);
        responses.forEach(r => expect(r.result.status).toBe('ok'));
    });
});
```

### Manual Testing Scenarios

**Scenario 1: MCP Client Connection**
1. Start Godot with test project, enable plugin
2. Run: `node dist/server/mcp-server.js`
3. Connect Claude Desktop with MCP config:
   ```json
   {
     "mcpServers": {
       "godot": {
         "command": "node",
         "args": ["C:/path/to/godot-mcp/dist/server/mcp-server.js"]
       }
     }
   }
   ```
4. Ask Claude: "List available Godot tools"
5. Verify response shows tools registered

**Scenario 2: Web UI Dashboard**
1. Start Web UI: `node dist/presentation/web-server.js`
2. Open browser: http://localhost:8080
3. Verify status shows "stopped" (MCP server not running)
4. Click "Start" button
5. Verify status changes to "running"
6. Observe logs streaming in real-time
7. Click "Stop" button
8. Verify graceful shutdown

**Scenario 3: Reconnection Handling**
1. Start MCP server and Godot
2. Verify communication working
3. Stop Godot editor
4. Observe Node.js client retries with backoff
5. Restart Godot editor
6. Verify automatic reconnection within 10s

### Target Coverage

**Overall:** >85%
- **src/server:** 90%
- **src/bridge:** 95%
- **src/presentation:** 80%
- **src/utils:** 100%

---

## 7. Documentation Impact

### VitePress Docs Updates

**New Pages:**
1. **[docs/en/getting-started.md](docs/en/getting-started.md)** - Installation and setup guide
2. **[docs/en/architecture/overview.md](docs/en/architecture/overview.md)** - System architecture diagram
3. **[docs/en/architecture/communication.md](docs/en/architecture/communication.md)** - HTTP bridge deep dive
4. **[docs/en/implementation/setup.md](docs/en/implementation/setup.md)** - Developer setup instructions

**Updated Pages:**
1. **[docs/en/index.md](docs/en/index.md)** - Add "Quick Start" section
2. **[docs/en/implementation/roadmap.md](docs/en/implementation/roadmap.md)** - Mark Sprint 1 as complete

### API Reference Additions

**[docs/en/api/protocol.md](docs/en/api/protocol.md):**
```markdown
## JSON-RPC 2.0 Protocol

### Request Format
```json
{
  "jsonrpc": "2.0",
  "method": "tool_name",
  "params": { /* ... */ },
  "id": 1
}
```

### Response Format
```json
{
  "jsonrpc": "2.0",
  "result": { /* ... */ },
  "id": 1
}
```

### Error Format
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  },
  "id": null
}
```

### Error Codes
- `-32600`: Invalid Request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error
```

### Usage Examples and Tutorials

**[docs/en/examples.md](docs/en/examples.md):**
```markdown
## Basic Setup Example

### 1. Install Dependencies
\`\`\`bash
npm install
npm run build
\`\`\`

### 2. Enable Godot Plugin
1. Open Godot project
2. Project → Project Settings → Plugins
3. Enable "Godot MCP Bridge"
4. Verify console shows "MCP Bridge enabled on port 7777"

### 3. Start MCP Server
\`\`\`bash
node dist/server/mcp-server.js
\`\`\`

### 4. Configure Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
\`\`\`json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server/mcp-server.js"]
    }
  }
}
\`\`\`

### 5. Test Connection
Open Claude Desktop and ask: "What Godot tools are available?"
```

---

## 8. MCP Server Usage

### Required: Yes

### Tools (Phase 1 - None Yet)
- Health check tool (internal, not exposed to clients)
- Tool registration infrastructure only

### Resources (Phase 1 - None Yet)
- Resource provider infrastructure only
- Will be implemented in Sprint 3 (Issue #4)

---

## 9. Estimated Effort

**Total: 10 days (2 weeks)**

**Breakdown:**
- Node.js MCP Server Setup: 3 days
- Godot HTTPServer: 4 days
- Web UI MVP: 3 days

**Developer Allocation:**
- 1 Full-stack developer (Node.js + GDScript + Web UI)

---

## 10. Critical Path

**Dependencies:**
- ✅ None (foundation layer)

**Blocks:**
- Issue #3: Editor Control Tools (needs HTTP bridge)
- Issue #4: Read Tools (needs HTTP bridge)
- Issue #5: Node Operations (needs HTTP bridge)
- Issue #6: Write Tools - Scene Operations (needs HTTP bridge + backup system)
- Issue #7: Write Tools - Script Operations (needs HTTP bridge)
- Issue #8: Security Hardening (needs all infrastructure)

**Milestones:**
1. Day 5: HTTP bridge functional (Node.js → Godot)
2. Day 8: JSON-RPC 2.0 working (bidirectional)
3. Day 10: Web UI MVP deployed

**Risks:**
- **Latency:** HTTP roundtrip might exceed 50ms on slower machines
  - Mitigation: Connection pooling, keep-alive, localhost only
- **Port conflicts:** Port 7777 or 8080 might be in use
  - Mitigation: Configurable ports via environment variables
- **Godot plugin stability:** HTTPServer might crash on malformed requests
  - Mitigation: Robust error handling, input validation

---

## Acceptance Criteria Checklist

- [ ] Node.js can send HTTP POST to Godot HTTPServer
- [ ] JSON-RPC requests/responses parse correctly
- [ ] Health check returns 200 OK with uptime
- [ ] Reconnection logic tested (stop/start Godot)
- [ ] Latency <20ms for localhost HTTP roundtrip (p99)
- [ ] MCP stdio transport functional
- [ ] Web UI accessible at http://localhost:8080
- [ ] Lifecycle controls (start/stop/restart) working
- [ ] SSE log streaming stable for >1 hour
- [ ] All unit tests passing (>85% coverage)
- [ ] Integration tests passing on Windows/macOS/Linux
- [ ] Documentation complete and reviewed
