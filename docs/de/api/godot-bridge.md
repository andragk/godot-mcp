---
title: Godot Bridge JSON-RPC API
description: Vollständige JSON-RPC-Endpunkt-Spezifikation und Methodenkatalog für den Godot Bridge HTTP-Server
outline: [2, 3]
---

# Godot Bridge JSON-RPC API

Die Godot Bridge stellt eine JSON-RPC 2.0-API über HTTP für die Kommunikation zwischen dem Node.js MCP Server und der Godot Engine bereit. Dieses Dokument beschreibt alle verfügbaren Methoden, Request/Response-Formate und Fehlercodes.

## Verbindungsinformationen

**Protokoll:** HTTP/1.1  
**Host:** `http://localhost:7777`  
**Endpunkt:** `POST /rpc`  
**Format:** JSON-RPC 2.0

**Zusätzliche Endpunkte:**
- `GET /health` - Integritätsprüfung
- `GET /metrics` - Performance-Metriken

## JSON-RPC 2.0-Format

### Request-Struktur

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

**Felder:**
- `jsonrpc`: Immer `"2.0"`
- `method`: Operationsname (namespace.operation-Format)
- `params`: Methodenspezifische Parameter (Objekt)
- `id`: Eindeutiger Request-Identifier (String oder Nummer)

### Response-Struktur (Erfolg)

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

### Response-Struktur (Fehler)

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

## Methodenkatalog

### Scene-Operationen

#### `scene.list`

**Beschreibung:** Listet alle Scene-Dateien im Projekt auf.

**Parameter:**
```json
{
  "directory": "scenes",      // Optional, Standard: ""
  "recursive": true,           // Optional, Standard: true
  "include_metadata": false    // Optional, Standard: false
}
```

**Ergebnis:**
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

**Fehlercodes:**
- `-32602`: Ungültige Parameter
- `404`: Verzeichnis nicht gefunden
- `500`: Dateisystemfehler

#### `scene.read`

**Beschreibung:** Liest und parst eine Scene-Datei.

**Parameter:**
```json
{
  "path": "res://scenes/MainMenu.tscn",
  "include_children": true,    // Optional, Standard: true
  "include_connections": true, // Optional, Standard: true
  "max_depth": 20              // Optional, Standard: 20
}
```

**Ergebnis:**
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

**Fehlercodes:**
- `-32602`: Ungültige Parameter
- `404`: Scene-Datei nicht gefunden
- `500`: Parse-Fehler

#### `scene.create`

**Beschreibung:** Erstellt eine neue Scene-Datei.

**Parameter:**
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
  "overwrite": false           // Optional, Standard: false
}
```

**Ergebnis:**
```json
{
  "path": "res://scenes/NewScene.tscn",
  "created": true,
  "node_count": 3,
  "message": "Scene created successfully"
}
```

#### `scene.modify`

**Beschreibung:** Ändert eine existierende Scene.

**Parameter:**
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
    }
  ],
  "create_backup": true        // Optional, Standard: true
}
```

### Script-Operationen

#### `script.list`

**Beschreibung:** Listet alle Script-Dateien auf.

**Parameter:**
```json
{
  "directory": "scripts",      // Optional, Standard: ""
  "recursive": true,           // Optional, Standard: true
  "language": "all",           // Optional: "all", "gdscript", "csharp"
  "include_metadata": false    // Optional, Standard: false
}
```

#### `script.read`

**Beschreibung:** Liest Script-Dateiinhalt.

**Parameter:**
```json
{
  "path": "res://scripts/Player.gd",
  "include_analysis": false    // Optional, Standard: false
}
```

**Ergebnis:**
```json
{
  "path": "res://scripts/Player.gd",
  "content": "extends CharacterBody2D\n\nclass_name Player\n...",
  "language": "gdscript",
  "metadata": {
    "file_size": 2048,
    "line_count": 85
  },
  "analysis": {                // Falls include_analysis: true
    "class_name": "Player",
    "extends": "CharacterBody2D",
    "functions": ["_physics_process", "take_damage"],
    "signals": ["health_changed"]
  }
}
```

