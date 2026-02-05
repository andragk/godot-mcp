---
title: Sidecar Web UI API
description: REST- und Server-Sent Events (SSE)-API-Endpunkte für das Monitoring-Dashboard
outline: [2, 3]
---

# Sidecar Web UI API

Die Sidecar Web UI bietet ein browserbasiertes Dashboard zur Überwachung und Steuerung des Godot MCP Servers. Sie stellt REST-API-Endpunkte und Server-Sent Events für Echtzeit-Updates bereit.

## Basis-URL

---

## Cache & SSE Monitoring

### GET /api/cache/metrics

Gibt Cache-Metriken fuer Datei-, Szenen- und Skript-Caches zurueck.

**Antwort:**
```json
{
  "fileCache": {
    "hits": 120,
    "misses": 30,
    "evictions": 4,
    "currentSize": 1048576,
    "entryCount": 42,
    "hitRatio": 0.8
  },
  "sceneCache": {
    "hits": 18,
    "misses": 5,
    "evictions": 0,
    "currentSize": 262144,
    "entryCount": 6,
    "hitRatio": 0.78
  },
  "scriptCache": {
    "hits": 40,
    "misses": 12,
    "evictions": 1,
    "currentSize": 131072,
    "entryCount": 8,
    "hitRatio": 0.77
  }
}
```

---

### GET /api/sse/stats

Gibt Statistiken fuer SSE-Clients und Heartbeat-Aktivitaet zurueck.

**Antwort:**
```json
{
  "clients": {
    "totalClients": 2,
    "totalEventsSent": 18,
    "clients": [
      {
        "id": "client-1700000000000-0.123",
        "connectedAt": "2026-02-04T10:00:00.000Z",
        "lastActivity": "2026-02-04T10:05:00.000Z",
        "eventsSent": 12,
        "sessionDuration": 300000
      }
    ]
  },
  "heartbeat": {
    "isRunning": true,
    "interval": 30000,
    "heartbeatsSent": 10,
    "subscribers": 2
  }
}
```

**Lokaler Zugriff:** `http://localhost:3000`

**Protokoll:** HTTP/1.1  
**Format:** JSON

## Authentifizierung & Zugriffskontrolle

**Aktuelles Verhalten:**
- Anfragen muessen von localhost (127.0.0.1/::1) stammen.
- Wenn `MCP_API_KEY` gesetzt ist, via `X-API-Key` oder `Authorization: Bearer <key>` senden.

:::warning
Schreib-Endpunkte und der SSE-Log-Stream erzwingen localhost-Zugriff. Remote-Zugriff wird mit `403` abgewiesen.
:::

## Rate Limits

**Aktuelles Verhalten:**
- Limits werden nach API-Key (falls vorhanden) oder sonst nach Client-IP gezaehlt.
- Localhost-Anfragen und gueltige API-Keys umgehen das Rate-Limit.
- Lese-Endpunkte: 100 Anfragen pro 15 Minuten (`RATE_LIMIT_MAX_READS`, `RATE_LIMIT_WINDOW`).
- Schreib-Endpunkte: 20 Anfragen pro 15 Minuten (`RATE_LIMIT_MAX_WRITES`, `RATE_LIMIT_WINDOW`).
- Tool-Ausfuehrung (`/api/execute`): 30 Anfragen pro Minute pro Tool und Client.
- Lifecycle-Steuerung (`/api/server/*`): 10 Anfragen pro 5 Minuten pro Client.
- SSE-Verbindungsversuche (`/api/logs/stream`): 10 Anfragen pro Minute pro Client.

## Endpunkt-Überblick

**Aktuelles Verhalten:** Die Web UI stellt folgende Endpunkte im laufenden Server bereit.

| Endpunkt | Methode | Beschreibung |
|----------|--------|-------------|
| `/api/health` | GET | Basis-Health-Check |
| `/api/status` | GET | Status-Zusammenfassung der Web UI |
| `/api/bridge/health` | GET | Godot-Bridge-Health |
| `/api/bridge/version` | GET | Godot-Bridge-Version |
| `/api/server/start` | POST | MCP-Serverprozess starten |
| `/api/server/stop` | POST | MCP-Serverprozess stoppen |
| `/api/server/restart` | POST | MCP-Serverprozess neu starten |
| `/api/server/status` | GET | Status des MCP-Serverprozesses |
| `/api/cache/metrics` | GET | Cache-Metriken-Snapshot |
| `/api/sse/stats` | GET | SSE-Client- und Heartbeat-Statistiken |
| `/api/logs/stream` | GET (SSE) | Echtzeit-Log-Streaming |
| `/api/tools` | GET | MCP-Tools fuer den Tool Explorer |
| `/api/execute` | POST | MCP-Tool aus der Web UI ausfuehren |

