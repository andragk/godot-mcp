---
title: MCP Protocol Specification
description: Complete JSON-RPC protocol specification, error codes, and versioning strategy for the Godot MCP Server
outline: [2, 3]
---

# MCP Protocol Specification

This document provides the complete protocol specification for the Godot 4.6 MCP Server, detailing JSON-RPC 2.0 mappings, error handling, and API versioning.

---

## Protocol Architecture

### Communication Layers

The Godot MCP Server uses a three-layer architecture:

```
┌──────────────────┐                  ┌──────────────────┐
│   MCP Client     │    stdio         │   Node.js MCP    │
│  (VS Code/CLI)   │ ←──────────────→ │     Server       │
└──────────────────┘    JSON-RPC      └────────┬─────────┘
                                               │
                                               │ HTTP POST
                                               │ localhost:7777/rpc
                                               │ JSON-RPC 2.0
                                               │
                                      ┌────────▼─────────┐
                                      │  Godot Bridge    │
                                      │  HTTP Server     │
                                      └──────────────────┘
```

**Layer 1: MCP Client ↔ Node.js** (stdio)
- Transport: Standard I/O (stdin/stdout)
- Protocol: MCP JSON-RPC 2.0
- Direction: Bidirectional

**Layer 2: Node.js ↔ Godot Bridge** (HTTP)
- Transport: HTTP/1.1
- Protocol: Custom JSON-RPC 2.0
- Direction: Bidirectional
- Endpoint: `http://localhost:7777/rpc`

---

## JSON-RPC 2.0 Format

### Request Format

**Standard Request:**

```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "scene.read",
  "params": {
    "path": "res://scenes/main_menu.tscn",
    "include_metadata": true
  }
}
```

**Field Descriptions:**

- `jsonrpc` (string, required): Protocol version, always `"2.0"`
- `id` (string/number, required): Unique request identifier for correlation
- `method` (string, required): Dot-notation method name (e.g., `"scene.read"`)
- `params` (object, optional): Method parameters as key-value object

### Response Format

**Successful Response:**

```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "path": "res://scenes/main_menu.tscn",
    "nodes": [...],
    "connections": [...]
  }
}
```

**Error Response:**

```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "field": "path",
      "reason": "Path traversal detected"
    }
  }
}
```

**Field Descriptions:**

- `result` (any, mutually exclusive with `error`): Method result on success
- `error` (object, mutually exclusive with `result`): Error object on failure
  - `code` (number): Standard or custom error code
  - `message` (string): Human-readable error message
  - `data` (any, optional): Additional error context

---

## MCP Tool to Godot Method Mapping

| MCP Tool | Godot JSON-RPC Method | Godot Operations |
|----------|----------------------|------------------|
| `list_scenes` | `scene.list` | `DirAccess.get_files()`, filter `.tscn` |
| `read_scene` | `scene.read` | `FileAccess.open()`, parse TSCN |
| `create_scene` | `scene.create` | `PackedScene.new()`, save via `ResourceSaver` |
| `modify_scene` | `scene.modify` | Load, modify scene tree, save |
| `list_scripts` | `script.list` | `DirAccess.get_files()`, filter `.gd/.cs` |
| `read_script` | `script.read` | `FileAccess.open()`, read text |
| `create_script` | `script.create` | `FileAccess.open(WRITE)`, template generation |
| `modify_script` | `script.modify` | Read, apply text edits, write back |
| `get_project_structure` | `project.structure` | Recursive directory traversal |
| `search_nodes` | `scene.search_nodes` | Load scenes, traverse scene tree |
| `get_node_properties` | `scene.get_node_properties` | Load scene, access node properties |
| `rename_node` | `scene.rename_node` | Load scene, rename node, save |

---

## MCP Resource URI Mapping

