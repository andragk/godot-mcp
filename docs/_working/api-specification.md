# Godot 4.6 MCP Server - Complete API Specification

**Document Version**: 1.0.0  
**Date**: February 3, 2026  
**Status**: API Reference  
**Authors**: @api-design-orchestrator

---

## Executive Summary

This document provides the complete API specification for the Godot 4.6 MCP Server, a Node.js-based bridge enabling Model Context Protocol (MCP) clients to interact with Godot Engine via HTTP REST (JSON-RPC 2.0). The specification covers all public interfaces including MCP protocol mappings, tool schemas, resource patterns, Godot bridge endpoints, and the sidecar Web UI API.

**Key Characteristics**:
- **Protocol**: JSON-RPC 2.0 over HTTP for Node.js ↔ Godot communication
- **Transport**: stdio for MCP clients, HTTP/REST for internal bridge
- **Validation**: JSON Schema for all request/response payloads
- **Error Handling**: Structured error codes with recovery strategies
- **Performance**: <50ms p99 latency for read operations
- **Versioning**: Semantic versioning with backward compatibility guarantees

---

## Table of Contents

1. [MCP Protocol Mapping](#1-mcp-protocol-mapping)
2. [Tool Specifications](#2-tool-specifications)
3. [Resource Specifications](#3-resource-specifications)
4. [Godot JSON-RPC API](#4-godot-json-rpc-api)
5. [Web UI API (Sidecar)](#5-web-ui-api-sidecar)
6. [Error Handling](#6-error-handling)
7. [API Versioning Strategy](#7-api-versioning-strategy)

---

## 1. MCP Protocol Mapping

### 1.1 Architecture Overview

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
                                      │  (HTTPServer)    │
                                      └────────┬─────────┘
                                               │
                                               │ Godot API
                                               │ FileAccess
                                               │
                                      ┌────────▼─────────┐
                                      │  Godot Engine    │
                                      │  File System     │
                                      └──────────────────┘
```

### 1.2 Request/Response Flow

#### Layer 1: MCP Client → Node.js Server (stdio)

**Request Format** (MCP Protocol):
```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "tools/call",
  "params": {
    "name": "read_scene",
    "arguments": {
      "path": "scenes/main_menu.tscn"
    }
  }
}
```

**Response Format** (MCP Protocol):
```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"nodes\": [...], \"connections\": [...]}"
      }
    ],
    "isError": false
  }
}
```

#### Layer 2: Node.js Server → Godot Bridge (HTTP)

**Request Format** (Internal JSON-RPC 2.0):
```http
POST http://localhost:7777/rpc HTTP/1.1
Content-Type: application/json
X-Request-ID: req-001
X-Client-Session: session-abc123

{
  "jsonrpc": "2.0",
  "id": "bridge-req-001",
  "method": "scene.read",
  "params": {
    "path": "res://scenes/main_menu.tscn",
    "include_metadata": true
  }
}
```

**Response Format** (Internal JSON-RPC 2.0):
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-ID: req-001
X-Response-Time-Ms: 12

{
  "jsonrpc": "2.0",
  "id": "bridge-req-001",
  "result": {
    "path": "res://scenes/main_menu.tscn",
    "nodes": [
      {
        "name": "MainMenu",
        "type": "Control",
        "properties": {...},
        "children": [...]
      }
    ],
    "connections": [...],
    "metadata": {
      "file_size": 4096,
      "modified_time": "2026-02-03T10:30:00Z",
      "godot_version": "4.6.0"
    }
  }
}
```

### 1.3 MCP Tool to Godot Operation Mapping

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

### 1.4 MCP Resource to Godot File System Mapping

| MCP Resource URI | Godot Path | Access Method |
|------------------|------------|---------------|
| `godot://scenes/main_menu.tscn` | `res://scenes/main_menu.tscn` | `ResourceLoader.load()` |
| `godot://scripts/player.gd` | `res://scripts/player.gd` | `FileAccess.open(READ)` |
| `godot://resources/theme.tres` | `res://resources/theme.tres` | `ResourceLoader.load()` |
| `godot://assets/sprites/icon.png` | `res://assets/sprites/icon.png` | Binary `FileAccess.open(READ)` |
| `godot://project.godot` | `res://project.godot` | ConfigFile API |

---

## 2. Tool Specifications

### 2.1 Tool Overview

All tools follow JSON Schema validation via Zod-equivalent schemas. Each tool returns structured data with standardized error handling.

**Tool Categories**:
- **Read Tools**: Query project state (read-only, cacheable)
- **Write Tools**: Modify project state (idempotent where possible)
- **Query Tools**: Search/filter operations

---

### 2.2 Read Tools

#### 2.2.1 `list_scenes`

**Description**: Lists all scene files (`.tscn`) in the project with optional filtering and metadata.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "directory": {
      "type": "string",
      "description": "Directory path relative to project root (default: root)",
      "default": "",
      "pattern": "^[a-zA-Z0-9_/.-]*$"
    },
    "recursive": {
      "type": "boolean",
      "description": "Whether to search subdirectories",
      "default": true
    },
    "include_metadata": {
      "type": "boolean",
      "description": "Include file size, modification time",
      "default": false
    },
    "filter": {
      "type": "string",
      "description": "Regex pattern to filter scene names",
      "pattern": "^.*$"
    }
  },
  "required": []
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "scenes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "description": "Relative path from project root"
          },
          "name": {
            "type": "string",
            "description": "Scene filename without extension"
          },
          "metadata": {
            "type": "object",
            "properties": {
              "file_size": {"type": "integer"},
              "modified_time": {"type": "string", "format": "date-time"},
              "is_main_scene": {"type": "boolean"}
            }
          }
        },
        "required": ["path", "name"]
      }
    },
    "total_count": {"type": "integer"}
  },
  "required": ["scenes", "total_count"]
}
```

**Example Request**:
```json
{
  "name": "list_scenes",
  "arguments": {
    "directory": "scenes/menus",
    "recursive": true,
    "include_metadata": true
  }
}
```

**Example Response**:
```json
{
  "scenes": [
    {
      "path": "scenes/menus/main_menu.tscn",
      "name": "main_menu",
      "metadata": {
        "file_size": 4096,
        "modified_time": "2026-02-03T10:30:00Z",
        "is_main_scene": true
      }
    },
    {
      "path": "scenes/menus/settings_menu.tscn",
      "name": "settings_menu",
      "metadata": {
        "file_size": 2048,
        "modified_time": "2026-02-02T15:22:00Z",
        "is_main_scene": false
      }
    }
  ],
  "total_count": 2
}
```

**Error Codes**:
- `INVALID_PATH`: Directory path contains invalid characters
- `DIRECTORY_NOT_FOUND`: Specified directory does not exist
- `FILE_SYSTEM_ERROR`: Unable to read directory contents

---

#### 2.2.2 `read_scene`

**Description**: Reads and parses a scene file, returning structured representation of scene tree, nodes, properties, and connections.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Scene file path relative to project root",
      "pattern": "^.*\\.tscn$"
    },
    "include_children": {
      "type": "boolean",
      "description": "Include full child node hierarchy",
      "default": true
    },
    "include_connections": {
      "type": "boolean",
      "description": "Include signal connections",
      "default": true
    },
    "max_depth": {
      "type": "integer",
      "description": "Maximum depth of node hierarchy to return",
      "minimum": 1,
      "maximum": 20,
      "default": 20
    }
  },
  "required": ["path"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {"type": "string"},
    "root_node": {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "type": {"type": "string"},
        "instance": {"type": "string"},
        "properties": {
          "type": "object",
          "additionalProperties": true
        },
        "children": {
          "type": "array",
          "items": {"$ref": "#/properties/root_node"}
        },
        "groups": {
          "type": "array",
          "items": {"type": "string"}
        },
        "script": {"type": "string"}
      },
      "required": ["name", "type"]
    },
    "connections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "signal": {"type": "string"},
          "from": {"type": "string"},
          "to": {"type": "string"},
          "method": {"type": "string"},
          "binds": {"type": "array"}
        },
        "required": ["signal", "from", "to", "method"]
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "file_size": {"type": "integer"},
        "modified_time": {"type": "string", "format": "date-time"},
        "godot_version": {"type": "string"},
        "node_count": {"type": "integer"}
      }
    }
  },
  "required": ["path", "root_node"]
}
```