**Geplante Erweiterung:** Die folgenden Endpunkte sind in zukuenftigen UI-Modulen vorgesehen, aber noch nicht implementiert.

| Endpunkt | Methode | Beschreibung |
|----------|--------|-------------|
| `/api/connections` | GET | Aktive MCP-Clients auflisten |
| `/api/logs/history` | GET | Historische Logs |
| `/api/settings` | GET/PUT | Server-Konfiguration |
| `/api/resources` | GET | Ressourcen-Browser |
| `/api/resources/content` | GET | Ressourcen-Inhaltsvorschau |

## Status & Monitoring

### GET /api/status

Gibt aktuellen Server-Status und Basis-Metriken zurück.

**Antwort:**
```json
{
  "uptime": 3600,
  "bridgeConnected": true,
  "activeSessions": 2,
  "lastActivity": "2026-02-04T10:05:23.000Z"
}
```

**Antwort-Codes:**
- `200` - Erfolg
- `500` - Dienst nicht verfuegbar

---

### GET /api/health

Basis-Health-Check fuer den Web-UI-Server.

**Antwort:**
```json
{
  "status": "ok",
  "uptime": 3600
}
```

---

### GET /api/bridge/health

Gibt den aktuellen Health-Status der Godot-Bridge zurueck.

**Antwort:**
```json
{
  "status": "healthy",
  "port": 7777,
  "uptime": 5234,
  "lastCheck": "2026-02-04T10:05:23.000Z",
  "error": null
}
```

**Antwort-Codes:**
- `200` - Erfolg
- `503` - Bridge nicht verfuegbar

---

### GET /api/bridge/version

Gibt die Versionszeichenkette der Godot-Bridge zurueck.

**Antwort:**
```json
{
  "version": "4.6.0"
}
```

**Antwort-Codes:**
- `200` - Erfolg
- `503` - Bridge nicht verfuegbar

### GET /api/connections

Listet alle aktiven MCP-Client-Verbindungen auf.

**Geplante Erweiterung:** Dieser Endpunkt ist in der aktuellen Web UI nicht implementiert.

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

### POST /api/server/start

Startet den MCP-Serverprozess.

**Antwort:**
```json
{
  "success": true,
  "message": "MCP server started",
  "info": {
    "state": "running",
    "pid": 12345,
    "startedAt": "2026-02-04T10:00:00.000Z",
    "uptime": 2,
    "restartCount": 0
  }
}
```

**Antwort-Codes:**
- `200` - Erfolgreich gestartet
- `500` - Start fehlgeschlagen

---

### POST /api/server/stop

Stoppt den MCP-Serverprozess.

**Request-Body:**
```json
{
  "force": false
}
```

**Antwort:**
```json
{
  "success": true,
  "message": "MCP server stopped",
  "info": {
    "state": "stopped",
    "stoppedAt": "2026-02-04T10:05:00.000Z",
    "restartCount": 0
  }
}
```

**Antwort-Codes:**
- `200` - Erfolgreich gestoppt
- `500` - Stop fehlgeschlagen

---

### POST /api/server/restart

Startet den MCP-Serverprozess neu (Stop + Start).

**Antwort:**
```json
{
  "success": true,
  "message": "MCP server restarted",
  "info": {
    "state": "running",
    "pid": 12346,
    "startedAt": "2026-02-04T10:06:00.000Z",
    "restartCount": 1
  }
}
```

**Antwort-Codes:**
- `200` - Erfolgreich neu gestartet
- `500` - Neustart fehlgeschlagen

---

### GET /api/server/status

Gibt den aktuellen Status des MCP-Serverprozesses zurueck.

