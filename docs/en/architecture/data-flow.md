---
title: Data Flow Architecture
description: Request/response cycles, data transformation, caching strategies, and error propagation in the Godot MCP Server
outline: [2, 3]
---

# Data Flow Architecture

This document details how data flows through the Godot MCP Server, including request/response cycles, serialization formats, caching strategies, and error handling patterns.

## Request Flow Overview

The system uses a **synchronous request-response model** with three protocol layers:

```
┌─────────────┐                  ┌──────────────┐                  ┌─────────────┐
│  MCP Client │                  │   Node.js    │                  │   Godot     │
│  (VS Code)  │                  │  MCP Server  │                  │   Bridge    │
└──────┬──────┘                  └──────┬───────┘                  └──────┬──────┘
       │                                │                                 │
       │  1. MCP Tool Request (stdio)   │                                 │
       │  JSON-RPC over stdio           │                                 │
       │───────────────────────────────>│                                 │
       │                                │                                 │
       │                                │  2. HTTP POST (JSON-RPC 2.0)    │
       │                                │  to localhost:7777/rpc          │
       │                                │────────────────────────────────>│
       │                                │                                 │
       │                                │                           3. File I/O
       │                                │                           Parse .tscn
       │                                │                                 │
       │                                │  4. HTTP 200 (JSON response)    │
       │                                │<────────────────────────────────│
       │                                │                                 │
       │     5. MCP Response            │                                 │
       │<───────────────────────────────│                                 │
       │                                │                                 │
```

## Data Models

### Scene Data Model

Scenes are parsed from Godot's `.tscn` text format into structured JSON:

```typescript
interface SceneData {
  metadata: {
    path: string;              // "scenes/MainMenu.tscn"
    format: number;            // Godot format version (e.g., 3)
    modified: string;          // ISO 8601 timestamp
    size: number;              // File size in bytes
    dependencies: string[];    // External resources referenced
  };
  root: SceneNode;
}

interface SceneNode {
  name: string;                // "MainMenu"
  type: string;                // "Control", "CharacterBody2D", etc.
  parent: string | null;       // Parent node name (null for root)
  instance: string | null;     // Path to instanced scene
  properties: Record<string, any>;
  children: SceneNode[];
  scripts: string[];           // Attached script paths
}
```

### Script Data Model

Scripts are represented with content and optional structural metadata:

```typescript
interface ScriptData {
  metadata: {
    path: string;              // "scripts/Player.gd"
    language: "GDScript" | "C#";
    modified: string;
    size: number;
    lineCount: number;
  };
  content: string;             // Raw script content
  structure?: {                // Optional: extracted in Phase 2
    className: string | null;
    extends: string | null;
    signals: SignalDef[];
    functions: FunctionDef[];
  };
}
```

### Project Structure Model

Hierarchical representation of the project directory:

```typescript
interface ProjectStructure {
  projectPath: string;         // Absolute path to project root
  projectName: string;         // From project.godot
  godotVersion: string;        // "4.6.0"
  tree: FileNode;
}

interface FileNode {
  name: string;
  type: "directory" | "scene" | "script" | "resource" | "other";
  path: string;                // Relative to project root
  children?: FileNode[];       // For directories
  metadata?: {
    size: number;
    modified: string;
    mimeType: string;
  };
}
```

## Read Operations

### Pattern: List Scenes

**Flow:**
```
Request → Cache Check (list:scenes) → [Cache Miss]
  → Godot FileSystem (DirAccess.get_files_at("res://scenes"))
    → Filter *.tscn
      → Build metadata list
        → Cache Result (TTL: 60s)
          → Return
```

**Timing Breakdown:**
```
Node.js Validation           : 5-10ms
Cache Lookup (miss)          : 1-2ms
HTTP Request → Godot         : 10-15ms
Godot Directory Scan         : 20-40ms
Build Metadata List          : 5-10ms
HTTP Response → Node.js      : 10-15ms
Cache Storage                : 1-2ms
MCP Response Format          : 3-5ms
────────────────────────────────────
TOTAL                        : 55-99ms
Target: <100ms ✅
```

**Godot Implementation:**
```gdscript
static func list_scenes(params: Dictionary) -> Array:
	var directory = params.get("directory", "scenes")
	var recursive = params.get("recursive", true)
	var scenes = []
	
	var dir = DirAccess.open("res://" + directory)
	if dir == null:
		return GodotError.new(404, "Directory not found")
	
	var files = dir.get_files()
	for file in files:
		if file.ends_with(".tscn"):
			scenes.append({
				"path": directory + "/" + file,
				"name": file.get_basename(),
				"metadata": _get_file_metadata("res://" + directory + "/" + file)
			})
	
	if recursive:
		var subdirs = dir.get_directories()
		for subdir in subdirs:
			var sub_params = params.duplicate()
			sub_params["directory"] = directory + "/" + subdir
			var sub_scenes = list_scenes(sub_params)
			scenes.append_array(sub_scenes)
	
	return scenes
```

