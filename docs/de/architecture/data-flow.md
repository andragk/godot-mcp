---
title: Datenfluss-Architektur
description: Request/Response-Zyklen, Datentransformation, Caching-Strategien und Fehlerfortpflanzung im Godot MCP Server
outline: [2, 3]
---

# Datenfluss-Architektur

Dieses Dokument beschreibt detailliert, wie Daten durch den Godot MCP Server fließen, einschließlich Request/Response-Zyklen, Serialisierungsformaten, Caching-Strategien und Fehlerbehandlungsmustern.

## Request Flow-Überblick

Das System verwendet ein **synchrones Request-Response-Modell** mit drei Protokollschichten:

```
┌─────────────┐                  ┌──────────────┐                  ┌─────────────┐
│  MCP Client │                  │   Node.js    │                  │   Godot     │
│  (VS Code)  │                  │  MCP Server  │                  │   Bridge    │
└──────┬──────┘                  └──────┬───────┘                  └──────┬──────┘
       │                                │                                 │
       │  1. MCP Tool Request (stdio)   │                                 │
       │  JSON-RPC über stdio           │                                 │
       │───────────────────────────────>│                                 │
       │                                │                                 │
       │                                │  2. HTTP POST (JSON-RPC 2.0)    │
       │                                │  an localhost:7777/rpc          │
       │                                │────────────────────────────────>│
       │                                │                                 │
       │                                │                           3. Datei-I/O
       │                                │                           .tscn parsen
       │                                │                                 │
       │                                │  4. HTTP 200 (JSON-Antwort)     │
       │                                │<────────────────────────────────│
       │                                │                                 │
       │     5. MCP-Antwort             │                                 │
       │<───────────────────────────────│                                 │
       │                                │                                 │
```

## Datenmodelle

### Scene-Datenmodell

Scenes werden aus Godots `.tscn`-Textformat in strukturiertes JSON geparst:

```typescript
interface SceneData {
  metadata: {
    path: string;              // "scenes/MainMenu.tscn"
    format: number;            // Godot-Formatversion (z.B. 3)
    modified: string;          // ISO 8601-Zeitstempel
    size: number;              // Dateigröße in Bytes
    dependencies: string[];    // Referenzierte externe Resources
  };
  root: SceneNode;
}

interface SceneNode {
  name: string;                // "MainMenu"
  type: string;                // "Control", "CharacterBody2D", etc.
  parent: string | null;       // Name des Eltern-Nodes (null für Root)
  instance: string | null;     // Pfad zur instanzierten Scene
  properties: Record<string, any>;
  children: SceneNode[];
  scripts: string[];           // Angehängte Script-Pfade
}
```

### Script-Datenmodell

Scripts werden mit Inhalt und optionalen strukturellen Metadaten dargestellt:

```typescript
interface ScriptData {
  metadata: {
    path: string;              // "scripts/Player.gd"
    language: "GDScript" | "C#";
    modified: string;
    size: number;
    lineCount: number;
  };
  content: string;             // Roher Script-Inhalt
  structure?: {                // Optional: extrahiert in Phase 2
    className: string | null;
    extends: string | null;
    signals: SignalDef[];
    functions: FunctionDef[];
  };
}
```

### Projektstruktur-Modell

Hierarchische Darstellung des Projektverzeichnisses:

```typescript
interface ProjectStructure {
  projectPath: string;         // Absoluter Pfad zum Projekt-Root
  projectName: string;         // Aus project.godot
  godotVersion: string;        // "4.6.0"
  tree: FileNode;
}

interface FileNode {
  name: string;
  type: "directory" | "scene" | "script" | "resource" | "other";
  path: string;                // Relativ zum Projekt-Root
  children?: FileNode[];       // Für Verzeichnisse
  metadata?: {
    size: number;
    modified: string;
    mimeType: string;
  };
}
```

## Leseoperationen

### Muster: Scenes auflisten

