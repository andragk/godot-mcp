# Core Concepts

Understanding the architecture and protocols behind the Godot MCP Server.

---

## Model Context Protocol (MCP)

### What is MCP?

The **Model Context Protocol** is an open standard developed by Anthropic that enables Large Language Models (LLMs) to securely interact with external tools and data sources. Think of it as a standardized API that AI assistants use to:

- **Read data** from your applications (scenes, scripts, databases)
- **Invoke tools** to perform operations (create files, run tests, deploy)
- **Access resources** via structured URIs (godot://scenes/Player.tscn)

### Why MCP Matters

**Before MCP**: Each AI tool needed custom integrations. VS Code Copilot, Claude Desktop, and Cursor all used different approaches, leading to fragmentation and duplicated effort.

**With MCP**: One server implementation works with all MCP-compatible clients. Build once, use everywhere.

### Core MCP Primitives

#### 1. Tools

**Tools** are functions that AI can invoke to perform actions.

```typescript
// Tool definition
{
  name: "read_scene",
  description: "Parse a Godot scene file and return its structure",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path to .tscn file" }
    },
    required: ["path"]
  }
}

// Tool invocation
{
  "method": "tools/call",
  "params": {
    "name": "read_scene",
    "arguments": { "path": "scenes/Player.tscn" }
  }
}

// Tool result
{
  "content": [
    {
      "type": "text",
      "text": "{\"nodes\": [...], \"connections\": [...]}"
    }
  ]
}
```

**Godot MCP Server Tools** (60+):
- **Read Operations**: `list_scenes`, `read_scene`, `list_scripts`, `read_script`, `get_project_structure`, `search_nodes`
- **Write Operations**: `create_scene`, `modify_scene`, `create_script`, `modify_script`
- **Editor Control**: `launch_godot_editor`, `run_godot_project`, `stop_godot_execution`, `get_godot_version`, `list_godot_projects`, `analyze_project`
- **Resource Management**: `import_asset`, `create_resource`, `list_project_assets`, `configure_import_settings`
- **Signal System**: `create_signal`, `connect_signal`, `list_node_signals`, `disconnect_signal`
- **Physics Operations** (Godot 4.5+): `add_physics_body`, `configure_physics_properties`, `setup_collision_layers`, `create_area`
- **UI Operations**: `create_ui_element`, `apply_theme`, `setup_container_layout`, `create_menu`
- **Animation System**: `create_animation_player`, `add_animation_keyframe`, `setup_animation_tree`, `add_particle_system`
- **Debug Operations**: `run_project_debug`, `capture_debug_output`, `get_error_context`, `analyze_error`, `get_debug_documentation`
- **Documentation** (Godot 4.5+): `get_class_documentation`, `search_documentation`, `get_method_documentation`, `get_best_practices`, `check_deprecated_features`
- **UID Management** (Godot 4.4+): `get_file_uid`, `update_uid_references`
- **Validation**: `get_node_properties`, `validate_scene`

::: tip Tool Categories
Tools are organized into 12 categories covering the complete Godot development lifecycle: from launching the editor and running projects, to scene management, scripting, physics, UI, animation, debugging, and accessing official documentation.
:::

#### 2. Resources

**Resources** are data objects accessed via URI schemes.

```typescript
// Resource URI patterns
godot://scenes/MainMenu.tscn       // Scene files
godot://scripts/Player.gd          // GDScript files
godot://resources/PlayerStats.tres // Resource files

// Resource access
{
  "method": "resources/read",
  "params": {
    "uri": "godot://scenes/Player.tscn"
  }
}

// Resource metadata
{
  "uri": "godot://scenes/Player.tscn",
  "mimeType": "application/json",
  "size": 4096,
  "modifiedTime": "2026-02-04T10:30:00Z"
}
```

**Benefits of Resources**:
- **Caching**: LLMs can cache frequently accessed scenes/scripts
- **Efficient updates**: Only re-read when `modifiedTime` changes
- **Structured access**: MIME types enable proper parsing
- **Discoverability**: `resources/list` shows all available URIs

#### 3. Prompts (Future)

**Prompts** are reusable templates for common AI interactions (Phase 2 feature).

```typescript
// Example prompt template
{
  name: "debug_collision_layers",
  description: "Analyze collision layer configuration across all scenes",
  arguments: {
    expected_layers: { type: "array", items: { type: "number" } }
  }
}

// AI expands this into multi-step workflow:
// 1. list_scenes
// 2. read_scene for each
// 3. Analyze collision properties
// 4. Generate report
```

---

## Architecture Deep Dive

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Client Layer                        │
│  (VS Code, Claude Desktop, custom MCP clients)              │
└────────────────────────┬────────────────────────────────────┘
                         │ stdio (JSON-RPC over stdin/stdout)
                         │ 
┌────────────────────────▼────────────────────────────────────┐
│                  Node.js MCP Server                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ MCP Protocol │→ │ Tool Handler │→ │ HTTP Client     │  │
│  │ Adapter      │  │ (Validation) │  │ (Bridge Comms)  │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Sidecar Web UI (Port 3000)                │   │
│  │     Express.js + Alpine.js + Tailwind CSS           │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP POST localhost:7777/rpc
                         │ (JSON-RPC 2.0)
┌────────────────────────▼────────────────────────────────────┐
│                 Godot Bridge (Addon)                        │
│                                                             │
│  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │ HTTPServer      │→ │ Tool Implementation Layer        │ │
│  │ (Port 7777)     │  │ (SceneManager, ScriptManager)    │ │
│  └─────────────────┘  └──────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ Godot API (FileAccess, DirAccess)
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Godot Engine / File System                 │
│    (project.godot, *.tscn, *.gd, *.tres, *.res)            │
└─────────────────────────────────────────────────────────────┘
```

### Communication Flow

#### Read Operation Example (`read_scene`)

```
┌──────────┐                                     ┌──────────┐
│ Claude   │  1. "Read Player.tscn"              │ Node.js  │
│ Desktop  │────────────────────────────────────>│ Server   │
└──────────┘    stdio: tools/call                └────┬─────┘
                                                      │
                  2. Validate request                 │
                  3. Transform to JSON-RPC            │
                                                      │
                  ┌───────────────────────────────────┘
                  │  HTTP POST /rpc
                  │  {
                  │    "method": "scene.read",
                  │    "params": {
                  │      "path": "res://scenes/Player.tscn"
                  │    }
                  │  }
                  ▼
           ┌─────────────┐
           │   Godot     │  4. Parse .tscn file
           │   Bridge    │  5. Convert to JSON
           └──────┬──────┘  6. Return result
                  │
                  │  HTTP 200 OK
                  │  {
                  │    "result": {
                  │      "nodes": [...],
                  │      "connections": [...]
                  │    }
                  │  }
                  ▼
           ┌─────────────┐
           │   Node.js   │  7. Format as MCP response
           │   Server    │  8. Send to client
           └──────┬──────┘
                  │
                  │  stdio: result
                  ▼
           ┌─────────────┐
           │   Claude    │  9. Display to user:
           │   Desktop   │  "The Player scene has..."
           └─────────────┘
```

**Latency Breakdown**:
- MCP Client ↔ Node.js (stdio): ~5ms
- Node.js ↔ Godot (HTTP): ~10-20ms
- Godot file parsing: ~15-80ms (depends on file size)
- Total: **45-150ms** (within acceptable range for AI workflows)

#### Write Operation Example (`modify_scene`)

```
1. AI invokes modify_scene tool
2. Node.js validates:
   - Path within project directory
   - Valid node operations
   - Required fields present
3. Node.js creates backup:
   - Copy original to .godot/mcp-backups/
   - Include timestamp
4. HTTP POST to Godot bridge
5. Godot applies modifications:
   - Load scene
   - Apply node changes
   - Validate structure
   - Save to disk
6. Godot returns success/error
7. Node.js updates cache (invalidate stale data)
8. Return result to AI client
```

**Safety Mechanisms**:
- ✅ Automatic backups before all writes
- ✅ Validation before applying changes
- ✅ Atomic operations (all-or-nothing)
- ✅ Rollback capability
- ✅ Audit logging (Phase 2)

---

## Communication Patterns

### HTTP REST (Current Implementation)

**Why HTTP?**

1. **Native Godot support**: HTTPServer node, no dependencies
2. **Debuggability**: Easy to inspect with curl, Postman, browser DevTools
3. **Cross-platform**: Works on Windows, macOS, Linux
4. **Simplicity**: Standard protocol, extensive tooling
5. **Stateless**: Each request is independent, easy to scale

**JSON-RPC 2.0 Format**:

```json
// Request
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "scene.read",
  "params": {
    "path": "res://scenes/Player.tscn",
    "include_metadata": true
  }
}

