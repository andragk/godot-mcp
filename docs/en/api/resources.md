---
title: MCP Resources API
description: Resource URI scheme, MIME types, metadata, and caching for Godot MCP Server resources
outline: [2, 3]
---

# MCP Resources API

The Godot MCP Server exposes Godot project files as **MCP Resources** using a custom URI scheme. Resources provide read-only access to project assets with metadata and MIME type information.

## Resource URI Scheme

All resources use the `godot://` URI scheme with the following format:

```
godot://<type>/<path>
```

**Examples:**
- `godot://scenes/MainMenu.tscn` - Scene file
- `godot://scripts/Player.gd` - GDScript file
- `godot://resources/PlayerTheme.tres` - Resource file
- `godot://assets/sprites/icon.png` - Asset file
- `godot://project.godot` - Project configuration

## Resource Types

### Scenes

**URI Pattern:** `godot://scenes/<path>.tscn`

**MIME Type:** `application/x-godot-scene`

**Content Format:** JSON (parsed scene structure)

**Example:**
```
URI: godot://scenes/MainMenu.tscn
Content-Type: application/json
Content:
{
  "nodes": [
    {
      "name": "MainMenu",
      "type": "Control",
      "properties": {...},
      "children": [...]
    }
  ],
  "connections": [...]
}
```

### Scripts

**URI Pattern:** `godot://scripts/<path>.gd` or `godot://scripts/<path>.cs`

**MIME Types:**
- GDScript: `text/x-gdscript`
- C#: `text/x-csharp`

**Content Format:** Plain text (script source code)

**Example:**
```
URI: godot://scripts/Player.gd
Content-Type: text/x-gdscript
Content:
extends CharacterBody2D

class_name Player

@export var speed: float = 200.0

func _physics_process(delta: float) -> void:
    move_and_slide()
```

### Resources

**URI Pattern:** `godot://resources/<path>.tres`

**MIME Type:** `application/x-godot-resource`

**Content Format:** JSON (resource properties)

**Example:**
```
URI: godot://resources/PlayerTheme.tres
Content-Type: application/json
Content:
{
  "type": "Theme",
  "properties": {
    "default_font": "res://assets/fonts/main.ttf",
    "default_font_size": 16
  }
}
```

### Assets

**URI Pattern:** `godot://assets/<path>.<ext>`

**MIME Types:** Detected from file extension
- `.png`, `.jpg`: `image/png`, `image/jpeg`
- `.wav`, `.ogg`: `audio/wav`, `audio/ogg`
- `.glb`, `.gltf`: `model/gltf+json`

**Content Format:** Binary (Base64-encoded in JSON response)

:::warning Binary Asset Handling
Binary assets (images, audio, models) are Base64-encoded when accessed via MCP resources. For large assets (>1MB), use direct file access instead.
:::

### Project Configuration

**URI Pattern:** `godot://project.godot`

**MIME Type:** `text/plain`

**Content Format:** INI-style configuration

**Example:**
```
URI: godot://project.godot
Content-Type: text/plain
Content:
config_version=5

[application]
config/name="My Game"
run/main_scene="res://scenes/MainMenu.tscn"
config/features=PackedStringArray("4.6", "Forward Plus")
```

## Resource Metadata

Every resource includes metadata in the response headers or JSON envelope:

```typescript
interface ResourceMetadata {
  uri: string;                 // "godot://scenes/MainMenu.tscn"
  path: string;                // "scenes/MainMenu.tscn"
  type: "scene" | "script" | "resource" | "asset";
  mimeType: string;            // "application/json"
  size: number;                // File size in bytes
  modified: string;            // ISO 8601 timestamp
  checksum: string;            // SHA-256 for cache invalidation
}
```

**Example Response:**
```json
{
  "uri": "godot://scenes/MainMenu.tscn",
  "mimeType": "application/json",
  "text": "{\"nodes\": [...]}",
  "metadata": {
    "path": "scenes/MainMenu.tscn",
    "type": "scene",
    "size": 4096,
    "modified": "2026-02-03T10:30:00Z",
    "checksum": "a3f5b9c2..."
  }
}
```

## MCP Resource Request

### List Resources

List all available resources of a specific type.

**Request:**
```json
{
  "method": "resources/list",
  "params": {
    "uriPrefix": "godot://scenes/"
  }
}
```

**Response:**
```json
{
  "resources": [
    {
      "uri": "godot://scenes/MainMenu.tscn",
      "name": "MainMenu",
      "mimeType": "application/x-godot-scene",
      "description": "Main menu scene"
    },
    {
      "uri": "godot://scenes/Level1.tscn",
      "name": "Level1",
      "mimeType": "application/x-godot-scene",
      "description": "First game level"
    }
  ]
}
```

### Read Resource

Retrieve resource content with metadata.

**Request:**
```json
{
  "method": "resources/read",
  "params": {
    "uri": "godot://scenes/MainMenu.tscn"
  }
}
```

**Response:**
```json
{
  "uri": "godot://scenes/MainMenu.tscn",
  "mimeType": "application/json",
  "text": "{\"root_node\": {...}, \"connections\": [...]}",
  "metadata": {
    "size": 4096,
    "modified": "2026-02-03T10:30:00Z"
  }
}
```

### Subscribe to Resource Changes (Phase 2)

Subscribe to notifications when a resource is modified.

**Request:**
```json
{
  "method": "resources/subscribe",
  "params": {
    "uri": "godot://scenes/MainMenu.tscn"
  }
}
```

**Notification (on change):**
```json
{
  "method": "notifications/resources/updated",
  "params": {
    "uri": "godot://scenes/MainMenu.tscn",
    "checksum": "b7c9d4e1..."
  }
}
```

## Resource Caching

