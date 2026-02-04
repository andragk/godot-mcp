# Godot 4.6 MCP Server - System Architecture

**Document Version**: 1.0.0  
**Date**: February 3, 2026  
**Status**: Architecture Blueprint  
**Architecture Type**: Layered + Plugin Architecture  
**Target Phase**: MVP (Phase 1)

---

## Executive Summary

This document defines the production-ready system architecture for the Godot 4.6 MCP Server—a lightweight, high-performance bridge that exposes Godot Engine capabilities via the Model Context Protocol. This architecture prioritizes **simplicity**, **reliability**, and **performance** (<50ms p99 latency) while maintaining extensibility for future enhancements.

**Core Architectural Principles**:
- **Simplicity First**: HTTP REST for MVP, upgrade to WebSocket only when needed
- **Production-Ready**: Structured error handling, observability, graceful degradation
- **Minimal Footprint**: <100MB Node.js process, <50MB Godot overhead
- **Developer-Friendly**: Clear separation of concerns, comprehensive logging, debuggable

---

## 1. High-Level Architecture (C4 Model)

### 1.1 System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         External Systems                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐         ┌──────────────┐      ┌──────────────┐  │
│  │   VS Code    │         │   Claude     │      │   Browser    │  │
│  │  + MCP Ext   │         │   Desktop    │      │  (Web UI)    │  │
│  └──────┬───────┘         └──────┬───────┘      └──────┬───────┘  │
│         │                        │                     │          │
│         └────────────────────────┼─────────────────────┘          │
│                                  │                                │
└──────────────────────────────────┼────────────────────────────────┘
                                   │
                    MCP Protocol (stdio) / HTTP
                                   │
┌──────────────────────────────────▼────────────────────────────────┐
│                    Godot 4.6 MCP Server System                    │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Node.js MCP Server (Port 3000)                │  │
│  │  - MCP SDK (stdio transport)                               │  │
│  │  - Tool/Resource/Prompt handlers                           │  │
│  │  - HTTP client (Godot bridge)                              │  │
│  │  - Express server (Web UI API)                             │  │
│  │  - Session management & caching                            │  │
│  └────────────────┬───────────────────────────────────────────┘  │
│                   │                                               │
│                   │ HTTP/REST (localhost:7777)                    │
│                   │                                               │
│  ┌────────────────▼───────────────────────────────────────────┐  │
│  │         Godot 4.6 Bridge (GDScript + Optional Plugin)      │  │
│  │  - HTTPServer (port 7777)                                  │  │
│  │  - JSON-RPC 2.0 request router                             │  │
│  │  - Scene/script operations                                 │  │
│  │  - File system access layer                                │  │
│  │  - Resource cache manager                                  │  │
│  └────────────────┬───────────────────────────────────────────┘  │
│                   │                                               │
│                   │ Godot API / FileAccess                        │
│                   │                                               │
│  ┌────────────────▼───────────────────────────────────────────┐  │
│  │                  Godot 4.6 Engine                          │  │
│  │  - Scene tree (.tscn files)                                │  │
│  │  - Scripts (.gd, .cs files)                                │  │
│  │  - Resources (.tres, assets)                               │  │
│  │  - Project configuration (project.godot)                   │  │
│  └────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘

      ┌──────────────────────────────────────────────────────┐
      │  Sidecar Web UI (Tailwind CSS + Alpine.js)           │
      │  - Server lifecycle controls                         │
      │  - Real-time connection dashboard                    │
      │  - Log viewer (WebSocket stream from Node.js)        │
      │  - Resource browser                                  │
      │  - Tool catalog & testing interface                  │
      └──────────────────────────────────────────────────────┘
```

**Key Relationships**:
- MCP Clients communicate via **stdio** (JSON-RPC over stdin/stdout) with Node.js server
- Node.js server communicates via **HTTP REST** (JSON-RPC 2.0) with Godot bridge
- Web UI communicates via **HTTP + WebSocket** with Node.js server for UI/observability
- Godot bridge uses native **FileAccess/DirAccess** APIs to manipulate project files

---

### 1.2 Container Diagram (Node.js MCP Server)

```
┌────────────────────────────────────────────────────────────────────┐
│                      Node.js MCP Server Process                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    MCP Protocol Layer                        │ │
│  │  - @modelcontextprotocol/sdk/server                          │ │
│  │  - StdioServerTransport                                      │ │
│  │  - Request/response schema validation (Zod)                 │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                       │
│  ┌────────────────────────▼─────────────────────────────────────┐ │
│  │                   Handler Layer                              │ │
│  │  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐ │ │
│  │  │ Tool Handlers │  │ Resource      │  │ Prompt Handlers  │ │ │
│  │  │               │  │ Handlers      │  │                  │ │ │
│  │  │ - list_scenes │  │ - godot://    │  │ - create_scene   │ │ │
│  │  │ - read_scene  │  │   URI router  │  │ - refactor_code  │ │ │
│  │  │ - modify_*    │  │ - MIME types  │  │                  │ │ │
│  │  └───────┬───────┘  └───────┬───────┘  └──────┬───────────┘ │ │
│  │          │                  │                  │             │ │
│  └──────────┼──────────────────┼──────────────────┼─────────────┘ │
│             │                  │                  │               │
│  ┌──────────▼──────────────────▼──────────────────▼─────────────┐ │
│  │                   Service Layer                              │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │ │
│  │  │ Godot       │  │ Cache        │  │ Session Manager    │  │ │
│  │  │ Bridge      │  │ Manager      │  │                    │  │ │
│  │  │ Client      │  │ (LRU)        │  │ - Client tracking  │  │ │
│  │  │             │  │              │  │ - Request context  │  │ │
│  │  └─────┬───────┘  └──────┬───────┘  └────────┬───────────┘  │ │
│  │        │                 │                   │              │ │
│  └────────┼─────────────────┼───────────────────┼──────────────┘ │
│           │                 │                   │                │
│  ┌────────▼─────────────────▼───────────────────▼──────────────┐ │
│  │                  Infrastructure Layer                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │ │
│  │  │ HTTP Client  │  │ Logger       │  │ Error Handler    │  │ │
│  │  │ (undici)     │  │ (pino)       │  │ (typed errors)   │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │ │
│  │  │ Health       │  │ Metrics      │  │ Config Loader    │  │ │
│  │  │ Monitor      │  │ Collector    │  │ (dotenv)         │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    Express API (Port 3001)                   │ │
│  │  - GET /health                                               │ │
│  │  - GET /api/status                                           │ │
│  │  - WebSocket /ws (real-time logs/metrics)                   │ │
│  │  - Static files (Sidecar UI)                                │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

### 1.3 Container Diagram (Godot Bridge)

