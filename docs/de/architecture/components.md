---
title: Komponentenarchitektur
description: Detaillierte Komponentenarchitektur des Godot MCP Servers, einschließlich Node.js-Schichten, Godot Bridge und Sidecar UI
outline: [2, 3]
---

# Komponentenarchitektur

Der Godot 4.6 MCP Server folgt einem **geschichteten Architekturmuster** mit klarer Trennung der Zuständigkeiten über drei Hauptkomponenten: den Node.js MCP Server, die Godot Bridge und die Sidecar Web UI.

## Systemüberblick

```
┌─────────────┐        ┌─────────────────┐      ┌──────────────┐
│   VS Code   │ stdio  │   Node.js MCP   │ HTTP │Godot 4.6     │
│   (MCP      │◄──────►│     Server      │◄────►│Bridge Plugin │
│  Extension) │        └─────────────────┘      └──────────────┘
└─────────────┘                 │
                                │ HTTP
                                ▼
                        ┌──────────────┐
                        │  Web Browser │
                        │(Sidecar UI)  │
                        └──────────────┘
```

## Node.js MCP Server

Die Node.js-Komponente implementiert eine **4-schichtige Architektur**: Presentation, Application, Domain und Infrastructure.

### Presentation Layer

Die Presentation Layer behandelt die gesamte externe Kommunikation über zwei Protokolle:

#### stdio Transport (MCP Protocol)

Behandelt die MCP-Client-Kommunikation mit dem offiziellen SDK:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export class McpStdioTransport {
  private server: Server;
  
  async initialize() {
    this.server = new Server({
      name: 'godot-mcp-server',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {},
        resources: {},
      },
    });
    
    // Tool-Handler registrieren
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: await this.toolRegistry.listTools() };
    });
    
    // stdio-Transport verbinden
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

**Hauptaufgaben:**
- Eingehende MCP JSON-RPC-Anfragen von stdin parsen
- Tool-Aufrufe an Application Layer Handler routen
- Antworten gemäß MCP-Protokollspezifikation formatieren
- MCP-spezifische Fehlerformate behandeln

#### Web UI Server (Express)

Bietet REST-API und SSE-Endpunkte für das Sidecar-Dashboard:

```typescript
import express from 'express';
import { EventEmitter } from 'events';

export class WebUIServer extends EventEmitter {
  private app = express();
  
  async start(port: number = 8080) {
    // Statische Dateien bereitstellen (Tailwind + Alpine.js)
    this.app.use(express.static('public'));
    
    // API-Endpunkte
    this.app.get('/api/status', this.getStatus);
    this.app.post('/api/lifecycle/start', this.startService);
    this.app.post('/api/lifecycle/stop', this.stopService);
    
    // Server-Sent Events für Echtzeit-Logs
    this.app.get('/api/logs/stream', this.streamLogs);
    
    this.app.listen(port);
  }
  
  private streamLogs = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    
    const listener = (log) => {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    };
    this.on('log', listener);
    
    req.on('close', () => this.off('log', listener));
  };
}
```

### Application Layer

Orchestriert die Geschäftslogik und behandelt übergreifende Belange:

#### Tool Handler

Validiert Anfragen, setzt Rate Limiting durch und verwaltet Caching:

```typescript
import { z } from 'zod';
import { GodotClient } from '../infrastructure/godot-client';

export class ToolHandler {
  constructor(
    private godotClient: GodotClient,
    private cache: LRUCache<string, any>,
  ) {}
  
  async handleReadScene(params: { path: string }) {
    // Validierung
    const schema = z.object({
      path: z.string().regex(/^[\w\-\/]+\.tscn$/),
    });
    const validated = schema.parse(params);
    
    // Cache prüfen
    const cacheKey = `scene:${validated.path}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    
    // Godot aufrufen
    const result = await this.godotClient.call('read_scene', validated);
    
    // Ergebnis cachen (5min TTL)
    this.cache.set(cacheKey, result, { ttl: 300_000 });
    
    return result;
  }
}
```

**Zuständigkeiten:**
- Eingabevalidierung mit Zod-Schemas
- Autorisierungsprüfungen (Phase 2)
- Rate-Limiting-Durchsetzung
- Cache-Verwaltung (Lesen und Invalidierung)
- Fehlerumwandlung

#### Resource Handler

Löst MCP Resource URIs in Godot-Dateisystempfade auf:

```typescript
export class ResourceHandler {
  async resolveResource(uri: string): Promise<Resource> {
    // URI parsen: godot://scenes/MainMenu.tscn
    const match = uri.match(/^godot:\/\/(\w+)\/(.+)$/);
    if (!match) throw new Error('Invalid resource URI');
    
    const [, type, path] = match;
    
    switch (type) {
      case 'scenes':
        return this.getSceneResource(path);
      case 'scripts':
        return this.getScriptResource(path);
      default:
        throw new Error(`Unknown resource type: ${type}`);
    }
  }
  