**Example Request**:
```json
{
  "name": "read_scene",
  "arguments": {
    "path": "scenes/main_menu.tscn",
    "include_children": true,
    "include_connections": true
  }
}
```

**Example Response**:
```json
{
  "path": "scenes/main_menu.tscn",
  "root_node": {
    "name": "MainMenu",
    "type": "Control",
    "properties": {
      "layout_mode": 3,
      "anchors_preset": 15,
      "anchor_right": 1.0,
      "anchor_bottom": 1.0
    },
    "children": [
      {
        "name": "Title",
        "type": "Label",
        "properties": {
          "text": "My Awesome Game",
          "theme_override_font_sizes/font_size": 48
        },
        "children": []
      },
      {
        "name": "StartButton",
        "type": "Button",
        "properties": {
          "text": "Start Game"
        },
        "script": "res://scripts/start_button.gd",
        "children": []
      }
    ],
    "groups": ["main_menu"]
  },
  "connections": [
    {
      "signal": "pressed",
      "from": "StartButton",
      "to": "MainMenu",
      "method": "_on_start_button_pressed",
      "binds": []
    }
  ],
  "metadata": {
    "file_size": 4096,
    "modified_time": "2026-02-03T10:30:00Z",
    "godot_version": "4.6.0.stable",
    "node_count": 3
  }
}
```

**Error Codes**:
- `FILE_NOT_FOUND`: Scene file does not exist
- `PARSE_ERROR`: Invalid TSCN format
- `FILE_SYSTEM_ERROR`: Unable to read file

---

#### 2.2.3 `list_scripts`

**Description**: Lists all script files (`.gd`, `.cs`) in the project.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "directory": {
      "type": "string",
      "description": "Directory path relative to project root",
      "default": ""
    },
    "recursive": {
      "type": "boolean",
      "default": true
    },
    "language": {
      "type": "string",
      "enum": ["gdscript", "csharp", "all"],
      "default": "all",
      "description": "Filter by script language"
    },
    "include_metadata": {
      "type": "boolean",
      "default": false
    }
  },
  "required": []
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "scripts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": {"type": "string"},
          "name": {"type": "string"},
          "language": {
            "type": "string",
            "enum": ["gdscript", "csharp"]
          },
          "metadata": {
            "type": "object",
            "properties": {
              "file_size": {"type": "integer"},
              "modified_time": {"type": "string", "format": "date-time"},
              "line_count": {"type": "integer"},
              "class_name": {"type": "string"}
            }
          }
        },
        "required": ["path", "name", "language"]
      }
    },
    "total_count": {"type": "integer"}
  },
  "required": ["scripts", "total_count"]
}
```

**Example Request**:
```json
{
  "name": "list_scripts",
  "arguments": {
    "directory": "scripts",
    "language": "gdscript",
    "include_metadata": true
  }
}
```

**Example Response**:
```json
{
  "scripts": [
    {
      "path": "scripts/player.gd",
      "name": "player",
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

**Error Codes**:
- `INVALID_PATH`: Directory path invalid
- `DIRECTORY_NOT_FOUND`: Directory does not exist

---

#### 2.2.4 `read_script`

**Description**: Reads script file content with optional syntax metadata.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Script file path relative to project root",
      "pattern": "^.*\\.(gd|cs)$"
    },
    "include_analysis": {
      "type": "boolean",
      "description": "Include basic syntax analysis (class name, functions)",
      "default": false
    }
  },
  "required": ["path"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {"type": "string"},
    "content": {"type": "string"},
    "language": {
      "type": "string",
      "enum": ["gdscript", "csharp"]
    },
    "analysis": {
      "type": "object",
      "properties": {
        "class_name": {"type": "string"},
        "extends": {"type": "string"},
        "functions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": {"type": "string"},
              "line_number": {"type": "integer"},
              "is_virtual": {"type": "boolean"}
            }
          }
        },
        "signals": {
          "type": "array",
          "items": {"type": "string"}
        }
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "file_size": {"type": "integer"},
        "modified_time": {"type": "string", "format": "date-time"},
        "line_count": {"type": "integer"}
      }
    }
  },
  "required": ["path", "content", "language"]
}
```

**Example Response**:
```json
{
  "path": "scripts/player.gd",
  "content": "extends CharacterBody2D\n\nclass_name Player\n\n@export var speed: float = 200.0\n\nfunc _physics_process(delta: float) -> void:\n\tvar velocity = Vector2.ZERO\n\tif Input.is_action_pressed(\"move_right\"):\n\t\tvelocity.x += 1\n\tmove_and_slide()\n",
  "language": "gdscript",
  "analysis": {
    "class_name": "Player",
    "extends": "CharacterBody2D",
    "functions": [
      {
        "name": "_physics_process",
        "line_number": 7,
        "is_virtual": true
      }
    ],
    "signals": []
  },
  "metadata": {
    "file_size": 256,
    "modified_time": "2026-02-03T09:15:00Z",
    "line_count": 11
  }
}
```

**Error Codes**:
- `FILE_NOT_FOUND`: Script file does not exist
- `FILE_SYSTEM_ERROR`: Unable to read file

---

#### 2.2.5 `get_project_structure`

**Description**: Returns hierarchical directory structure of the entire project.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "max_depth": {
      "type": "integer",
      "minimum": 1,
      "maximum": 20,
      "default": 10
    },
    "include_hidden": {
      "type": "boolean",
      "description": "Include hidden files/directories (starting with .)",
      "default": false
    },
    "file_types": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Filter by file extensions (e.g., ['tscn', 'gd'])",
      "default": []
    }
  },
  "required": []
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "root": {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "type": {
          "type": "string",
          "enum": ["directory", "file"]
        },
        "path": {"type": "string"},
        "children": {
          "type": "array",
          "items": {"$ref": "#/properties/root"}
        },
        "metadata": {
          "type": "object",
          "properties": {
            "file_size": {"type": "integer"},
            "modified_time": {"type": "string"}
          }
        }
      },
      "required": ["name", "type", "path"]
    },
    "statistics": {
      "type": "object",
      "properties": {
        "total_files": {"type": "integer"},
        "total_directories": {"type": "integer"},
        "total_size": {"type": "integer"}
      }
    }
  },
  "required": ["root"]
}
```

**Example Response**:
```json
{
  "root": {
    "name": "project_root",
    "type": "directory",
    "path": "",
    "children": [
      {
        "name": "scenes",
        "type": "directory",
        "path": "scenes",
        "children": [
          {
            "name": "main_menu.tscn",
            "type": "file",
            "path": "scenes/main_menu.tscn",
            "children": [],
            "metadata": {
              "file_size": 4096,
              "modified_time": "2026-02-03T10:30:00Z"
            }
          }
        ]
      },
      {
        "name": "scripts",
        "type": "directory",
        "path": "scripts",
        "children": [
          {
            "name": "player.gd",
            "type": "file",
            "path": "scripts/player.gd",
            "children": []
          }
        ]
      }
    ]
  },
  "statistics": {
    "total_files": 2,
    "total_directories": 2,
    "total_size": 8192
  }
}
```

