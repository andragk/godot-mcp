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

## Verwandte Dokumentation

- [Tools-API](/de/api/tools) - MCP-Tool-Spezifikationen
- [Godot Bridge-API](/de/api/godot-bridge) - JSON-RPC-Endpunkte
- [Implementierungsleitfaden](/de/implementation/web-ui) - Dashboard erstellen