```
┌────────────────────────────────────────────────────────────────────┐
│                    Godot 4.6 Bridge (GDScript)                     │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  HTTP Server Layer                           │ │
│  │  - HTTPServer (bind to 127.0.0.1:7777)                       │ │
│  │  - Request parser (JSON-RPC 2.0)                             │ │
│  │  - Response formatter                                        │ │
│  │  - CORS headers (localhost only)                             │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                       │
│  ┌────────────────────────▼─────────────────────────────────────┐ │
│  │                   RPC Router                                 │ │
│  │  - Method registry (Map[method_name → handler])              │ │
│  │  - Parameter validation                                      │ │
│  │  - Error code mapping (Godot → JSON-RPC)                     │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                       │
│  ┌────────────────────────▼─────────────────────────────────────┐ │
│  │                   Operation Handlers                         │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │ │
│  │  │ Scene Manager   │  │ Script Manager  │  │ Project      │ │ │
│  │  │                 │  │                 │  │ Navigator    │ │ │
│  │  │ - list_scenes   │  │ - list_scripts  │  │              │ │ │
│  │  │ - read_scene    │  │ - read_script   │  │ - get_tree   │ │ │
│  │  │ - create_scene  │  │ - modify_script │  │ - search     │ │ │
│  │  │ - modify_scene  │  │ - validate      │  │              │ │ │
│  │  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘ │ │
│  │           │                    │                   │         │ │
│  └───────────┼────────────────────┼───────────────────┼─────────┘ │
│              │                    │                   │           │
│  ┌───────────▼────────────────────▼───────────────────▼─────────┐ │
│  │                   File System Layer                          │ │
│  │  - FileAccess wrapper (error handling)                       │ │
│  │  - DirAccess wrapper (recursive listing)                     │ │
│  │  - Path validation (prevent traversal)                       │ │
│  │  - Backup manager (write operations)                         │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                       │
│  ┌────────────────────────▼─────────────────────────────────────┐ │
│  │                   Parsers & Serializers                      │ │
│  │  - TSCN parser (scene → JSON)                                │ │
│  │  - GDScript parser (basic AST, future)                       │ │
│  │  - JSON encoder/decoder                                      │ │
│  │  - Resource reference resolver                               │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │         Optional: EditorPlugin Integration                   │ │
│  │  - Scene reload trigger                                      │ │
│  │  - Editor selection sync                                     │ │
│  │  - Resource change notifications                             │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack Selection

### 2.1 Node.js MCP Server Stack

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **Runtime** | Node.js | ≥20.x LTS | Built-in fetch, performance, long-term support |
| **MCP SDK** | `@modelcontextprotocol/sdk` | Latest | Official MCP implementation, stdio transport |
| **HTTP Client** | `undici` | Latest | Native Node.js HTTP client (fastest, maintained) |
| **Schema Validation** | `zod` | ^3.x | Type-safe schemas, runtime validation, MCP standard |
| **Logging** | `pino` | ^8.x | Fastest JSON logger, structured logs, low overhead |
| **Cache** | `lru-cache` | ^10.x | Simple, fast in-memory LRU cache |
| **Web Server** | `express` | ^4.x | Sidecar UI, WebSocket upgrade, mature ecosystem |
| **WebSocket** | `ws` | ^8.x | Lightweight, RFC 6455 compliant, no Socket.IO overhead |
| **Config** | `dotenv` | ^16.x | Standard .env file loading |
| **Testing** | `vitest` | ^1.x | Fast, compatible with Vite, built-in TypeScript |
| **Type System** | TypeScript | ^5.3 | Type safety, IDE support, strict mode |

**Excluded Libraries**:
- ❌ **Socket.IO**: Too heavyweight, unnecessary features
- ❌ **Axios**: Slower than undici, legacy API
- ❌ **Winston**: Slower than pino for high-frequency logging
- ❌ **Redis**: External dependency, overkill for local caching

---

### 2.2 Godot Bridge Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Language** | GDScript | Native to Godot, no build step, easy to debug |
| **HTTP Server** | `HTTPServer` (built-in) | No dependencies, cross-platform, sufficient performance |
| **Serialization** | `JSON` (built-in) | Standard format, readable, debuggable |
| **File I/O** | `FileAccess`/`DirAccess` | Native Godot APIs, safe, well-documented |
| **Editor Integration** | `EditorPlugin` (optional) | Scene reloading, editor state sync |

**Future Considerations**:
- **GDExtension (Phase 2+)**: If GDScript HTTPServer performance insufficient (<50ms target)
- **MessagePack (Phase 2+)**: Binary serialization for large scene data
- **WebSocket Client (Phase 2+)**: Bidirectional event streaming (Godot → Node.js)

---

### 2.3 Sidecar Web UI Stack

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **CSS Framework** | Tailwind CSS | ^3.x | Utility-first, minimal bundle, JIT mode |
| **JS Framework** | Alpine.js | ^3.x | Lightweight (15KB), reactive, no build step |
| **Build Tool** | Vite | ^5.x | Fast dev server, optimized production builds |
| **HTTP Client** | `fetch` (native) | Built-in | Standard API, no dependencies |
| **WebSocket** | `WebSocket` (native) | Built-in | Real-time logs/metrics from Node.js |

**No React/Vue/Angular**: Over-engineered for simple dashboard UI. Alpine.js provides sufficient reactivity with minimal complexity.

---

## 3. Component Architecture

### 3.1 Node.js MCP Server (Internal Architecture)

#### 3.1.1 Layer Structure

```
┌────────────────────────────────────────────────────────────┐
│ Layer 1: MCP Protocol Layer (Presentation)                │
│ - Transport: StdioServerTransport                         │
│ - Schema validation: Zod schemas                          │
│ - Request parsing, response formatting                    │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│ Layer 2: Handler Layer (Application)                      │
│ - ToolHandler: Implements MCP tool protocol               │
│ - ResourceHandler: Implements MCP resource protocol       │
│ - PromptHandler: Implements MCP prompt protocol           │
│ - Routing logic, parameter mapping                        │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│ Layer 3: Service Layer (Business Logic)                   │
│ - GodotBridgeClient: HTTP communication with Godot        │
│ - CacheManager: LRU cache for frequently accessed data    │
│ - SessionManager: Track client sessions, request context  │
│ - ValidationService: Path validation, input sanitization  │
└──────────────────────┬─────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────┐
│ Layer 4: Infrastructure Layer (Cross-cutting)             │
│ - Logger: Structured logging (pino)                       │
│ - ErrorHandler: Centralized error transformation          │
│ - HealthMonitor: Godot connection health checks           │
│ - MetricsCollector: Latency, error rates, throughput     │
└────────────────────────────────────────────────────────────┘
```

#### 3.1.2 Key Components

##### GodotBridgeClient

**Responsibility**: Manage HTTP communication with Godot bridge

```typescript
class GodotBridgeClient {
  private httpClient: Agent; // undici connection pool
  private baseUrl: string = "http://127.0.0.1:7777/rpc";
  private timeout: number = 5000; // 5s default
  private retryPolicy: RetryPolicy;
  
  async call<T>(method: string, params: unknown): Promise<T> {
    // JSON-RPC 2.0 request construction
    // Retry logic (exponential backoff)
    // Error transformation (Godot errors → MCP errors)
    // Latency tracking
  }
  
  async healthCheck(): Promise<boolean> {
    // Ping Godot /health endpoint
    // Return connection status
  }
}
```

**Key Features**:
- **Connection Pooling**: Keep-alive connections (reduce handshake overhead)
- **Timeout Management**: Per-request timeouts (5s read, 10s write)
- **Retry Logic**: Exponential backoff (100ms, 200ms, 400ms) for network errors
- **Circuit Breaker**: Stop retries after 5 consecutive failures (60s cooldown)

##### CacheManager

**Responsibility**: In-memory LRU cache for frequently accessed data

```typescript
class CacheManager {
  private cache: LRUCache<string, CachedItem>;
  
  constructor(maxSize: number = 100, ttl: number = 300000) {
    // maxSize: 100 items, ttl: 5 minutes
  }
  
  get(key: string): T | undefined {
    // Return cached value if exists and not expired
  }
  
  set(key: string, value: T, ttl?: number): void {
    // Store with optional custom TTL
  }
  
  invalidate(pattern: string): void {
    // Invalidate cache entries matching pattern (e.g., "scenes/*")
  }
}
```

**Cache Keys**:
- `scene:<path>`: Scene file content
- `script:<path>`: Script file content
- `project:structure`: Full project tree
- `search:<query>`: Search results

**Invalidation Strategy**:
- Invalidate on write operations (e.g., `modify_scene` clears `scene:*`)
- Manual invalidation via Sidecar UI
- TTL-based expiration (5 minutes default)

##### SessionManager

**Responsibility**: Track MCP client sessions and request context

```typescript
class SessionManager {
  private sessions: Map<string, ClientSession>;
  
  registerClient(clientId: string, metadata: ClientMetadata): void {
    // Create session with correlation ID, start time
  }
  
  getContext(clientId: string): RequestContext {
    // Return session metadata for request tracing
  }
  
  recordRequest(clientId: string, request: McpRequest): void {
    // Log request for observability dashboard
  }
}
```

**Session Data**:
- Client ID (from MCP client_info)
- Connection timestamp
- Request history (last 100 requests)
- Active request count (for rate limiting in Phase 2)

---

### 3.2 Godot Bridge Architecture

#### 3.2.1 Core Components

##### HTTPServer (Entry Point)

```gdscript
class_name MCPBridgeServer
extends Node

var http_server: HTTPServer
var request_router: RPCRouter
const PORT: int = 7777

func _ready() -> void:
    http_server = HTTPServer.new()
    http_server.register_handler("/rpc", _handle_rpc_request)
    http_server.register_handler("/health", _handle_health_check)
    
    var error = http_server.listen(PORT, "127.0.0.1")
    if error != OK:
        push_error("Failed to start MCP bridge: %s" % error)
    else:
        print("[MCP Bridge] Listening on http://127.0.0.1:%d" % PORT)

