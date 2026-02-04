---
title: Sidecar Web UI API
description: REST- und Server-Sent Events (SSE)-API-Endpunkte für das Monitoring-Dashboard
outline: [2, 3]
---

# Sidecar Web UI API

Die Sidecar Web UI bietet ein browserbasiertes Dashboard zur Überwachung und Steuerung des Godot MCP Servers. Sie stellt REST-API-Endpunkte und Server-Sent Events für Echtzeit-Updates bereit.

## Basis-URL

**Lokaler Zugriff:** `http://localhost:8080`

**Protokoll:** HTTP/1.1  
**Format:** JSON

## Endpunkt-Überblick

| Endpunkt | Methode | Beschreibung |
|----------|--------|-------------|
| `/api/status` | GET | Server-Status und Metriken |
| `/api/lifecycle/start` | POST | MCP-Server starten |
| `/api/lifecycle/stop` | POST | MCP-Server stoppen |
| `/api/lifecycle/restart` | POST | MCP-Server neustarten |
| `/api/connections` | GET | Aktive MCP-Clients auflisten |
| `/api/logs/stream` | GET (SSE) | Echtzeit-Log-Streaming |
| `/api/logs/history` | GET | Historische Logs |
| `/api/settings` | GET/PUT | Server-Konfiguration |

## Status & Monitoring

### GET /api/status

Gibt aktuellen Server-Status und Performance-Metriken zurück.

**Antwort:**
```json
{
  "status": "running",
  "uptime_ms": 3600000,
  "version": "1.0.0",
  "godot": {
    "connected": true,
    "version": "4.6.0.stable",
    "project_path": "/home/user/MyGame",
    "project_name": "My Awesome Game"
  },
  "mcp": {
    "clients_connected": 2,
    "requests_total": 1542,
    "requests_success": 1520,
    "requests_errors": 22
  },
  "performance": {
    "latency_p50_ms": 25,
    "latency_p95_ms": 45,
    "latency_p99_ms": 120,
    "requests_per_second": 12.5
  },
  "cache": {
    "size": 42,
    "max_size": 100,
    "hit_rate": 0.72,
    "memory_mb": 8.5
  }
}
```

**Status-Werte:**
- `starting` - Server initialisiert
- `running` - Betriebsbereit
- `stopping` - Fährt ordnungsgemäß herunter
- `stopped` - Nicht laufend
- `error` - Fehlerzustand

### GET /api/connections

Listet alle aktiven MCP-Client-Verbindungen auf.

**Antwort:**
```json
{
  "connections": [
    {
      "id": "conn-abc123",
      "client_name": "VS Code",
      "client_version": "1.85.0",
      "connected_at": "2026-02-04T10:00:00Z",
      "last_activity": "2026-02-04T10:05:23Z",
      "requests_count": 145,
      "active": true
    }
  ],
  "total": 2,
  "max_concurrent": 10
}
```

## Lebenszyklus-Verwaltung

### POST /api/lifecycle/start

Startet den MCP-Server, falls er gestoppt ist.

**Request-Body:**
```json
{
  "wait_for_godot": true      // Optional: Auf Godot-Verbindung warten
}
```

**Antwort:**
```json
{
  "success": true,
  "message": "MCP server started successfully",
  "pid": 12345,
  "started_at": "2026-02-04T10:00:00Z"
}
```

### POST /api/lifecycle/stop

Stoppt den MCP-Server ordnungsgemäß.

**Request-Body:**
```json
{
  "force": false,             // Optional: Sofortiges Herunterfahren erzwingen
  "timeout_ms": 5000          // Optional: Schonfrist vor erzwungenem Kill
}
```

### POST /api/lifecycle/restart

Startet den MCP-Server neu (Stop + Start).

## Logging

### GET /api/logs/stream (Server-Sent Events)

Echtzeit-Log-Streaming mit Server-Sent Events (SSE).

**Beispiel-Request:**
```http
GET /api/logs/stream HTTP/1.1
Host: localhost:8080
Accept: text/event-stream
```