// Success Response
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "path": "res://scenes/Player.tscn",
    "nodes": [...],
    "metadata": {...}
  }
}

// Error Response
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32602,
    "message": "File not found",
    "data": {
      "path": "res://scenes/Player.tscn",
      "errno": "ENOENT"
    }
  }
}
```

**Latency Profile**:
- **p50**: 15ms (median)
- **p95**: 35ms (95th percentile)
- **p99**: 50ms (99th percentile)
- **Max**: ~150ms (large scenes)

### WebSocket (Phase 2 Enhancement)

**Future bidirectional communication** for:
- **Real-time events**: Godot → Node.js (scene modified, build completed)
- **Lower latency**: 1-5ms persistent connection
- **Streaming**: Large file transfers, progressive scene parsing
- **Push notifications**: AI can subscribe to Godot events

---

## Data Models

### Scene Representation

Godot `.tscn` files are text-based scene descriptions:

```gdscript
[gd_scene load_steps=3 format=3 uid="uid://abcdef123"]

[ext_resource type="Script" path="res://scripts/Player.gd" id="1"]
[ext_resource type="Texture2D" path="res://assets/player.png" id="2"]

[node name="Player" type="CharacterBody2D"]
script = ExtResource("1")
position = Vector2(100, 200)
velocity = Vector2(0, 0)

