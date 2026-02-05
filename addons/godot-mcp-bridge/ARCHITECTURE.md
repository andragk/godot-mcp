# Godot MCP Bridge - Architecture Documentation

## Overview

The Godot MCP Bridge is a **bridging layer** that exposes Godot Editor APIs to the Model Context Protocol (MCP) server via HTTP/JSON-RPC. It follows enterprise software engineering principles to ensure maintainability, testability, and extensibility.

## Design Principles

### 1. Single Responsibility Principle (SRP)

Each class has exactly ONE reason to change:

**Core Layer**:
- `MCPLogger` - Logging and diagnostics only
  - **Why**: Centralized logging makes debugging easier and allows log level configuration

**Protocol Layer**:
- `HTTPRequestParser` - Parse raw HTTP request strings into structured data
  - **Why**: HTTP parsing is complex; isolating it allows unit testing without TCP
- `HTTPResponseBuilder` - Build HTTP response strings with proper headers
  - **Why**: Ensures consistent response format (CORS, content-type, status codes)
- `JSONRPCHandler` - JSON-RPC 2.0 protocol validation and response creation
  - **Why**: JSON-RPC has specific structure; compliance requires separate focus

**Business Logic Layer**:
- `EditorControlHandler` - Godot editor operations (launch, run, stop, version)
  - **Why**: Editor control is distinct from project discovery
- `ProjectDiscoveryHandler` - Find and analyze Godot projects
  - **Why**: Project discovery has different concerns than editor control

**Coordination Layer**:
- `http_server.gd` - TCP server lifecycle and request routing only
  - **Why**: Orchestrates components but delegates all specific work

### 2. Dependency Injection

All handlers receive dependencies via constructor:

```gdscript
# BAD: Tight coupling, hard to test
class EditorControlHandler:
    func _init():
        self.logger = MCPLogger.new()  # Creates its own logger

# GOOD: Dependency injection, easy to mock
class EditorControlHandler:
    func _init(logger: MCPLogger):
        self._logger = logger  # Receives logger from coordinator
```

**Benefits**:
- Unit tests can inject mock loggers
- Configuration changes centralized in coordinator
- Components don't know how dependencies are created

### 3. Separation of Concerns

**Three distinct layers**:

```
┌─────────────────────────────────────────┐
│     Business Logic Layer                │
│  (handlers/ directory)                  │
│  • What operations to perform           │
│  • Domain-specific logic                │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│     Protocol Layer                      │
│  (protocol/ directory)                  │
│  • How to communicate                   │
│  • HTTP/JSON-RPC parsing & building     │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│     Infrastructure Layer                │
│  (core/ directory + http_server.gd)     │
│  • TCP connection management            │
│  • Logging, error handling              │
└─────────────────────────────────────────┘
```

**Why This Matters**:
- Can change HTTP to WebSocket without touching business logic
- Can swap JSON-RPC for another protocol without changing handlers
- Can add new handlers without modifying protocol code

### 4. Fail-Fast Error Handling

Operations validate inputs immediately and return structured errors:

```gdscript
func launch_editor(project_path: String, ...) -> Dictionary:
    if project_path.is_empty():
        return _error("project_path is required")  # Fail immediately
    
    # ... rest of logic only executes if input valid
```

**Benefits**:
- Errors caught early before side effects occur
- Clear error messages for API consumers
- No silent failures or invalid state

### 5. Open/Closed Principle

**Open for extension, closed for modification**:

Adding a new handler:
1. Create new handler class in `handlers/`
2. Initialize in `http_server.gd::_initialize_handlers()`
3. Add routing in `http_server.gd::_route_rpc_method()`
4. **Zero changes to existing handlers or protocol layer**

```gdscript
# Adding a new handler doesn't require changing existing code
func _initialize_handlers():
    # ... existing handlers ...
    new_handler = NewHandler.new(logger)  # Just add new line

func _route_rpc_method(method: String, params):
    # ... existing routes ...
    elif method == "new_operation":
        return new_handler.new_operation(params)  # Just add new route
```

## Request Flow

### HTTP Request Lifecycle

```
1. TCP Connection → http_server.gd::_process()
   ↓
2. Read bytes → _handle_client_request()
   ↓
3. Parse HTTP → HTTPRequestParser::parse()
   ↓
4. Validate JSON-RPC → JSONRPCHandler::is_valid_request()
   ↓
5. Route method → _route_rpc_method()
   ↓
6. Execute handler → EditorControlHandler::launch_editor()
   ↓
7. Build response → HTTPResponseBuilder::build_json_response()
   ↓
8. Send to client → StreamPeerTCP::put_data()
```