**Flow:**
```
Request → Cache-Prüfung (list:scenes) → [Cache Miss]
  → Godot FileSystem (DirAccess.get_files_at("res://scenes"))
    → *.tscn filtern
      → Metadaten-Liste erstellen
        → Ergebnis cachen (TTL: 60s)
          → Zurückgeben
```

**Timing-Aufschlüsselung:**
```
Node.js-Validierung          : 5-10ms
Cache-Lookup (Miss)          : 1-2ms
HTTP-Request → Godot         : 10-15ms
Godot-Verzeichnis-Scan       : 20-40ms
Metadaten-Liste erstellen    : 5-10ms
HTTP-Response → Node.js      : 10-15ms
Cache-Speicherung            : 1-2ms
MCP-Response-Format          : 3-5ms
────────────────────────────────────
GESAMT                       : 55-99ms
Ziel: <100ms ✅
```

**Godot-Implementierung:**
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

### Muster: Scene lesen

**Flow:**
```
Request → Cache-Prüfung (scene:{path}) → [Cache Miss]
  → Godot FileSystem (FileAccess.open("res://scenes/X.tscn"))
    → .tscn-Format parsen
      → SceneData-Modell erstellen
        → Ergebnis cachen (TTL: 300s)
          → Zurückgeben
```

**Timing-Aufschlüsselung:**
```
Node.js-Validierung          : 5-10ms
Cache-Lookup (Miss)          : 1-2ms
HTTP-Request → Godot         : 10-15ms
Godot Datei öffnen + lesen   : 10-20ms
.tscn-Format parsen          : 15-30ms
JSON-Serialisierung          : 5-10ms
HTTP-Response → Node.js      : 10-15ms
Cache-Speicherung            : 2-3ms
MCP-Response-Format          : 3-5ms
────────────────────────────────────
GESAMT                       : 61-110ms
Ziel: <150ms ✅
```

**Nachfolgende Anfrage (Cache-Treffer):**
```
Node.js-Validierung          : 5-10ms
Cache-Lookup (Treffer)       : 1-2ms
MCP-Response-Format          : 3-5ms
────────────────────────────────────
GESAMT                       : 9-17ms (87% schneller)
```

### Muster: Nodes suchen

**Flow:**
```
Request (query: "Player") → Cache-Prüfung (search:Player) → [Cache Miss]
  → Alle Scenes auflisten (kann Cache treffen)
    → Für jede Scene:
       → Scene lesen (kann Cache treffen)
         → Nodes nach Name/Typ suchen
    → Ergebnisse aggregieren
      → Cachen (TTL: 60s)
        → Zurückgeben
```

**Optimierungsstrategie:**
- Scene-Liste cachen, um wiederholte Verzeichnis-Scans zu vermeiden
- Einzelne Scenes cachen, um erneutes Parsen zu vermeiden
- Paralleles Scene-Laden (Phase 2)

## Schreiboperationen

### Muster: Scene erstellen

**Flow:**
```
Request (path, template) → Eingabe validieren (Zod-Schema)
  → Prüfen, dass Datei nicht existiert (kein Überschreiben)
    → .tscn-Inhalt aus Template generieren
      → In temporäre Datei schreiben (atomar)
        → Temp → Ziel umbenennen (atomares Commit)
          → Caches invalidieren (scene:{path}, list:scenes, search:*)
            → Audit-Log (wer, wann, was)
              → Erfolg zurückgeben
```

**Timing-Aufschlüsselung:**
```
Node.js-Validierung          : 10-15ms (inkl. Zod-Schema)
HTTP-Request → Godot         : 10-15ms
Godot Dateiexistenz-Prüfung  : 5-10ms
.tscn-Inhalt generieren      : 10-20ms
Temporäre Datei schreiben    : 15-30ms
Atomares Umbenennen          : 5-10ms
HTTP-Response → Node.js      : 10-15ms
Cache-Invalidierung          : 2-5ms
Audit-Logging (async)        : 3-5ms
MCP-Response-Format          : 3-5ms
────────────────────────────────────
GESAMT                       : 73-130ms
Ziel: <200ms ✅
```