func _handle_rpc_request(request: HTTPRequest) -> Dictionary:
    var body := request.get_body_as_text()
    var rpc_request := JSON.parse_string(body)
    
    # Validate JSON-RPC 2.0 format
    if not _validate_jsonrpc(rpc_request):
        return _error_response(-32600, "Invalid Request")
    
    # Route to handler
    var result = request_router.call_method(
        rpc_request["method"],
        rpc_request.get("params", {})
    )
    
    return {
        "jsonrpc": "2.0",
        "id": rpc_request.get("id"),
        "result": result
    }
```

##### RPCRouter (Method Dispatcher)

```gdscript
class_name RPCRouter

var _handlers: Dictionary = {}

func register_handler(method: String, handler: Callable) -> void:
    _handlers[method] = handler

func call_method(method: String, params: Variant) -> Variant:
    if not _handlers.has(method):
        return _error(-32601, "Method not found: %s" % method)
    
    var handler: Callable = _handlers[method]
    var start_time := Time.get_ticks_msec()
    
    var result = handler.call(params)
    
    var duration := Time.get_ticks_msec() - start_time
    _log_metrics(method, duration)
    
    return result

func _error(code: int, message: String) -> Dictionary:
    return {"error": {"code": code, "message": message}}
```

##### SceneManager (Scene Operations)

```gdscript
class_name SceneManager

func list_scenes(params: Dictionary) -> Array:
    var base_path: String = params.get("path", "res://")
    var recursive: bool = params.get("recursive", true)
    
    var scenes: Array = []
    _scan_directory(base_path, recursive, func(file_path: String):
        if file_path.ends_with(".tscn"):
            scenes.append({
                "path": file_path,
                "name": file_path.get_file(),
                "size": FileAccess.get_file_as_bytes(file_path).size()
            })
    )
    return scenes

func read_scene(params: Dictionary) -> Dictionary:
    var path: String = params["path"]
    
    # Validate path (prevent traversal)
    if not _is_valid_path(path):
        return _error(-32602, "Invalid path")
    
    # Read .tscn file
    var file := FileAccess.open(path, FileAccess.READ)
    if not file:
        return _error(-32001, "File not found: %s" % path)
    
    var content := file.get_as_text()
    file.close()
    
    # Parse TSCN format (basic)
    var parsed := _parse_tscn(content)
    
    return {
        "path": path,
        "content": content,
        "parsed": parsed  # Optional structured representation
    }

func modify_scene(params: Dictionary) -> Dictionary:
    var path: String = params["path"]
    var content: String = params["content"]
    
    # Backup original file
    _backup_file(path)
    
    # Write new content
    var file := FileAccess.open(path, FileAccess.WRITE)
    if not file:
        return _error(-32002, "Failed to write file: %s" % path)
    
    file.store_string(content)
    file.close()
    
    # Trigger editor reload (if plugin active)
    if Engine.is_editor_hint():
        EditorInterface.get_resource_filesystem().scan()
    
    return {"success": true, "path": path}
```

**Error Codes** (Custom Range -32001 to -32099):
- `-32001`: File not found
- `-32002`: File write error
- `-32003`: Parse error
- `-32004`: Invalid scene structure
- `-32005`: Path traversal attempt

##### Validation & Security

```gdscript
func _is_valid_path(path: String) -> bool:
    # Must start with res://
    if not path.begins_with("res://"):
        return false
    
    # No parent directory traversal
    if ".." in path:
        return false
    
    # Within project directory
    var project_dir := ProjectSettings.globalize_path("res://")
    var absolute_path := ProjectSettings.globalize_path(path)
    
    return absolute_path.begins_with(project_dir)

func _backup_file(path: String) -> void:
    var backup_path := path + ".bak"
    DirAccess.copy_absolute(path, backup_path)
```

---

### 3.3 Sidecar Web UI Architecture

#### 3.3.1 Page Structure

```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <title>Godot MCP Server Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body x-data="dashboard()" x-init="init()">
    <!-- Status Header -->
    <header class="bg-gray-800 text-white p-4">
        <div class="flex justify-between items-center">
            <h1 class="text-2xl font-bold">Godot MCP Server</h1>
            <div class="flex gap-4 items-center">
                <span :class="statusColor" class="px-3 py-1 rounded-full text-sm">
                    <span x-text="status"></span>
                </span>
                <button @click="toggleServer()" 
                        :disabled="loading"
                        class="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">
                    <span x-text="serverRunning ? 'Stop' : 'Start'"></span>
                </button>
            </div>
        </div>
    </header>

    <!-- Tabs -->
    <nav class="bg-gray-700 text-white flex gap-4 p-2">
        <button @click="activeTab = 'overview'" 
                :class="activeTab === 'overview' ? 'bg-gray-600' : ''"
                class="px-4 py-2 rounded">Overview</button>
        <button @click="activeTab = 'connections'" 
                :class="activeTab === 'connections' ? 'bg-gray-600' : ''"
                class="px-4 py-2 rounded">Connections</button>
        <button @click="activeTab = 'logs'" 
                :class="activeTab === 'logs' ? 'bg-gray-600' : ''"
                class="px-4 py-2 rounded">Logs</button>
        <button @click="activeTab = 'tools'" 
                :class="activeTab === 'tools' ? 'bg-gray-600' : ''"
                class="px-4 py-2 rounded">Tools</button>
    </nav>

    <!-- Content -->
    <main class="p-6">
        <!-- Overview Tab -->
        <div x-show="activeTab === 'overview'" class="space-y-6">
            <!-- Metrics Cards -->
            <div class="grid grid-cols-4 gap-4">
                <div class="bg-gray-800 p-4 rounded-lg">
                    <h3 class="text-gray-400 text-sm">Latency (p99)</h3>
                    <p class="text-3xl font-bold text-white" x-text="metrics.latency_p99 + 'ms'"></p>
                </div>
                <!-- More metric cards... -->
            </div>
            
            <!-- Connection Graph -->
            <div class="bg-gray-800 p-4 rounded-lg">
                <h3 class="text-lg font-semibold mb-4">Request Rate</h3>
                <canvas id="requestChart"></canvas>
            </div>
        </div>

        <!-- Logs Tab -->
        <div x-show="activeTab === 'logs'" class="space-y-4">
            <div class="flex gap-4">
                <select x-model="logLevel" class="px-4 py-2 bg-gray-800 rounded">
                    <option value="all">All Levels</option>
                    <option value="error">Errors Only</option>
                    <option value="warn">Warnings+</option>
                </select>
                <button @click="clearLogs()" class="px-4 py-2 bg-red-600 rounded">Clear</button>
            </div>
            
            <div class="bg-gray-900 p-4 rounded font-mono text-sm h-96 overflow-auto">
                <template x-for="log in filteredLogs" :key="log.id">
                    <div :class="getLogColor(log.level)" class="mb-1">
                        <span class="text-gray-500" x-text="log.timestamp"></span>
                        <span class="font-bold" x-text="log.level"></span>
                        <span x-text="log.message"></span>
                    </div>
                </template>
            </div>
        </div>
    </main>