**Why This Flow**:
- Each step is independently testable
- Clear separation between transport (TCP), protocol (HTTP/JSON-RPC), and logic (handlers)
- Easy to add logging/metrics at each step

### Error Propagation

```
Handler Error → Dictionary {"error": "message"}
   ↓
JSONRPCHandler::create_error() → JSON-RPC 2.0 error format
   ↓
HTTPResponseBuilder::build_json_response() → HTTP 200 with JSON-RPC error
   ↓
TCP send → Client receives structured error
```

**Why Return 200 for Errors**:
- JSON-RPC 2.0 spec: Transport (HTTP) and protocol (JSON-RPC) errors are separate
- HTTP 200 = "successfully received and processed request"
- JSON-RPC error code = "request had a problem"

## Why This Architecture?

### Before Refactoring (Monolithic)

```gdscript
# http_server.gd - 558 lines

func _handle_client_request(client):
    # TCP logic
    var bytes = client.get_data(...)
    
    # HTTP parsing logic (100+ lines)
    var lines = request.split("\r\n")
    var method = ...
    var path = ...
    var headers = ...
    
    # JSON-RPC parsing logic (50+ lines)
    var json = JSON.parse(...)
    if not json.has("jsonrpc") or json.jsonrpc != "2.0":
        return _error(...)
    
    # Business logic (200+ lines)
    if method == "launch_editor":
        var editor_path = ...
        var args = ...
        var pid = OS.create_process(...)
    elif method == "list_projects":
        var projects = []
        _scan_directory(search_path, projects, 0)
    # ... 6 more operations mixed in ...
    
    # HTTP response building (100+ lines)
    var response = "HTTP/1.1 200 OK\r\n"
    response += "Content-Type: application/json\r\n"
    # ... more headers ...
```