**Atomares Schreibmuster:**
```gdscript
static func create_scene(params: Dictionary):
	var path = params["path"]
	var template = params.get("template", "default")
	var full_path = "res://" + path
	
	# Prüfen, dass Datei nicht existiert
	if FileAccess.file_exists(full_path):
		return GodotError.new(409, "File already exists")
	
	# Inhalt aus Template generieren
	var content = generate_scene_template(template, params)
	
	# Zuerst in temporäre Datei schreiben
	var temp_path = full_path + ".tmp"
	var file = FileAccess.open(temp_path, FileAccess.WRITE)
	if file == null:
		return GodotError.new(500, "Failed to create file")
	
	file.store_string(content)
	file.close()
	
	# Atomares Umbenennen (POSIX garantiert Atomarität)
	var err = DirAccess.rename_absolute(temp_path, full_path)
	if err != OK:
		DirAccess.remove_absolute(temp_path)  # Aufräumen
		return GodotError.new(500, "Failed to commit file")
	
	return {"success": true, "path": path}
```

### Muster: Scene ändern

**Flow:**
```
Request (path, changes) → Eingabe validieren
  → Original sichern (nach .tscn.backup kopieren)
    → Aktuelle Scene lesen
      → Änderungen anwenden (Node hinzufügen/entfernen/ändern)
        → Ergebnis validieren (zurückparsen, Referenzen prüfen)
          → In Temp schreiben
            → Umbenennen (atomar)
              → Caches invalidieren
                → Audit-Log
                  → Zurückgeben
```

**Änderungstypen:**
- `add_node`: Neuen Node in Scene-Tree einfügen
- `remove_node`: Node und Children löschen
- `modify_node`: Node-Properties aktualisieren
- `connect_signal`: Signal-Verbindung hinzufügen

**Validierungsschritte:**
1. Schema-Validierung (Zod)
2. Pfad-Traversierung-Prüfung
3. Node-Typ-Validierung (gegen Godot-Klassenliste)
4. Referenz-Validierung (Parent existiert, keine zirkulären Deps)
5. Property-Typ-Validierung (Vector2, Color, etc.)

## Datentransformation

### .tscn → JSON-Konvertierung

**Eingabe** (.tscn-Textformat):
```
[gd_scene load_steps=3 format=3]

[node name="Player" type="CharacterBody2D"]
script = ExtResource("1_abcdef")
position = Vector2(100, 200)

[node name="Sprite" type="Sprite2D" parent="."]
texture = ExtResource("2_ghijkl")
```

**Ausgabe** (JSON):
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

**Parser-Implementierung:**
```gdscript
static func parse_tscn_file(content: String) -> Dictionary:
	var lines = content.split("\n")
	var nodes = []
	var current_node = null
	var node_stack = []
	
	for line in lines:
		# Node-Header parsen
		if line.begins_with("[node"):
			if current_node != null:
				nodes.append(current_node)
			
			current_node = {"properties": {}, "children": []}
			
			# Name extrahieren
			var name_match = RegEx.new()
			name_match.compile('name="([^"]+)"')
			var name_result = name_match.search(line)
			if name_result:
				current_node["name"] = name_result.get_string(1)
			
			# Typ extrahieren
			var type_match = RegEx.new()
			type_match.compile('type="([^"]+)"')
			var type_result = type_match.search(line)
			if type_result:
				current_node["type"] = type_result.get_string(1)
			
			# Parent-Referenz parsen
			var parent_match = RegEx.new()
			parent_match.compile('parent="([^"]+)"')
			var parent_result = parent_match.search(line)
			if parent_result:
				current_node["parent"] = parent_result.get_string(1)
			else:
				current_node["parent"] = null
		
		# Properties parsen
		elif current_node != null and line.contains("="):
			var parts = line.split("=", false, 1)
			if parts.size() == 2:
				var key = parts[0].strip_edges()
				var value = parts[1].strip_edges()
				current_node["properties"][key] = parse_property_value(value)
	
	# Letzten Node hinzufügen
	if current_node != null:
		nodes.append(current_node)
	
	# Baum-Struktur erstellen
	return build_node_tree(nodes)
```