**Beispiel-Antwort-Stream:**
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"level":"info","timestamp":"2026-02-04T10:00:00Z","message":"MCP server started","context":{}}

data: {"level":"debug","timestamp":"2026-02-04T10:00:06Z","message":"Tool invoked: read_scene","context":{"tool":"read_scene","path":"scenes/MainMenu.tscn","latency_ms":45}}
```

**Log-Event-Schema:**
```typescript
interface LogEvent {
  level: "debug" | "info" | "warn" | "error";
  timestamp: string;          // ISO 8601
  message: string;
  context: Record<string, any>;
}
```

**Client-seitige Verwendung (JavaScript):**
```javascript
const eventSource = new EventSource('/api/logs/stream');

eventSource.onmessage = (event) => {
  const log = JSON.parse(event.data);
  console.log(`[${log.level}] ${log.message}`);
};

eventSource.onerror = () => {
  console.error('Verbindung verloren, reconnecting...');
};
```

### GET /api/logs/history

Ruft historische Logs mit Filterung und Paginierung ab.

**Query-Parameter:**
- `level`: Nach Log-Level filtern (`debug`, `info`, `warn`, `error`)
- `start_time`: ISO 8601-Zeitstempel (Logs nach dieser Zeit filtern)
- `end_time`: ISO 8601-Zeitstempel (Logs vor dieser Zeit filtern)
- `search`: Textsuche in Nachricht und Kontext
- `limit`: Max. Anzahl Logs (Standard: 100, max: 1000)
- `page`: Seitennummer (Standard: 1)

**Beispiel:**
```http
GET /api/logs/history?level=error&limit=50&page=1
```

## Konfiguration

### GET /api/settings

Ruft aktuelle Server-Konfiguration ab.

**Antwort:**
```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 3000,
    "max_connections": 10
  },
  "godot": {
    "host": "127.0.0.1",
    "port": 7777,
    "timeout_ms": 10000,
    "retry_attempts": 3
  },
  "cache": {
    "enabled": true,
    "max_items": 100,
    "ttl_seconds": 300
  },
  "logging": {
    "level": "info",
    "console_enabled": true,
    "file_enabled": true,
    "file_path": "/var/log/godot-mcp/server.log"
  }
}
```

### PUT /api/settings

Aktualisiert Server-Konfiguration (erfordert Neustart für einige Einstellungen).

**Request-Body:**
```json
{
  "cache": {
    "enabled": true,
    "max_items": 150
  },
  "logging": {
    "level": "debug"
  }
}
```

## Alpine.js-Integrationsbeispiel

```html
<div x-data="dashboard()">
  <!-- Status-Badge -->
  <div class="status-badge" :class="statusColor">
    <span x-text="status"></span>
  </div>

  <!-- Metriken -->
  <div class="metrics">
    <div>
      <span>Anfragen:</span>
      <span x-text="metrics.requests_total"></span>
    </div>
  </div>

  <!-- Steuerungen -->
  <button @click="startServer()" :disabled="status === 'running'">
    Starten
  </button>
  <button @click="stopServer()" :disabled="status !== 'running'">
    Stoppen
  </button>

  <!-- Log-Viewer -->
  <div class="logs">
    <template x-for="log in logs" :key="log.id">
      <div :class="'log-' + log.level">
        <span x-text="log.timestamp"></span>
        <span x-text="log.message"></span>
      </div>
    </template>
  </div>
</div>