**Error Codes**:
- `FILE_SYSTEM_ERROR`: Unable to traverse directories

---

#### 2.2.6 `search_nodes`

**Description**: Searches for nodes across all scenes matching specified criteria.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "object",
      "properties": {
        "name_pattern": {
          "type": "string",
          "description": "Regex pattern for node name"
        },
        "node_type": {
          "type": "string",
          "description": "Godot node type (e.g., 'Button', 'Sprite2D')"
        },
        "has_script": {
          "type": "boolean",
          "description": "Filter nodes with attached scripts"
        },
        "in_group": {
          "type": "string",
          "description": "Filter nodes belonging to specific group"
        },
        "property_filter": {
          "type": "object",
          "description": "Filter by property values",
          "additionalProperties": true
        }
      }
    },
    "scope": {
      "type": "object",
      "properties": {
        "scenes": {
          "type": "array",
          "items": {"type": "string"},
          "description": "Limit search to specific scenes"
        },
        "directories": {
          "type": "array",
          "items": {"type": "string"},
          "description": "Limit search to specific directories"
        }
      }
    },
    "max_results": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000,
      "default": 100
    }
  },
  "required": ["query"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "scene_path": {"type": "string"},
          "node_path": {"type": "string"},
          "node_name": {"type": "string"},
          "node_type": {"type": "string"},
          "script": {"type": "string"},
          "groups": {
            "type": "array",
            "items": {"type": "string"}
          },
          "matched_properties": {
            "type": "object",
            "additionalProperties": true
          }
        },
        "required": ["scene_path", "node_path", "node_name", "node_type"]
      }
    },
    "total_matches": {"type": "integer"},
    "searched_scenes": {"type": "integer"}
  },
  "required": ["results", "total_matches"]
}
```

**Example Request**:
```json
{
  "name": "search_nodes",
  "arguments": {
    "query": {
      "node_type": "Button",
      "has_script": true
    },
    "max_results": 50
  }
}
```

**Example Response**:
```json
{
  "results": [
    {
      "scene_path": "scenes/main_menu.tscn",
      "node_path": "MainMenu/StartButton",
      "node_name": "StartButton",
      "node_type": "Button",
      "script": "res://scripts/start_button.gd",
      "groups": ["interactive"],
      "matched_properties": {
        "text": "Start Game"
      }
    }
  ],
  "total_matches": 1,
  "searched_scenes": 5
}
```

**Error Codes**:
- `INVALID_QUERY`: Query syntax error
- `SEARCH_TIMEOUT`: Search exceeded time limit (10s)

---

#### 2.2.7 `get_node_properties`

**Description**: Retrieves detailed property information for a specific node in a scene.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "scene_path": {
      "type": "string",
      "description": "Path to scene file"
    },
    "node_path": {
      "type": "string",
      "description": "Node path within scene (e.g., 'Root/Child/GrandChild')"
    },
    "include_inherited": {
      "type": "boolean",
      "description": "Include properties from parent classes",
      "default": false
    }
  },
  "required": ["scene_path", "node_path"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "node": {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "type": {"type": "string"},
        "path": {"type": "string"},
        "properties": {
          "type": "object",
          "additionalProperties": true
        },
        "inherited_properties": {
          "type": "object",
          "additionalProperties": true
        },
        "script": {"type": "string"},
        "groups": {
          "type": "array",
          "items": {"type": "string"}
        }
      },
      "required": ["name", "type", "path", "properties"]
    }
  },
  "required": ["node"]
}
```

**Example Request**:
```json
{
  "name": "get_node_properties",
  "arguments": {
    "scene_path": "scenes/main_menu.tscn",
    "node_path": "MainMenu/StartButton",
    "include_inherited": true
  }
}
```

**Example Response**:
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
    "inherited_properties": {
      "focus_mode": 2,
      "mouse_filter": 0,
      "theme_type_variation": ""
    },
    "script": "res://scripts/start_button.gd",
    "groups": ["interactive"]
  }
}
```

**Error Codes**:
- `SCENE_NOT_FOUND`: Scene file does not exist
- `NODE_NOT_FOUND`: Node path does not exist in scene

---

### 2.3 Write Tools

#### 2.3.1 `create_scene`

**Description**: Creates a new scene file with specified root node and optional child nodes.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Destination path for new scene",
      "pattern": "^.*\\.tscn$"
    },
    "root_node": {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "type": {"type": "string"},
        "properties": {
          "type": "object",
          "additionalProperties": true
        },
        "children": {
          "type": "array",
          "items": {"$ref": "#/properties/root_node"}
        },
        "script": {"type": "string"}
      },
      "required": ["name", "type"]
    },
    "overwrite": {
      "type": "boolean",
      "description": "Overwrite if file exists",
      "default": false
    }
  },
  "required": ["path", "root_node"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {"type": "string"},
    "created": {"type": "boolean"},
    "message": {"type": "string"}
  },
  "required": ["path", "created"]
}
```

**Example Request**:
```json
{
  "name": "create_scene",
  "arguments": {
    "path": "scenes/new_level.tscn",
    "root_node": {
      "name": "Level1",
      "type": "Node2D",
      "properties": {
        "position": {"x": 0, "y": 0}
      },
      "children": [
        {
          "name": "Player",
          "type": "CharacterBody2D",
          "script": "res://scripts/player.gd"
        },
        {
          "name": "Camera",
          "type": "Camera2D"
        }
      ]
    }
  }
}
```

**Example Response**:
```json
{
  "path": "scenes/new_level.tscn",
  "created": true,
  "message": "Scene created successfully with 3 nodes"
}
```

**Error Codes**:
- `FILE_EXISTS`: File already exists and overwrite=false
- `INVALID_NODE_TYPE`: Node type not recognized by Godot
- `FILE_SYSTEM_ERROR`: Unable to write file

---

#### 2.3.2 `modify_scene`

**Description**: Modifies an existing scene by applying a set of operations (add/remove/modify nodes).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Path to scene file to modify"
    },
    "operations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["add_node", "remove_node", "modify_node", "add_connection", "remove_connection"]
          },
          "target_path": {
            "type": "string",
            "description": "Node path for operation (parent for add_node)"
          },
          "data": {
            "type": "object",
            "description": "Operation-specific data",
            "additionalProperties": true
          }
        },
        "required": ["type"]
      }
    },
    "create_backup": {
      "type": "boolean",
      "description": "Create .backup file before modifying",
      "default": true
    }
  },
  "required": ["path", "operations"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {"type": "string"},
    "modified": {"type": "boolean"},
    "operations_applied": {"type": "integer"},
    "backup_path": {"type": "string"},
    "message": {"type": "string"}
  },
  "required": ["path", "modified", "operations_applied"]
}
```

**Example Request**:
```json
{
  "name": "modify_scene",
  "arguments": {
    "path": "scenes/main_menu.tscn",
    "operations": [
      {
        "type": "add_node",
        "target_path": "MainMenu",
        "data": {
          "name": "OptionsButton",
          "type": "Button",
          "properties": {
            "text": "Options"
          }
        }
      },
      {
        "type": "modify_node",
        "target_path": "MainMenu/StartButton",
        "data": {
          "properties": {
            "text": "New Game"
          }
        }
      }
    ]
  }
}
```

**Example Response**:
```json
{
  "path": "scenes/main_menu.tscn",
  "modified": true,
  "operations_applied": 2,
  "backup_path": "scenes/main_menu.tscn.backup",
  "message": "Successfully applied 2 operations"
}
```

**Error Codes**:
- `SCENE_NOT_FOUND`: Scene file does not exist
- `INVALID_OPERATION`: Operation type or data invalid
- `NODE_NOT_FOUND`: Target node path does not exist
- `BACKUP_FAILED`: Unable to create backup file

---

#### 2.3.3 `create_script`

**Description**: Creates a new script file from template or custom content.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Destination path for new script",
      "pattern": "^.*\\.(gd|cs)$"
    },
    "template": {
      "type": "string",
      "enum": ["node", "resource", "autoload", "custom"],
      "description": "Template type for script generation",
      "default": "node"
    },
    "extends": {
      "type": "string",
      "description": "Base class for script",
      "default": "Node"
    },
    "class_name": {
      "type": "string",
      "description": "Global class name"
    },
    "content": {
      "type": "string",
      "description": "Custom script content (overrides template)"
    },
    "overwrite": {
      "type": "boolean",
      "default": false
    }
  },
  "required": ["path"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {"type": "string"},
    "created": {"type": "boolean"},
    "template_used": {"type": "string"},
    "message": {"type": "string"}
  },
  "required": ["path", "created"]
}
```