### Pattern: Read Scene

**Flow:**
```
Request → Cache Check (scene:{path}) → [Cache Miss]
  → Godot FileSystem (FileAccess.open("res://scenes/X.tscn"))
    → Parse .tscn format
      → Build SceneData model
        → Cache Result (TTL: 300s)
          → Return
```

**Timing Breakdown:**
```
Node.js Validation           : 5-10ms
Cache Lookup (miss)          : 1-2ms
HTTP Request → Godot         : 10-15ms
Godot File Open + Read       : 10-20ms
Parse .tscn Format           : 15-30ms
JSON Serialization           : 5-10ms
HTTP Response → Node.js      : 10-15ms
Cache Storage                : 2-3ms
MCP Response Format          : 3-5ms
────────────────────────────────────
TOTAL                        : 61-110ms
Target: <150ms ✅
```

**Subsequent Request (Cache Hit):**
```
Node.js Validation           : 5-10ms
Cache Lookup (hit)           : 1-2ms
MCP Response Format          : 3-5ms
────────────────────────────────────
TOTAL                        : 9-17ms (87% faster)
```

### Pattern: Search Nodes

**Flow:**
```
Request (query: "Player") → Cache Check (search:Player) → [Cache Miss]
  → List all scenes (may hit cache)
    → For each scene:
       → Read scene (may hit cache)
         → Search nodes by name/type
    → Aggregate results
      → Cache (TTL: 60s)
        → Return
```

**Optimization Strategy:**
- Cache scene list to avoid repeated directory scans
- Cache individual scenes to avoid re-parsing
- Parallel scene loading (Phase 2)

## Write Operations

### Pattern: Create Scene

**Flow:**
```
Request (path, template) → Validate input (Zod schema)
  → Check file doesn't exist (no overwrite)
    → Generate .tscn content from template
      → Write to temp file (atomic)
        → Rename temp → target (atomic commit)
          → Invalidate caches (scene:{path}, list:scenes, search:*)
            → Audit log (who, when, what)
              → Return success
```

**Timing Breakdown:**
```
Node.js Validation           : 10-15ms (includes Zod schema)
HTTP Request → Godot         : 10-15ms
Godot File Existence Check   : 5-10ms
Generate .tscn Content       : 10-20ms
Write Temp File              : 15-30ms
Atomic Rename                : 5-10ms
HTTP Response → Node.js      : 10-15ms
Cache Invalidation           : 2-5ms
Audit Logging (async)        : 3-5ms
MCP Response Format          : 3-5ms
────────────────────────────────────
TOTAL                        : 73-130ms
Target: <200ms ✅
```

**Atomic Write Pattern:**
```gdscript
static func create_scene(params: Dictionary):
	var path = params["path"]
	var template = params.get("template", "default")
	var full_path = "res://" + path
	
	# Check file doesn't exist
	if FileAccess.file_exists(full_path):
		return GodotError.new(409, "File already exists")
	
	# Generate content from template
	var content = generate_scene_template(template, params)
	
	# Write to temp file first
	var temp_path = full_path + ".tmp"
	var file = FileAccess.open(temp_path, FileAccess.WRITE)
	if file == null:
		return GodotError.new(500, "Failed to create file")
	
	file.store_string(content)
	file.close()
	
	# Atomic rename (POSIX guarantees atomicity)
	var err = DirAccess.rename_absolute(temp_path, full_path)
	if err != OK:
		DirAccess.remove_absolute(temp_path)  # Cleanup
		return GodotError.new(500, "Failed to commit file")
	
	return {"success": true, "path": path}
```

### Pattern: Modify Scene

**Flow:**
```
Request (path, changes) → Validate input
  → Backup original (copy to .tscn.backup)
    → Read current scene
      → Apply changes (node add/remove/modify)
        → Validate result (parse back, check references)
          → Write to temp
            → Rename (atomic)
              → Invalidate caches
                → Audit log
                  → Return
```

**Change Types:**
- `add_node`: Insert new node into scene tree
- `remove_node`: Delete node and children
- `modify_node`: Update node properties
- `connect_signal`: Add signal connection

**Validation Steps:**
1. Schema validation (Zod)
2. Path traversal check
3. Node type validation (against Godot class list)
4. Reference validation (parent exists, no circular deps)
5. Property type validation (Vector2, Color, etc.)

## Data Transformation