[node name="Sprite2D" type="Sprite2D" parent="."]
texture = ExtResource("2")
```

**MCP Server JSON Representation**:

```json
{
  "metadata": {
    "path": "scenes/Player.tscn",
    "format": 3,
    "uid": "uid://abcdef123",
    "dependencies": [
      "res://scripts/Player.gd",
      "res://assets/player.png"
    ]
  },
  "nodes": [
    {
      "name": "Player",
      "type": "CharacterBody2D",
      "parent": null,
      "properties": {
        "script": "res://scripts/Player.gd",
        "position": {"x": 100, "y": 200},
        "velocity": {"x": 0, "y": 0}
      },
      "children": [
        {
          "name": "Sprite2D",
          "type": "Sprite2D",
          "properties": {
            "texture": "res://assets/player.png"
          }
        }
      ]
    }
  ],
  "connections": []
}
```

### Script Representation

GDScript files are parsed for structure:

```gdscript
class_name Player
extends CharacterBody2D

signal health_changed(new_health: int)

const MAX_SPEED: int = 300
const JUMP_FORCE: int = -600

@export var max_health: int = 100
var current_health: int = 100

func _ready() -> void:
    current_health = max_health

func take_damage(amount: int) -> void:
    current_health -= amount
    health_changed.emit(current_health)