**Example Request**:
```json
{
  "name": "create_script",
  "arguments": {
    "path": "scripts/enemy.gd",
    "template": "node",
    "extends": "CharacterBody2D",
    "class_name": "Enemy"
  }
}
```

**Example Response**:
```json
{
  "path": "scripts/enemy.gd",
  "created": true,
  "template_used": "node",
  "message": "Script created with CharacterBody2D template"
}
```

**Generated Content Example**:
```gdscript
extends CharacterBody2D

class_name Enemy

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	pass # Replace with function body.

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass
```

**Error Codes**:
- `FILE_EXISTS`: File already exists and overwrite=false
- `INVALID_TEMPLATE`: Template type not recognized
- `FILE_SYSTEM_ERROR`: Unable to write file

---

#### 2.3.4 `modify_script`

**Description**: Modifies script content using text operations (insert, replace, delete).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Path to script file"
    },
    "operations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["insert", "replace", "delete"]
          },
          "line": {
            "type": "integer",
            "description": "Line number (1-indexed)",
            "minimum": 1
          },
          "content": {
            "type": "string",
            "description": "Content to insert or replace with"
          },
          "search": {
            "type": "string",
            "description": "Text to search for (replace/delete)"
          },
          "replace_all": {
            "type": "boolean",
            "description": "Replace all occurrences",
            "default": false
          }
        },
        "required": ["type"]
      }
    },
    "create_backup": {
      "type": "boolean",
      "default": true
    }
  },
  "required": ["path", "operations"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "path": {"type": "string"},
    "modified": {"type": "boolean"},
    "operations_applied": {"type": "integer"},
    "backup_path": {"type": "string"},
    "line_count_before": {"type": "integer"},
    "line_count_after": {"type": "integer"}
  },
  "required": ["path", "modified", "operations_applied"]
}
```

**Example Request**:
```json
{
  "name": "modify_script",
  "arguments": {
    "path": "scripts/player.gd",
    "operations": [
      {
        "type": "insert",
        "line": 5,
        "content": "@export var jump_force: float = 400.0\n"
      },
      {
        "type": "replace",
        "search": "var speed: float = 200.0",
        "content": "var speed: float = 250.0"
      }
    ]
  }
}
```

**Example Response**:
```json
{
  "path": "scripts/player.gd",
  "modified": true,
  "operations_applied": 2,
  "backup_path": "scripts/player.gd.backup",
  "line_count_before": 85,
  "line_count_after": 86
}
```

**Error Codes**:
- `FILE_NOT_FOUND`: Script file does not exist
- `INVALID_LINE_NUMBER`: Line number out of range
- `SEARCH_TEXT_NOT_FOUND`: Search text not found in file

---

#### 2.3.5 `rename_node`

**Description**: Renames a node within a scene and updates all references.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "scene_path": {
      "type": "string",
      "description": "Path to scene file"
    },
    "node_path": {
      "type": "string",
      "description": "Current node path"
    },
    "new_name": {
      "type": "string",
      "description": "New node name",
      "pattern": "^[a-zA-Z_][a-zA-Z0-9_]*$"
    },
    "update_references": {
      "type": "boolean",
      "description": "Update all references to this node (connections, scripts)",
      "default": true
    },
    "create_backup": {
      "type": "boolean",
      "default": true
    }
  },
  "required": ["scene_path", "node_path", "new_name"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "scene_path": {"type": "string"},
    "renamed": {"type": "boolean"},
    "old_name": {"type": "string"},
    "new_name": {"type": "string"},
    "references_updated": {"type": "integer"},
    "backup_path": {"type": "string"}
  },
  "required": ["scene_path", "renamed", "old_name", "new_name"]
}
```

**Example Request**:
```json
{
  "name": "rename_node",
  "arguments": {
    "scene_path": "scenes/main_menu.tscn",
    "node_path": "MainMenu/StartButton",
    "new_name": "PlayButton",
    "update_references": true
  }
}
```

**Example Response**:
```json
{
  "scene_path": "scenes/main_menu.tscn",
  "renamed": true,
  "old_name": "StartButton",
  "new_name": "PlayButton",
  "references_updated": 3,
  "backup_path": "scenes/main_menu.tscn.backup"
}
```

**Error Codes**:
- `SCENE_NOT_FOUND`: Scene file does not exist
- `NODE_NOT_FOUND`: Node path does not exist
- `INVALID_NAME`: New name contains invalid characters
- `NAME_CONFLICT`: Node with new name already exists at same level

---

## 3. Resource Specifications

### 3.1 Resource URI Patterns

MCP Resources provide read-only access to Godot project files via URI patterns.

**URI Format**: `godot://<category>/<path>`

| URI Pattern | Description | MIME Type |
|-------------|-------------|-----------|
| `godot://scenes/{path}` | Scene files (`.tscn`, `.scn`) | `application/x-godot-scene` |
| `godot://scripts/{path}` | Script files (`.gd`, `.cs`) | `text/x-gdscript`, `text/x-csharp` |
| `godot://resources/{path}` | Resource files (`.tres`, `.res`) | `application/x-godot-resource` |
| `godot://assets/{path}` | Asset files (images, audio, etc.) | `image/*`, `audio/*`, etc. |
| `godot://project.godot` | Project configuration | `text/plain` |

### 3.2 Resource Metadata Structure

All resources return metadata in standardized format:

```json
{
  "uri": "godot://scenes/main_menu.tscn",
  "mimeType": "application/x-godot-scene",
  "metadata": {
    "file_size": 4096,
    "modified_time": "2026-02-03T10:30:00Z",
    "created_time": "2026-01-15T14:20:00Z",
    "godot_version": "4.6.0.stable",
    "encoding": "utf-8"
  }
}
```

### 3.3 Resource Caching Rules

**Cache Strategy**: LRU cache with TTL

| Resource Type | Cache TTL | Cache Key |
|---------------|-----------|-----------|
| Scenes | 5 minutes | URI + modified_time |
| Scripts | 5 minutes | URI + modified_time |
| Resources | 10 minutes | URI + modified_time |
| Assets | 30 minutes | URI + file_size |

**Cache Invalidation**:
- Automatic on file modification (via filesystem watcher)
- Manual via `cache.clear()` API endpoint
- TTL expiration

### 3.4 Resource Resolution Examples

#### Example 1: Scene Resource

**Request**:
```json
{
  "method": "resources/read",
  "params": {
    "uri": "godot://scenes/main_menu.tscn"
  }
}
```

