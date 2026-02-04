# API Tools Reference

Complete specification for all available MCP tools.

---

## Tool Categories

- [Scene Operations](#scene-operations) - Read, create, modify scenes
- [Script Operations](#script-operations) - Read, create, modify scripts
- [Project Operations](#project-operations) - Project structure and search
- [Node Operations](#node-operations) - Node inspection and queries
- [Editor Operations](#editor-operations) - Launch editor, run projects, control execution
- [Resource Operations](#resource-operations) - Import assets, create resources
- [Signal Operations](#signal-operations) - Create, connect, list, disconnect signals
- [Physics Operations](#physics-operations) - Physics bodies, collision, areas (Godot 4.5+)
- [UI Operations](#ui-operations) - Create UI elements, themes, layouts
- [Animation Operations](#animation-operations) - Animation players, keyframes, trees
- [Debug Operations](#debug-operations) - Capture output, error analysis
- [Documentation Operations](#documentation-operations) - Class info, methods, best practices (Godot 4.5+)
- [UID Operations](#uid-operations) - Get/update UIDs (Godot 4.4+)
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

## Editor Operations

### launch_godot_editor

Open the Godot editor for a specific project.

**Input Schema**:

```json
{
  "project_path": {
    "type": "string",
    "description": "Absolute path to Godot project directory",
    "required": true
  },
  "editor_executable": {
    "type": "string",
    "description": "Path to Godot executable (auto-detected if omitted)"
  },
  "additional_args": {
    "type": "array",
    "description": "Additional command-line arguments",
    "items": {"type": "string"}
  }
}
```

**Output**:

```json
{
  "launched": true,
  "pid": 12345,
  "editor_version": "4.6.0.stable",
  "project_name": "My Game"
}
```

**Example**:

```typescript
launch_godot_editor({
  project_path: "/path/to/my-game",
  additional_args: ["--verbose"]
})
```

**Errors**:
- `-32001`: Project not found
- `-32002`: Godot executable not found
- `-32603`: Failed to launch editor

---

### run_godot_project

Execute a Godot project in debug mode.

**Input Schema**:

```json
{
  "project_path": {
    "type": "string",
    "required": true
  },
  "scene": {
    "type": "string",
    "description": "Specific scene to run (uses main scene if omitted)"
  },
  "debug_port": {
    "type": "number",
    "description": "Debug server port",
    "default": 6007
  },
  "capture_output": {
    "type": "boolean",
    "description": "Capture console output",
    "default": true
  }
}
```

**Output**:

```json
{
  "running": true,
  "pid": 12346,
  "debug_port": 6007,
  "output_stream_id": "stream-abc123"
}
```

**Example**:

```typescript
run_godot_project({
  project_path: "/path/to/my-game",
  scene: "res://scenes/Level1.tscn",
  capture_output: true
})
```

---

### capture_debug_output

Retrieve console output and error messages from running Godot project.

**Input Schema**:

```json
{
  "output_stream_id": {
    "type": "string",
    "description": "Stream ID from run_godot_project",
    "required": true
  },
  "since": {
    "type": "string",
    "description": "ISO timestamp to fetch logs since",
    "format": "date-time"
  },
  "level": {
    "type": "array",
    "description": "Log levels to include",
    "items": {"enum": ["info", "warning", "error"]},
    "default": ["info", "warning", "error"]
  }
}
```

**Output**:

```json
{
  "output": [
    {
      "timestamp": "2026-02-04T10:30:15.123Z",
      "level": "info",
      "message": "Scene loaded: res://scenes/Level1.tscn"
    },
    {
      "timestamp": "2026-02-04T10:30:15.456Z",
      "level": "error",
      "message": "Null reference in Player.gd line 45",
      "stack_trace": ["...", "..."]
    }
  ],
  "count": 2
}
```

---

### stop_godot_execution

Stop a running Godot project.

**Input Schema**:

```json
{
  "pid": {
    "type": "number",
    "description": "Process ID from run_godot_project",
    "required": true
  },
  "force": {
    "type": "boolean",
    "description": "Force kill if graceful shutdown fails",
    "default": false
  }
}
```

**Output**:

```json
{
  "stopped": true,
  "pid": 12346,
  "exit_code": 0
}
```

---

### get_godot_version

Retrieve the installed Godot version.

**Input Schema**:

```json
{
  "executable_path": {
    "type": "string",
    "description": "Path to Godot executable (auto-detected if omitted)"
  }
}
```

**Output**:

```json
{
  "version": "4.6.0.stable",
  "full_name": "Godot Engine v4.6.0.stable.official",
  "mono": false,
  "executable_path": "/usr/local/bin/godot"
}
```

---

### list_godot_projects

Find Godot projects in a specified directory.

**Input Schema**:

```json
{
  "search_path": {
    "type": "string",
    "description": "Directory to search",
    "required": true
  },
  "recursive": {
    "type": "boolean",
    "description": "Search subdirectories",
    "default": true
  },
  "max_depth": {
    "type": "number",
    "description": "Maximum recursion depth",
    "default": 3
  }
}
```

**Output**:

```json
{
  "projects": [
    {
      "path": "/home/user/projects/platformer",
      "name": "Platformer Game",
      "godot_version": "4.6.0",
      "main_scene": "res://scenes/MainMenu.tscn"
    },
    {
      "path": "/home/user/projects/rpg",
      "name": "RPG Adventure",
      "godot_version": "4.5.0",
      "main_scene": "res://scenes/TitleScreen.tscn"
    }
  ],
  "count": 2
}
```

---

### analyze_project

Get detailed information about project structure and dependencies.

**Input Schema**:

```json
{
  "project_path": {
    "type": "string",
    "required": true
  },
  "include_dependencies": {
    "type": "boolean",
    "description": "Analyze resource dependencies",
    "default": true
  },
  "include_statistics": {
    "type": "boolean",
    "description": "Calculate project statistics",
    "default": true
  }
}
```

**Output**:

```json
{
  "project_name": "My Game",
  "godot_version": "4.6.0",
  "statistics": {
    "scene_count": 45,
    "script_count": 67,
    "texture_count": 123,
    "audio_count": 34,
    "total_size_mb": 245.6
  },
  "dependencies": {
    "plugins": ["godot-plugin-example"],
    "external_resources": ["res://addons/plugin_name"],
    "missing_dependencies": []
  },
  "warnings": [
    "3 unused scripts detected",
    "Scene 'Level5.tscn' has no main script"
  ]
}
```

---

## Resource Operations

### import_asset

Import an asset with custom import settings.

**Input Schema**:

```json
{
  "source_path": {
    "type": "string",
    "description": "Path to source file to import",
    "required": true
  },
  "target_path": {
    "type": "string",
    "description": "Target path in project (e.g., 'assets/textures/sprite.png')",
    "required": true
  },
  "import_settings": {
    "type": "object",
    "description": "Import configuration",
    "properties": {
      "compress_mode": {"type": "string"},
      "filter": {"type": "boolean"},
      "mipmaps": {"type": "boolean"},
      "preset": {"enum": ["2D", "3D", "2D Pixel"]}
    }
  }
}
```

**Output**:

```json
{
  "imported": true,
  "target_path": "res://assets/textures/sprite.png",
  "import_file": "res://assets/textures/sprite.png.import",
  "size_bytes": 45678
}
```

---

### create_resource

Create a Godot resource (material, shader, etc.).

**Input Schema**:

```json
{
  "path": {
    "type": "string",
    "description": "Target resource path (e.g., 'materials/PlayerMaterial.tres')",
    "required": true
  },
  "resource_type": {
    "type": "string",
    "description": "Resource type (e.g., 'StandardMaterial3D', 'ShaderMaterial')",
    "required": true
  },
  "properties": {
    "type": "object",
    "description": "Resource properties"
  }
}
```

**Output**:

```json
{
  "created": true,
  "path": "res://materials/PlayerMaterial.tres",
  "uid": "uid://xyz789",
  "resource_type": "StandardMaterial3D"
}
```

**Example**:

```typescript
create_resource({
  path: "materials/GlowMaterial.tres",
  resource_type: "StandardMaterial3D",
  properties: {
    albedo_color: {r: 1.0, g: 0.5, b: 0.0, a: 1.0},
    emission_enabled: true,
    emission: {r: 1.0, g: 0.5, b: 0.0, a: 1.0},
    emission_energy: 2.0
  }
})
```

---

### list_project_assets

List all assets in the project with metadata.

**Input Schema**:

```json
{
  "directory": {
    "type": "string",
    "description": "Subdirectory to search",
    "default": ""
  },
  "asset_types": {
    "type": "array",
    "description": "Filter by asset types",
    "items": {"enum": ["texture", "audio", "mesh", "material", "scene", "script"]},
    "default": []
  },
  "include_metadata": {
    "type": "boolean",
    "default": true
  }
}
```

**Output**:

```json
{
  "assets": [
    {
      "path": "res://assets/textures/player.png",
      "type": "texture",
      "size_bytes": 45678,
      "modified": "2026-02-04T10:30:00Z",
      "metadata": {
        "width": 512,
        "height": 512,
        "format": "RGBA8"
      }
    }
  ],
  "count": 1
}
```

---

### configure_import_settings

Update import settings for an asset.

**Input Schema**:

```json
{
  "asset_path": {
    "type": "string",
    "description": "Path to asset",
    "required": true
  },
  "settings": {
    "type": "object",
    "description": "Import settings to update",
    "required": true
  },
  "reimport": {
    "type": "boolean",
    "description": "Trigger reimport after updating settings",
    "default": true
  }
}
```

**Output**:

```json
{
  "updated": true,
  "asset_path": "res://assets/player.png",
  "reimported": true
}
```

---

## Signal Operations

### create_signal

Create a custom signal in a script.

**Input Schema**:

```json
{
  "script_path": {
    "type": "string",
    "required": true
  },
  "signal_name": {
    "type": "string",
    "required": true
  },
  "parameters": {
    "type": "array",
    "description": "Signal parameters",
    "items": {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "type": {"type": "string"}
      }
    }
  }
}
```

**Output**:

```json
{
  "created": true,
  "script_path": "res://scripts/Player.gd",
  "signal_name": "health_changed",
  "signature": "signal health_changed(old_value: int, new_value: int)"
}
```

**Example**:

```typescript
create_signal({
  script_path: "scripts/Player.gd",
  signal_name: "health_changed",
  parameters: [
    {name: "old_value", type: "int"},
    {name: "new_value", type: "int"}
  ]
})
```

---

### connect_signal

Connect a signal between nodes with validation.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "from_node": {
    "type": "string",
    "description": "Node path emitting the signal",
    "required": true
  },
  "signal_name": {
    "type": "string",
    "required": true
  },
  "to_node": {
    "type": "string",
    "description": "Node path receiving the signal",
    "required": true
  },
  "method_name": {
    "type": "string",
    "description": "Method to call on target node",
    "required": true
  },
  "binds": {
    "type": "array",
    "description": "Additional arguments to bind"
  },
  "flags": {
    "type": "number",
    "description": "Connection flags (CONNECT_DEFERRED, etc.)",
    "default": 0
  }
}
```

**Output**:

```json
{
  "connected": true,
  "scene_path": "res://scenes/Player.tscn",
  "connection": {
    "from": "Player",
    "signal": "health_changed",
    "to": "UI/HealthBar",
    "method": "_on_player_health_changed"
  }
}
```

**Example**:

```typescript
connect_signal({
  scene_path: "scenes/Player.tscn",
  from_node: "Player",
  signal_name: "body_entered",
  to_node: "Player",
  method_name: "_on_body_entered"
})
```

---

### list_node_signals

List available signals on a node.

**Input Schema**:

```json
{
  "node_type": {
    "type": "string",
    "description": "Node type to query (e.g., 'Area2D')",
    "required": true
  },
  "include_inherited": {
    "type": "boolean",
    "description": "Include signals from parent classes",
    "default": true
  }
}
```

**Output**:

```json
{
  "node_type": "Area2D",
  "signals": [
    {
      "name": "body_entered",
      "parameters": [{"name": "body", "type": "Node2D"}]
    },
    {
      "name": "body_exited",
      "parameters": [{"name": "body", "type": "Node2D"}]
    },
    {
      "name": "area_entered",
      "parameters": [{"name": "area", "type": "Area2D"}]
    }
  ],
  "count": 3
}
```

---

### disconnect_signal

Disconnect a signal connection.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "from_node": {
    "type": "string",
    "required": true
  },
  "signal_name": {
    "type": "string",
    "required": true
  },
  "to_node": {
    "type": "string",
    "required": true
  },
  "method_name": {
    "type": "string",
    "required": true
  }
}
```

**Output**:

```json
{
  "disconnected": true,
  "scene_path": "res://scenes/Player.tscn"
}
```

---

## Physics Operations

::: tip Godot 4.5+ Required
Physics tools require Godot 4.5 or later.
:::

### add_physics_body

Add a physics body to a scene.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "parent_node": {
    "type": "string",
    "description": "Parent node path",
    "required": true
  },
  "body_type": {
    "type": "string",
    "enum": ["CharacterBody2D", "CharacterBody3D", "RigidBody2D", "RigidBody3D", "StaticBody2D", "StaticBody3D"],
    "required": true
  },
  "name": {
    "type": "string",
    "required": true
  },
  "properties": {
    "type": "object",
    "description": "Body properties (mass, friction, etc.)"
  },
  "add_collision_shape": {
    "type": "boolean",
    "description": "Automatically add collision shape child",
    "default": true
  }
}
```

**Output**:

```json
{
  "added": true,
  "scene_path": "res://scenes/Player.tscn",
  "node_path": "Player/PhysicsBody",
  "body_type": "CharacterBody2D",
  "collision_shape_added": true
}
```

**Example**:

```typescript
add_physics_body({
  scene_path: "scenes/Enemy.tscn",
  parent_node: "Enemy",
  body_type: "RigidBody2D",
  name: "RigidBody2D",
  properties: {
    mass: 10.0,
    gravity_scale: 1.0,
    linear_damp: 0.1
  },
  add_collision_shape: true
})
```

---

### configure_physics_properties

Configure physics properties and materials.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "node_path": {
    "type": "string",
    "required": true
  },
  "properties": {
    "type": "object",
    "properties": {
      "mass": {"type": "number"},
      "friction": {"type": "number"},
      "bounce": {"type": "number"},
      "gravity_scale": {"type": "number"},
      "linear_damp": {"type": "number"},
      "angular_damp": {"type": "number"}
    }
  }
}
```

**Output**:

```json
{
  "updated": true,
  "scene_path": "res://scenes/Player.tscn",
  "node_path": "Player/RigidBody2D",
  "properties_set": ["mass", "friction", "bounce"]
}
```

---

### setup_collision_layers

Setup collision layers and masks.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "node_path": {
    "type": "string",
    "required": true
  },
  "collision_layer": {
    "type": "number",
    "description": "Bitmask for collision layer"
  },
  "collision_mask": {
    "type": "number",
    "description": "Bitmask for collision mask"
  }
}
```

**Output**:

```json
{
  "updated": true,
  "collision_layer": 1,
  "collision_mask": 6
}
```

---

### create_area

Create Area2D/Area3D with signal connections.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "parent_node": {
    "type": "string",
    "required": true
  },
  "area_type": {
    "type": "string",
    "enum": ["Area2D", "Area3D"],
    "required": true
  },
  "name": {
    "type": "string",
    "required": true
  },
  "monitoring": {
    "type": "boolean",
    "default": true
  },
  "monitorable": {
    "type": "boolean",
    "default": true
  },
  "connect_signals": {
    "type": "array",
    "description": "Auto-connect signals",
    "items": {
      "type": "object",
      "properties": {
        "signal": {"type": "string"},
        "method": {"type": "string"}
      }
    }
  }
}
```

**Output**:

```json
{
  "created": true,
  "node_path": "Player/DetectionArea",
  "area_type": "Area2D",
  "signals_connected": ["body_entered", "body_exited"]
}
```

---

## UI Operations

### create_ui_element

Create UI elements (Button, Label, TextEdit, Panel, etc.).

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "parent_node": {
    "type": "string",
    "required": true
  },
  "element_type": {
    "type": "string",
    "enum": ["Button", "Label", "TextEdit", "LineEdit", "Panel", "VBoxContainer", "HBoxContainer", "MarginContainer"],
    "required": true
  },
  "name": {
    "type": "string",
    "required": true
  },
  "properties": {
    "type": "object",
    "description": "Element-specific properties"
  }
}
```

**Output**:

```json
{
  "created": true,
  "node_path": "UI/MainMenu/StartButton",
  "element_type": "Button",
  "properties_set": ["text", "position", "size"]
}
```

**Example**:

```typescript
create_ui_element({
  scene_path: "scenes/MainMenu.tscn",
  parent_node: "UI/MainMenu",
  element_type: "Button",
  name: "StartButton",
  properties: {
    text: "Start Game",
    position: {x: 100, y: 200},
    size: {x: 200, y: 50}
  }
})
```

---

### apply_theme

Apply themes to UI elements.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "node_path": {
    "type": "string",
    "required": true
  },
  "theme_path": {
    "type": "string",
    "description": "Path to theme resource",
    "required": true
  },
  "theme_type_variation": {
    "type": "string",
    "description": "Theme type variation"
  }
}
```

**Output**:

```json
{
  "applied": true,
  "node_path": "UI/MainMenu/StartButton",
  "theme_path": "res://themes/main_theme.tres"
}
```

---

### setup_container_layout

Setup container layouts (VBox, HBox, Grid, etc.).

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "parent_node": {
    "type": "string",
    "required": true
  },
  "container_type": {
    "type": "string",
    "enum": ["VBoxContainer", "HBoxContainer", "GridContainer", "MarginContainer"],
    "required": true
  },
  "name": {
    "type": "string",
    "required": true
  },
  "layout_properties": {
    "type": "object",
    "properties": {
      "separation": {"type": "number"},
      "alignment": {"type": "string"}
    }
  }
}
```

**Output**:

```json
{
  "created": true,
  "node_path": "UI/SettingsMenu/VBoxContainer",
  "container_type": "VBoxContainer"
}
```

---

### create_menu

Create menus with buttons and navigation.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "parent_node": {
    "type": "string",
    "required": true
  },
  "menu_name": {
    "type": "string",
    "required": true
  },
  "buttons": {
    "type": "array",
    "description": "Menu buttons",
    "items": {
      "type": "object",
      "properties": {
        "text": {"type": "string"},
        "action": {"type": "string"}
      }
    }
  }
}
```

**Output**:

```json
{
  "created": true,
  "node_path": "UI/MainMenu",
  "buttons_created": ["StartButton", "SettingsButton", "QuitButton"]
}
```

---

## Animation Operations

### create_animation_player

Create AnimationPlayer nodes with animations.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "parent_node": {
    "type": "string",
    "required": true
  },
  "name": {
    "type": "string",
    "required": true
  },
  "animations": {
    "type": "array",
    "description": "Initial animations to create",
    "items": {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "length": {"type": "number"}
      }
    }
  }
}
```

**Output**:

```json
{
  "created": true,
  "node_path": "Player/AnimationPlayer",
  "animations_created": ["idle", "walk", "jump"]
}
```

---

### add_animation_keyframe

Add keyframes to animation tracks.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "animation_player_path": {
    "type": "string",
    "required": true
  },
  "animation_name": {
    "type": "string",
    "required": true
  },
  "track": {
    "type": "object",
    "properties": {
      "node_path": {"type": "string"},
      "property": {"type": "string"},
      "time": {"type": "number"},
      "value": {}
    },
    "required": ["node_path", "property", "time", "value"]
  }
}
```

**Output**:

```json
{
  "added": true,
  "animation_player": "Player/AnimationPlayer",
  "animation": "walk",
  "track_index": 0,
  "keyframe_index": 5
}
```

**Example**:

```typescript
add_animation_keyframe({
  scene_path: "scenes/Player.tscn",
  animation_player_path: "Player/AnimationPlayer",
  animation_name: "walk",
  track: {
    node_path: "Sprite2D",
    property: "position:x",
    time: 0.5,
    value: 100
  }
})
```

---

### setup_animation_tree

Setup AnimationTree with state machines.

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "parent_node": {
    "type": "string",
    "required": true
  },
  "name": {
    "type": "string",
    "required": true
  },
  "animation_player_path": {
    "type": "string",
    "description": "Path to AnimationPlayer node",
    "required": true
  },
  "state_machine": {
    "type": "object",
    "description": "State machine configuration"
  }
}
```

**Output**:

```json
{
  "created": true,
  "node_path": "Player/AnimationTree",
  "animation_player": "Player/AnimationPlayer",
  "state_machine_configured": true
}
```

---

### add_particle_system

Add particle systems (GPUParticles2D/3D).

**Input Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "parent_node": {
    "type": "string",
    "required": true
  },
  "particle_type": {
    "type": "string",
    "enum": ["GPUParticles2D", "GPUParticles3D"],
    "required": true
  },
  "name": {
    "type": "string",
    "required": true
  },
  "properties": {
    "type": "object",
    "description": "Particle system properties"
  }
}
```

**Output**:

```json
{
  "created": true,
  "node_path": "Effects/Explosion",
  "particle_type": "GPUParticles2D",
  "emitting": false
}
```

---

## Debug Operations

### run_project_debug

Run projects with full debug output capture.

**Input Schema**:

```json
{
  "project_path": {
    "type": "string",
    "required": true
  },
  "scene": {
    "type": "string",
    "description": "Scene to run"
  },
  "capture_performance": {
    "type": "boolean",
    "description": "Capture performance metrics",
    "default": false
  },
  "break_on_error": {
    "type": "boolean",
    "default": false
  }
}
```

**Output**:

```json
{
  "running": true,
  "pid": 12347,
  "debug_session_id": "debug-xyz789",
  "performance_monitoring": false
}
```

---

### get_error_context

Get error context with stack traces.

**Input Schema**:

```json
{
  "debug_session_id": {
    "type": "string",
    "required": true
  },
  "error_id": {
    "type": "string",
    "description": "Specific error to analyze"
  }
}
```

**Output**:

```json
{
  "error": {
    "message": "Null reference in Player.gd line 45",
    "file": "res://scripts/Player.gd",
    "line": 45,
    "column": 12,
    "stack_trace": [
      "Player._physics_process() at res://scripts/Player.gd:45",
      "Node._physics_process_internal() at core"
    ],
    "context": {
      "variable": "health_component",
      "expected": "HealthComponent",
      "actual": "null"
    }
  }
}
```

---

### analyze_error

Intelligent error analysis with solutions.

**Input Schema**:

```json
{
  "error_message": {
    "type": "string",
    "required": true
  },
  "stack_trace": {
    "type": "array",
    "items": {"type": "string"}
  },
  "context": {
    "type": "object"
  }
}
```

**Output**:

```json
{
  "error_type": "NullReferenceException",
  "severity": "error",
  "likely_causes": [
    "health_component not initialized in _ready()",
    "Node reference lost during scene change"
  ],
  "solutions": [
    {
      "description": "Add null check before accessing health_component",
      "code_example": "if health_component:\n    health_component.take_damage(10)"
    },
    {
      "description": "Initialize health_component in _ready()",
      "code_example": "func _ready():\n    health_component = get_node(\"HealthComponent\")"
    }
  ],
  "documentation_links": [
    "https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html#null-safety"
  ]
}
```

---

### get_debug_documentation

Integration with documentation for contextual help.

**Input Schema**:

```json
{
  "query": {
    "type": "string",
    "description": "Search query or error message",
    "required": true
  },
  "context": {
    "type": "object",
    "description": "Additional context (node types, error codes, etc.)"
  }
}
```

**Output**:

```json
{
  "results": [
    {
      "title": "CharacterBody2D Physics",
      "url": "https://docs.godotengine.org/...",
      "excerpt": "CharacterBody2D is for implementing bodies...",
      "relevance": 0.95
    }
  ],
  "count": 1
}
```

---

## Documentation Operations

::: tip Godot 4.5+ Required
Documentation tools require Godot 4.5 or later and depend on the official Godot documentation API.
:::

### get_class_documentation

Get detailed class information from official Godot documentation.

**Input Schema**:

```json
{
  "class_name": {
    "type": "string",
    "description": "Godot class name (e.g., 'CharacterBody2D')",
    "required": true
  },
  "include_methods": {
    "type": "boolean",
    "default": true
  },
  "include_properties": {
    "type": "boolean",
    "default": true
  },
  "include_signals": {
    "type": "boolean",
    "default": true
  },
  "include_examples": {
    "type": "boolean",
    "default": true
  }
}
```

**Output**:

```json
{
  "class_name": "CharacterBody2D",
  "inherits": "PhysicsBody2D",
  "description": "Character body 2D node for implementing custom character physics...",
  "methods": [
    {
      "name": "move_and_slide",
      "return_type": "bool",
      "parameters": [],
      "description": "Moves the body based on velocity..."
    }
  ],
  "properties": [
    {
      "name": "velocity",
      "type": "Vector2",
      "default": "Vector2(0, 0)",
      "description": "Current velocity of the body"
    }
  ],
  "signals": [],
  "examples": [
    {
      "title": "Basic platformer movement",
      "code": "extends CharacterBody2D\n..."
    }
  ],
  "url": "https://docs.godotengine.org/en/stable/classes/class_characterbody2d.html"
}
```

---

### search_documentation

Search documentation for classes, methods, properties, and signals.

**Input Schema**:

```json
{
  "query": {
    "type": "string",
    "description": "Search query",
    "required": true
  },
  "categories": {
    "type": "array",
    "description": "Search categories",
    "items": {"enum": ["classes", "methods", "properties", "signals", "tutorials"]},
    "default": ["classes", "methods", "properties"]
  },
  "max_results": {
    "type": "number",
    "default": 10
  }
}
```

**Output**:

```json
{
  "results": [
    {
      "type": "class",
      "name": "CharacterBody2D",
      "description": "Character body 2D node...",
      "url": "https://docs.godotengine.org/...",
      "relevance": 0.98
    },
    {
      "type": "method",
      "class": "CharacterBody2D",
      "name": "move_and_slide",
      "description": "Moves the body...",
      "url": "https://docs.godotengine.org/...#move_and_slide",
      "relevance": 0.87
    }
  ],
  "count": 2,
  "query": "character movement"
}
```

---

### get_method_documentation

Get method information with parameters and examples.

**Input Schema**:

```json
{
  "class_name": {
    "type": "string",
    "required": true
  },
  "method_name": {
    "type": "string",
    "required": true
  },
  "include_examples": {
    "type": "boolean",
    "default": true
  }
}
```

**Output**:

```json
{
  "class": "CharacterBody2D",
  "method": "move_and_slide",
  "return_type": "bool",
  "parameters": [],
  "description": "Moves the body along velocity vector...",
  "examples": [
    {
      "description": "Basic usage",
      "code": "velocity.y += gravity * delta\nmove_and_slide()"
    }
  ],
  "notes": [
    "Should be called in _physics_process()",
    "Automatically handles collisions"
  ],
  "url": "https://docs.godotengine.org/..."
}
```

---

### get_best_practices

Access best practices for common Godot topics.

**Input Schema**:

```json
{
  "topic": {
    "type": "string",
    "enum": ["physics", "signals", "gdscript", "performance", "architecture", "ui", "animation"],
    "required": true
  },
  "subtopic": {
    "type": "string",
    "description": "Specific subtopic within main topic"
  }
}
```

**Output**:

```json
{
  "topic": "physics",
  "subtopic": "collision_detection",
  "best_practices": [
    {
      "title": "Use collision layers and masks effectively",
      "description": "Separate collision detection into layers...",
      "examples": [
        "# Player on layer 1, detects layers 2 (enemies) and 4 (world)\ncollision_layer = 1\ncollision_mask = 6  # Binary: 110 = layers 2 and 4"
      ],
      "anti_patterns": [
        "Don't use collision_mask = 0xFFFFFFFF (all layers)"
      ]
    }
  ],
  "related_documentation": [
    "https://docs.godotengine.org/..."
  ]
}
```

---

### check_deprecated_features

Support for Godot 4.5+ features and deprecated feature warnings.

**Input Schema**:

```json
{
  "feature_name": {
    "type": "string",
    "description": "Feature, method, or property name to check",
    "required": true
  },
  "godot_version": {
    "type": "string",
    "description": "Target Godot version",
    "default": "4.6.0"
  }
}
```

**Output**:

```json
{
  "feature": "KinematicBody2D",
  "deprecated": true,
  "deprecated_in_version": "4.0.0",
  "replacement": "CharacterBody2D",
  "migration_guide": "Rename KinematicBody2D to CharacterBody2D. Replace move_and_slide_with_snap() with move_and_slide().",
  "breaking_changes": [
    "velocity is now a property instead of being passed to move_and_slide()"
  ],
  "documentation_url": "https://docs.godotengine.org/en/stable/tutorials/migrating/upgrading_to_godot_4.html"
}
```

---

## UID Operations

::: tip Godot 4.4+ Required
UID operations require Godot 4.4 or later.
:::

### get_file_uid

Get UID for a specific file.

**Input Schema**:

```json
{
  "file_path": {
    "type": "string",
    "description": "Path to file (scene, script, resource)",
    "required": true
  }
}
```

**Output**:

```json
{
  "file_path": "res://scenes/Player.tscn",
  "uid": "uid://abcdef123456",
  "type": "PackedScene"
}
```

---

### update_uid_references

Update UID references by resaving resources.

**Input Schema**:

```json
{
  "file_path": {
    "type": "string",
    "description": "Path to resource to resave",
    "required": true
  },
  "recursive": {
    "type": "boolean",
    "description": "Update all dependent resources",
    "default": false
  }
}
```

**Output**:

```json
{
  "updated": true,
  "file_path": "res://scenes/Player.tscn",
  "uid": "uid://abcdef123456",
  "dependencies_updated": 3,
  "updated_files": [
    "res://scenes/Level1.tscn",
    "res://scenes/Level2.tscn"
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