<script>
function dashboard() {
  return {
    status: 'connecting',
    metrics: {},
    logs: [],
    
    init() {
      this.pollStatus();
      this.connectLogs();
      setInterval(() => this.pollStatus(), 1000);
    },
    
    async pollStatus() {
      const res = await fetch('/api/status');
      const data = await res.json();
      this.status = data.status;
      this.metrics = data.mcp;
    },
    
    connectLogs() {
      const eventSource = new EventSource('/api/logs/stream');
      eventSource.onmessage = (event) => {
        const log = JSON.parse(event.data);
        this.logs.push(log);
        if (this.logs.length > 1000) this.logs.shift();
      };
    },
    
    async startServer() {
      await fetch('/api/lifecycle/start', { method: 'POST' });
      await this.pollStatus();
    },
    
    async stopServer() {
      await fetch('/api/lifecycle/stop', { method: 'POST' });
      await this.pollStatus();
    },
    
    get statusColor() {
      return {
        'bg-green-500': this.status === 'running',
        'bg-yellow-500': this.status === 'starting',
        'bg-red-500': this.status === 'error'
      };
    }
  };
}
</script>
```

## Performance-Überlegungen

**Antwortzeiten:**
- Status-Endpunkt: <10ms
- Logs (Historie): <50ms
- Lebenszyklus-Operationen: 500-2000ms (inkl. Server-Start/Stop-Zeit)

**SSE-Verbindung:**
- Heartbeat alle 30s (um Verbindung aufrechtzuerhalten)
- Automatische Wiederverbindung bei Trennung
- Puffere letzten 1000 Log-Events im Browser

:::tip Best Practices
- SSE für Echtzeit-Updates statt Polling verwenden
- Exponentielles Backoff für Wiederverbindung implementieren
- Log-Puffer-Größe im Browser begrenzen, um Speicherlecks zu verhindern
- Alpine.js `$watch` für reaktive UI-Updates verwenden
:::

---

## Feature-Module

Die Web-UI ist in sieben Kern-Feature-Module organisiert, die umfassende Überwachungs-, Steuerungs- und Debugging-Funktionen bieten.

### 1. Tool-Exploration und -Aufruf

Interaktive Schnittstelle zum Entdecken und Testen von MCP-Tools direkt aus dem Browser.

#### Tool-Katalog

**Endpunkt:** `GET /api/tools`

**Antwort:**
```json
{
  "tools": [
    {
      "name": "read_scene",
      "description": "Godot-Szenendatei lesen und parsen",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "description": "Szenendateipfad relativ zum Projektstamm"
          }
        },
        "required": ["path"]
      }
    }
  ],
  "total": 15
}
```

#### Interaktive Tool-Tests

**Endpunkt:** `POST /api/tools/invoke`

**Request:**
```json
{
  "tool": "read_scene",
  "arguments": {
    "path": "scenes/Player.tscn"
  }
}
```

**Antwort:**
```json
{
  "success": true,
  "result": {
    "type": "Node2D",
    "name": "Player",
    "children": [...]
  },
  "execution_time_ms": 45,
  "timestamp": "2026-02-04T10:00:00Z"
}
```

#### Schema-Viewer

Interaktiver JSON-Schema-Viewer mit:
- Anzeige von Eigenschaftstypen und -beschränkungen
- Hervorhebung erforderlicher Felder
- Beschreibungs-Tooltips
- Generierung von Beispielwerten

---

### 2. Ressourcenverwaltung

Durchsuchen, Vorschau und Suche von MCP-Ressourcen, die vom Server bereitgestellt werden.

#### Ressourcen-Browser

**Endpunkt:** `GET /api/resources`

**Query-Parameter:**
- `type`: Nach Ressourcentyp filtern (`scene`, `script`, `asset`)
- `search`: Textsuche in Ressourcen-URIs
- `limit`: Max. Ergebnisse (Standard: 100)

**Antwort:**
```json
{
  "resources": [
    {
      "uri": "godot://scene/MainMenu.tscn",
      "name": "MainMenu",
      "type": "PackedScene",
      "mimeType": "application/x-godot-scene",
      "size": 2048,
      "description": "Hauptmenü-Szene mit UI-Buttons"
    },
    {
      "uri": "godot://script/Player.gd",
      "name": "Player",
      "type": "GDScript",
      "mimeType": "text/x-gdscript",
      "size": 1024,
      "description": "Spieler-Controller-Skript"
    }
  ],
  "total": 42,
  "filtered": 2
}
```

#### Inhaltsvorschau

**Endpunkt:** `GET /api/resources/content`

**Query-Parameter:**
- `uri`: Ressourcen-URI zum Abrufen

**Antwort:**
```json
{
  "uri": "godot://script/Player.gd",
  "content": "extends CharacterBody2D\n\nvar speed = 300.0\n...",
  "mimeType": "text/x-gdscript",
  "size": 1024,
  "encoding": "utf-8"
}
```

#### Suche & Filter

Erweiterte Filterfunktionen:
- **Volltextsuche** über Ressourceninhalte
- **Typfilterung** (Szenen, Skripte, Assets)
- **Tag/Gruppen-Filterung** für organisierte Ressourcen
- **Datumsbereich** (zuletzt geändert)
- **Größenbereichsfilterung**

---

### 3. Echtzeit-Logging & Monitoring

Umfassende Logging-Infrastruktur mit kategorisierter Ausgabe und Performance-Tracking.

#### Traffic-Log

**Endpunkt:** `GET /api/traffic/stream` (SSE)

Echtzeit-JSON-RPC-Nachrichteninspektion zwischen Client und Server.

**Event-Stream:**
```
data: {"direction":"incoming","timestamp":"2026-02-04T10:00:00Z","type":"request","method":"tools/call","params":{"name":"read_scene","arguments":{"path":"scenes/Player.tscn"}}}