**Response**:
```json
{
  "contents": [
    {
      "uri": "godot://scenes/main_menu.tscn",
      "mimeType": "application/x-godot-scene",
      "text": "[gd_scene load_steps=2 format=3]\n\n[node name=\"MainMenu\" type=\"Control\"]...",
      "metadata": {
        "file_size": 4096,
        "modified_time": "2026-02-03T10:30:00Z"
      }
    }
  ]
}
```

#### Example 2: Script Resource

**Request**:
```json
{
  "method": "resources/read",
  "params": {
    "uri": "godot://scripts/player.gd"
  }
}
```

**Response**:
```json
{
  "contents": [
    {
      "uri": "godot://scripts/player.gd",
      "mimeType": "text/x-gdscript",
      "text": "extends CharacterBody2D\n\nclass_name Player\n\n@export var speed: float = 200.0\n...",
      "metadata": {
        "file_size": 2048,
        "modified_time": "2026-02-03T09:15:00Z",
        "line_count": 85
      }
    }
  ]
}
```

#### Example 3: Resource Listing

**Request**:
```json
{
  "method": "resources/list",
  "params": {
    "uri": "godot://scenes/"
  }
}
```

**Response**:
```json
{
  "resources": [
    {
      "uri": "godot://scenes/main_menu.tscn",
      "name": "main_menu.tscn",
      "mimeType": "application/x-godot-scene"
    },
    {
      "uri": "godot://scenes/game_level.tscn",
      "name": "game_level.tscn",
      "mimeType": "application/x-godot-scene"
    }
  ]
}
```

---

## 4. Godot JSON-RPC API

### 4.1 Endpoint Configuration

**Base URL**: `http://localhost:7777`  
**Endpoint**: `POST /rpc`  
**Protocol**: JSON-RPC 2.0  
**Content-Type**: `application/json`

### 4.2 Request Format

**Standard Request**:
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "namespace.operation",
  "params": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

**Request Headers**:
```http
POST /rpc HTTP/1.1
Host: localhost:7777
Content-Type: application/json
X-Request-ID: unique-request-id
X-Client-Session: session-abc123
X-Client-Version: 1.0.0
Content-Length: 123
```

### 4.3 Response Format

**Success Response**:
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "result": {
    "data": "operation result"
  }
}
```

**Response Headers**:
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-ID: unique-request-id
X-Response-Time-Ms: 12
X-Server-Version: 1.0.0
Content-Length: 89
```

**Error Response**:
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": {
      "details": "Missing required parameter 'path'",
      "timestamp": "2026-02-03T10:30:00Z",
      "request_id": "unique-request-id"
    }
  }
}
```

### 4.4 Method Namespaces

| Namespace | Description | Example Methods |
|-----------|-------------|-----------------|
| `scene` | Scene operations | `scene.list`, `scene.read`, `scene.create`, `scene.modify` |
| `script` | Script operations | `script.list`, `script.read`, `script.create`, `script.modify` |
| `project` | Project-level operations | `project.structure`, `project.config` |
| `resource` | Resource operations | `resource.load`, `resource.save` |
| `system` | System utilities | `system.health`, `system.version` |

### 4.5 Batch Requests

**Batch Request Format**:
```json
[
  {
    "jsonrpc": "2.0",
    "id": "req-1",
    "method": "scene.list",
    "params": {"directory": "scenes"}
  },
  {
    "jsonrpc": "2.0",
    "id": "req-2",
    "method": "script.list",
    "params": {"directory": "scripts"}
  }
]
```

**Batch Response Format**:
```json
[
  {
    "jsonrpc": "2.0",
    "id": "req-1",
    "result": {"scenes": [...]}
  },
  {
    "jsonrpc": "2.0",
    "id": "req-2",
    "result": {"scripts": [...]}
  }
]
```

**Batch Processing Rules**:
- All requests executed sequentially (not parallel)
- Individual request failures don't abort batch
- Response order matches request order
- Max batch size: 50 requests

### 4.6 Method Catalog

#### 4.6.1 Scene Methods

**`scene.list`**
```json
{
  "method": "scene.list",
  "params": {
    "directory": "scenes",
    "recursive": true,
    "include_metadata": false
  }
}
```

**`scene.read`**
```json
{
  "method": "scene.read",
  "params": {
    "path": "res://scenes/main_menu.tscn",
    "include_children": true,
    "include_connections": true,
    "max_depth": 10
  }
}
```

**`scene.create`**
```json
{
  "method": "scene.create",
  "params": {
    "path": "res://scenes/new_level.tscn",
    "root_node": {
      "name": "Level1",
      "type": "Node2D"
    }
  }
}
```

**`scene.modify`**
```json
{
  "method": "scene.modify",
  "params": {
    "path": "res://scenes/main_menu.tscn",
    "operations": [
      {"type": "add_node", "target_path": "Root", "data": {...}}
    ]
  }
}
```

**`scene.search_nodes`**
```json
{
  "method": "scene.search_nodes",
  "params": {
    "query": {
      "node_type": "Button",
      "has_script": true
    }
  }
}
```

**`scene.get_node_properties`**
```json
{
  "method": "scene.get_node_properties",
  "params": {
    "scene_path": "res://scenes/main_menu.tscn",
    "node_path": "MainMenu/StartButton"
  }
}
```

**`scene.rename_node`**
```json
{
  "method": "scene.rename_node",
  "params": {
    "scene_path": "res://scenes/main_menu.tscn",
    "node_path": "MainMenu/StartButton",
    "new_name": "PlayButton"
  }
}
```

#### 4.6.2 Script Methods

**`script.list`**
```json
{
  "method": "script.list",
  "params": {
    "directory": "scripts",
    "language": "gdscript",
    "recursive": true
  }
}
```

**`script.read`**
```json
{
  "method": "script.read",
  "params": {
    "path": "res://scripts/player.gd",
    "include_analysis": true
  }
}
```

**`script.create`**
```json
{
  "method": "script.create",
  "params": {
    "path": "res://scripts/enemy.gd",
    "template": "node",
    "extends": "CharacterBody2D",
    "class_name": "Enemy"
  }
}
```

**`script.modify`**
```json
{
  "method": "script.modify",
  "params": {
    "path": "res://scripts/player.gd",
    "operations": [
      {"type": "insert", "line": 5, "content": "@export var jump_force: float = 400.0\n"}
    ]
  }
}
```

#### 4.6.3 Project Methods

**`project.structure`**
```json
{
  "method": "project.structure",
  "params": {
    "max_depth": 10,
    "include_hidden": false
  }
}
```

**`project.config`**
```json
{
  "method": "project.config",
  "params": {
    "section": "application",
    "key": "config/name"
  }
}
```

#### 4.6.4 System Methods

**`system.health`**
```json
{
  "method": "system.health",
  "params": {}
}
```

Response:
```json
{
  "result": {
    "status": "healthy",
    "uptime_seconds": 3600,
    "godot_version": "4.6.0.stable",
    "project_path": "/path/to/project"
  }
}
```

**`system.version`**
```json
{
  "method": "system.version",
  "params": {}
}
```

Response:
```json
{
  "result": {
    "bridge_version": "1.0.0",
    "godot_version": "4.6.0.stable",
    "api_version": "1.0.0"
  }
}
```

---

## 5. Web UI API (Sidecar)

### 5.1 API Overview

**Base URL**: `http://localhost:8080`  
**Protocol**: HTTP/REST + Server-Sent Events (SSE)  
**Authentication**: None (localhost only, optional API key for production)

### 5.2 Lifecycle Endpoints

#### 5.2.1 `GET /api/status`

**Description**: Returns server status and connection information.