**Antwort:**
```json
{
  "state": "running",
  "pid": 12345,
  "startedAt": "2026-02-04T10:00:00.000Z",
  "stoppedAt": null,
  "uptime": 3600,
  "restartCount": 0,
  "lastError": null
}
```

## Logging

### GET /api/logs/stream (Server-Sent Events)

Echtzeit-Log-Streaming mit Server-Sent Events (SSE).

**Aktuelles Verhalten:** Erfordert localhost-Zugriff und optionalen API-Key (siehe Abschnitt Authentifizierung).

**Beispiel-Request:**
```http
GET /api/logs/stream HTTP/1.1
Host: localhost:3000
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

interface SSEEventEnvelope {
  event: "log" | "status" | "metric" | "error" | "info" | "heartbeat";
  data: LogEvent | Record<string, unknown>;
  id?: string;
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

**Geplante Erweiterung:** Dieser Endpunkt ist noch nicht verfuegbar. Fuer Echtzeit-Logs `/api/logs/stream` verwenden.

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

**Geplante Erweiterung:** Diese Endpunkte sind in der aktuellen Web UI nicht implementiert.

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

---

## Fehlerbehandlung

### Standard-Fehlerantwort

```json
{
  "error": "Service temporarily unavailable"
}
```

`/api/execute` gibt bei fehlgeschlagener Tool-Ausfuehrung eine strukturierte Antwort zurueck (siehe Tool-Explorer-Abschnitt).

### Fehlercodes

| HTTP-Status | Beschreibung |
|-------------|-------------|
| 400 | Validierungsfehler oder fehlende Pflichtfelder |
| 401 | API-Key fehlt oder ist ungueltig |
| 403 | Localhost-Zugriffsbeschraenkung |
| 404 | Tool nicht gefunden |
| 429 | Rate Limit ueberschritten |
| 500 | Interner Serverfehler |
| 503 | Bridge nicht verfuegbar |
| 504 | Tool-Ausfuehrung hat Zeitlimit ueberschritten |

---

## Rate Limiting

**Aktuelles Verhalten:**
- Lese-Endpunkte: 100 Anfragen pro 15 Minuten
- Schreib-Endpunkte: 20 Anfragen pro 15 Minuten

**Rate-Limit-Header:**
```http
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1612451200
```

**Antwort (Rate Limited):**
```json
{
  "error": "Too many requests, please try again later"
}
```

**HTTP-Status:** `429 Too Many Requests`

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
      <span>Aktive Sessions:</span>
      <span x-text="metrics.activeSessions"></span>
    </div>
    <div>
      <span>Uptime (s):</span>
      <span x-text="metrics.uptime"></span>
    </div>
  </div>

  <!-- Steuerungen -->
  <button @click="startServer()" :disabled="status === 'bridge_connected'">
    Starten
  </button>
  <button @click="stopServer()" :disabled="status !== 'bridge_connected'">
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
      await fetch('/api/server/start', { method: 'POST' });
      await this.pollStatus();
    },
    
    async stopServer() {
      await fetch('/api/server/stop', { method: 'POST' });
      await this.pollStatus();
    },
    
    get statusColor() {
      return {
        'bg-green-500': this.status === 'bridge_connected',
        'bg-red-500': this.status === 'bridge_disconnected'
      };
    }
  };
}
</script>
```

## Performance-Überlegungen

**Antwortzeiten:**
- Status-Endpunkt: <10ms
- Logs (Stream): <50ms
- Server-Start/Stop: 500-2000ms (inkl. Prozess-Startzeit)

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
      "category": "scene_operations",
      "securityLevel": "safe",
      "version": "1.0.0",
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
  ]
}
```

#### Interaktive Tool-Tests

**Endpunkt:** `POST /api/execute`

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
  "data": {
    "type": "Node2D",
    "name": "Player",
    "children": [...]
  },
  "correlationId": "corr-1700000000000-abc123",
  "durationMs": 45
}
```

**Fehlerantwort:**
```json
{
  "success": false,
  "error": {
    "name": "ValidationError",
    "message": "Invalid arguments"
  },
  "correlationId": "corr-1700000000000-abc123",
  "durationMs": 12
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

**Geplante Erweiterung:** Nicht im aktuellen Web-UI-Server implementiert.

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

**Geplante Erweiterung:** Nicht im aktuellen Web-UI-Server implementiert.

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

**Geplante Erweiterung:** Nicht im aktuellen Web-UI-Server implementiert.

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

**Geplante Erweiterung:** Nicht im aktuellen Web-UI-Server implementiert.

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

**Geplante Erweiterung:** Nicht im aktuellen Web-UI-Server implementiert.

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
POST /api/server/start
```