data: {"direction":"outgoing","timestamp":"2026-02-04T10:00:01Z","type":"response","result":{...},"latency_ms":45}
```

**Traffic-Log-Schema:**
```typescript
interface TrafficEvent {
  direction: "incoming" | "outgoing";
  timestamp: string;
  type: "request" | "response" | "notification";
  method?: string;
  params?: any;
  result?: any;
  error?: any;
  latency_ms?: number;
}
```

#### Fehler-Konsole

**Endpunkt:** `GET /api/errors/history`

**Query-Parameter:**
- `severity`: `critical`, `error`, `warning`
- `start_time`: ISO 8601-Zeitstempel
- `limit`: Max. Ergebnisse

**Antwort:**
```json
{
  "errors": [
    {
      "id": "err-123",
      "severity": "error",
      "timestamp": "2026-02-04T10:00:10Z",
      "tool": "read_scene",
      "message": "Datei nicht gefunden: scenes/Missing.tscn",
      "stack_trace": "...",
      "context": {
        "client_id": "conn-abc123",
        "request_id": "req-456"
      },
      "recovered": false
    }
  ],
  "total": 5
}
```

#### Performance-Metriken

**Endpunkt:** `GET /api/metrics/performance`

**Antwort:**
```json
{
  "tool_latency": {
    "read_scene": {
      "p50_ms": 25,
      "p95_ms": 45,
      "p99_ms": 120,
      "max_ms": 250,
      "invocations": 1542
    },
    "create_scene": {
      "p50_ms": 150,
      "p95_ms": 300,
      "p99_ms": 500,
      "max_ms": 800,
      "invocations": 245
    }
  },
  "godot_bridge": {
    "connection_latency_ms": 5,
    "request_queue_size": 0,
    "timeout_count": 2
  },
  "server_health": {
    "cpu_percent": 15.2,
    "memory_mb": 85.6,
    "event_loop_lag_ms": 2
  }
}
```

**Echtzeit-Metriken (SSE):**
```http
GET /api/metrics/stream
```

---

### 4. Konfiguration & Sicherheit

Umgebungsvariablen, Client-Zugriff und Prompt-Vorlagen verwalten.

#### Umgebungsvariablen

**Endpunkt:** `GET /api/config/environment`

**Antwort:**
```json
{
  "variables": [
    {
      "name": "GODOT_HOST",
      "value": "127.0.0.1",
      "type": "string",
      "description": "Godot-Bridge-Host-Adresse",
      "editable": true
    },
    {
      "name": "GODOT_PORT",
      "value": "7777",
      "type": "number",
      "description": "Godot-Bridge-Port",
      "editable": true
    },
    {
      "name": "LOG_LEVEL",
      "value": "info",
      "type": "enum",
      "options": ["debug", "info", "warn", "error"],
      "editable": true
    }
  ]
}
```

**Variablen aktualisieren:**
```http
PUT /api/config/environment
Content-Type: application/json