</body>
</html>
```

#### 3.3.2 Alpine.js Store

```javascript
function dashboard() {
    return {
        activeTab: 'overview',
        status: 'disconnected',
        serverRunning: false,
        loading: false,
        metrics: {
            latency_p99: 0,
            request_rate: 0,
            error_rate: 0,
            connections: 0
        },
        logs: [],
        logLevel: 'all',
        ws: null,
        
        init() {
            this.connectWebSocket();
            this.fetchStatus();
            setInterval(() => this.fetchStatus(), 5000);
        },
        
        connectWebSocket() {
            this.ws = new WebSocket('ws://localhost:3001/ws');
            
            this.ws.onopen = () => {
                this.status = 'connected';
            };
            
            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === 'log') {
                    this.logs.unshift(data.payload);
                    if (this.logs.length > 1000) this.logs.pop();
                } else if (data.type === 'metrics') {
                    this.metrics = data.payload;
                }
            };
            
            this.ws.onclose = () => {
                this.status = 'disconnected';
                setTimeout(() => this.connectWebSocket(), 5000);
            };
        },
        
        async fetchStatus() {
            try {
                const response = await fetch('http://localhost:3001/api/status');
                const data = await response.json();
                this.serverRunning = data.running;
                this.metrics = data.metrics;
            } catch (error) {
                console.error('Failed to fetch status:', error);
            }
        },
        
        async toggleServer() {
            this.loading = true;
            try {
                const endpoint = this.serverRunning ? 'stop' : 'start';
                await fetch(`http://localhost:3001/api/${endpoint}`, { method: 'POST' });
                await this.fetchStatus();
            } finally {
                this.loading = false;
            }
        },
        
        get statusColor() {
            return {
                'bg-green-600': this.status === 'connected',
                'bg-red-600': this.status === 'disconnected',
                'bg-yellow-600': this.status === 'connecting'
            };
        },
        
        get filteredLogs() {
            if (this.logLevel === 'all') return this.logs;
            const levels = { error: 0, warn: 1, info: 2, debug: 3 };
            const threshold = levels[this.logLevel];
            return this.logs.filter(log => levels[log.level] <= threshold);
        },
        
        clearLogs() {
            this.logs = [];
        },
        
        getLogColor(level) {
            return {
                'text-red-400': level === 'error',
                'text-yellow-400': level === 'warn',
                'text-blue-400': level === 'info',
                'text-gray-400': level === 'debug'
            };
        }
    };
}
```

---

## 4. Data Flow & Sequence Diagrams

### 4.1 Tool Invocation Flow (read_scene)

```
┌────────┐      ┌──────────┐      ┌─────────────┐      ┌──────────┐
│VS Code │      │ Node.js  │      │   Godot     │      │   File   │
│  MCP   │      │ MCP      │      │   Bridge    │      │  System  │
│ Client │      │ Server   │      │  (GDScript) │      │          │
└───┬────┘      └────┬─────┘      └──────┬──────┘      └────┬─────┘
    │                │                   │                   │
    │ 1. Call tool   │                   │                   │
    │ read_scene     │                   │                   │
    │ (stdio)        │                   │                   │
    ├───────────────>│                   │                   │
    │  5-10ms        │                   │                   │
    │                │ 2. Validate       │                   │
    │                │    & Route        │                   │
    │                │                   │                   │
    │                │ 3. HTTP POST      │                   │
    │                │    /rpc           │                   │
    │                ├──────────────────>│                   │
    │                │  10-20ms          │                   │
    │                │                   │ 4. Parse JSON-RPC │
    │                │                   │                   │
    │                │                   │ 5. Validate path  │
    │                │                   │                   │
    │                │                   │ 6. Read file      │
    │                │                   ├──────────────────>│
    │                │                   │  5-15ms           │
    │                │                   │                   │
    │                │                   │ 7. File content   │
    │                │                   │<──────────────────┤
    │                │                   │                   │
    │                │                   │ 8. Parse TSCN     │
    │                │                   │    (optional)     │
    │                │                   │  10-30ms          │
    │                │                   │                   │
    │                │ 9. HTTP 200       │                   │
    │                │    (JSON result)  │                   │
    │                │<──────────────────┤                   │
    │                │  10-20ms          │                   │
    │                │                   │                   │
    │                │ 10. Cache result  │                   │
    │                │                   │                   │
    │ 11. MCP        │                   │                   │
    │     response   │                   │                   │
    │<───────────────┤                   │                   │
    │  5-10ms        │                   │                   │
    │                │                   │                   │

Total latency: 45-105ms (within <50ms p99 target with optimization)
```

**Latency Breakdown**:
- stdio transport: 5-10ms
- Node.js processing: 5-10ms
- HTTP request: 10-20ms
- Godot processing: 5-10ms
- File I/O: 5-15ms
- Parsing: 10-30ms (optional, can be deferred)
- HTTP response: 10-20ms
- stdio response: 5-10ms

**Optimization Strategies**:
1. **Cache parsed scenes** (reduce parsing overhead)
2. **Keep-alive connections** (reduce HTTP handshake)
3. **Defer heavy parsing** (return raw content, parse on-demand)
4. **Connection pooling** (reuse HTTP connections)

---

### 4.2 Write Operation Flow (modify_scene)

```
┌────────┐      ┌──────────┐      ┌─────────────┐      ┌──────────┐
│VS Code │      │ Node.js  │      │   Godot     │      │   File   │
│        │      │          │      │   Bridge    │      │  System  │
└───┬────┘      └────┬─────┘      └──────┬──────┘      └────┬─────┘
    │                │                   │                   │
    │ 1. modify_scene│                   │                   │
    ├───────────────>│                   │                   │
    │                │ 2. Validate       │                   │
    │                │    input          │                   │
    │                │                   │                   │
    │                │ 3. HTTP POST      │                   │
    │                ├──────────────────>│                   │
    │                │                   │ 4. Validate path  │
    │                │                   │                   │
    │                │                   │ 5. Backup file    │
    │                │                   ├──────────────────>│
    │                │                   │<──────────────────┤
    │                │                   │                   │
    │                │                   │ 6. Write file     │
    │                │                   ├──────────────────>│
    │                │                   │  20-50ms          │
    │                │                   │<──────────────────┤
    │                │                   │                   │
    │                │                   │ 7. Verify write   │
    │                │                   │                   │
    │                │                   │ 8. Trigger reload │
    │                │                   │    (EditorPlugin) │
    │                │                   │                   │
    │                │ 9. Success        │                   │
    │                │<──────────────────┤                   │
    │                │                   │                   │
    │                │ 10. Invalidate    │                   │
    │                │     cache         │                   │
    │                │                   │                   │
    │ 11. Response   │                   │                   │
    │<───────────────┤                   │                   │
    │                │                   │                   │

Total latency: 60-180ms (within <200ms target)
```

**Safety Mechanisms**:
1. **Automatic backups** (`.bak` files before writes)
2. **Validation** (schema validation, path checking)
3. **Atomic writes** (write to temp file, then rename)
4. **Rollback support** (restore from backup on failure)
5. **Cache invalidation** (clear stale data)

---

### 4.3 Error Propagation Flow

```
┌────────┐      ┌──────────┐      ┌─────────────┐
│VS Code │      │ Node.js  │      │   Godot     │
└───┬────┘      └────┬─────┘      └──────┬──────┘
    │                │                   │
    │ 1. Invalid     │                   │
    │    request     │                   │
    ├───────────────>│                   │
    │                │ 2. Schema         │
    │                │    validation     │
    │                │    fails          │
    │                │                   │
    │ 3. MCP Error   │                   │
    │    -32602      │                   │
    │<───────────────┤                   │
    │                │                   │
    │ 4. Valid       │                   │
    │    request     │                   │
    ├───────────────>│                   │
    │                │ 5. HTTP POST      │
    │                ├──────────────────>│
    │                │                   │ 6. File not found
    │                │                   │
    │                │ 7. JSON-RPC Error │
    │                │    -32001         │
    │                │<──────────────────┤
    │                │                   │
    │                │ 8. Transform      │
    │                │    to MCP error   │
    │                │                   │
    │ 9. MCP Error   │                   │
    │    with context│                   │
    │<───────────────┤                   │
    │                │                   │
```

**Error Code Mapping**:

| Godot Error | JSON-RPC Code | MCP Error Code | Description |
|-------------|---------------|----------------|-------------|
| File not found | -32001 | -32001 | Resource not found |
| Write failed | -32002 | -32603 | Internal error |
| Parse error | -32003 | -32700 | Parse error |
| Invalid structure | -32004 | -32602 | Invalid params |
| Path traversal | -32005 | -32602 | Invalid params |

**Error Response Structure**:
```json
{
  "jsonrpc": "2.0",
  "id": "req-123",
  "error": {
    "code": -32001,
    "message": "File not found",
    "data": {
      "path": "scenes/NonExistent.tscn",
      "suggestion": "Check file path or use list_scenes to browse available scenes"
    }
  }
}
```

---

### 4.4 Caching Strategy

```
┌────────┐      ┌──────────┐      ┌─────────────┐
│ Client │      │   Cache  │      │   Godot     │
└───┬────┘      └────┬─────┘      └──────┬──────┘
    │                │                   │
    │ 1. read_scene  │                   │
    ├───────────────>│                   │
    │                │ 2. Check cache    │
    │                │    (cache miss)   │
    │                │                   │
    │                │ 3. Forward request│
    │                ├──────────────────>│
    │                │                   │
    │                │ 4. Response       │
    │                │<──────────────────┤
    │                │                   │
    │                │ 5. Store in cache │
    │                │    (TTL: 5min)    │
    │                │                   │
    │ 6. Response    │                   │
    │<───────────────┤                   │
    │                │                   │
    │ 7. read_scene  │                   │
    │    (same path) │                   │
    ├───────────────>│                   │
    │                │ 8. Check cache    │
    │                │    (cache hit)    │
    │                │                   │
    │ 9. Response    │                   │
    │    (cached)    │                   │
    │<───────────────┤                   │
    │  <5ms          │                   │
    │                │                   │
    │ 10. modify_scene                   │
    ├───────────────>│                   │
    │                │ 11. Invalidate    │
    │                │     cache         │
    │                │                   │
    │                │ 12. Forward       │
    │                ├──────────────────>│
    │                │                   │
