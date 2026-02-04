---
title: Godot Bridge JSON-RPC API
description: Complete JSON-RPC endpoint specification and method catalog for the Godot Bridge HTTP server
outline: [2, 3]
---

# Godot Bridge JSON-RPC API

The Godot Bridge exposes a JSON-RPC 2.0 API over HTTP for communication between the Node.js MCP Server and Godot Engine. This document details all available methods, request/response formats, and error codes.

## Connection Information

**Protocol:** HTTP/1.1  
**Host:** `http://localhost:7777`  
**Endpoint:** `POST /rpc`  
**Format:** JSON-RPC 2.0

**Additional Endpoints:**
- `GET /health` - Health check
- `GET /metrics` - Performance metrics

## JSON-RPC 2.0 Format

### Request Structure

```json
{
  "jsonrpc": "2.0",
  "method": "scene.read",
  "params": {
    "path": "res://scenes/MainMenu.tscn"
  },
  "id": "req-123"
}
```

**Fields:**
- `jsonrpc`: Always `"2.0"`
- `method`: Operation name (namespace.operation format)
- `params`: Method-specific parameters (object)
- `id`: Unique request identifier (string or number)

### Response Structure (Success)

```json
{
  "jsonrpc": "2.0",
  "result": {
    "nodes": [...],
    "connections": [...]
  },
  "id": "req-123"
}
```