{
  "GODOT_PORT": "8888",
  "LOG_LEVEL": "debug"
}
```

:::warning Neustart erforderlich
Die meisten Änderungen an Umgebungsvariablen erfordern einen Server-Neustart, um wirksam zu werden. Die UI zeigt eine Warnung an, wenn dies notwendig ist.
:::

#### Zugriffskontrolle

**Endpunkt:** `GET /api/security/access`

**Antwort:**
```json
{
  "clients": [
    {
      "id": "conn-abc123",
      "name": "Claude Desktop",
      "ip_address": "127.0.0.1",
      "connected_at": "2026-02-04T10:00:00Z",
      "authenticated": true,
      "permissions": ["read", "write", "execute"],
      "rate_limit": {
        "requests_per_minute": 100,
        "current": 45
      }
    }
  ],
  "access_rules": [
    {
      "rule_id": "rule-1",
      "pattern": "127.0.0.1/*",
      "action": "allow",
      "permissions": ["read", "write", "execute"]
    },
    {
      "rule_id": "rule-2",
      "pattern": "0.0.0.0/0",
      "action": "deny",
      "permissions": []
    }
  ]
}
```

**Client trennen:**
```http
POST /api/security/disconnect
Content-Type: application/json

{
  "client_id": "conn-abc123",
  "reason": "Wartung"
}
```

#### Prompt-Galerie

**Endpunkt:** `GET /api/prompts`

**Antwort:**
```json
{
  "prompts": [
    {
      "name": "scene_analysis",
      "description": "Szenenstruktur analysieren und Verbesserungen vorschlagen",
      "template": "Analysiere die Szene unter {{scene_path}} und gib Optimierungsvorschläge für Performance und Wartbarkeit.",
      "variables": [
        {
          "name": "scene_path",
          "type": "string",
          "description": "Pfad zur Szenendatei",
          "required": true
        }
      ]
    },
    {
      "name": "code_review",
      "description": "GDScript-Code auf Best Practices prüfen",
      "template": "Überprüfe das Skript {{script_path}} auf:\n1. Codequalität\n2. Performance-Probleme\n3. Godot Best Practices\n4. Sicherheitsbedenken",
      "variables": [
        {
          "name": "script_path",
          "type": "string",
          "required": true
        }
      ]
    }
  ],
  "total": 8
}
```

**Prompt testen:**
```http
POST /api/prompts/test
Content-Type: application/json