### .tscn → JSON Conversion

**Input** (.tscn text format):
```
[gd_scene load_steps=3 format=3]

[node name="Player" type="CharacterBody2D"]
script = ExtResource("1_abcdef")
position = Vector2(100, 200)

[node name="Sprite" type="Sprite2D" parent="."]
texture = ExtResource("2_ghijkl")
```

**Output** (JSON):
```json
{
  "metadata": {
    "format": 3,
    "load_steps": 3
  },
  "nodes": [
    {
      "name": "Player",
      "type": "CharacterBody2D",
      "parent": null,
      "properties": {
        "script": "res://scripts/player.gd",
        "position": {"x": 100, "y": 200}
      },
      "children": [
        {
          "name": "Sprite",
          "type": "Sprite2D",
          "parent": ".",
          "properties": {
            "texture": "res://assets/player.png"
          }
        }
      ]
    }
  ]
}
```

**Parser Implementation:**
```gdscript
static func parse_tscn_file(content: String) -> Dictionary:
	var lines = content.split("\n")
	var nodes = []
	var current_node = null
	var node_stack = []
	
	for line in lines:
		# Parse node headers
		if line.begins_with("[node"):
			if current_node != null:
				nodes.append(current_node)
			
			current_node = {"properties": {}, "children": []}
			
			# Extract name and type
			var name_match = RegEx.new()
			name_match.compile('name="([^"]+)"')
			var name_result = name_match.search(line)
			if name_result:
				current_node["name"] = name_result.get_string(1)
			
			var type_match = RegEx.new()
			type_match.compile('type="([^"]+)"')
			var type_result = type_match.search(line)
			if type_result:
				current_node["type"] = type_result.get_string(1)
			
			# Parse parent reference
			var parent_match = RegEx.new()
			parent_match.compile('parent="([^"]+)"')
			var parent_result = parent_match.search(line)
			if parent_result:
				current_node["parent"] = parent_result.get_string(1)
			else:
				current_node["parent"] = null
		
		# Parse properties
		elif current_node != null and line.contains("="):
			var parts = line.split("=", false, 1)
			if parts.size() == 2:
				var key = parts[0].strip_edges()
				var value = parts[1].strip_edges()
				current_node["properties"][key] = parse_property_value(value)
	
	# Add last node
	if current_node != null:
		nodes.append(current_node)
	
	# Build tree structure
	return build_node_tree(nodes)
```

## Caching Strategy

### Cache Configuration

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, any>({
  max: 100,              // Max 100 items (~10MB estimated)
  ttl: 300_000,          // Default 5min (300s)
  updateAgeOnGet: true,  // Reset TTL on access
  updateAgeOnHas: false, // Don't reset TTL on existence check
});
```

### Cache Rules

| Data Type | Cache Key | TTL | Max Items | Invalidation Trigger |
|-----------|-----------|-----|-----------|---------------------|
| Scene list | `list:scenes` | 60s | 1 | Any scene create/delete |
| Scene data | `scene:{path}` | 300s | 50 | Write to same scene |
| Script list | `list:scripts` | 60s | 1 | Any script create/delete |
| Script data | `script:{path}` | 300s | 50 | Write to same script |
| Project structure | `project:structure` | 60s | 1 | Any file create/delete/move |
| Search results | `search:{query}` | 60s | 20 | Any scene/script write |

### Cache Invalidation

**On Write Operations:**
```typescript
async function invalidateCache(operation: string, params: any) {
  switch (operation) {
    case 'create_scene':
    case 'modify_scene':
      cache.delete(`scene:${params.path}`);
      cache.delete('list:scenes');
      cache.delete('project:structure');
      
      // Invalidate all searches (may contain this scene)
      for (const key of cache.keys()) {
        if (key.startsWith('search:')) {
          cache.delete(key);
        }
      }
      break;
      
    case 'delete_scene':
      cache.delete(`scene:${params.path}`);
      cache.delete('list:scenes');
      cache.delete('project:structure');
      // Clear all searches
      for (const key of cache.keys()) {
        if (key.startsWith('search:')) {
          cache.delete(key);
        }
      }
      break;
      
    case 'create_script':
    case 'modify_script':
      cache.delete(`script:${params.path}`);
      cache.delete('list:scripts');
      cache.delete('project:structure');
      break;
  }
}
```

**Target Cache Hit Ratio:** >70% for typical development workflows

### Cache Performance

**Without Cache:**
- Read scene: 60-110ms
- Read same scene 10x: 600-1100ms

**With Cache:**
- Read scene (cold): 60-110ms
- Read same scene 10x: 60ms + 9×10ms = 150ms (85% faster)

## Error Propagation

### Error Flow

```
┌─────────────────┐
│  Godot Bridge   │  Error Source
└────────┬────────┘
         │ GodotError(code, message, data)
         │
         ▼