| MCP Resource URI | Godot Path | Access Method |
|------------------|------------|---------------|
| `godot://scenes/main_menu.tscn` | `res://scenes/main_menu.tscn` | `ResourceLoader.load()` |
| `godot://scripts/player.gd` | `res://scripts/player.gd` | `FileAccess.open(READ)` |
| `godot://resources/theme.tres` | `res://resources/theme.tres` | `ResourceLoader.load()` |
| `godot://assets/sprites/icon.png` | `res://assets/sprites/icon.png` | Binary `FileAccess.open(READ)` |
| `godot://project.godot` | `res://project.godot` | ConfigFile API |

**URI Structure:**

```
godot://<relative-path-from-project-root>
```

**Example Transformations:**

- `godot://scenes/levels/level1.tscn` → `res://scenes/levels/level1.tscn`
- `godot://scripts/player.gd` → `res://scripts/player.gd`
- `godot://addons/my_plugin/plugin.cfg` → `res://addons/my_plugin/plugin.cfg`

---

## Error Codes

### Standard JSON-RPC Errors

| Code | Message | Description |
|------|---------|-------------|
| `-32700` | Parse error | Invalid JSON received |
| `-32600` | Invalid Request | JSON-RPC request malformed |
| `-32601` | Method not found | Method does not exist |
| `-32602` | Invalid params | Invalid method parameters |
| `-32603` | Internal error | Internal JSON-RPC error |

### Godot-Specific Errors (Custom Range: -32000 to -32099)

#### File System Errors (-32001 to -32010)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| `-32001` | `FILE_NOT_FOUND` | File does not exist | Check path, verify file exists |
| `-32002` | `PERMISSION_DENIED` | Insufficient permissions | Check file permissions, run as admin |
| `-32003` | `PATH_TRAVERSAL` | Path traversal detected | Use relative paths only |
| `-32004` | `INVALID_PATH` | Path format invalid | Validate path format |
| `-32005` | `FILE_LOCKED` | File locked by another process | Close other editors, retry |
| `-32006` | `DISK_FULL` | Insufficient disk space | Free disk space |
| `-32007` | `FILE_TOO_LARGE` | File exceeds size limit | Reduce file size |
| `-32008` | `INVALID_FILE_TYPE` | Unsupported file extension | Use supported file types |
| `-32009` | `DIRECTORY_NOT_EMPTY` | Cannot delete non-empty directory | Delete contents first |
| `-32010` | `FILE_ALREADY_EXISTS` | File exists, overwrite not allowed | Use unique name or set overwrite flag |

#### Scene Errors (-32011 to -32020)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| `-32011` | `SCENE_PARSE_ERROR` | Cannot parse .tscn file | Validate TSCN syntax |
| `-32012` | `NODE_NOT_FOUND` | Node does not exist in scene | Check node path |
| `-32013` | `INVALID_NODE_TYPE` | Invalid node type | Use valid Godot node type |
| `-32014` | `CIRCULAR_DEPENDENCY` | Circular scene dependency | Break dependency cycle |
| `-32015` | `SCENE_SAVE_ERROR` | Cannot save scene | Check permissions, disk space |
| `-32016` | `INVALID_SCENE_STRUCTURE` | Scene structure invalid | Validate scene hierarchy |
| `-32017` | `NODE_NAME_CONFLICT` | Node name already exists | Use unique node name |
| `-32018` | `MISSING_SCRIPT_RESOURCE` | Referenced script not found | Add missing script file |
| `-32019` | `INVALID_CONNECTION` | Signal connection invalid | Check signal/method names |
| `-32020` | `SCENE_INSTANCE_ERROR` | Cannot instantiate scene | Verify scene is valid |

#### Script Errors (-32021 to -32030)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| `-32021` | `SCRIPT_SYNTAX_ERROR` | GDScript syntax error | Fix syntax |
| `-32022` | `SCRIPT_PARSE_ERROR` | Cannot parse script | Validate script format |
| `-32023` | `INVALID_LINE_RANGE` | Line range out of bounds | Check line numbers |
| `-32024` | `SCRIPT_READONLY` | Script is read-only | Change file permissions |
| `-32025` | `INVALID_SCRIPT_LANGUAGE` | Unsupported script language | Use GDScript or C# |
| `-32026` | `SCRIPT_COMPILATION_ERROR` | Script fails compilation | Fix compilation errors |
| `-32027` | `CLASS_NAME_MISMATCH` | class_name does not match filename | Align class_name with file |
| `-32028` | `MISSING_EXTENDS` | Missing extends declaration | Add extends statement |