{
  "name": "scene_analysis",
  "variables": {
    "scene_path": "scenes/MainMenu.tscn"
  }
}
```

---

### 5. Verbindungs- & Session-Verwaltung

Aktive Client-Verbindungen mit detaillierter Session-Verfolgung überwachen und steuern.

#### Aktive Client-Liste

**Endpunkt:** `GET /api/connections` (erweiterte Version)

**Antwort:**
```json
{
  "connections": [
    {
      "id": "conn-abc123",
      "client_name": "VS Code",
      "client_version": "1.85.0",
      "connected_at": "2026-02-04T10:00:00Z",
      "last_activity": "2026-02-04T10:05:23Z",
      "session_duration_ms": 323000,
      "requests_count": 145,
      "requests_success": 140,
      "requests_failed": 5,
      "active": true,
      "idle_time_ms": 2000,
      "protocol_version": "2024-11-05",
      "capabilities": {
        "tools": true,
        "resources": true,
        "prompts": false,
        "sampling": false
      }
    }
  ],
  "total": 2,
  "max_concurrent": 10,
  "total_sessions_today": 15
}
```

#### Session-Dauer-Verfolgung

Echtzeit-Session-Analysen:
- Aktive Verbindungszeit
- Leerlaufzeiterkennung
- Anforderungsratenüberwachung
- Bandbreitennutzung (zukünftig)

#### Verbindungsmetadaten

**Endpunkt:** `GET /api/connections/{connection_id}`

**Antwort:**
```json
{
  "id": "conn-abc123",
  "client_info": {
    "name": "Claude Desktop",
    "version": "0.5.2",
    "user_agent": "ModelContextProtocol/1.0"
  },
  "initialization": {
    "timestamp": "2026-02-04T10:00:00Z",
    "protocol_version": "2024-11-05",
    "client_capabilities": {
      "tools": { "listChanged": true },
      "resources": { "subscribe": true, "listChanged": true }
    },
    "server_capabilities": {
      "tools": {},
      "resources": {},
      "prompts": {},
      "logging": {}
    }
  },
  "statistics": {
    "requests_by_method": {
      "tools/call": 85,
      "resources/read": 45,
      "tools/list": 15
    },
    "average_latency_ms": 42,
    "data_transferred_bytes": 1048576
  }
}
```

#### Kill-Switch

**Endpunkt:** `POST /api/connections/{connection_id}/disconnect`

**Request:**
```json
{
  "reason": "Nicht reagierender Client",
  "force": false,
  "notify_client": true
}
```

**Antwort:**
```json
{
  "success": true,
  "message": "Verbindung ordnungsgemäß geschlossen",
  "client_id": "conn-abc123",
  "disconnected_at": "2026-02-04T10:10:00Z"
}
```

---

### 6. Service-Status & Lebenszyklus-Steuerung

Umfassende Prozessverwaltung mit visuellen Statusanzeigen und Gesundheitsüberwachung.

#### Statusanzeigen

**Erweiterter Status-Endpunkt:** `GET /api/status` (zusätzliche Felder)

**Antwort:**
```json
{
  "status": "running",
  "substatus": "healthy",
  "uptime_ms": 3600000,
  "version": "1.0.0",
  "health": {
    "overall": "healthy",
    "checks": {
      "godot_connection": {
        "status": "healthy",
        "latency_ms": 5,
        "last_check": "2026-02-04T10:05:00Z"
      },
      "event_loop": {
        "status": "healthy",
        "lag_ms": 2,
        "last_check": "2026-02-04T10:05:00Z"
      },
      "memory": {
        "status": "healthy",
        "usage_mb": 85.6,
        "limit_mb": 512,
        "last_check": "2026-02-04T10:05:00Z"
      },
      "disk": {
        "status": "healthy",
        "free_gb": 50.2,
        "last_check": "2026-02-04T10:05:00Z"
      }
    }
  },
  "transitions": [
    {
      "from": "stopped",
      "to": "starting",
      "timestamp": "2026-02-04T09:59:58Z"
    },
    {
      "from": "starting",
      "to": "running",
      "timestamp": "2026-02-04T10:00:00Z"
    }
  ]
}
```

**Status-Werte:**
- 🟢 **running** / **healthy** - Voll funktionsfähig
- 🟡 **starting** / **initializing** - Ressourcen werden geladen
- 🟡 **running** / **degraded** - Betriebsbereit mit Warnungen
- 🔴 **stopped** - Prozess läuft nicht
- 🔴 **error** / **crashed** - Kritischer Fehler

#### Gesundheitschecks

**Endpunkt:** `GET /api/health`

**Antwort:**
```json
{
  "status": "healthy",
  "checks": {
    "godot_bridge": {
      "status": "pass",
      "response_time_ms": 5
    },
    "event_loop": {
      "status": "pass",
      "lag_ms": 2
    },
    "memory": {
      "status": "pass",
      "usage_percent": 16.7
    }
  },
  "timestamp": "2026-02-04T10:00:00Z"
}
```

**Gesundheitscheck-Standards:**
- Folgt RFC 7234 (Caching) und draft-inadarei-api-health-check
- `/health`-Endpunkt für Überwachungssysteme
- 200 OK = gesund, 503 Service Unavailable = ungesund

#### Prozesssteuerung

**Server starten:**
```http
POST /api/lifecycle/start
```

**Server stoppen:**
```http
POST /api/lifecycle/stop
```

**Server neustarten:**
```http
POST /api/lifecycle/restart
```

**Konfiguration neu laden:**
```http
POST /api/lifecycle/reload
Content-Type: application/json