**Problems**:
- ❌ Hard to test (need full TCP server for unit tests)
- ❌ Hard to understand (mixing 5 different concerns)
- ❌ Hard to extend (adding new operation requires navigating 558 lines)
- ❌ High coupling (changing HTTP parsing might break business logic)
- ❌ No code reuse (HTTP parsing logic can't be used elsewhere)

### After Refactoring (Modular)

```gdscript
# http_server.gd - 368 lines (34% reduction)

func _handle_client_request(client):
    # TCP logic only - delegates everything else
    var bytes = client.get_data(...)
    var request = request_parser.parse(bytes.get_string_from_utf8())
    
    if not jsonrpc_handler.is_valid_request(request.body):
        var error_response = jsonrpc_handler.create_error(...)
        client.put_data(response_builder.build_json_response(200, error_response))
        return
    
    var result = _route_rpc_method(parsed_rpc.method, parsed_rpc.params)
    client.put_data(response_builder.build_json_response(200, result))
```

**Benefits**:
- ✅ Each component is unit testable
- ✅ Clear separation of concerns
- ✅ Easy to extend (add new handler, register route)
- ✅ Low coupling (protocol changes don't affect business logic)
- ✅ Code reuse (protocol components can be used in other projects)

## Testing Strategy

### Unit Testing (Future)

Each handler should have dedicated tests:

```gdscript
# tests/handlers/test_editor_control_handler.gd

func test_launch_editor_with_valid_path():
    var mock_logger = MockLogger.new()
    var handler = EditorControlHandler.new(mock_logger)
    
    var result = handler.launch_editor("/path/to/project")
    
    assert(result.success == true)
    assert(result.has("processId"))

func test_launch_editor_with_empty_path():
    var handler = EditorControlHandler.new(MockLogger.new())
    
    var result = handler.launch_editor("")
    
    assert(result.success == false)
    assert(result.error == "project_path is required")
```

### Integration Testing (Future)

Test full HTTP/JSON-RPC flow:

```gdscript
# tests/integration/test_http_bridge.gd

func test_json_rpc_launch_editor():
    var server = HTTPServer.new()
    server._ready()
    
    var request = """POST /rpc HTTP/1.1
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"launch_editor","params":{"projectPath":"/test"}}"""
    
    var response = _send_request(server, request)
    
    assert(response.contains("HTTP/1.1 200 OK"))
    assert(response.contains('"result"'))
    assert(response.contains('"processId"'))
```

### Manual Testing (Current)

1. Open Godot project with plugin enabled
2. Verify plugin loads: Output should show "HTTP server started on port 7777"
3. Test with `curl`:
   ```bash
   curl -X POST http://localhost:7777/rpc \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}'
   ```
4. Should receive: `{"jsonrpc":"2.0","id":1,"result":{"pong":"pong"}}`

## Performance Considerations

### Why TCP Server in _process()?

```gdscript
func _process(_delta: float) -> void:
    if server.is_connection_available():
        var client = server.take_connection()
        clients.append(client)
    
    for client in clients:
        if client.get_available_bytes() > 0:
            _handle_client_request(client)
```

**Godot's TCP API is non-blocking**:
- `is_connection_available()` returns immediately (no waiting)
- `get_available_bytes()` returns immediately (no blocking)
- Processing in `_process()` checks for data every frame (~60 FPS)
- No threads needed for concurrent requests

**Trade-offs**:
- ✅ Simple to implement and understand
- ✅ No threading complexity or race conditions
- ✅ Works great for low-to-moderate request rates (<100 req/sec)
- ❌ Limited concurrency (processes one request per frame)
- ❌ Not suitable for high-throughput scenarios

**Future Improvement**: For high throughput, move to threaded model with request queue.

### Memory Management

```gdscript
# WHY: Remove disconnected clients to prevent memory leaks
var i := 0
while i < clients.size():
    var client := clients[i]
    if client.get_status() == StreamPeerTCP.STATUS_CONNECTED:
        # Process client...
        i += 1
    else:
        clients.remove_at(i)  # Remove without incrementing i
```

**Pattern**: Process array in reverse or track index carefully when removing during iteration.

## Extension Guide

### Adding a New Handler

**1. Create handler class** (`handlers/new_handler.gd`):

```gdscript
extends RefCounted
class_name NewHandler

const MCPLoggerScript := preload("res://addons/godot-mcp-bridge/core/logger.gd")

var _logger: MCPLogger

func _init(logger: MCPLogger) -> void:
    _logger = logger

func new_operation(params: Dictionary) -> Dictionary:
    # Validate params
    if not params.has("required_field"):
        return {"error": "required_field is missing"}
    
    # Perform operation
    _logger.info("Performing new operation", params)
    
    # Return structured result
    return {
        "success": true,
        "result": "operation completed"
    }
```

**2. Register handler** (`http_server.gd`):

```gdscript
# Add preload
const NewHandlerScript := preload("res://addons/godot-mcp-bridge/handlers/new_handler.gd")

# Add property
var new_handler: NewHandler

# Initialize in _initialize_handlers()
func _initialize_handlers() -> void:
    # ... existing handlers ...
    new_handler = NewHandlerScript.new(logger)

# Add route in _route_rpc_method()
func _route_rpc_method(method: String, params: Dictionary):
    # ... existing routes ...
    elif method == "new_operation":
        return new_handler.new_operation(params)
```

**3. Update TypeScript client** (in main MCP server):

```typescript
// src/bridge/godot-client.ts
export class GodotClient {
    async newOperation(params: { requiredField: string }): Promise<NewOperationResult> {
        return this.call('new_operation', params);
    }
}
```

**4. Register MCP tool** (in main MCP server):

```typescript
// src/server/tool-registration.ts
server.tool(
    'new_operation',
    'Description of new operation',
    NewOperationInputSchema,
    async (params) => {
        const result = await godotClient.newOperation(params);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);
```

## Security Considerations

### Current State (Local Only)

The bridge is designed for **local development** only:

- Binds to `0.0.0.0:7777` (accessible from local network)
- No authentication required
- No rate limiting
- CORS headers allow all origins (`Access-Control-Allow-Origin: *`)

**Threat Model**: Assumes Godot editor runs on trusted developer machine.

### Future Security Enhancements

**For Remote Access**:
1. **Authentication**: API keys in Authorization header
2. **HTTPS**: TLS encryption for request/response
3. **Rate Limiting**: Prevent abuse (max requests per minute)
4. **IP Allowlist**: Only accept connections from specific IPs
5. **Input Sanitization**: Validate all paths, prevent directory traversal
6. **Audit Logging**: Log all operations with timestamps and origins

**Implementation Example**:

```gdscript
# handlers/auth_handler.gd
func validate_api_key(headers: Dictionary) -> bool:
    if not headers.has("authorization"):
        return false
    
    var auth_header = headers["authorization"]
    var expected_key = OS.get_environment("MCP_API_KEY")
    
    return auth_header == "Bearer " + expected_key
```

## Conclusion

This architecture prioritizes:

1. **Maintainability**: Clear responsibilities, easy to understand
2. **Testability**: Each component independently testable
3. **Extensibility**: Add features without modifying existing code
4. **Reliability**: Fail-fast error handling, structured responses
5. **Performance**: Non-blocking I/O, efficient request processing

The modular design ensures the codebase can grow from 8 operations to 50+ operations without becoming unmaintainable.