#### Validation Errors (-32031 to -32040)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| `-32031` | `INVALID_PROPERTY_VALUE` | Property value invalid | Use valid value type |
| `-32032` | `REQUIRED_FIELD_MISSING` | Required field not provided | Add required field |
| `-32033` | `TYPE_MISMATCH` | Value type does not match expected | Provide correct type |
| `-32034` | `VALUE_OUT_OF_RANGE` | Value exceeds allowed range | Use value within range |
| `-32035` | `PATTERN_MISMATCH` | Value does not match pattern | Match required pattern |
| `-32036` | `ENUM_VALUE_INVALID` | Value not in enum | Use allowed enum value |

#### Godot Engine Errors (-32041 to -32050)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| `-32041` | `GODOT_NOT_RUNNING` | Godot bridge not responding | Start Godot, enable plugin |
| `-32042` | `GODOT_VERSION_MISMATCH` | Godot version incompatible | Use Godot 4.6+ |
| `-32043` | `PROJECT_NOT_LOADED` | Godot project not loaded | Open project in Godot |
| `-32044` | `PLUGIN_NOT_ENABLED` | MCP bridge plugin disabled | Enable plugin in settings |
| `-32045` | `GODOT_TIMEOUT` | Godot operation timeout | Increase timeout, check performance |
| `-32046` | `GODOT_CRASH` | Godot engine crashed | Restart Godot, check logs |

#### Rate Limiting & Security (-32051 to -32060)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| `-32051` | `RATE_LIMIT_EXCEEDED` | Too many requests | Wait for rate limit reset |
| `-32052` | `AUTHENTICATION_FAILED` | Invalid API key | Provide valid API key |
| `-32053` | `AUTHORIZATION_FAILED` | Insufficient permissions | Request higher permissions |
| `-32054` | `INVALID_TOKEN` | Token invalid or expired | Refresh authentication token |
| `-32055` | `IP_BLOCKED` | IP address blocked | Contact administrator |

---

## Error Response Examples

### File Not Found

```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32001,
    "message": "File not found",
    "data": {
      "path": "scenes/missing_scene.tscn",
      "project_root": "res://",
      "suggestion": "Verify file exists in project directory"
    }
  }
}
```

### Path Traversal Blocked

```json
{
  "jsonrpc": "2.0",
  "id": "req-002",
  "error": {
    "code": -32003,
    "message": "Path traversal detected",
    "data": {
      "path": "../../../etc/passwd",
      "reason": "Attempted to access path outside project root",
      "allowed_prefix": "res://"
    }
  }
}
```

### Scene Parse Error

```json
{
  "jsonrpc": "2.0",
  "id": "req-003",
  "error": {
    "code": -32011,
    "message": "Scene parse error",
    "data": {
      "path": "scenes/corrupted.tscn",
      "line": 42,
      "column": 15,
      "reason": "Unexpected token '}'"
    }
  }
}
```

### Rate Limit Exceeded

```json
{
  "jsonrpc": "2.0",
  "id": "req-004",
  "error": {
    "code": -32051,
    "message": "Rate limit exceeded",
    "data": {
      "limit": 100,
      "window_seconds": 60,
      "retry_after_seconds": 45,
      "current_usage": 105
    }
  }
}
```

---

## API Versioning Strategy

### Versioning Scheme

The Godot MCP Server follows **Semantic Versioning 2.0.0** (SemVer):

```
MAJOR.MINOR.PATCH
```