```

**Cache Policies**:
- **Read Operations**: Cache for 5 minutes
- **Project Structure**: Cache for 10 minutes (rarely changes)
- **Search Results**: Cache for 2 minutes (query-dependent)
- **Write Operations**: Invalidate related cache entries

**Cache Key Strategy**:
```typescript
const cacheKey = `${operation}:${normalizedPath}:${hash(params)}`;
// Examples:
// "scene:res://scenes/MainMenu.tscn"
// "script:res://scripts/Player.gd"
// "search:res://:query:enemy:recursive:true"
```

---

## 5. Scalability & Performance

### 5.1 Performance Targets

| Metric | Target | MVP | Phase 2 | Measurement |
|--------|--------|-----|---------|-------------|
| **Read latency (p50)** | <30ms | <40ms | <20ms | End-to-end tool call |
| **Read latency (p99)** | <50ms | <70ms | <40ms | End-to-end tool call |
| **Write latency (p99)** | <200ms | <250ms | <150ms | Including backup/validation |
| **Throughput** | 100 req/s | 50 req/s | 200 req/s | Sustained load |
| **Memory (Node.js)** | <100MB | <150MB | <80MB | Resident set size |
| **Memory (Godot)** | <50MB | <80MB | <40MB | Bridge overhead |
| **Startup time** | <3s | <5s | <2s | Server ready state |
| **Connection time** | <5s | <8s | <3s | Node.js → Godot ready |

### 5.2 Connection Pooling (HTTP)

**Node.js undici Agent**:
```typescript
import { Agent, request } from 'undici';

const agent = new Agent({
  connections: 10,           // Max connections per origin
  pipelining: 1,             // Disable pipelining (HTTP/1.1)
  keepAliveTimeout: 60000,   // 60s keep-alive
  keepAliveMaxTimeout: 120000 // 120s max keep-alive
});

// All requests reuse connections
const response = await request('http://127.0.0.1:7777/rpc', {
  method: 'POST',
  body: JSON.stringify(rpcRequest),
  headers: { 'Content-Type': 'application/json' },
  dispatcher: agent  // Use pooled agent
});
```

**Benefits**:
- **Reduced latency**: Skip TCP handshake (save 5-10ms per request)
- **Lower overhead**: Reuse sockets, reduce kernel context switches
- **Better throughput**: Concurrent requests use separate connections

---

### 5.3 Request Batching (Phase 2)

**Batch API** (Future Enhancement):
```json
{
  "jsonrpc": "2.0",
  "id": "batch-1",
  "method": "batch",
  "params": {
    "requests": [
      {"method": "read_scene", "params": {"path": "res://scenes/Level1.tscn"}},
      {"method": "read_scene", "params": {"path": "res://scenes/Level2.tscn"}},
      {"method": "list_scripts", "params": {"path": "res://scripts/"}}
    ]
  }
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "id": "batch-1",
  "result": {
    "responses": [
      {"id": 0, "result": {...}},
      {"id": 1, "result": {...}},
      {"id": 2, "result": {...}}
    ],
    "total_time_ms": 45
  }
}
```

**Benefits**:
- **Reduced round-trips**: 1 HTTP request instead of N
- **Better caching**: Batch-level cache key
- **Atomic operations**: All succeed or all fail (optional)

---

### 5.4 Concurrency Model

**Node.js (Single-threaded Event Loop)**:
- **I/O operations**: Asynchronous (await fetch, file reads via Godot)
- **CPU-bound operations**: Offload to worker threads (future: scene parsing)
- **Max concurrent requests**: Limited by Godot capacity (~50 concurrent)

**Godot (Single-threaded Main Thread)**:
- **HTTPServer**: Single-threaded request handling
- **Mutex protection**: Not needed (GDScript runs on main thread)
- **Queue depth**: Max 100 pending requests (reject with 503 if exceeded)

**Rate Limiting** (Phase 2):
```typescript
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  checkLimit(clientId: string, limit: number = 100, window: number = 60000): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(clientId) || [];
    
    // Remove old timestamps
    const recent = timestamps.filter(t => now - t < window);
    
    if (recent.length >= limit) {
      return false; // Rate limit exceeded
    }
    
    recent.push(now);
    this.requests.set(clientId, recent);
    return true;
  }
}
```

---

### 5.5 Resource Limits

**Node.js Process**:
```bash
# Limit memory usage
node --max-old-space-size=512 server.js  # 512MB heap
```

**Godot Bridge** (GDScript):
```gdscript
const MAX_REQUEST_SIZE: int = 10 * 1024 * 1024  # 10MB
const MAX_RESPONSE_SIZE: int = 50 * 1024 * 1024 # 50MB
const MAX_PENDING_REQUESTS: int = 100

func _handle_request(request: HTTPRequest) -> void:
    if request.body_size > MAX_REQUEST_SIZE:
        return _error_response(413, "Request too large")
    
    if _pending_requests >= MAX_PENDING_REQUESTS:
        return _error_response(503, "Server overloaded, retry later")
```

---

## 6. Deployment Architecture

### 6.1 Package Structure

```
godot-mcp-server/
├── package.json                    # Node.js dependencies
├── tsconfig.json                   # TypeScript configuration
├── .env.example                    # Environment template
├── README.md                       # Installation guide
├── LICENSE                         # MIT License
│
├── src/                            # Node.js MCP Server
│   ├── index.ts                    # Entry point
│   ├── server/
│   │   ├── mcp-server.ts           # MCP SDK setup
│   │   ├── handlers/               # Tool/Resource/Prompt handlers
│   │   ├── services/               # Business logic
│   │   └── infrastructure/         # Logging, config, etc.
│   ├── web/
│   │   ├── app.ts                  # Express server
│   │   ├── routes/                 # API routes
│   │   └── static/                 # Sidecar UI files
│   │       ├── index.html
│   │       ├── styles.css (Tailwind)
│   │       └── app.js (Alpine.js)
│   └── types/                      # TypeScript definitions
│
├── godot-bridge/                   # Godot 4.6 Bridge
│   ├── plugin.cfg                  # EditorPlugin metadata (optional)
│   ├── mcp_bridge.gd               # Autoload singleton
│   ├── http_server.gd              # HTTPServer wrapper
│   ├── rpc_router.gd               # Method dispatcher
│   ├── handlers/
│   │   ├── scene_manager.gd
│   │   ├── script_manager.gd
│   │   └── project_navigator.gd
│   └── utils/
│       ├── file_utils.gd
│       └── validation.gd
│
├── tests/                          # Test suites
│   ├── unit/                       # Unit tests (Vitest)
│   ├── integration/                # Integration tests
│   └── godot/                      # GDScript tests (GUT)
│
├── docs/                           # Documentation
│   ├── getting-started.md
│   ├── api-reference.md
│   ├── architecture.md (this doc)
│   └── troubleshooting.md
│
└── scripts/                        # Build/deployment scripts
    ├── install.ps1                 # Windows installer
    ├── install.sh                  # Unix installer
    └── build.js                    # Production build
```

---

### 6.2 Installation Process

#### Step 1: Node.js Server Installation

```bash
# Clone repository
git clone https://github.com/your-org/godot-mcp-server.git
cd godot-mcp-server

# Install dependencies
npm install

# Build TypeScript
npm run build

# Configure environment
cp .env.example .env
# Edit .env: GODOT_BRIDGE_URL=http://127.0.0.1:7777

