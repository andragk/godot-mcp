# API Tools Reference

Complete specification for all available MCP tools.

---

## Tool Categories

- [Scene Operations](#scene-operations) - Read, create, modify scenes
- [Script Operations](#script-operations) - Read, create, modify scripts
- [Project Operations](#project-operations) - Project structure and search
- [Node Operations](#node-operations) - Node inspection and queries
- [Validation Tools](#validation-tools) - Scene and project validation

---

## Scene Operations

### list_scenes

List all scene files in the project.

**Input Schema**:

```json
{
  "directory": {
    "type": "string",
    "description": "Optional subdirectory to search (e.g., 'scenes/levels')",
    "default": ""
  },
  "recursive": {
    "type": "boolean",
    "description": "Search subdirectories recursively",
    "default": true
  },
  "include_metadata": {
    "type": "boolean",
    "description": "Include file size, modified time",
    "default": false
  }
}
```

**Output**:

```json
{
  "scenes": [
    {
      "path": "scenes/MainMenu.tscn",
      "size": 4096,
      "modified": "2026-02-04T10:30:00Z"
    },
    {
      "path": "scenes/levels/Level1.tscn",
      "size": 8192,
      "modified": "2026-02-03T15:45:00Z"
    }
  ],
  "count": 2
}
```

**Example**:

```typescript
list_scenes({
  directory: "scenes/levels",
  recursive: true,
  include_metadata: true
})
```

**Errors**:
- `-32001`: Directory not found
- `-32002`: Permission denied

---

### read_scene

Parse a scene file and return its structure.

**Input Schema**:

```json
{
  "path": {
    "type": "string",
    "description": "Relative path to .tscn file (e.g., 'scenes/Player.tscn')",
    "required": true,
    "pattern": "^[^./][^/]*(/[^/]+)*\\.tscn$"
  },
  "include_metadata": {
    "type": "boolean",
    "description": "Include file metadata and dependencies",
    "default": true
  },
  "include_scripts": {
    "type": "boolean",
    "description": "Include script content for attached scripts",
    "default": false
  }
}
```

**Output**:

```json
{
  "metadata": {
    "path": "scenes/Player.tscn",
    "format": 3,
    "uid": "uid://abcdef123",
    "modified": "2026-02-04T10:30:00Z",
    "size": 4096,
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
  "connections": [
    {
      "signal": "body_entered",
      "from": "Player",
      "to": "Player",
      "method": "_on_body_entered"
    }
  ]
}
```

**Example**:

```typescript
read_scene({
  path: "scenes/Player.tscn",
  include_metadata: true,
  include_scripts: false
})
```

**Errors**:
- `-32001`: File not found
- `-32602`: Invalid path (path traversal, wrong extension)
- `-32603`: Parse error (malformed .tscn)

---

### create_scene

Create a new scene file.

**Input Schema**:

```json
{
  "path": {
    "type": "string",
    "description": "Path for new scene (e.g., 'scenes/NewLevel.tscn')",
    "required": true,
    "pattern": "^[^./][^/]*(/[^/]+)*\\.tscn$"
  },
  "root_node": {
    "type": "object",
    "description": "Root node configuration",
    "required": true,
    "properties": {
      "name": {"type": "string", "required": true},
      "type": {"type": "string", "required": true},
      "properties": {"type": "object"},
      "children": {"type": "array"}
    }
  },
  "overwrite": {
    "type": "boolean",
    "description": "Overwrite if file exists",
    "default": false
  }
}
```

**Output**:

```json
{
  "path": "scenes/NewLevel.tscn",
  "created": true,
  "backup": null
}
```

**Example**:

```typescript
create_scene({
  path: "scenes/TestLevel.tscn",
  root_node: {
    name: "TestLevel",
    type: "Node2D",
    properties: {},
    children: [
      {
        name: "TileMap",
        type: "TileMap",
        properties: {
          tile_set: "res://tilesets/platformer.tres"
        }
      }
    ]
  },
  overwrite: false
})
```

**Errors**:
- `-32001`: File already exists (and overwrite=false)
- `-32002`: Permission denied
- `-32602`: Invalid node structure

---

### modify_scene

Modify an existing scene file.

**Input Schema**:

```json
{
  "path": {
    "type": "string",
    "description": "Path to scene to modify",
    "required": true
  },
  "operations": {
    "type": "array",
    "description": "List of modification operations",
    "required": true,
    "items": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "type": {"enum": ["add_node"]},
            "parent": {"type": "string"},
            "node": {"type": "object"}
          }
        },
        {
          "type": "object",
          "properties": {
            "type": {"enum": ["remove_node"]},
            "node_path": {"type": "string"}
          }
        },
        {
          "type": "object",
          "properties": {
            "type": {"enum": ["update_property"]},
            "node_path": {"type": "string"},
            "property": {"type": "string"},
            "value": {}
          }
        }
      ]
    }
  },
  "create_backup": {
    "type": "boolean",
    "default": true
  }
}
```

**Output**:

```json
{
  "path": "scenes/Player.tscn",
  "modified": true,
  "backup": ".godot/mcp-backups/2026-02-04_10-30-00_Player.tscn.bak",
  "operations_applied": 3
}
```

**Example**:

```typescript
modify_scene({
  path: "scenes/Player.tscn",
  operations: [
    {
      type: "add_node",
      parent: "Player",
      node: {
        name: "HealthComponent",
        type: "Node",
        properties: {
          script: "res://scripts/components/HealthComponent.gd",
          max_health: 100
        }
      }
    },
    {
      type: "update_property",
      node_path: "Player/Sprite2D",
      property: "modulate",
      value: {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0}
    }
  ],
  create_backup: true
})
```

**Errors**:
- `-32001`: File not found
- `-32602`: Invalid operation structure
- `-32603`: Operation failed (e.g., parent not found)

---

## Script Operations

### list_scripts

List all script files in the project.

**Input Schema**:

```json
{
  "directory": {
    "type": "string",
    "default": ""
  },
  "recursive": {
    "type": "boolean",
    "default": true
  },
  "language": {
    "type": "string",
    "enum": ["GDScript", "CSharp", "all"],
    "default": "all"
  }
}
```

**Output**:

```json
{
  "scripts": [
    {
      "path": "scripts/Player.gd",
      "language": "GDScript",
      "size": 2048,
      "modified": "2026-02-04T10:30:00Z"
    }
  ],
  "count": 1
}
```

---

### read_script

Read a script file and return its content and structure.

**Input Schema**:

```json
{
  "path": {
    "type": "string",
    "description": "Relative path to script (e.g., 'scripts/Player.gd')",
    "required": true,
    "pattern": "^[^./][^/]*(/[^/]+)*\\.(gd|cs)$"
  },
  "parse_structure": {
    "type": "boolean",
    "description": "Extract class name, functions, signals",
    "default": true
  }
}
```

**Output**:

```json
{
  "metadata": {
    "path": "scripts/Player.gd",
    "language": "GDScript",
    "modified": "2026-02-04T10:30:00Z",
    "size": 2048,
    "line_count": 120
  },
  "content": "class_name Player\nextends CharacterBody2D\n...",
  "structure": {
    "class_name": "Player",
    "extends": "CharacterBody2D",
    "signals": [
      {
        "name": "health_changed",
        "params": [{"name": "new_health", "type": "int"}]
      }
    ],
    "constants": [
      {"name": "MAX_SPEED", "type": "int", "value": "300"}
    ],
    "variables": [
      {"name": "max_health", "type": "int", "export": true, "default": "100"}
    ],
    "functions": [
      {
        "name": "_ready",
        "return_type": "void",
        "params": [],
        "line_start": 15,
        "line_end": 17
      }
    ]
  }
}
```

---

### create_script

Create a new script file.

**Input Schema**:

```json
{
  "path": {
    "type": "string",
    "required": true
  },
  "content": {
    "type": "string",
    "description": "Script content",
    "required": true
  },
  "template": {
    "type": "string",
    "enum": ["empty", "node", "character_body_2d", "area_2d"],
    "description": "Use predefined template (overrides content)"
  }
}
```

**Output**:

```json
{
  "path": "scripts/NewScript.gd",
  "created": true,
  "line_count": 25
}
```

---

### modify_script

Modify an existing script file.

**Input Schema**:

```json
{
  "path": {
    "type": "string",
    "required": true
  },
  "changes": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "type": {"enum": ["replace", "insert", "delete"]},
        "start_line": {"type": "number"},
        "end_line": {"type": "number"},
        "new_content": {"type": "string"}
      }
    }
  }
}
```

---

## Project Operations

### get_project_structure

Get complete project directory tree.

**Input Schema**:

```json
{
  "include_hidden": {
    "type": "boolean",
    "description": "Include .godot/, .import/ folders",
    "default": false
  },
  "max_depth": {
    "type": "number",
    "description": "Maximum directory depth (-1 for unlimited)",
    "default": -1
  }
}
```

**Output**:

```json
{
  "project_path": "/path/to/project",
  "project_name": "My Game",
  "godot_version": "4.6.0",
  "tree": {
    "name": "project_root",
    "type": "directory",
    "children": [
      {
        "name": "scenes",
        "type": "directory",
        "children": [...]
      },
      {
        "name": "scripts",
        "type": "directory",
        "children": [...]
      }
    ]
  }
}
```

---

### search_nodes

Find nodes across scenes by criteria.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "description": "Specific scene to search (omit for all scenes)"
  },
  "node_name": {
    "type": "string",
    "description": "Search by node name (supports wildcards)"
  },
  "node_type": {
    "type": "string",
    "description": "Filter by node type (e.g., 'Area2D')"
  },
  "property": {
    "type": "object",
    "description": "Search by property value",
    "properties": {
      "name": {"type": "string"},
      "value": {}
    }
  },
  "group": {
    "type": "string",
    "description": "Filter by Godot group"
  }
}
```

**Output**:

```json
{
  "results": [
    {
      "scene": "scenes/Level1.tscn",
      "node_path": "Level1/Enemies/Enemy1",
      "node_type": "CharacterBody2D",
      "properties": {...}
    }
  ],
  "count": 15
}
```

**Example**:

```typescript
// Find all Area2D nodes on collision layer 4
search_nodes({
  node_type: "Area2D",
  property: {
    name: "collision_layer",
    value: 4
  }
})
```

---

## Node Operations

### get_node_properties

Get detailed properties of a specific node.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "node_path": {
    "type": "string",
    "description": "Path to node within scene (e.g., 'Player/Sprite2D')",
    "required": true
  },
  "properties": {
    "type": "array",
    "description": "Specific properties to fetch (omit for all)",
    "items": {"type": "string"}
  }
}
```

**Output**:

```json
{
  "scene": "scenes/Player.tscn",
  "node_path": "Player/Sprite2D",
  "node_type": "Sprite2D",
  "properties": {
    "texture": "res://assets/player.png",
    "centered": true,
    "offset": {"x": 0, "y": 0},
    "flip_h": false,
    "flip_v": false,
    "modulate": {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0}
  }
}
```

---

## Validation Tools

### validate_scene

Validate a scene file for errors.

**Input Schema**:

```json
{
  "path": {
    "type": "string",
    "required": true
  },
  "checks": {
    "type": "array",
    "description": "Specific checks to run",
    "items": {
      "enum": [
        "syntax",
        "missing_dependencies",
        "broken_paths",
        "circular_dependencies"
      ]
    },
    "default": ["syntax", "missing_dependencies", "broken_paths"]
  }
}
```

**Output**:

```json
{
  "path": "scenes/Player.tscn",
  "valid": false,
  "errors": [
    {
      "type": "missing_dependency",
      "message": "Script not found: res://scripts/MissingScript.gd",
      "line": 5
    }
  ],
  "warnings": [
    {
      "type": "deprecated_property",
      "message": "Property 'motion_mode' is deprecated in Godot 4.6",
      "line": 12
    }
  ]
}
```

---

## Error Handling

All tools follow consistent error patterns:

**Common Error Codes**:

| Code | Name | Description |
|------|------|-------------|
| -32001 | File Not Found | Requested file doesn't exist |
| -32002 | Permission Denied | Path validation failed (traversal, symlink) |
| -32003 | Timeout | Operation exceeded time limit |
| -32600 | Invalid Request | Missing required fields |
| -32602 | Invalid Params | Parameter validation failed |
| -32603 | Internal Error | Server-side exception |

**Error Response Format**:

```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "field": "path",
      "reason": "Path must be relative and within project directory",
      "provided": "../../../etc/passwd"
    }
  }
}
```

---

## Performance Characteristics

| Tool | Typical Latency | Cache Hit Rate | Notes |
|------|----------------|----------------|-------|
| `list_scenes` | 20-50ms | 60% | Depends on project size |
| `read_scene` | 15-80ms | 70% | Depends on scene complexity |
| `create_scene` | 50-150ms | N/A | Includes validation |
| `modify_scene` | 80-200ms | N/A | Includes backup |
| `list_scripts` | 15-40ms | 65% | Faster than scenes |
| `read_script` | 10-50ms | 75% | Text-only, no parsing |
| `get_project_structure` | 30-100ms | 85% | Cached aggressively |
| `search_nodes` | 50-500ms | 40% | Depends on search scope |

---

::: tip Tool Composition
AI assistants automatically chain tools for complex queries:

> "Find all enemies in Level1 and increase their health by 20%"

1. `read_scene("scenes/Level1.tscn")`
2. `search_nodes({scene_path: "...", node_type: "Enemy"})`
3. For each enemy: `modify_scene({operations: [{type: "update_property", ...}]})`
:::

::: warning Rate Limiting
In production (Phase 2), tools are rate-limited to 100 req/min per client. Batch operations are more efficient than sequential calls.
:::