{
  "preserve_connections": true
}
```

---

### 7. Erweiterte Protokollierung & Observability

Professionelles Logging mit Traffic-Inspektion, Kategorisierung und Exportfunktionen.

#### Traffic-Inspektion (Der "Inspektor")

**Split-View-Log-Endpunkt:** `GET /api/inspector/stream` (SSE)

**Event-Format:**
```typescript
interface InspectorEvent {
  id: string;
  timestamp: string;
  direction: "client_to_server" | "server_to_client";
  protocol: "jsonrpc";
  message: {
    jsonrpc: "2.0";
    id?: number | string;
    method?: string;
    params?: any;
    result?: any;
    error?: any;
  };
  metadata: {
    client_id: string;
    size_bytes: number;
    latency_ms?: number;
  };
}
```

**Beispiel-Stream:**
```
data: {"id":"msg-1","timestamp":"2026-02-04T10:00:00Z","direction":"client_to_server","protocol":"jsonrpc","message":{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_scene","arguments":{"path":"scenes/Player.tscn"}}},"metadata":{"client_id":"conn-abc123","size_bytes":128}}

data: {"id":"msg-2","timestamp":"2026-02-04T10:00:01Z","direction":"server_to_client","protocol":"jsonrpc","message":{"jsonrpc":"2.0","id":1,"result":{...}},"metadata":{"client_id":"conn-abc123","size_bytes":2048,"latency_ms":45}}
```

#### Log-Level

**Filter-Endpunkt:** `GET /api/logs/stream?levels=debug,info,warn,error`

**Unterstützte Level:**
- `DEBUG` - Ausführliche Debugging-Informationen
- `INFO` - Allgemeine Informationsmeldungen
- `WARN` - Warnmeldungen (nicht kritisch)
- `ERROR` - Fehlermeldungen (Ausfälle)

**Umschalt-Beispiel (Alpine.js):**
```html
<div x-data="{ logLevels: ['info', 'warn', 'error'] }">
  <label>
    <input type="checkbox" x-model="logLevels" value="debug">
    Debug
  </label>
  <label>
    <input type="checkbox" x-model="logLevels" value="info">
    Info
  </label>
  <label>
    <input type="checkbox" x-model="logLevels" value="warn">
    Warnung
  </label>
  <label>
    <input type="checkbox" x-model="logLevels" value="error">
    Fehler
  </label>
</div>
```

#### Auto-Scroll & Einfrieren

**UI-Implementierung:**
```html
<div x-data="logViewer()">
  <div class="controls">
    <button @click="autoScroll = !autoScroll">
      <span x-text="autoScroll ? 'Einfrieren' : 'Auto-Scroll'"></span>
    </button>
    <button @click="clearLogs()">Löschen</button>
  </div>
  
  <div class="logs-container" 
       x-ref="logsContainer"
       @scroll="handleScroll()">
    <template x-for="log in logs" :key="log.id">
      <div :class="'log-' + log.level">
        <span x-text="log.timestamp"></span>
        <span x-text="log.message"></span>
      </div>
    </template>
  </div>
</div>
```

#### Logs exportieren

**Endpunkt:** `GET /api/logs/export`

**Query-Parameter:**
- `format`: `json`, `csv`, `txt`
- `start_time`: ISO 8601-Zeitstempel
- `end_time`: ISO 8601-Zeitstempel
- `levels`: Komma-getrennte Log-Level

**Beispiel:**
```http
GET /api/logs/export?format=json&start_time=2026-02-04T09:00:00Z&end_time=2026-02-04T10:00:00Z&levels=error,warn
```

**Antwort (JSON):**
```json
{
  "export_id": "export-123",
  "generated_at": "2026-02-04T10:05:00Z",
  "filters": {
    "start_time": "2026-02-04T09:00:00Z",
    "end_time": "2026-02-04T10:00:00Z",
    "levels": ["error", "warn"]
  },
  "logs": [
    {
      "id": "log-1",
      "level": "error",
      "timestamp": "2026-02-04T09:15:00Z",
      "message": "Tool-Ausführung fehlgeschlagen",
      "context": {...}
    }
  ],
  "total": 15
}
```

---

## UI-Integrationsleitfaden

### Dashboard-Layout

Empfohlene Struktur für die Web-UI:

```
┌─────────────────────────────────────────────────┐
│ Header: Godot MCP Server                       │
│ [Status-Badge] [Version] [Steuerungen]         │
├─────────────────────────────────────────────────┤
│ Navigation: Status | Tools | Ressourcen | Logs │
├─────────────────────────────────────────────────┤
│                                                 │
│ Hauptinhalt (routenspezifisch)                 │
│                                                 │
│ - Status: Metrik-Karten + Gesundheitschecks   │
│ - Tools: Katalog + Interaktiver Tester        │
│ - Ressourcen: Browser + Inhaltsvorschau       │
│ - Logs: Traffic-Inspektor + Log-Viewer        │
│                                                 │
├─────────────────────────────────────────────────┤
│ Footer: © 2026 | Docs | GitHub                 │
└─────────────────────────────────────────────────┘
```

### Tailwind CSS-Komponentenbibliothek

Wiederverwendbare Komponenten für konsistente UI:

**Status-Badge:**
```html
<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
      :class="{
        'bg-green-100 text-green-800': status === 'running',
        'bg-yellow-100 text-yellow-800': status === 'starting',
        'bg-red-100 text-red-800': status === 'error'
      }">
  <svg class="w-2 h-2 mr-2" fill="currentColor" viewBox="0 0 8 8">
    <circle cx="4" cy="4" r="3"/>
  </svg>
  <span x-text="status"></span>
</span>
```

**Metrik-Karte:**
```html
<div class="bg-white rounded-lg shadow p-6">
  <h3 class="text-sm font-medium text-gray-500 mb-2">Gesamtanfragen</h3>
  <p class="text-3xl font-bold text-gray-900" x-text="metrics.requests_total"></p>
  <p class="text-sm text-gray-600 mt-1">
    <span class="text-green-600">↑ 12%</span> seit letzter Stunde
  </p>
</div>
```

### Alpine.js-Statusverwaltung

**Globales Store-Pattern:**
```javascript
document.addEventListener('alpine:init', () => {
  Alpine.store('server', {
    status: 'connecting',
    metrics: {},
    connections: [],
    
    async init() {
      await this.pollStatus();
      setInterval(() => this.pollStatus(), 1000);
    },
    
    async pollStatus() {
      const res = await fetch('/api/status');
      const data = await res.json();
      this.status = data.status;
      this.metrics = data.mcp;
    }
  });
});
```

**Komponenten-Verwendung:**
```html
<div x-data>
  <span x-text="$store.server.status"></span>
  <span x-text="$store.server.metrics.requests_total"></span>
</div>
```

---

## Sicherheitsüberlegungen

### CORS-Konfiguration

Für Entwicklung localhost-Origins erlauben:

```javascript
// server.js
app.use(cors({
  origin: ['http://localhost:8080', 'http://127.0.0.1:8080'],
  methods: ['GET', 'POST', 'PUT'],
  credentials: true
}));
```

### Content Security Policy

Restriktive CSP-Header setzen:

```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline' cdn.tailwindcss.com cdn.jsdelivr.net; 
               style-src 'self' 'unsafe-inline' cdn.tailwindcss.com; 
               connect-src 'self';">
```

---

## Verwandte Dokumentation

- [Tools-API](/de/api/tools) - MCP-Tool-Spezifikationen
- [Godot Bridge-API](/de/api/godot-bridge) - JSON-RPC-Endpunkte
- [Implementierungsleitfaden](/de/implementation/web-ui) - Dashboard erstellen