# Test server
npm test

# Run server (development)
npm run dev

# Run server (production)
npm start
```

#### Step 2: VS Code MCP Configuration

**Add to VS Code settings** (`.vscode/settings.json` or user settings):
```json
{
  "mcp.servers": {
    "godot": {
      "command": "node",
      "args": ["path/to/godot-mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Step 3: Godot Bridge Setup

**Option A: Autoload (Recommended)**
1. Copy `godot-bridge/` folder to your Godot project: `res://addons/mcp-bridge/`
2. In Godot Editor: **Project > Project Settings > Autoload**
3. Add `MCPBridge`: Path `res://addons/mcp-bridge/mcp_bridge.gd`, Enabled ✓
4. Restart Godot Editor

**Option B: EditorPlugin (Advanced)**
1. Copy `godot-bridge/` folder to `res://addons/mcp-bridge/`
2. Enable plugin: **Project > Project Settings > Plugins > MCP Bridge** ✓
3. Access via Editor menu: **Tools > MCP Bridge > Status**

#### Step 4: Verification

```bash
# Test Godot bridge (from command line)
curl http://127.0.0.1:7777/health
# Expected: {"status": "ok", "version": "1.0.0"}

# Test Node.js server
curl http://localhost:3001/api/status
# Expected: {"running": true, "godot_connected": true}

# Open Sidecar UI
open http://localhost:3001
# Should show dashboard with "Connected" status
```

---

### 6.3 Configuration Management

#### Environment Variables (.env)

```bash
# Node.js MCP Server Configuration
NODE_ENV=production              # production | development | test
LOG_LEVEL=info                   # error | warn | info | debug
LOG_FILE=./logs/mcp-server.log   # Log file path

# Godot Bridge Configuration
GODOT_BRIDGE_URL=http://127.0.0.1:7777
GODOT_HEALTH_CHECK_INTERVAL=10000  # 10 seconds
GODOT_REQUEST_TIMEOUT=5000         # 5 seconds
GODOT_RETRY_ATTEMPTS=3
GODOT_RETRY_DELAY=1000             # 1 second

# Web UI Configuration
WEB_UI_PORT=3001
WEB_UI_HOST=127.0.0.1
WEB_UI_ENABLED=true

# Cache Configuration
CACHE_MAX_SIZE=100                # Max cached items
CACHE_TTL=300000                  # 5 minutes

# Security (Phase 2)
API_KEY=                          # Optional API key
RATE_LIMIT_REQUESTS=100           # Requests per minute
RATE_LIMIT_WINDOW=60000           # 1 minute
```

#### Runtime Configuration (TypeScript)

```typescript
// src/config/index.ts
import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['production', 'development', 'test']),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']),
  godot: z.object({
    bridgeUrl: z.string().url(),
    healthCheckInterval: z.number().positive(),
    requestTimeout: z.number().positive(),
    retryAttempts: z.number().int().nonnegative(),
    retryDelay: z.number().positive()
  }),
  webUi: z.object({
    port: z.number().int().positive(),
    host: z.string(),
    enabled: z.boolean()
  }),
  cache: z.object({
    maxSize: z.number().int().positive(),
    ttl: z.number().positive()
  })
});

export const config = configSchema.parse({
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  godot: {
    bridgeUrl: process.env.GODOT_BRIDGE_URL || 'http://127.0.0.1:7777',
    healthCheckInterval: parseInt(process.env.GODOT_HEALTH_CHECK_INTERVAL || '10000'),
    requestTimeout: parseInt(process.env.GODOT_REQUEST_TIMEOUT || '5000'),
    retryAttempts: parseInt(process.env.GODOT_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.GODOT_RETRY_DELAY || '1000')
  },
  webUi: {
    port: parseInt(process.env.WEB_UI_PORT || '3001'),
    host: process.env.WEB_UI_HOST || '127.0.0.1',
    enabled: process.env.WEB_UI_ENABLED !== 'false'
  },
  cache: {
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100'),
    ttl: parseInt(process.env.CACHE_TTL || '300000')
  }
});
```

---

### 6.4 Production Deployment

#### Option 1: NPM Global Installation

```bash
# Publish to npm
npm publish

# Install globally
npm install -g @your-org/godot-mcp-server

# Run as global command
godot-mcp-server

# VS Code configuration
{
  "mcp.servers": {
    "godot": {
      "command": "godot-mcp-server"
    }
  }
}
```

#### Option 2: Standalone Executable (pkg)

```bash
# Build standalone executables
npm install -g pkg
pkg package.json

# Outputs:
# - godot-mcp-server-win-x64.exe
# - godot-mcp-server-linux-x64
# - godot-mcp-server-macos-x64

# VS Code configuration
{
  "mcp.servers": {
    "godot": {
      "command": "C:/tools/godot-mcp-server-win-x64.exe"
    }
  }
}
```

#### Option 3: Docker (Optional)

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY godot-bridge/ ./godot-bridge/

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

```bash
# Build
docker build -t godot-mcp-server .

# Run
docker run -p 3001:3001 -p 7777:7777 godot-mcp-server
```

---

## 7. Architecture Decision Records (ADRs)

### ADR-001: Communication Protocol Selection (HTTP REST for MVP)

**Status**: Accepted  
**Date**: 2026-02-03  
**Deciders**: Architecture Team

**Context**: 
Need to establish communication between Node.js MCP Server and Godot Engine. Options: HTTP REST, WebSocket, Unix Domain Sockets, Raw TCP, stdio.

**Decision**: 
Use **HTTP REST** (JSON-RPC 2.0) for MVP, with upgrade path to WebSocket in Phase 2.

**Rationale**:
- ✅ Native Godot support (HTTPServer node, no dependencies)
- ✅ Simple to implement and debug (curl, Postman, browser DevTools)
- ✅ Sufficient performance (<50ms p99 achievable with keep-alive)
- ✅ Stateless (easier error recovery, no connection management complexity)
- ✅ Standard protocol (JSON-RPC 2.0 widely supported)

**Consequences**:
- **Positive**: Fast development, easy debugging, no external dependencies
- **Negative**: Higher latency than WebSocket (acceptable trade-off for MVP)
- **Mitigation**: Use keep-alive connections, implement caching, plan WebSocket upgrade

---

### ADR-002: GDScript vs GDExtension for Bridge

**Status**: Accepted  
**Date**: 2026-02-03

**Decision**: 
Use **GDScript** for MVP, defer GDExtension to Phase 2+.

**Rationale**:
- ✅ Faster development (no C++ build toolchain)
- ✅ Easier debugging (print statements, Godot debugger)
- ✅ Sufficient performance (HTTPServer, FileAccess are native C++ under the hood)
- ✅ No platform-specific builds

**Consequences**:
- **Positive**: Rapid iteration, accessible to community contributors
- **Negative**: Slight performance overhead vs GDExtension (acceptable for MVP)
- **Mitigation**: Profile early, optimize hot paths, upgrade to GDExtension if needed

---

### ADR-003: In-Memory Cache vs Redis

**Status**: Accepted  
**Date**: 2026-02-03

**Decision**: 
Use **in-memory LRU cache** (lru-cache library), not Redis.

**Rationale**:
- ✅ Zero dependencies (no external services)
- ✅ Faster (no network overhead)
- ✅ Sufficient for single-machine use case
- ✅ Simpler deployment (no Redis installation)

**Consequences**:
- **Positive**: Simple, fast, no operational overhead
- **Negative**: Cache lost on server restart (acceptable, TTL is short anyway)
- **Note**: If distributed deployment needed (Phase 3+), reconsider Redis

---

### ADR-004: Tailwind CSS + Alpine.js vs React/Vue

**Status**: Accepted  
**Date**: 2026-02-03

**Decision**: 
Use **Tailwind CSS + Alpine.js** for Sidecar Web UI, not React/Vue/Angular.

**Rationale**:
- ✅ Lightweight (Alpine.js is 15KB, React is 100KB+)
- ✅ No build step required (CDN delivery for MVP)
- ✅ Sufficient reactivity for dashboard UI
- ✅ Follows "minimum footprint" philosophy

**Consequences**:
- **Positive**: Fast load times, simple development, no complex build tooling
- **Negative**: Less suitable for complex UIs (not needed for this project)
- **Note**: Can upgrade to React/Vue if UI complexity grows (unlikely)

---

### ADR-005: Zod for Schema Validation

**Status**: Accepted  
**Date**: 2026-02-03

**Decision**: 
Use **Zod** for runtime schema validation, not JSON Schema validators.

**Rationale**:
- ✅ TypeScript-first (type inference from schemas)
- ✅ Excellent error messages (user-friendly validation errors)
- ✅ MCP SDK recommendation (used in examples)
- ✅ Composable schemas (reusable validation logic)

**Consequences**:
- **Positive**: Type safety + runtime validation, great developer experience
- **Negative**: Adds 50KB to bundle (acceptable overhead)

---

### ADR-006: Pino for Logging

**Status**: Accepted  
**Date**: 2026-02-03

**Decision**: 
Use **Pino** for structured logging, not Winston or Bunyan.

**Rationale**:
- ✅ Fastest JSON logger (benchmarked 5x faster than Winston)
- ✅ Low overhead (critical for high-throughput server)
- ✅ Structured logs (JSON format, easy to parse)
- ✅ Child loggers (per-request context)

**Consequences**:
- **Positive**: High performance, negligible latency impact
- **Negative**: Less feature-rich than Winston (acceptable, we don't need many features)

---

### ADR-007: Undici for HTTP Client

**Status**: Accepted  
**Date**: 2026-02-03

**Decision**: 
Use **undici** for HTTP client, not Axios or node-fetch.

**Rationale**:
- ✅ Native Node.js HTTP client (maintained by Node.js core team)
- ✅ Fastest HTTP client (benchmarked faster than Axios, node-fetch)
- ✅ Modern API (async/await, streams)
- ✅ Built-in connection pooling

**Consequences**:
- **Positive**: Best performance, official Node.js support
- **Negative**: Newer library (less community resources than Axios)
- **Mitigation**: Well-documented, stable API

---

### ADR-008: No Authentication for MVP

**Status**: Accepted  
**Date**: 2026-02-03

**Decision**: 
**No authentication** for MVP (localhost-only), add API key auth in Phase 2.

**Rationale**:
- ✅ Simplifies MVP development
- ✅ Acceptable risk (server binds to 127.0.0.1, not public internet)
- ✅ Matches MCP pattern (most MCP servers run locally without auth)

**Consequences**:
- **Positive**: Faster development, no credential management
- **Negative**: Cannot use over network (acceptable for MVP)
- **Mitigation**: Document security considerations, plan API key auth for Phase 2

---

## 8. Patterns & Principles

### 8.1 Architectural Patterns

#### 8.1.1 Layered Architecture

```
┌─────────────────────────────────────────────────┐
│  Presentation Layer (MCP Protocol)              │
│  - Request/response handling                    │
│  - Schema validation                            │
└────────────────────┬────────────────────────────┘
                     │ depends on
┌────────────────────▼────────────────────────────┐
│  Application Layer (Handlers)                   │
│  - Tool/Resource/Prompt handlers                │
│  - Business logic orchestration                 │
└────────────────────┬────────────────────────────┘
                     │ depends on
┌────────────────────▼────────────────────────────┐
│  Domain Layer (Services)                        │
│  - GodotBridgeClient                            │
│  - CacheManager                                 │
│  - SessionManager                               │
└────────────────────┬────────────────────────────┘
                     │ depends on
┌────────────────────▼────────────────────────────┐
│  Infrastructure Layer                           │
│  - HTTP client, logger, config                  │
└─────────────────────────────────────────────────┘
```

**Benefits**:
- Clear separation of concerns
- Easier testing (mock lower layers)
- Flexible (swap implementations without affecting upper layers)

---

#### 8.1.2 Plugin Architecture (Future)

```typescript
// Plugin interface (Phase 2+)
interface MCPPlugin {
  name: string;
  version: string;
  
  // Lifecycle hooks
  onServerStart?(server: MCPServer): Promise<void>;
  onServerStop?(server: MCPServer): Promise<void>;
  
  // Extension points
  registerTools?(): ToolDefinition[];
  registerResources?(): ResourceDefinition[];
  registerPrompts?(): PromptDefinition[];
  
  // Middleware
  beforeRequest?(request: McpRequest): Promise<McpRequest>;
  afterResponse?(response: McpResponse): Promise<McpResponse>;
}

// Plugin registry
class PluginManager {
  private plugins: MCPPlugin[] = [];
  
  register(plugin: MCPPlugin): void {
    this.plugins.push(plugin);
  }
  
  async loadAll(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onServerStart?.(this.server);
    }
  }
}

// Example plugin
class DebugPlugin implements MCPPlugin {
  name = 'debug-tools';
  version = '1.0.0';
  
  registerTools() {
    return [
      {
        name: 'debug_scene',
        description: 'Attach debugger to running scene',
        inputSchema: z.object({
          scene_path: z.string()
        }),
        handler: async (params) => {
          // Custom debug logic
        }
      }
    ];
  }
}
```

---

### 8.2 SOLID Principles

#### Single Responsibility Principle
Each class has one reason to change:
- `GodotBridgeClient`: HTTP communication only
- `CacheManager`: Caching logic only
- `ToolHandler`: MCP tool protocol only

#### Open/Closed Principle
Open for extension, closed for modification:
- Plugin system allows new tools without modifying core
- Handler interface allows new operation types

#### Liskov Substitution Principle
Subtypes must be substitutable:
```typescript
interface ErrorHandler {
  handle(error: Error): McpError;
}

class NetworkErrorHandler implements ErrorHandler {
  handle(error: Error): McpError {
    // Network-specific logic
  }
}

class ValidationErrorHandler implements ErrorHandler {
  handle(error: Error): McpError {
    // Validation-specific logic
  }
}

// Can use any ErrorHandler implementation
function processRequest(handler: ErrorHandler) {
  try {
    // ...
  } catch (error) {
    return handler.handle(error); // Works with any implementation
  }
}
```

#### Interface Segregation Principle
Clients should not depend on unused interfaces:
```typescript
// Bad: Fat interface
interface MCPServer {
  handleTool(request: ToolRequest): Promise<ToolResponse>;
  handleResource(request: ResourceRequest): Promise<ResourceResponse>;
  handlePrompt(request: PromptRequest): Promise<PromptResponse>;
  startWebUI(): void;
  stopWebUI(): void;
  // ... many more methods
}

// Good: Segregated interfaces
interface ToolProvider {
  handleTool(request: ToolRequest): Promise<ToolResponse>;
}

interface ResourceProvider {
  handleResource(request: ResourceRequest): Promise<ResourceResponse>;
}

interface WebUIServer {
  start(): void;
  stop(): void;
}
```

#### Dependency Inversion Principle
Depend on abstractions, not concretions:
```typescript
// Abstraction
interface BridgeClient {
  call<T>(method: string, params: unknown): Promise<T>;
}

// Concrete implementations
class HTTPBridgeClient implements BridgeClient {
  async call<T>(method: string, params: unknown): Promise<T> {
    // HTTP implementation
  }
}

class WebSocketBridgeClient implements BridgeClient {
  async call<T>(method: string, params: unknown): Promise<T> {
    // WebSocket implementation
  }
}

// Handler depends on abstraction
class ToolHandler {
  constructor(private bridge: BridgeClient) {}
  
  async handleTool(request: ToolRequest): Promise<ToolResponse> {
    // Works with any BridgeClient implementation
    return this.bridge.call(request.name, request.params);
  }
}
```

---

### 8.3 Design Patterns Used

#### 8.3.1 Repository Pattern (Future)

```typescript
// Abstraction over data access
interface SceneRepository {
  findAll(path: string): Promise<SceneMetadata[]>;
  findByPath(path: string): Promise<Scene | null>;
  save(scene: Scene): Promise<void>;
  delete(path: string): Promise<void>;
}

// Implementation delegates to Godot bridge
class GodotSceneRepository implements SceneRepository {
  constructor(private bridge: BridgeClient) {}
  
  async findAll(path: string): Promise<SceneMetadata[]> {
    return this.bridge.call('list_scenes', { path });
  }
  
  async findByPath(path: string): Promise<Scene | null> {
    try {
      return await this.bridge.call('read_scene', { path });
    } catch (error) {
      if (error.code === -32001) return null; // Not found
      throw error;
    }
  }
}
```

#### 8.3.2 Factory Pattern

```typescript
class ErrorFactory {
  static fromGodotError(error: GodotError): McpError {
    const mapping: Record<number, number> = {
      [-32001]: -32001, // File not found
      [-32002]: -32603, // Internal error
      [-32003]: -32700, // Parse error
      [-32004]: -32602, // Invalid params
      [-32005]: -32602  // Invalid params
    };
    
    return {
      code: mapping[error.code] || -32603,
      message: error.message,
      data: {
        originalCode: error.code,
        godotError: error
      }
    };
  }
}
```

#### 8.3.3 Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private lastFailureTime = 0;
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

---

## 9. Technical Debt & Trade-offs

### 9.1 Planned Technical Debt (MVP)

#### 1. Simple TSCN Parsing

**Debt**: MVP uses basic text parsing, not full AST.

**Impact**: Limited scene modification capabilities (can't safely edit complex scenes).

**Mitigation Plan**: 
- Phase 2: Implement proper TSCN parser (AST-based)
- Phase 3: Consider using Godot's native parser (via GDExtension)

**Payoff Timeline**: Phase 2 (3-4 months)

---

#### 2. No Request Authentication

**Debt**: MVP has no authentication (localhost-only).

**Impact**: Cannot use over network, no multi-user support.

**Mitigation Plan**:
- Phase 2: Add API key authentication
- Phase 3: Add OAuth2 support (if needed)

**Payoff Timeline**: Phase 2 (3-4 months)

---

#### 3. In-Memory Cache Only

**Debt**: Cache lost on server restart.

**Impact**: Cold start latency, no persistent cache.

**Mitigation Plan**:
- Phase 2: Add optional Redis support
- Phase 3: Implement disk-based cache (SQLite)

**Payoff Timeline**: Phase 3 (5-6 months)

---

#### 4. Limited Error Recovery

**Debt**: Basic retry logic, no sophisticated failure handling.

**Impact**: Some edge cases may cause tool failures.

**Mitigation Plan**:
- Phase 2: Add circuit breaker pattern
- Phase 2: Implement request queue with persistence
- Phase 3: Add compensation transactions (rollback support)

**Payoff Timeline**: Phase 2-3 (3-6 months)

---

### 9.2 Accepted Trade-offs

#### 1. HTTP REST vs WebSocket

**Trade-off**: Chose HTTP REST for MVP despite higher latency.

**Rationale**: 
- Simplicity > performance for MVP
- 10-20ms latency difference acceptable
- Easier debugging and testing

**Future Path**: Upgrade to WebSocket in Phase 2 if latency becomes bottleneck.

---

#### 2. GDScript vs GDExtension

**Trade-off**: Chose GDScript despite slight performance overhead.

**Rationale**:
- Development velocity > raw performance for MVP
- GDScript performance sufficient (HTTPServer is native C++)
- Easier community contributions

**Future Path**: Rewrite hot paths in GDExtension if profiling shows need.

---

#### 3. No Godot Engine Modifications

**Trade-off**: Work within Godot's public APIs, don't modify engine source.

**Rationale**:
- Maintainability (no custom Godot builds)
- Forward compatibility (easier to support new Godot versions)
- Accessibility (users don't need custom engine)

**Consequence**: Some advanced features not possible (e.g., deep runtime inspection).

---

#### 4. Single-Project Support (MVP)

**Trade-off**: Support one Godot project at a time, not multi-project.

**Rationale**:
- Simplifies MVP implementation
- Matches typical developer workflow (one project open at a time)

**Future Path**: Add multi-project support in Phase 3 if user demand exists.

---

### 9.3 Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Godot API changes** (4.6 → 4.7) | Medium | High | Abstraction layer, version detection, compatibility matrix |
| **MCP protocol changes** | Low | High | Follow MCP SDK updates, extensive tests |
| **Performance <50ms not achievable** | Low | Medium | Early benchmarking, fallback to WebSocket/GDExtension |
| **Security vulnerabilities** | Low | High | Input validation, path sanitization, security audits |
| **Low adoption** | Medium | Medium | Comprehensive docs, demo videos, community engagement |
| **Competing projects** | Medium | Low | Differentiate on quality (reliability, docs, UI) |

---

## 10. Next Steps (Implementation Roadmap)

### Phase 1: MVP (Months 1-2)

**Week 1-2: Foundation**
- [ ] Set up Node.js project structure (TypeScript, ESLint, Vitest)
- [ ] Implement MCP server scaffolding (@modelcontextprotocol/sdk)
- [ ] Create Godot bridge GDScript files (HTTPServer, basic routing)
- [ ] Establish HTTP communication (JSON-RPC 2.0)
- [ ] Health check endpoint

**Week 3-4: Read Operations**
- [ ] Implement `list_scenes`, `list_scripts`, `get_project_structure`
- [ ] Implement `read_scene`, `read_script`
- [ ] Add caching layer (LRUCache)
- [ ] Basic error handling and logging
- [ ] Unit tests (>70% coverage)

**Week 5-6: Sidecar UI**
- [ ] Express server setup
- [ ] Static UI (Tailwind CSS + Alpine.js)
- [ ] WebSocket for real-time logs
- [ ] Status dashboard, connection list
- [ ] Log viewer with filtering

**Week 7-8: Polish & Testing**
- [ ] Integration tests (Node.js ↔ Godot)
- [ ] Performance benchmarking (<50ms p99 latency)
- [ ] Documentation (getting-started.md, API reference)
- [ ] Example project (demo workflows)
- [ ] Alpha release (internal testing)

---

### Phase 2: Production Features (Months 3-4)

- [ ] Write operations (`create_scene`, `modify_scene`, `modify_script`)
- [ ] Backup/rollback mechanism
- [ ] EditorPlugin integration (scene reloading)
- [ ] Advanced resource browser (scene tree visualization)
- [ ] Tool catalog with interactive testing
- [ ] Performance optimization (WebSocket upgrade, connection pooling)
- [ ] API key authentication
- [ ] Rate limiting
- [ ] Beta release (public testing)

---

### Phase 3: Advanced Features (Months 5-6)

- [ ] Advanced tools (`run_scene`, `debug_attach`, `execute_gdscript`)
- [ ] Binary protocol (MessagePack)
- [ ] Request batching
- [ ] Plugin ecosystem (hot-reload)
- [ ] Multi-project support
- [ ] Comprehensive documentation (VitePress)
- [ ] Security audit
- [ ] v1.0 production release

---

## Appendices

### A. Technology Versions

| Technology | Version | Release Date | LTS Until |
|------------|---------|--------------|-----------|
| Node.js | 20.x | Apr 2023 | Apr 2026 |
| TypeScript | 5.3 | Nov 2023 | N/A |
| Godot Engine | 4.6 | Expected Q1 2026 | TBD |
| MCP SDK | Latest | Ongoing | N/A |
| Zod | 3.x | Current | N/A |
| Pino | 8.x | Current | N/A |
| undici | Latest | Current | N/A |
| Express | 4.x | Current | TBD (5.x in beta) |
| Alpine.js | 3.x | Current | N/A |
| Tailwind CSS | 3.x | Current | N/A |

---

### B. Glossary

- **MCP**: Model Context Protocol—standard for AI tool integration
- **Stdio**: Standard input/output—IPC mechanism used by MCP
- **JSON-RPC 2.0**: Remote procedure call protocol using JSON
- **TSCN**: Text-based scene file format in Godot (`.tscn`)
- **GDScript**: Python-like scripting language in Godot
- **GDExtension**: C++ extension mechanism for Godot 4.x
- **LRU Cache**: Least Recently Used cache eviction policy
- **p99 Latency**: 99th percentile latency (slowest 1% of requests)
- **Circuit Breaker**: Fault tolerance pattern to prevent cascading failures
- **Sidecar**: Auxiliary service running alongside main application

---

### C. References

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [Godot 4.6 Documentation](https://docs.godotengine.org/)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [C4 Model](https://c4model.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [Alpine.js Documentation](https://alpinejs.dev/)

---

**Document Prepared By**: @software-architect  
**Review Status**: Ready for Stage 3 (API Design)  
**Next Actions**: 
1. Review architecture with team
2. Validate technology choices
3. Proceed to API design specification
4. Begin implementation planning

---

*This document is a living blueprint. Update as decisions evolve during implementation.*