### Response Structure (Error)

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": 404,
    "message": "File not found",
    "data": {
      "path": "res://scenes/Missing.tscn"
    }
  },
  "id": "req-123"
}
```

## Method Catalog

### Scene Operations

#### `scene.list`

**Description:** Lists all scene files in the project.

**Parameters:**
```json
{
  "directory": "scenes",      // Optional, default: ""
  "recursive": true,           // Optional, default: true
  "include_metadata": false    // Optional, default: false
}
```

**Result:**
```json
{
  "scenes": [
    {
      "path": "res://scenes/MainMenu.tscn",
      "name": "MainMenu",
      "metadata": {
        "file_size": 4096,
        "modified_time": "2026-02-03T10:30:00Z"
      }
    }
  ],
  "total_count": 1
}
```

**Error Codes:**
- `-32602`: Invalid parameters
- `404`: Directory not found
- `500`: File system error

---

#### `scene.read`

**Description:** Reads and parses a scene file.

**Parameters:**
```json
{
  "path": "res://scenes/MainMenu.tscn",
  "include_children": true,    // Optional, default: true
  "include_connections": true, // Optional, default: true
  "max_depth": 20              // Optional, default: 20
}
```

**Result:**
```json
{
  "path": "res://scenes/MainMenu.tscn",
  "root_node": {
    "name": "MainMenu",
    "type": "Control",
    "properties": {...},
    "children": [...],
    "script": "res://scripts/main_menu.gd",
    "groups": ["ui"]
  },
  "connections": [
    {
      "signal": "pressed",
      "from": "StartButton",
      "to": "MainMenu",
      "method": "_on_start_button_pressed"
    }
  ],
  "metadata": {
    "file_size": 4096,
    "modified_time": "2026-02-03T10:30:00Z",
    "node_count": 5
  }
}
```

**Error Codes:**
- `-32602`: Invalid parameters
- `404`: Scene file not found
- `500`: Parse error

---

#### `scene.create`

**Description:** Creates a new scene file.

**Parameters:**
```json
{
  "path": "res://scenes/NewScene.tscn",
  "root_node": {
    "name": "Root",
    "type": "Node2D",
    "properties": {
      "position": {"x": 0, "y": 0}
    },
    "children": [...]
  },
  "overwrite": false           // Optional, default: false
}
```

**Result:**
```json
{
  "path": "res://scenes/NewScene.tscn",
  "created": true,
  "node_count": 3,
  "message": "Scene created successfully"
}
```

**Error Codes:**
- `-32602`: Invalid parameters
- `409`: File already exists (overwrite=false)
- `500`: Write error

---

#### `scene.modify`

**Description:** Modifies an existing scene.

**Parameters:**
```json
{
  "path": "res://scenes/MainMenu.tscn",
  "operations": [
    {
      "type": "add_node",
      "parent_path": "MainMenu",
      "node": {
        "name": "NewButton",
        "type": "Button",
        "properties": {"text": "Click Me"}
      }
    },
    {
      "type": "modify_node",
      "node_path": "MainMenu/StartButton",
      "properties": {"text": "Begin Game"}
    }
  ],
  "create_backup": true        // Optional, default: true
}
```

**Result:**
```json
{
  "path": "res://scenes/MainMenu.tscn",
  "modified": true,
  "operations_applied": 2,
  "backup_path": "res://scenes/MainMenu.tscn.backup"
}
```

**Error Codes:**
- `-32602`: Invalid parameters
- `404`: Scene not found
- `422`: Invalid operation (e.g., parent doesn't exist)
- `500`: Write error

---

### Script Operations

#### `script.list`

**Description:** Lists all script files.

**Parameters:**
```json
{
  "directory": "scripts",      // Optional, default: ""
  "recursive": true,           // Optional, default: true
  "language": "all",           // Optional: "all", "gdscript", "csharp"
  "include_metadata": false    // Optional, default: false
}
```

**Result:**
```json
{
  "scripts": [
    {
      "path": "res://scripts/Player.gd",
      "name": "Player",
      "language": "gdscript",
      "metadata": {
        "file_size": 2048,
        "modified_time": "2026-02-03T09:15:00Z",
        "line_count": 85,
        "class_name": "Player"
      }
    }
  ],
  "total_count": 1
}
```

---

#### `script.read`

**Description:** Reads script file content.

**Parameters:**
```json
{
  "path": "res://scripts/Player.gd",
  "include_analysis": false    // Optional, default: false
}
```

**Result:**
```json
{
  "path": "res://scripts/Player.gd",
  "content": "extends CharacterBody2D\n\nclass_name Player\n...",
  "language": "gdscript",
  "metadata": {
    "file_size": 2048,
    "line_count": 85
  },
  "analysis": {                // If include_analysis: true
    "class_name": "Player",
    "extends": "CharacterBody2D",
    "functions": ["_physics_process", "take_damage"],
    "signals": ["health_changed"]
  }
}
```

---

#### `script.create`

**Description:** Creates a new script file.

**Parameters:**
```json
{
  "path": "res://scripts/NewScript.gd",
  "template": "node",          // Optional: "node", "resource", "tool", "custom"
  "extends": "Node",           // Optional
  "class_name": "NewScript",   // Optional
  "content": "..."             // Optional: custom content (overrides template)
}
```

**Result:**
```json
{
  "path": "res://scripts/NewScript.gd",
  "created": true,
  "line_count": 12
}
```

---

#### `script.modify`

**Description:** Modifies script content.

**Parameters:**
```json
{
  "path": "res://scripts/Player.gd",
  "operations": [
    {
      "type": "insert_line",
      "line_number": 10,
      "content": "\tprint(\"Debug message\")"
    },
    {
      "type": "replace_lines",
      "start_line": 15,
      "end_line": 18,
      "content": "\t# Refactored code\n\tvar new_var = 10"
    }
  ],
  "create_backup": true
}
```

**Result:**
```json
{
  "path": "res://scripts/Player.gd",
  "modified": true,
  "operations_applied": 2,
  "backup_path": "res://scripts/Player.gd.backup"
}
```

---

### Project Operations

#### `project.structure`

**Description:** Returns the project directory tree.

**Parameters:**
```json
{
  "max_depth": 10,             // Optional, default: 10
  "include_hidden": false,     // Optional, default: false
  "file_types": ["tscn", "gd"] // Optional: filter by extensions
}
```

**Result:**
```json
{
  "root": {
    "name": "project_root",
    "type": "directory",
    "path": "res://",
    "children": [
      {
        "name": "scenes",
        "type": "directory",
        "path": "res://scenes",
        "children": [...]
      }
    ]
  },
  "statistics": {
    "total_files": 45,
    "total_directories": 12,
    "total_size": 1048576
  }
}
```

---

#### `project.search_nodes`

**Description:** Searches for nodes across all scenes.

**Parameters:**
```json
{
  "query": {
    "name_pattern": "Player.*",  // Optional: regex
    "node_type": "CharacterBody2D", // Optional
    "has_script": true,          // Optional
    "in_group": "enemies"        // Optional
  },
  "scope": {
    "scenes": ["scenes/Level1.tscn"], // Optional: limit to scenes
    "directories": ["scenes/levels"]  // Optional: limit to dirs
  },
  "max_results": 100           // Optional, default: 100
}
```

**Result:**
```json
{
  "results": [
    {
      "scene_path": "res://scenes/Level1.tscn",
      "node_path": "Level1/Player",
      "node_name": "Player",
      "node_type": "CharacterBody2D",
      "script": "res://scripts/Player.gd",
      "groups": ["player"]
    }
  ],
  "total_matches": 1,
  "searched_scenes": 5
}
```

---

#### `project.get_node_properties`

**Description:** Gets properties for a specific node.

**Parameters:**
```json
{
  "scene_path": "res://scenes/MainMenu.tscn",
  "node_path": "MainMenu/StartButton",
  "include_inherited": false   // Optional, default: false
}
```

**Result:**
```json
{
  "node": {
    "name": "StartButton",
    "type": "Button",
    "path": "MainMenu/StartButton",
    "properties": {
      "text": "Start Game",
      "custom_minimum_size": {"x": 200, "y": 50}
    },
    "script": "res://scripts/start_button.gd",
    "groups": ["interactive"]
  }
}
```

---

## Utility Endpoints

### Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "uptime_ms": 123456,
  "godot_version": "4.6.0.stable",
  "active_requests": 0
}
```