### Projektoperationen

#### `project.structure`

**Beschreibung:** Gibt den Projektverzeichnisbaum zurück.

**Parameter:**
```json
{
  "max_depth": 10,             // Optional, Standard: 10
  "include_hidden": false,     // Optional, Standard: false
  "file_types": ["tscn", "gd"] // Optional: Nach Erweiterungen filtern
}
```

**Ergebnis:**
```json
{
  "root": {
    "name": "project_root",
    "type": "directory",
    "path": "res://",
    "children": [...]
  },
  "statistics": {
    "total_files": 45,
    "total_directories": 12,
    "total_size": 1048576
  }
}
```

#### `project.search_nodes`

**Beschreibung:** Sucht Nodes über alle Scenes hinweg.

**Parameter:**
```json
{
  "query": {
    "name_pattern": "Player.*",  // Optional: Regex
    "node_type": "CharacterBody2D", // Optional
    "has_script": true,          // Optional
    "in_group": "enemies"        // Optional
  },
  "max_results": 100           // Optional, Standard: 100
}
```

## Utility-Endpunkte

### Integritätsprüfung

**Endpunkt:** `GET /health`

**Antwort:**
```json
{
  "status": "ok",
  "uptime_ms": 123456,
  "godot_version": "4.6.0.stable",
  "active_requests": 0
}
```

### Metriken

**Endpunkt:** `GET /metrics`

**Antwort:**
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
  }
}
```

## Fehlercodes

### Standard JSON-RPC-Fehler

| Code | Nachricht | Bedeutung |
|------|---------|---------|
| `-32700` | Parse-Fehler | Ungültiges JSON |
| `-32600` | Ungültige Anfrage | Fehlende erforderliche Felder |
| `-32601` | Methode nicht gefunden | Unbekannte Methode |
| `-32602` | Ungültige Parameter | Parameter-Validierung fehlgeschlagen |
| `-32603` | Interner Fehler | Server-Fehler |

### Anwendungsfehler

| Code | Nachricht | Beschreibung |
|------|---------|-------------|
| `404` | Nicht gefunden | Datei/Resource existiert nicht |
| `409` | Konflikt | Datei existiert (overwrite=false) |
| `422` | Nicht verarbeitbar | Ungültige Operation (z.B. zirkuläre Referenz) |
| `500` | Interner Fehler | Datei-I/O, Parsing oder anderer Server-Fehler |
| `503` | Service nicht verfügbar | Godot Engine nicht bereit |

## Performance-Eigenschaften

| Operation | Durchschn. Latenz | p99-Latenz |
|-----------|-------------|-------------|
| `scene.list` | 30-50ms | 80ms |
| `scene.read` | 40-70ms | 110ms |
| `script.read` | 15-30ms | 50ms |
| `project.structure` | 50-100ms | 150ms |
| `search_nodes` | 100-300ms | 500ms |
| `scene.create` | 80-150ms | 200ms |
| `scene.modify` | 90-160ms | 220ms |

:::tip Performance-Optimierung
- Connection Pooling (Keep-Alive) für wiederholte Anfragen verwenden
- Antworten auf Node.js-Seite cachen (5min TTL für Lesevorgänge)
- Operationen wenn möglich batchen (Phase 2)
- `max_depth` und `max_results` für große Projekte begrenzen
:::

## GDScript-Implementierungsbeispiel

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
	
	# Zu Handler routen
	var result = null
	match method:
		"scene.read":
			result = SceneManager.read_scene(params)
		"script.read":
			result = ScriptManager.read_script(params)
		_:
			return error_response(request, -32601, "Method not found: " + method)
	
	# Fehler behandeln
	if result is GodotError:
		return error_response(request, result.code, result.message, result.data)
	
	return success_response(request, result, id)
```

## Verwandte Dokumentation

- [Tools-API](/de/api/tools) - MCP-Tool-Spezifikationen
- [Resources-API](/de/api/resources) - Resource-URIs und Metadaten
- [Implementierungsleitfaden](/de/implementation/godot-bridge) - HTTP-Server erstellen