**Server stoppen:**
```http
POST /api/server/stop
```

**Server neustarten:**
```http
POST /api/server/restart
```

---

### 7. Erweiterte Protokollierung & Observability

**Geplante Erweiterung:** Nicht im aktuellen Web-UI-Server implementiert.

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

## Statische Assets

Die Web UI stellt statische Dateien aus dem Verzeichnis `/public` bereit:

- `GET /` - Dashboard HTML
- `GET /tool-explorer.html` - Tool-Explorer-UI
- `GET /tool-explorer.js` - Tool-Explorer-Skript
- `GET /styles/output.css` - Tailwind CSS Output
- `GET /styles/input.css` - Tailwind CSS Quelle

---

## WebSocket-API (Phase 2)

**Geplante Erweiterung:** WebSocket-Unterstuetzung ist noch nicht verfuegbar.

In Phase 2 wird WebSocket-Unterstuetzung fuer bidirektionale Kommunikation hinzugefuegt:

**Endpunkt:** `ws://localhost:3000/ws`

**Nachrichtentypen:**
- `subscribe` - Events abonnieren
- `unsubscribe` - Abonnement beenden
- `command` - Server-Befehl ausfuehren
- `notification` - Server-seitige Ereignisse

**Beispiel:**
```json
{
  "type": "subscribe",
  "channel": "tools",
  "filter": {"tool_name": "read_scene"}
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
        'bg-green-100 text-green-800': status === 'bridge_connected',
        'bg-red-100 text-red-800': status === 'bridge_disconnected'
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
  <h3 class="text-sm font-medium text-gray-500 mb-2">Aktive Sessions</h3>
  <p class="text-3xl font-bold text-gray-900" x-text="metrics.activeSessions"></p>
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
      this.status = data.bridgeConnected ? 'bridge_connected' : 'bridge_disconnected';
      this.metrics = {
        activeSessions: data.activeSessions,
        uptime: data.uptime
      };
    }
  });
});
```

**Komponenten-Verwendung:**
```html
<div x-data>
  <span x-text="$store.server.status"></span>
  <span x-text="$store.server.metrics.activeSessions"></span>
</div>
```

---

## Sicherheitsüberlegungen

### CORS-Konfiguration

**Aktuelles Verhalten:** CORS ist aktiv und nutzt eine Allowlist (localhost plus `ALLOWED_ORIGINS`).

Allowlisted Origins fuer Entwicklung:

```javascript
// server.js
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  methods: ['GET', 'POST', 'PUT'],
  credentials: true
}));
```

### Content Security Policy

**Aktuelles Verhalten:** CSP-Header werden via Helmet erzwungen, um Skript-, Style- und Font-Quellen einzuschraenken.

Aktuelle CSP-Konfiguration:

```html
<meta http-equiv="Content-Security-Policy" 
  content="default-src 'self';
       style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
       script-src 'self' 'unsafe-inline' 'unsafe-eval';
       img-src 'self' data: https:;
       connect-src 'self';
       font-src 'self' https://fonts.gstatic.com;
       object-src 'none';
       media-src 'self';
       frame-src 'none';">
```

### Eingabevalidierung

**Geplante Erweiterung:** Nicht im aktuellen Web-UI-Server implementiert.

Eingaben immer validieren und bereinigen:

```javascript
function validateToolArguments(tool, args) {
  // Validate against JSON Schema
  const valid = validate(tool.inputSchema, args);
  if (!valid) {
    throw new Error('Invalid arguments');
  }
  
  // Sanitize string inputs
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      args[key] = sanitizeHtml(value);
    }
  }
  
  return args;
}
```

---

## Verwandte Dokumentation

- [Tools-API](/de/api/tools) - MCP-Tool-Spezifikationen
- [Godot Bridge-API](/de/api/godot-bridge) - JSON-RPC-Endpunkte
- [Implementierungsleitfaden](/de/implementation/web-ui) - Dashboard erstellen