**Request**:
```http
GET /api/status HTTP/1.1
Host: localhost:8080
```

**Response**:
```json
{
  "server": {
    "status": "running",
    "uptime_seconds": 3600,
    "version": "1.0.0",
    "pid": 12345
  },
  "godot": {
    "connected": true,
    "bridge_url": "http://localhost:7777",
    "godot_version": "4.6.0.stable",
    "project_name": "My Awesome Game",
    "project_path": "C:/Users/Dev/Projects/my_game"
  },
  "mcp": {
    "active_sessions": 2,
    "total_requests": 156,
    "cache_hit_rate": 0.85
  },
  "performance": {
    "avg_response_time_ms": 15,
    "p99_response_time_ms": 45,
    "requests_per_minute": 12
  }
}
```

#### 5.2.2 `POST /api/lifecycle/start`

**Description**: Starts the MCP server and Godot bridge connection.

**Request**:
```http
POST /api/lifecycle/start HTTP/1.1
Host: localhost:8080
Content-Type: application/json

{
  "godot_executable": "C:/Godot/Godot_v4.6.exe",
  "project_path": "C:/Users/Dev/Projects/my_game",
  "bridge_port": 7777,
  "auto_connect": true
}
```

**Response**:
```json
{
  "status": "started",
  "server_pid": 12345,
  "godot_pid": 67890,
  "bridge_url": "http://localhost:7777",
  "message": "Server started successfully"
}
```

#### 5.2.3 `POST /api/lifecycle/stop`

**Description**: Stops the MCP server and disconnects Godot bridge.

**Request**:
```http
POST /api/lifecycle/stop HTTP/1.1
Host: localhost:8080
Content-Type: application/json

{
  "force": false,
  "kill_godot": false
}
```

**Response**:
```json
{
  "status": "stopped",
  "graceful_shutdown": true,
  "pending_requests": 0,
  "message": "Server stopped successfully"
}
```

#### 5.2.4 `POST /api/lifecycle/restart`

**Description**: Restarts the MCP server (graceful restart).

**Request**:
```http
POST /api/lifecycle/restart HTTP/1.1
Host: localhost:8080
```

**Response**:
```json
{
  "status": "restarted",
  "downtime_ms": 150,
  "message": "Server restarted successfully"
}
```

### 5.3 Observability Endpoints

#### 5.3.1 `GET /api/logs/stream` (SSE)

**Description**: Real-time log streaming via Server-Sent Events.

**Request**:
```http
GET /api/logs/stream?level=info&component=bridge HTTP/1.1
Host: localhost:8080
Accept: text/event-stream
```

**Response Stream**:
```
event: log
data: {"timestamp":"2026-02-03T10:30:00Z","level":"info","component":"bridge","message":"Scene loaded: main_menu.tscn","request_id":"req-001"}

event: log
data: {"timestamp":"2026-02-03T10:30:01Z","level":"debug","component":"cache","message":"Cache hit for godot://scenes/main_menu.tscn"}

event: heartbeat
data: {"timestamp":"2026-02-03T10:30:05Z"}
```

**Query Parameters**:
- `level`: Filter by log level (`debug`, `info`, `warn`, `error`)
- `component`: Filter by component name (`bridge`, `cache`, `mcp`, `server`)
- `since`: ISO 8601 timestamp (return logs since this time)

#### 5.3.2 `GET /api/logs`

**Description**: Retrieve historical logs (paginated).

**Request**:
```http
GET /api/logs?page=1&limit=100&level=error HTTP/1.1
Host: localhost:8080
```

**Response**:
```json
{
  "logs": [
    {
      "timestamp": "2026-02-03T10:25:00Z",
      "level": "error",
      "component": "bridge",
      "message": "Failed to connect to Godot bridge",
      "error": {
        "code": "ECONNREFUSED",
        "details": "Connection refused at localhost:7777"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total_count": 1,
    "total_pages": 1
  }
}
```

#### 5.3.3 `GET /api/metrics`

**Description**: Server performance metrics.

**Request**:
```http
GET /api/metrics HTTP/1.1
Host: localhost:8080
```

**Response**:
```json
{
  "timestamp": "2026-02-03T10:30:00Z",
  "uptime_seconds": 3600,
  "requests": {
    "total": 1000,
    "succeeded": 980,
    "failed": 20,
    "rate_per_minute": 16.67
  },
  "latency": {
    "avg_ms": 15.2,
    "p50_ms": 12,
    "p95_ms": 35,
    "p99_ms": 45
  },
  "cache": {
    "size": 85,
    "max_size": 100,
    "hit_rate": 0.85,
    "evictions": 12
  },
  "memory": {
    "heap_used_mb": 45,
    "heap_total_mb": 100,
    "external_mb": 5
  }
}
```

### 5.4 Tool Management Endpoints

#### 5.4.1 `GET /api/tools`

**Description**: List all available MCP tools with schemas.

**Request**:
```http
GET /api/tools HTTP/1.1
Host: localhost:8080
```

**Response**:
```json
{
  "tools": [
    {
      "name": "list_scenes",
      "description": "Lists all scene files in the project",
      "category": "read",
      "input_schema": {...},
      "output_schema": {...},
      "examples": [...]
    },
    {
      "name": "read_scene",
      "description": "Reads and parses a scene file",
      "category": "read",
      "input_schema": {...},
      "output_schema": {...},
      "examples": [...]
    }
  ],
  "total_count": 12
}
```

#### 5.4.2 `POST /api/tools/invoke`

**Description**: Test tool invocation directly from Web UI.

**Request**:
```http
POST /api/tools/invoke HTTP/1.1
Host: localhost:8080
Content-Type: application/json

{
  "tool": "read_scene",
  "arguments": {
    "path": "scenes/main_menu.tscn",
    "include_children": true
  },
  "timeout_ms": 5000
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "path": "scenes/main_menu.tscn",
    "root_node": {...},
    "metadata": {...}
  },
  "execution_time_ms": 12,
  "timestamp": "2026-02-03T10:30:00Z"
}
```

#### 5.4.3 `GET /api/tools/{name}`

**Description**: Get detailed tool documentation.

**Request**:
```http
GET /api/tools/read_scene HTTP/1.1
Host: localhost:8080
```

**Response**:
```json
{
  "name": "read_scene",
  "description": "Reads and parses a scene file, returning structured representation",
  "version": "1.0.0",
  "category": "read",
  "input_schema": {...},
  "output_schema": {...},
  "examples": [
    {
      "title": "Read main menu scene",
      "input": {...},
      "output": {...}
    }
  ],
  "error_codes": [
    {"code": "FILE_NOT_FOUND", "description": "Scene file does not exist"},
    {"code": "PARSE_ERROR", "description": "Invalid TSCN format"}
  ]
}
```

### 5.5 Resource Browser Endpoints

#### 5.5.1 `GET /api/resources`

**Description**: Browse project resources (hierarchical).

**Request**:
```http
GET /api/resources?path=scenes&depth=2 HTTP/1.1
Host: localhost:8080
```

**Response**:
```json
{
  "path": "scenes",
  "type": "directory",
  "children": [
    {
      "name": "main_menu.tscn",
      "type": "file",
      "uri": "godot://scenes/main_menu.tscn",
      "mime_type": "application/x-godot-scene",
      "size": 4096,
      "modified_time": "2026-02-03T10:30:00Z"
    },
    {
      "name": "levels",
      "type": "directory",
      "children": [...]
    }
  ]
}
```

#### 5.5.2 `GET /api/resources/preview`

**Description**: Get resource preview (text snippet or thumbnail).

**Request**:
```http
GET /api/resources/preview?uri=godot://scenes/main_menu.tscn&lines=20 HTTP/1.1
Host: localhost:8080
```