- **MAJOR**: Breaking changes (incompatible API changes)
- **MINOR**: New features (backward-compatible additions)
- **PATCH**: Bug fixes (backward-compatible fixes)

**Version Header:**

All HTTP requests include a version header:

```http
POST http://localhost:7777/rpc HTTP/1.1
X-API-Version: 1.2.0
```

### Backward Compatibility Guarantees

**Within MAJOR version:**

- ✅ New optional parameters can be added
- ✅ New methods can be added
- ✅ New error codes can be added (in custom range)
- ✅ Response can include additional fields
- ❌ Required parameters cannot be removed
- ❌ Method names cannot change
- ❌ Existing error codes cannot change meaning

**Example: v1.0.0 → v1.1.0 (Compatible)**

```typescript
// v1.0.0
read_scene({ path: string })

// v1.1.0 (backward compatible)
read_scene({
  path: string,
  include_metadata?: boolean  // New optional parameter
})
```

### Deprecation Policy

**Deprecation Timeline:**

1. **Announce**: Deprecation notice in CHANGELOG (MINOR release)
2. **Warn**: Runtime warnings for 2 MINOR versions
3. **Remove**: Breaking change in next MAJOR version

**Deprecation Warning Example:**

```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {...},
  "warnings": [
    {
      "code": "DEPRECATED_PARAMETER",
      "message": "Parameter 'old_param' is deprecated, use 'new_param'",
      "deprecated_in": "1.5.0",
      "removed_in": "2.0.0"
    }
  ]
}
```

### Version Negotiation

**Client Version Header:**

```http
POST http://localhost:7777/rpc HTTP/1.1
X-Client-API-Version: 1.0.0
```

**Server Response:**

```http
HTTP/1.1 200 OK
X-Server-API-Version: 1.2.0
X-Min-Supported-Version: 1.0.0
X-Max-Supported-Version: 1.2.0
```

**Incompatible Version:**

```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32600,
    "message": "API version mismatch",
    "data": {
      "client_version": "0.9.0",
      "server_version": "1.2.0",
      "min_supported": "1.0.0",
      "upgrade_required": true
    }
  }
}
```

---

## Performance Characteristics

### Latency Targets

| Operation Type | p50 | p95 | p99 |
|---------------|-----|-----|-----|
| Read (list, read_scene) | <20ms | <40ms | <50ms |
| Write (create, modify) | <100ms | <150ms | <200ms |
| Search (search_nodes) | <50ms | <100ms | <150ms |
| Project Structure | <30ms | <60ms | <80ms |

### Throughput Targets

- **Read Operations**: 200 req/s per instance
- **Write Operations**: 50 req/s per instance
- **Concurrent Connections**: 100 simultaneous clients

### Timeout Configuration

```typescript
{
  "request_timeout_ms": 30000,      // 30s default
  "long_operation_timeout_ms": 120000, // 2min for large scenes
  "health_check_interval_ms": 5000  // 5s heartbeat
}
```

---

## Request/Response Headers

### Standard Headers

**Request:**

```http
POST /rpc HTTP/1.1
Host: localhost:7777
Content-Type: application/json
Content-Length: 256
X-Request-ID: req-abc123
X-Client-Session: session-xyz
X-API-Version: 1.0.0
X-Client-Name: VS Code MCP Client
```

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 1024
X-Request-ID: req-abc123
X-Response-Time-Ms: 12
X-Server-Version: 1.2.0
```

### Custom Headers

- `X-Request-ID`: Unique request identifier for tracing
- `X-Response-Time-Ms`: Server-side processing time
- `X-Godot-Version`: Godot Engine version
- `X-Project-Path`: Absolute project path (debugging)

---

## Related Documentation

- [API Tools Reference](/en/api/tools) - Complete tool specifications
- [Godot Bridge API](/en/api/godot-bridge) - Godot bridge endpoint details
- [Resources](/en/api/resources) - MCP resource specifications
- [Security Architecture](/en/architecture/security) - Security requirements
- [Best Practices](/en/best-practices) - API usage guidelines