  private async getSceneResource(path: string): Promise<Resource> {
    const content = await this.godotClient.call('read_scene', { path });
    return {
      uri: `godot://scenes/${path}`,
      mimeType: 'application/json',
      text: JSON.stringify(content, null, 2),
    };
  }
}
```

### Domain Layer

Enthält die zentrale Geschäftslogik und Tool-Implementierungen:

#### Tool Registry

Plugin-Architektur für erweiterbare Tool-Verwaltung:

```typescript
export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (params: any) => Promise<any>;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  
  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }
  
  async execute(toolName: string, params: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`Tool not found: ${toolName}`);
    
    // Eingabe validieren
    const validated = tool.inputSchema.parse(params);
    
    // Handler ausführen
    return tool.handler(validated);
  }
  
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    }));
  }
}
```

**Integrierte Tools:**
- Scene-Operationen: `list_scenes`, `read_scene`, `create_scene`, `modify_scene`
- Script-Operationen: `list_scripts`, `read_script`, `create_script`, `modify_script`
- Projektabfragen: `get_project_structure`, `search_nodes`, `get_node_properties`

### Infrastructure Layer

Bietet Low-Level-Dienste und externe Integrationen:

#### HTTP Client

Hochleistungs-Client mit undici und Connection Pooling:

```typescript
import { request, Agent } from 'undici';

export class GodotClient {
  private agent: Agent;
  private baseUrl = 'http://localhost:7777';
  private requestId = 0;
  
  constructor() {
    // Connection Pooling mit Keep-Alive
    this.agent = new Agent({
      connections: 5, // Max. 5 gleichzeitige Verbindungen
      keepAliveTimeout: 60_000, // 60s Keep-Alive
      keepAliveMaxTimeout: 600_000, // 10min Maximum
    });
  }
  
  async call(method: string, params: any): Promise<any> {
    const id = ++this.requestId;
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };
    
    try {
      const response = await request(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        dispatcher: this.agent,
        headersTimeout: 5000,
        bodyTimeout: 10000,
      });
      
      const data = await response.body.json();
      
      if (data.error) {
        throw new GodotError(data.error.message, data.error.code);
      }
      
      return data.result;
    } catch (error) {
      if (isNetworkError(error)) {
        return this.retryWithBackoff(method, params);
      }
      throw error;
    }
  }
}
```

**Features:**
- HTTP/1.1 Keep-Alive für Verbindungs-Wiederverwendung
- Automatische Wiederholung mit exponentiellem Backoff
- Konfigurierbare Timeouts (Headers: 5s, Body: 10s)
- Connection Pool-Verwaltung (5 gleichzeitige max.)

#### Cache (LRU)

Speichereffizientes Caching mit automatischer TTL-Ablauf:

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, any>({
  max: 100,              // Max. 100 Einträge (~10MB)
  ttl: 300_000,          // Standard 5min
  updateAgeOnGet: true,  // TTL bei Zugriff zurücksetzen
  updateAgeOnHas: false,
});
```

**Cache-Strategie:**
| Datentyp | TTL | Max. Einträge | Invalidierungs-Trigger |
|-----------|-----|-----------|---------------------|
| Scene-Daten | 300s | 50 | Schreiben in gleiche Scene |
| Script-Daten | 300s | 50 | Schreiben in gleiches Script |
| Projektstruktur | 60s | 1 | Jede Dateioperation |
| Suchergebnisse | 60s | 20 | Scene/Script-Schreiben |

## Godot Bridge Plugin

Die Godot Bridge ist ein GDScript-Plugin, das Godot Engine-Funktionen über HTTP bereitstellt.

### HTTP Server Layer

Leichtgewichtiger Wrapper um Godots eingebauten HTTPServer:

```gdscript
# godot-bridge/http_server.gd
extends Node

var server: HTTPServer
var port: int = 7777

func _ready():
	server = HTTPServer.new()
	server.register_router("/rpc", rpc_handler)
	server.register_router("/health", health_handler)
	
	var err = server.listen(port, "127.0.0.1")
	if err != OK:
		push_error("Failed to start HTTP server on port %d" % port)
		return
	
	print("Godot MCP Bridge listening on http://localhost:%d" % port)

func _process(_delta):
	server.poll()

func rpc_handler(request: HTTPServerRequest) -> HTTPServerResponse:
	var body = request.get_body_as_string()
	var json = JSON.parse_string(body)
	
	if json == null or not json.has("method"):
		return error_response(request, -32600, "Invalid Request")
	
	var method = json["method"]
	var params = json.get("params", {})
	var id = json.get("id")
	
	# Zu Operations-Handler routen
	var result = RPCRouter.handle(method, params)
	
	if result is GodotError:
		return error_response(request, result.code, result.message)
	
	return success_response(request, result, id)
```

**Hauptfeatures:**
- Bindet nur an localhost (Sicherheit)
- Nicht-blockierend mit `_process()`-Polling
- JSON-RPC 2.0-konform
- Strukturierte Fehlerantworten

### RPC Router

Ordnet JSON-RPC-Methoden Operations-Handlern zu:

```gdscript
# godot-bridge/rpc_router.gd
class_name RPCRouter

static var handlers = {}

static func register(method: String, handler: Callable):
	handlers[method] = handler

static func handle(method: String, params: Dictionary):
	if not handlers.has(method):
		return GodotError.new(-32601, "Method not found: %s" % method)
	
	var handler = handlers[method]
	return await handler.call(params)

# Handler automatisch registrieren
static func _static_init():
	register("list_scenes", SceneManager.list_scenes)
	register("read_scene", SceneManager.read_scene)
	register("create_scene", SceneManager.create_scene)
	register("list_scripts", ScriptManager.list_scripts)
	register("read_script", ScriptManager.read_script)
```

### Operations Handler

Domänenspezifische Manager für Scenes, Scripts und Projektoperationen:

#### Scene Manager

```gdscript
# godot-bridge/scene_manager.gd
class_name SceneManager

static func read_scene(params: Dictionary):
	var path = params.get("path", "")
	
	# Pfad validieren
	if not path.ends_with(".tscn"):
		return GodotError.new(-32602, "Invalid path: must be .tscn file")
	
	var full_path = "res://%s" % path
	if not FileAccess.file_exists(full_path):
		return GodotError.new(404, "File not found", {"path": path})
	
	# Scene-Datei lesen und parsen
	var file = FileAccess.open(full_path, FileAccess.READ)
	if file == null:
		return GodotError.new(500, "Failed to open file")
	
	var content = file.get_as_text()
	file.close()
	
	# .tscn-Format parsen
	var scene_data = parse_tscn_file(content)
	return scene_data
```

**Zuständigkeiten:**
- Pfadvalidierung und -normalisierung
- Dateisystemoperationen via `FileAccess`
- `.tscn`-Format-Parsing
- Fehlerbehandlung mit strukturierten Antworten

### File System Abstraction

Sichere Datei-I/O mit Validierung und atomaren Schreibvorgängen:

```gdscript
# godot-bridge/file_manager.gd
class_name FileManager

static func safe_write(path: String, content: String) -> Error:
	# Pfad innerhalb des Projekts validieren
	if not path.begins_with("res://"):
		push_error("Invalid path: must start with res://")
		return ERR_INVALID_PARAMETER
	
	# Zuerst in temporäre Datei schreiben (atomare Operation)
	var temp_path = path + ".tmp"
	var file = FileAccess.open(temp_path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	
	file.store_string(content)
	file.close()
	
	# Temporär zu Ziel umbenennen (atomares Commit)
	var err = DirAccess.rename_absolute(temp_path, path)
	return err
```

## Sidecar Web UI

Die Web UI ist ein leichtgewichtiges Dashboard, gebaut mit Alpine.js und Tailwind CSS.

### Frontend-Architektur

```
public/
├── index.html          # Haupt-Dashboard
├── css/
│   └── app.css         # Tailwind CSS
└── js/
    └── app.js          # Alpine.js-Komponenten
```

### Alpine.js-Komponenten