Resources are cached on the Node.js side with the following rules:

| Resource Type | Cache TTL | Cache Key | Invalidation |
|---------------|-----------|-----------|--------------|
| Scenes | 300s (5min) | `resource:scenes:{path}` | Write to same scene |
| Scripts | 300s | `resource:scripts:{path}` | Write to same script |
| Resources | 300s | `resource:resources:{path}` | Write to same resource |
| Assets | 600s (10min) | `resource:assets:{path}` | Rarely invalidated |
| Project config | 60s | `resource:project.godot` | Manual invalidation |

### Cache Validation

Resources include checksums (SHA-256) for cache validation:

```typescript
// Check if cached resource is stale
async function validateCache(uri: string, cached: Resource): Promise<boolean> {
  const metadata = await getResourceMetadata(uri);
  
  // Compare checksums
  if (metadata.checksum !== cached.metadata.checksum) {
    return false; // Stale, refetch
  }
  
  return true; // Valid
}
```

### Cache Invalidation

**Automatic Invalidation:**
- Writing to a scene/script invalidates its resource cache
- Project structure changes invalidate `project.godot` cache
- Asset changes must be manually invalidated (Phase 2)

**Manual Invalidation:**
```typescript
// Invalidate specific resource
cache.delete(`resource:scenes:MainMenu.tscn`);

// Invalidate all resources of type
for (const key of cache.keys()) {
  if (key.startsWith('resource:scenes:')) {
    cache.delete(key);
  }
}
```

## Resource Browser API

The Web UI provides a REST API for browsing resources:

### GET /api/resources

List all resources with filtering and pagination.

**Query Parameters:**
- `type`: Filter by type (`scene`, `script`, `resource`, `asset`)
- `directory`: Filter by directory prefix
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 200)

**Example:**
```http
GET /api/resources?type=scene&directory=scenes/levels&page=1&limit=20
```

**Response:**
```json
{
  "resources": [
    {
      "uri": "godot://scenes/levels/Level1.tscn",
      "name": "Level1",
      "type": "scene",
      "mimeType": "application/x-godot-scene",
      "metadata": {
        "size": 8192,
        "modified": "2026-02-03T10:00:00Z"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

### GET /api/resources/:uri

Get metadata for a specific resource.

**Example:**
```http
GET /api/resources/godot%3A%2F%2Fscenes%2FMainMenu.tscn
```

**Response:**
```json
{
  "uri": "godot://scenes/MainMenu.tscn",
  "name": "MainMenu",
  "type": "scene",
  "mimeType": "application/x-godot-scene",
  "metadata": {
    "path": "scenes/MainMenu.tscn",
    "size": 4096,
    "modified": "2026-02-03T10:30:00Z",
    "checksum": "a3f5b9c2...",
    "dependencies": [
      "res://scripts/main_menu.gd",
      "res://assets/sprites/logo.png"
    ]
  }
}
```

## MIME Type Mapping

| File Extension | MIME Type | Category |
|----------------|-----------|----------|
| `.tscn` | `application/x-godot-scene` | Scene |
| `.scn` | `application/x-godot-binary-scene` | Binary Scene |
| `.gd` | `text/x-gdscript` | Script |
| `.cs` | `text/x-csharp` | Script |
| `.tres` | `application/x-godot-resource` | Resource |
| `.res` | `application/x-godot-binary-resource` | Binary Resource |
| `.godot` | `text/plain` | Config |
| `.png` | `image/png` | Asset |
| `.jpg`, `.jpeg` | `image/jpeg` | Asset |
| `.svg` | `image/svg+xml` | Asset |
| `.wav` | `audio/wav` | Asset |
| `.ogg` | `audio/ogg` | Asset |
| `.mp3` | `audio/mpeg` | Asset |
| `.glb` | `model/gltf-binary` | Asset |
| `.gltf` | `model/gltf+json` | Asset |

## Error Handling

### Resource Not Found

**Error Code:** `RESOURCE_NOT_FOUND`

**Response:**
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Resource not found: godot://scenes/Missing.tscn",
    "uri": "godot://scenes/Missing.tscn"
  }
}
```

### Invalid URI

**Error Code:** `INVALID_RESOURCE_URI`

**Response:**
```json
{
  "error": {
    "code": "INVALID_RESOURCE_URI",
    "message": "Invalid resource URI format",
    "uri": "invalid://path"
  }
}
```

### Access Denied

**Error Code:** `RESOURCE_ACCESS_DENIED`

**Response:**
```json
{
  "error": {
    "code": "RESOURCE_ACCESS_DENIED",
    "message": "Access denied: Resource outside project directory",
    "uri": "godot://../../etc/passwd"
  }
}
```

## Performance Considerations

**Read Latency:**
- Cached resource: <5ms
- Uncached scene: 30-60ms (parsing)
- Uncached script: 10-20ms (text read)
- Binary asset: 50-200ms (depends on size)

**Optimization Tips:**
1. **Cache aggressively**: Most resources don't change frequently
2. **Use checksums**: Validate cache without re-reading files
3. **Batch requests**: Fetch multiple resources in one MCP call (Phase 2)
4. **Lazy load**: Only fetch resources when needed, not upfront
5. **Compress large assets**: Use gzip for text-based resources

:::tip Best Practices
- Always include metadata requests to check `modified` timestamps
- Use `godot://` URIs consistently across tools and resources
- Subscribe to resource changes (Phase 2) for real-time updates
- Respect MIME types when consuming resource content
:::

## Related Documentation

- [Tools API](/en/api/tools) - MCP tool specifications
- [Godot Bridge API](/en/api/godot-bridge) - JSON-RPC endpoints
- [Data Flow Architecture](/en/architecture/data-flow) - Caching strategy details