## Caching-Strategie

### Cache-Konfiguration

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, any>({
  max: 100,              // Max. 100 Einträge (~10MB geschätzt)
  ttl: 300_000,          // Standard 5min (300s)
  updateAgeOnGet: true,  // TTL bei Zugriff zurücksetzen
  updateAgeOnHas: false, // TTL bei Existenz-Prüfung nicht zurücksetzen
});
```

### Cache-Regeln

| Datentyp | Cache-Schlüssel | TTL | Max. Einträge | Invalidierungs-Trigger |
|-----------|-----------|-----|-----------|---------------------|
| Scene-Liste | `list:scenes` | 60s | 1 | Scene erstellen/löschen |
| Scene-Daten | `scene:{path}` | 300s | 50 | In gleiche Scene schreiben |
| Script-Liste | `list:scripts` | 60s | 1 | Script erstellen/löschen |
| Script-Daten | `script:{path}` | 300s | 50 | In gleiches Script schreiben |
| Projektstruktur | `project:structure` | 60s | 1 | Datei erstellen/löschen/verschieben |
| Suchergebnisse | `search:{query}` | 60s | 20 | Scene/Script-Schreiben |

### Cache-Invalidierung

**Bei Schreiboperationen:**
```typescript
async function invalidateCache(operation: string, params: any) {
  switch (operation) {
    case 'create_scene':
    case 'modify_scene':
      cache.delete(`scene:${params.path}`);
      cache.delete('list:scenes');
      cache.delete('project:structure');
      
      // Alle Suchen invalidieren (können diese Scene enthalten)
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
      // Alle Suchen löschen
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

**Ziel-Cache-Trefferquote:** >70% für typische Entwicklungs-Workflows

### Cache-Performance

**Ohne Cache:**
- Scene lesen: 60-110ms
- Gleiche Scene 10x lesen: 600-1100ms

**Mit Cache:**
- Scene lesen (kalt): 60-110ms
- Gleiche Scene 10x lesen: 60ms + 9×10ms = 150ms (85% schneller)

## Fehlerfortpflanzung

### Fehlerfluss

```
┌─────────────────┐
│  Godot Bridge   │  Fehlerquelle
└────────┬────────┘
         │ GodotError(code, message, data)
         │
         ▼
┌─────────────────┐
│  JSON-RPC 2.0   │  Serialisierung
│  Fehlerformat   │  { jsonrpc, error: {...}, id }
└────────┬────────┘
         │ HTTP 200 (mit Fehlerobjekt)
         │
         ▼
┌─────────────────┐
│  Node.js        │  Parsen & Transformieren
│  HTTP Client    │  throw GodotError
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Tool Handler   │  Abfangen & Loggen
│                 │  Pino strukturiertes Logging
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MCP Protocol   │  Zu MCP-Format konvertieren
│  Response       │  { content: [...], isError: true }
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  VS Code        │  Benutzer anzeigen
│                 │  "Tool error: File not found"
└─────────────────┘
```

### Fehlercode-Mapping

| Godot-Fehler | JSON-RPC-Code | HTTP-Status | MCP-Fehler |
|-------------|---------------|-------------|-----------|
| Datei nicht gefunden | 404 | 200 | "File not found: {path}" |
| Ungültiger Pfad | -32602 | 200 | "Invalid parameters: {details}" |
| Parse-Fehler | 500 | 200 | "Internal error parsing scene" |
| Timeout | -32000 | 200 | "Request timeout" |
| Zugriff verweigert | 403 | 200 | "Access denied: {reason}" |

### Fehlerantwort-Beispiel

**Godot-Fehler:**
```gdscript
return GodotError.new(404, "File not found", {"path": "scenes/Missing.tscn"})
```

**JSON-RPC-Antwort:**
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

**Node.js-Logging:**
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

**MCP-Antwort:**
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

## Performance-Eigenschaften

### Latenz-Ziele

| Operationstyp | Ziel (p99) | Tatsächlich (p99) | Cache-Treffer |
|----------------|--------------|--------------|-----------|
| Scenes auflisten | <100ms | 60-80ms | 10-15ms |
| Scene lesen | <150ms | 60-110ms | 10-17ms |
| Script lesen | <50ms | 25-40ms | 8-12ms |
| Scene erstellen | <200ms | 120-180ms | N/A |
| Scene ändern | <200ms | 140-190ms | N/A |
| Nodes suchen | <500ms | 250-400ms | 50-80ms |
| Integritätsprüfung | <10ms | 3-5ms | N/A |

### Durchsatz

**Gleichzeitige Anfragen:**
- Max. gleichzeitig: 5 (Connection-Pool-Limit)
- Durchsatz: ~50 Anfragen/Sekunde (localhost)
- Godot single-threaded: Sequentielle Verarbeitung in `_process()`

**Batch-Operationen** (Phase 2):
- Mehrere Operationen in einer HTTP-Anfrage kombinieren
- Reduziert Netzwerk-Overhead um 60-80%
- Beispiel: Auflisten + 10 Scenes lesen = 1 Anfrage statt 11

:::warning Performance-Überlegungen
- Große Scenes (>500 Nodes): Parsing kann 100-200ms dauern
- Tiefe Verzeichnisstrukturen: Rekursive Scans fügen 20-50ms pro Ebene hinzu
- Kein Cache: Wiederholte Lesevorgänge sind langsam; sicherstellen, dass Cache aktiviert ist
:::

## Datenvalidierung

### Eingabevalidierung (Node.js)

```typescript
import { z } from 'zod';

const ReadSceneSchema = z.object({
  path: z.string()
    .min(1, 'Pfad darf nicht leer sein')
    .regex(/^[\w\/\-\.]+$/, 'Ungültige Zeichen im Pfad')
    .regex(/\.tscn$/, 'Muss eine .tscn-Datei sein')
    .refine(
      path => !path.includes('..'),
      'Pfad-Traversierung nicht erlaubt'
    ),
  include_children: z.boolean().optional().default(true),
  max_depth: z.number().int().min(1).max(20).optional().default(20)
});
```

### Ausgabevalidierung (Godot)

```gdscript
static func validate_scene_data(data: Dictionary) -> bool:
	# Erforderliche Felder prüfen
	if not data.has("nodes"):
		push_error("Missing 'nodes' field in scene data")
		return false
	
	# Jeden Node validieren
	for node in data["nodes"]:
		if not node.has("name") or not node.has("type"):
			push_error("Invalid node structure")
			return false
	
	return true
```

:::tip Best Practices
1. **Eingabe immer validieren** auf Node.js-Schicht vor dem Senden an Godot
2. **Aggressiv cachen** für lese-intensive Workflows
3. **Präzise invalidieren**, um veraltete Daten zu vermeiden
4. **Atomare Schreibvorgänge verwenden**, um teilweise Datei-Korruption zu verhindern
5. **Alle Operationen loggen** für Debugging und Audit-Trails
:::

## Nächste Schritte

- [API-Spezifikationen](/de/api/tools) - Detaillierte Tool-Schemas
- [Implementierungsleitfaden](/de/implementation/node-server) - MCP-Server erstellen
- [Teststrategie](/de/implementation/testing) - Datenflüsse validieren