**Response**:
```json
{
  "uri": "godot://scenes/main_menu.tscn",
  "mime_type": "application/x-godot-scene",
  "preview": {
    "type": "text",
    "content": "[gd_scene load_steps=2 format=3]\n\n[node name=\"MainMenu\" type=\"Control\"]...",
    "truncated": true,
    "full_size": 4096
  }
}
```

### 5.6 Configuration Endpoints

#### 5.6.1 `GET /api/config`

**Description**: Get current server configuration.

**Request**:
```http
GET /api/config HTTP/1.1
Host: localhost:8080
```

**Response**:
```json
{
  "server": {
    "port": 8080,
    "host": "localhost",
    "log_level": "info"
  },
  "godot": {
    "bridge_url": "http://localhost:7777",
    "timeout_ms": 5000,
    "max_retries": 3
  },
  "cache": {
    "max_size": 100,
    "ttl_seconds": 300
  },
  "security": {
    "cors_enabled": false,
    "rate_limit_enabled": true,
    "max_requests_per_minute": 100
  }
}
```

#### 5.6.2 `PUT /api/config`

**Description**: Update server configuration (hot reload).

**Request**:
```http
PUT /api/config HTTP/1.1
Host: localhost:8080
Content-Type: application/json

{
  "cache": {
    "max_size": 200,
    "ttl_seconds": 600
  },
  "server": {
    "log_level": "debug"
  }
}
```

**Response**:
```json
{
  "updated": true,
  "changes": [
    "cache.max_size: 100 → 200",
    "cache.ttl_seconds: 300 → 600",
    "server.log_level: info → debug"
  ],
  "restart_required": false
}
```

---

## 6. Error Handling

### 6.1 Error Code Taxonomy

#### 6.1.1 Validation Errors (4xx range: -32000 to -32099)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| -32000 | `INVALID_PARAMS` | Required parameters missing or invalid type | Check input schema, provide required fields |
| -32001 | `INVALID_PATH` | File/directory path contains invalid characters | Use valid path format (alphanumeric, `/`, `-`, `_`, `.`) |
| -32002 | `INVALID_NODE_TYPE` | Node type not recognized by Godot | Check Godot documentation for valid node types |
| -32003 | `INVALID_OPERATION` | Operation type not supported | Use supported operation types |
| -32004 | `SCHEMA_VALIDATION_FAILED` | Input does not match JSON Schema | Fix input to match schema requirements |
| -32005 | `INVALID_NAME` | Name contains invalid characters | Use alphanumeric characters, `_`, no spaces |

#### 6.1.2 Not Found Errors (4xx range: -32100 to -32199)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| -32100 | `FILE_NOT_FOUND` | Requested file does not exist | Verify file path, check file exists |
| -32101 | `DIRECTORY_NOT_FOUND` | Requested directory does not exist | Verify directory path, create directory if needed |
| -32102 | `SCENE_NOT_FOUND` | Scene file does not exist | Check scene path, use `list_scenes` to find valid scenes |
| -32103 | `NODE_NOT_FOUND` | Node path does not exist in scene | Verify node path, use `search_nodes` to find nodes |
| -32104 | `RESOURCE_NOT_FOUND` | Resource URI does not resolve | Check resource URI format, verify resource exists |

#### 6.1.3 Conflict Errors (4xx range: -32200 to -32299)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| -32200 | `FILE_EXISTS` | File already exists (overwrite=false) | Set `overwrite: true` or use different path |
| -32201 | `NAME_CONFLICT` | Node/resource name already exists | Use unique name or remove conflicting item |
| -32202 | `CONCURRENT_MODIFICATION` | File modified by another process | Retry operation, reload file |

#### 6.1.4 Internal Errors (5xx range: -32300 to -32399)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| -32300 | `FILE_SYSTEM_ERROR` | Unable to read/write file system | Check permissions, disk space |
| -32301 | `PARSE_ERROR` | Unable to parse file (TSCN, GDScript) | Verify file format, check for corruption |
| -32302 | `INTERNAL_ERROR` | Unexpected server error | Retry operation, report bug if persistent |
| -32303 | `GODOT_API_ERROR` | Godot engine API call failed | Check Godot logs, verify Godot version |
| -32304 | `BACKUP_FAILED` | Unable to create backup file | Check disk space, permissions |

#### 6.1.5 Network Errors (5xx range: -32400 to -32499)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| -32400 | `CONNECTION_REFUSED` | Unable to connect to Godot bridge | Start Godot bridge, check port availability |
| -32401 | `TIMEOUT` | Request exceeded timeout threshold | Increase timeout, check Godot responsiveness |
| -32402 | `BRIDGE_UNAVAILABLE` | Godot bridge not responding | Restart Godot bridge, check network connectivity |
| -32403 | `RATE_LIMIT_EXCEEDED` | Too many requests in time window | Slow down request rate, implement backoff |

#### 6.1.6 Search/Query Errors (4xx range: -32500 to -32599)

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| -32500 | `INVALID_QUERY` | Search query syntax error | Fix query syntax, check supported operators |
| -32501 | `SEARCH_TIMEOUT` | Search exceeded time limit | Narrow search scope, increase timeout |
| -32502 | `MAX_RESULTS_EXCEEDED` | Result set too large | Reduce `max_results`, use filtering |

### 6.2 Error Response Structure

**Standard Error Format**:
```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32100,
    "message": "File not found",
    "data": {
      "error_type": "FILE_NOT_FOUND",
      "details": "Scene file 'scenes/missing.tscn' does not exist",
      "path": "scenes/missing.tscn",
      "suggestions": [
        "Verify file path is correct",
        "Use 'list_scenes' tool to find available scenes"
      ],
      "timestamp": "2026-02-03T10:30:00Z",
      "request_id": "req-001",
      "recovery_strategy": "VERIFY_AND_RETRY"
    }
  }
}
```

**Error Data Fields**:
- `error_type`: Machine-readable error constant
- `details`: Human-readable error explanation
- `timestamp`: ISO 8601 timestamp of error
- `request_id`: Original request ID for tracing
- `recovery_strategy`: Recommended recovery action
- Additional context fields (e.g., `path`, `node_path`, `line_number`)

### 6.3 Recovery Strategies

#### Strategy: `VERIFY_AND_RETRY`
**Use Case**: File/resource not found, invalid paths  
**Actions**:
1. Verify input parameters are correct
2. Check file/resource exists
3. Retry operation with corrected input

#### Strategy: `BACKOFF_AND_RETRY`
**Use Case**: Timeout, connection errors, rate limiting  
**Actions**:
1. Wait with exponential backoff (1s, 2s, 4s, 8s)
2. Retry up to 3 times
3. If still failing, escalate to user/log

**Example Implementation**:
```typescript
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}
```

#### Strategy: `CHECK_PRECONDITIONS`
**Use Case**: Validation errors, schema mismatches  
**Actions**:
1. Review input schema requirements
2. Validate all required fields present
3. Check data types match schema
4. Fix input and resubmit

#### Strategy: `RELOAD_AND_RETRY`
**Use Case**: Concurrent modification, stale data  
**Actions**:
1. Reload resource to get latest state
2. Re-apply operation with fresh data
3. Use optimistic locking if available

#### Strategy: `MANUAL_INTERVENTION`
**Use Case**: Internal errors, corruption, permission issues  
**Actions**:
1. Log detailed error information
2. Alert user/administrator
3. Provide diagnostic information
4. May require manual file system inspection

### 6.4 Error Handling Best Practices

#### Client-Side Error Handling