┌─────────────────┐
│  JSON-RPC 2.0   │  Serialization
│  Error Format   │  { jsonrpc, error: {...}, id }
└────────┬────────┘
         │ HTTP 200 (with error object)
         │
         ▼
┌─────────────────┐
│  Node.js        │  Parse & Transform
│  HTTP Client    │  throw GodotError
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Tool Handler   │  Catch & Log
│                 │  Pino structured logging
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MCP Protocol   │  Convert to MCP format
│  Response       │  { content: [...], isError: true }
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  VS Code        │  Display to User
│                 │  "Tool error: File not found"
└─────────────────┘
```

### Error Code Mapping

| Godot Error | JSON-RPC Code | HTTP Status | MCP Error |
|-------------|---------------|-------------|-----------|
| File not found | 404 | 200 | "File not found: {path}" |
| Invalid path | -32602 | 200 | "Invalid parameters: {details}" |
| Parse error | 500 | 200 | "Internal error parsing scene" |
| Timeout | -32000 | 200 | "Request timeout" |
| Permission denied | 403 | 200 | "Access denied: {reason}" |

### Error Response Example

**Godot Error:**
```gdscript
return GodotError.new(404, "File not found", {"path": "scenes/Missing.tscn"})
```

**JSON-RPC Response:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": 404,
    "message": "File not found",
    "data": {
      "path": "scenes/Missing.tscn"
    }
  },
  "id": "req-123"
}
```

**Node.js Logging:**
```typescript
logger.error({
  operation: 'read_scene',
  params: { path: 'scenes/Missing.tscn' },
  error: {
    code: 404,
    message: 'File not found'
  },
  latency_ms: 45
}, 'Tool execution failed');
```

**MCP Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Error reading scene: File not found: scenes/Missing.tscn"
    }
  ],
  "isError": true
}
```

## Performance Characteristics

### Latency Targets

| Operation Type | Target (p99) | Actual (p99) | Cache Hit |
|----------------|--------------|--------------|-----------|
| List scenes | <100ms | 60-80ms | 10-15ms |
| Read scene | <150ms | 60-110ms | 10-17ms |
| Read script | <50ms | 25-40ms | 8-12ms |
| Create scene | <200ms | 120-180ms | N/A |
| Modify scene | <200ms | 140-190ms | N/A |
| Search nodes | <500ms | 250-400ms | 50-80ms |
| Health check | <10ms | 3-5ms | N/A |

### Throughput

**Concurrent Requests:**
- Max concurrent: 5 (connection pool limit)
- Throughput: ~50 requests/second (localhost)
- Godot single-threaded: Sequential processing in `_process()`

**Batch Operations** (Phase 2):
- Combine multiple operations in one HTTP request
- Reduces network overhead by 60-80%
- Example: List + read 10 scenes = 1 request instead of 11

:::warning Performance Considerations
- Large scenes (>500 nodes): Parsing can take 100-200ms
- Deep directory structures: Recursive scans add 20-50ms per level
- No cache: Repeated reads are slow; ensure cache is enabled
:::

## Data Validation

### Input Validation (Node.js)

```typescript
import { z } from 'zod';

const ReadSceneSchema = z.object({
  path: z.string()
    .min(1, 'Path cannot be empty')
    .regex(/^[\w\/\-\.]+$/, 'Invalid characters in path')
    .regex(/\.tscn$/, 'Must be a .tscn file')
    .refine(
      path => !path.includes('..'),
      'Path traversal not allowed'
    ),
  include_children: z.boolean().optional().default(true),
  max_depth: z.number().int().min(1).max(20).optional().default(20)
});
```

### Output Validation (Godot)

```gdscript
static func validate_scene_data(data: Dictionary) -> bool:
	# Check required fields
	if not data.has("nodes"):
		push_error("Missing 'nodes' field in scene data")
		return false
	
	# Validate each node
	for node in data["nodes"]:
		if not node.has("name") or not node.has("type"):
			push_error("Invalid node structure")
			return false
	
	return true
```

:::tip Best Practices
1. **Always validate input** at the Node.js layer before sending to Godot
2. **Cache aggressively** for read-heavy workflows
3. **Invalidate precisely** to avoid stale data
4. **Use atomic writes** to prevent partial file corruption
5. **Log all operations** for debugging and audit trails
:::

## Next Steps

- [API Specifications](/en/api/tools) - Detailed tool schemas
- [Implementation Guide](/en/implementation/node-server) - Build the MCP server
- [Testing Strategy](/en/implementation/testing) - Validate data flows