```

**JSON Representation**:

```json
{
  "metadata": {
    "path": "scripts/Player.gd",
    "language": "GDScript",
    "lineCount": 18
  },
  "structure": {
    "className": "Player",
    "extends": "CharacterBody2D",
    "signals": [
      {
        "name": "health_changed",
        "params": [{"name": "new_health", "type": "int"}]
      }
    ],
    "constants": [
      {"name": "MAX_SPEED", "type": "int", "value": "300"},
      {"name": "JUMP_FORCE", "type": "int", "value": "-600"}
    ],
    "variables": [
      {"name": "max_health", "type": "int", "export": true, "default": "100"},
      {"name": "current_health", "type": "int", "default": "100"}
    ],
    "functions": [
      {
        "name": "_ready",
        "returnType": "void",
        "params": [],
        "lineStart": 11,
        "lineEnd": 12
      },
      {
        "name": "take_damage",
        "returnType": "void",
        "params": [{"name": "amount", "type": "int"}],
        "lineStart": 14,
        "lineEnd": 16
      }
    ]
  }
}
```

---

## Security Model

### Threat Mitigation

#### 1. Path Traversal Protection

**Threat**: Malicious AI tries to read `/etc/passwd` or `C:\Windows\System32\`

**Mitigation**:
```typescript
function validatePath(inputPath: string, projectRoot: string): boolean {
  // 1. Resolve to absolute path
  const absolute = path.resolve(projectRoot, inputPath);
  
  // 2. Normalize (remove ../,  ./, etc.)
  const normalized = path.normalize(absolute);
  
  // 3. Ensure within project directory
  if (!normalized.startsWith(projectRoot)) {
    throw new Error("Path traversal attempt detected");
  }
  
  // 4. Check for symlinks (follow and re-validate)
  const real = fs.realpathSync(normalized);
  if (!real.startsWith(projectRoot)) {
    throw new Error("Symlink points outside project");
  }
  
  return true;
}
```

#### 2. Input Validation

All tool inputs validated against JSON Schema:

```typescript
const readSceneSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      pattern: "^[a-zA-Z0-9_/-]+\\.tscn$", // Only .tscn files
      maxLength: 255
    },
    include_metadata: {
      type: "boolean"
    }
  },
  required: ["path"],
  additionalProperties: false // Reject unknown fields
};
```

#### 3. Rate Limiting (Phase 2)

Prevent resource exhaustion:

```typescript
const rateLimiter = {
  maxRequests: 100,     // 100 requests
  windowMs: 60000,      // per minute
  maxConcurrent: 10     // 10 simultaneous
};
```

#### 4. Operation Allowlisting

Only permitted operations allowed:

```typescript
const allowedOperations = [
  "scene.list", "scene.read", "scene.create", "scene.modify",
  "script.list", "script.read", "script.create", "script.modify",
  "project.structure", "node.search", "node.properties"
];

// Reject:
// - File deletions (explicit tool required)
// - Arbitrary code execution
// - System commands
```

---

## Performance Optimization

### Caching Strategy

**LRU Cache** for frequently accessed resources:

```typescript
interface CacheEntry {
  data: any;
  timestamp: number;
  checksum: string; // SHA-256 of file content
}

const cache = new LRUCache<string, CacheEntry>({
  max: 100,              // 100 items
  maxSize: 50 * 1024 * 1024, // 50MB
  ttl: 5 * 60 * 1000,    // 5 minutes
  sizeCalculation: (entry) => JSON.stringify(entry.data).length
});

// Cache key: "scene:scenes/Player.tscn"
// Invalidation: On file modification (checksum change)
```

**Cache Hit Rates** (typical):
- Scenes: 60-70% (AI re-reads frequently)
- Scripts: 40-50% (more dynamic)
- Project structure: 80-90% (rarely changes)

**Performance Gain**: 50-70% latency reduction on cache hits

### Connection Pooling

Reuse HTTP connections to Godot:

```typescript
const httpClient = new undici.Pool('http://localhost:7777', {
  connections: 10,      // Max 10 concurrent connections
  pipelining: 5,        // 5 requests per connection
  keepAliveTimeout: 60000, // 60s keep-alive
  keepAliveMaxTimeout: 600000 // 10min max
});
```

**Benefit**: Eliminates TCP handshake overhead (~5-10ms per request)

---

## Next Steps

- [See Real-World Examples](./examples.md) - AI-assisted workflows
- [Explore API Reference](./api/tools.md) - All available tools and schemas
- [Learn Best Practices](./best-practices.md) - Production optimization tips

---

::: tip Understanding MCP vs REST
MCP is a **protocol** (how clients and servers communicate).  
HTTP REST is the **transport** (how Node.js talks to Godot).  

MCP defines what tools/resources exist.  
HTTP carries the actual requests/responses.
:::

::: warning Performance Consideration
The 45-150ms latency is **acceptable** for AI workflows because:
1. LLMs take 1-5 seconds to generate responses
2. The bottleneck is AI inference, not MCP communication
3. Caching reduces repeated reads by 50-70%

For real-time applications, Phase 2 will add WebSocket support (1-5ms latency).
:::