```typescript
async function invokeTool(toolName: string, args: any): Promise<any> {
  try {
    const response = await mcpClient.callTool(toolName, args);
    return response.result;
  } catch (error) {
    if (error.code === -32100) { // FILE_NOT_FOUND
      console.warn(`File not found: ${error.data.path}`);
      // Show user-friendly message, suggest alternatives
      return null;
    } else if (error.code === -32400) { // CONNECTION_REFUSED
      console.error('Godot bridge not available');
      // Retry with backoff
      return retryWithBackoff(() => mcpClient.callTool(toolName, args));
    } else if (error.code >= -32099 && error.code <= -32000) {
      // Validation error - user input problem
      console.error(`Validation failed: ${error.message}`);
      // Show validation errors to user
      throw error;
    } else {
      // Internal error - log and alert
      console.error('Unexpected error:', error);
      throw error;
    }
  }
}
```

#### Server-Side Error Wrapping

```typescript
function wrapGodotError(error: any, context: string): JsonRpcError {
  if (error.code === 'ENOENT') {
    return {
      code: -32100,
      message: 'File not found',
      data: {
        error_type: 'FILE_NOT_FOUND',
        details: `${context}: File does not exist`,
        path: error.path,
        suggestions: ['Verify file path', 'Check file exists'],
        recovery_strategy: 'VERIFY_AND_RETRY'
      }
    };
  }
  // ... other error mappings
}
```

---

## 7. API Versioning Strategy

### 7.1 Versioning Scheme

**Format**: Semantic Versioning (SemVer) `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (incompatible API modifications)
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

**Examples**:
- `1.0.0`: Initial stable release
- `1.1.0`: Added new tool `search_nodes` (backward compatible)
- `1.1.1`: Fixed bug in `read_scene` parser (backward compatible)
- `2.0.0`: Changed `read_scene` response schema (breaking change)

### 7.2 Version Communication

#### HTTP Headers

**Request Headers**:
```http
X-API-Version: 1.0.0
X-Client-Version: 1.2.0
```

**Response Headers**:
```http
X-API-Version: 1.0.0
X-Server-Version: 1.0.5
X-Deprecated-API: false
X-Min-Supported-Version: 1.0.0
```

#### Version Negotiation

```json
{
  "method": "system.version",
  "params": {}
}
```

Response:
```json
{
  "result": {
    "api_version": "1.0.0",
    "server_version": "1.0.5",
    "godot_version": "4.6.0.stable",
    "min_supported_api_version": "1.0.0",
    "deprecated_features": []
  }
}
```

### 7.3 Breaking Changes Policy

**Breaking Changes Include**:
- Removing tools, resources, or endpoints
- Changing input/output schemas (removing fields, changing types)
- Changing error codes or meanings
- Modifying required parameters

**Non-Breaking Changes Include**:
- Adding new tools, resources, endpoints
- Adding optional parameters (with defaults)
- Adding new fields to output schemas
- Adding new error codes
- Bug fixes that don't change behavior

### 7.4 Deprecation Process

**Deprecation Timeline**:
1. **Announcement** (v1.0.0): Feature marked as deprecated in documentation
2. **Warning Phase** (v1.1.0 - v1.x.x): API returns deprecation warnings in headers
3. **Removal** (v2.0.0): Feature removed in next major version

**Deprecation Headers**:
```http
X-Deprecated-API: true
X-Deprecation-Date: 2026-06-01
X-Sunset-Date: 2026-12-01
X-Migration-Guide: https://docs.example.com/migration/v2.0
```

**Deprecation Warning in Response**:
```json
{
  "result": {...},
  "warnings": [
    {
      "code": "DEPRECATED_TOOL",
      "message": "Tool 'old_read_scene' is deprecated and will be removed in v2.0.0",
      "deprecated_since": "1.5.0",
      "removal_version": "2.0.0",
      "migration_guide": "Use 'read_scene' instead with updated parameters"
    }
  ]
}
```

### 7.5 Backward Compatibility Strategy

#### Approach 1: Version-Specific Handlers

```typescript
class ToolRegistry {
  private handlers: Map<string, Map<string, ToolHandler>>;

  registerTool(name: string, version: string, handler: ToolHandler) {
    if (!this.handlers.has(name)) {
      this.handlers.set(name, new Map());
    }
    this.handlers.get(name)!.set(version, handler);
  }

  async invokeTool(name: string, version: string, args: any) {
    const versionHandlers = this.handlers.get(name);
    const handler = versionHandlers?.get(version) ?? versionHandlers?.get('latest');
    return handler.execute(args);
  }
}
```

#### Approach 2: Schema Adapters

```typescript
class SchemaAdapter {
  adaptInput(toolName: string, fromVersion: string, toVersion: string, input: any): any {
    if (toolName === 'read_scene' && fromVersion === '1.0.0' && toVersion === '2.0.0') {
      // Migrate old schema to new schema
      return {
        ...input,
        options: {
          include_children: input.include_children,
          include_connections: input.include_connections
        }
      };
    }
    return input;
  }

  adaptOutput(toolName: string, fromVersion: string, toVersion: string, output: any): any {
    // Similar output adaptation
    return output;
  }
}
```

### 7.6 Version Discovery

**Endpoint**: `GET /api/versions`

**Response**:
```json
{
  "current_version": "1.2.0",
  "supported_versions": ["1.0.0", "1.1.0", "1.2.0"],
  "min_supported_version": "1.0.0",
  "deprecated_versions": [],
  "tools": {
    "read_scene": {
      "current_version": "1.0.0",
      "versions": ["1.0.0"],
      "deprecated_versions": []
    },
    "list_scenes": {
      "current_version": "1.1.0",
      "versions": ["1.0.0", "1.1.0"],
      "deprecated_versions": []
    }
  }
}
```

### 7.7 Migration Guides

**Format**: Markdown documentation per major version upgrade

**Example**: `MIGRATION_v1_to_v2.md`

```markdown
# Migration Guide: v1.x → v2.0

## Breaking Changes

### `read_scene` Tool

**Changed**: Input schema restructured

**v1.0.0 (Old)**:
```json
{
  "path": "scenes/main.tscn",
  "include_children": true,
  "include_connections": true
}
```

**v2.0.0 (New)**:
```json
{
  "path": "scenes/main.tscn",
  "options": {
    "include_children": true,
    "include_connections": true,
    "max_depth": 10
  }
}
```

**Migration**: Wrap boolean flags in `options` object.

### Removed Tools

- `old_read_scene` → Use `read_scene` instead

## New Features

- Added `search_nodes` tool for advanced node queries
- Added resource caching with configurable TTL
```

---

## Appendix A: Complete Type Definitions

### TypeScript MCP Tool Interface

```typescript
interface McpTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  examples: Array<{
    title: string;
    input: any;
    output: any;
  }>;
  errorCodes: Array<{
    code: number;
    name: string;
    description: string;
  }>;
}
```

### JSON-RPC Request/Response Types

```typescript
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: JsonRpcError;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: {
    error_type: string;
    details: string;
    timestamp: string;
    request_id: string;
    recovery_strategy: string;
    [key: string]: any;
  };
}
```

---

## Appendix B: Error Code Reference

**Complete Error Code Table**: [See Section 6.1](#61-error-code-taxonomy)

---

## Appendix C: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-03 | Initial API specification release |

---

**Document Status**: ✅ Complete and ready for implementation

**Next Steps**:
1. Implement Node.js MCP Server with tool registry
2. Implement Godot bridge GDScript HTTP server
3. Implement Web UI sidecar with API endpoints
4. Write integration tests for all endpoints
5. Generate OpenAPI/Swagger documentation
6. Create interactive API documentation website