### Metrics

**Endpoint:** `GET /metrics`

**Response:**
```json
{
  "requests": {
    "total": 1542,
    "success": 1520,
    "errors": 22
  },
  "latency": {
    "p50": 25,
    "p95": 45,
    "p99": 120
  },
  "operations": {
    "scene.read": 850,
    "script.read": 420,
    "scene.create": 15
  },
  "cache": {
    "hits": 1020,
    "misses": 522,
    "hit_rate": 0.662
  }
}
```

## Error Codes

### Standard JSON-RPC Errors

| Code | Message | Meaning |
|------|---------|---------|
| `-32700` | Parse error | Invalid JSON |
| `-32600` | Invalid Request | Missing required fields |
| `-32601` | Method not found | Unknown method |
| `-32602` | Invalid params | Parameter validation failed |
| `-32603` | Internal error | Server error |

### Application Errors

| Code | Message | Description |
|------|---------|-------------|
| `404` | Not found | File/resource does not exist |
| `409` | Conflict | File exists (overwrite=false) |
| `422` | Unprocessable | Invalid operation (e.g., circular reference) |
| `500` | Internal error | File I/O, parsing, or other server error |
| `503` | Service unavailable | Godot engine not ready |

### Error Response Example

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": 404,
    "message": "Scene file not found",
    "data": {
      "path": "res://scenes/Missing.tscn",
      "checked_paths": [
        "/absolute/path/to/project/scenes/Missing.tscn"
      ]
    }
  },
  "id": "req-123"
}
```

## Performance Characteristics

| Operation | Avg Latency | p99 Latency |
|-----------|-------------|-------------|
| `scene.list` | 30-50ms | 80ms |
| `scene.read` | 40-70ms | 110ms |
| `script.read` | 15-30ms | 50ms |
| `project.structure` | 50-100ms | 150ms |
| `search_nodes` | 100-300ms | 500ms |
| `scene.create` | 80-150ms | 200ms |
| `scene.modify` | 90-160ms | 220ms |

:::tip Performance Optimization
- Use connection pooling (keep-alive) for repeated requests
- Cache responses on Node.js side (5min TTL for reads)
- Batch operations when possible (Phase 2)
- Limit `max_depth` and `max_results` for large projects
:::

## GDScript Implementation Example

```gdscript
# http_server.gd
func rpc_handler(request: HTTPServerRequest) -> HTTPServerResponse:
	var body = request.get_body_as_string()
	var json = JSON.parse_string(body)
	
	if json == null or not json.has("method"):
		return error_response(request, -32600, "Invalid Request")
	
	var method = json["method"]
	var params = json.get("params", {})
	var id = json.get("id")
	
	# Route to handler
	var result = null
	match method:
		"scene.read":
			result = SceneManager.read_scene(params)
		"script.read":
			result = ScriptManager.read_script(params)
		_:
			return error_response(request, -32601, "Method not found: " + method)
	
	# Handle errors
	if result is GodotError:
		return error_response(request, result.code, result.message, result.data)
	
	return success_response(request, result, id)
```

## Related Documentation

- [Tools API](/en/api/tools) - MCP tool specifications
- [Resources API](/en/api/resources) - Resource URIs and metadata
- [Implementation Guide](/en/implementation/godot-bridge) - Building the HTTP server