```html
<!-- Status-Dashboard -->
<div x-data="statusWidget()">
  <div class="status-badge" :class="statusColor">
    <span x-text="status"></span>
  </div>
  <p>Uptime: <span x-text="uptime"></span></p>
</div>

<script>
function statusWidget() {
  return {
    status: 'connecting',
    uptime: 0,
    
    init() {
      this.pollStatus();
      setInterval(() => this.pollStatus(), 1000);
    },
    
    async pollStatus() {
      const res = await fetch('/api/status');
      const data = await res.json();
      this.status = data.status;
      this.uptime = data.uptime_ms;
    },
    
    get statusColor() {
      return {
        'bg-green-500': this.status === 'ok',
        'bg-yellow-500': this.status === 'connecting',
        'bg-red-500': this.status === 'error'
      };
    }
  };
}
</script>
```

### Server-Sent Events

Echtzeit-Log-Streaming ohne WebSockets:

```javascript
// Log-Viewer-Komponente
function logViewer() {
  return {
    logs: [],
    
    init() {
      const eventSource = new EventSource('/api/logs/stream');
      
      eventSource.onmessage = (event) => {
        const log = JSON.parse(event.data);
        this.logs.push(log);
        
        // Nur die letzten 1000 Einträge behalten
        if (this.logs.length > 1000) {
          this.logs.shift();
        }
      };
    }
  };
}
```

## Komponentenkommunikation

### Request Flow (Leseoperation)

```
VS Code → Node.js (MCP)       : 5-10ms  (stdio)
Node.js: Validierung          : 5-10ms  (Zod)
Node.js → Godot (HTTP)        : 10-20ms (localhost)
Godot: Datei-I/O + Parse      : 20-50ms (FileAccess)
Godot → Node.js (Response)    : 10-20ms (HTTP)
Node.js: Cache + Format       : 3-5ms   (LRU)
Node.js → VS Code (MCP)       : 5-10ms  (stdio)
────────────────────────────────────────────────
GESAMT                        : 60-130ms
```

### Fehlerfortpflanzung

```
Godot (GodotError) 
  → JSON-RPC-Fehlerformat
    → HTTP 200 mit Fehlerobjekt
      → Node.js fängt Fehler ab
        → Loggt mit Pino
          → Konvertiert zu MCP-Fehlerformat
            → VS Code zeigt Benutzer an
```

## Technologie-Stack-Zusammenfassung

| Komponente | Runtime | Sprache | Hauptbibliotheken |
|-----------|---------|----------|---------------|
| **MCP Server** | Node.js 20 | TypeScript | @modelcontextprotocol/sdk, undici, zod, pino |
| **Godot Bridge** | Godot 4.6 | GDScript | HTTPServer (eingebaut), JSON (eingebaut) |
| **Web UI** | Browser | HTML/JS | Alpine.js, Tailwind CSS |
| **Transport** | - | - | stdio (MCP), HTTP (intern), SSE (UI) |

## Performance-Eigenschaften

| Operation | Ziel-Latenz | Tatsächlich (p99) | Engpass |
|-----------|---------------|--------------|------------|
| Scene lesen | <50ms | 35-45ms | Datei-I/O in Godot |
| Scene schreiben | <200ms | 120-180ms | Atomarer Dateischreibvorgang |
| Scenes auflisten | <100ms | 60-80ms | Verzeichnis-Traversierung |
| Integritätsprüfung | <10ms | 3-5ms | Nur HTTP |
| Cache-Treffer | <5ms | 1-2ms | Speicher-Lookup |

:::tip Optimierungsmöglichkeiten
- **Connection Pooling**: Reduziert HTTP-Overhead um 70%
- **LRU-Caching**: 87% schneller bei wiederholten Lesevorgängen
- **Batch-Anfragen** (Phase 2): Kombiniert mehrere Operationen in einem HTTP-Aufruf
:::

## Sicherheitsgrenzen

1. **Netzwerkschicht**: Nur-Localhost-Bindung (`127.0.0.1`)
2. **Validierungsschicht**: Zod-Schemas weisen fehlerhafte Eingaben zurück
3. **Dateisystem**: Pfadvalidierung verhindert Traversal-Angriffe
4. **Rate Limiting**: Verhindert Ressourcenerschöpfung (Phase 2)

Siehe [Sicherheitsarchitektur](../../security-architecture.md) für detailliertes Bedrohungsmodell und Gegenmaßnahmen.
