---
title: Sidecar Web UI API
description: REST and Server-Sent Events (SSE) API endpoints for the monitoring dashboard
outline: [2, 3]
---

# Sidecar Web UI API

The Sidecar Web UI provides a browser-based dashboard for monitoring and controlling the Godot MCP Server. It exposes REST API endpoints and Server-Sent Events for real-time updates.

## Base URL

**Local Access:** `http://localhost:8080`

**Protocol:** HTTP/1.1  
**Format:** JSON

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Server status and metrics |
| `/api/lifecycle/start` | POST | Start MCP server |
| `/api/lifecycle/stop` | POST | Stop MCP server |
| `/api/lifecycle/restart` | POST | Restart MCP server |
| `/api/connections` | GET | List active MCP clients |
| `/api/logs/stream` | GET (SSE) | Real-time log streaming |
| `/api/logs/history` | GET | Historical logs |
| `/api/settings` | GET/PUT | Server configuration |

## Status & Monitoring

### GET /api/status

Returns current server status and performance metrics.

**Response:**
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

**Status Values:**
- `starting` - Server initializing
- `running` - Operational
- `stopping` - Shutting down gracefully
- `stopped` - Not running
- `error` - Error state

**Response Codes:**
- `200` - Success
- `503` - Service unavailable

---

### GET /api/connections

Lists all active MCP client connections.

**Response:**
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
    },
    {
      "id": "conn-def456",
      "client_name": "Claude Desktop",
      "client_version": "0.5.2",
      "connected_at": "2026-02-04T10:02:15Z",
      "last_activity": "2026-02-04T10:05:18Z",
      "requests_count": 67,
      "active": true
    }
  ],
  "total": 2,
  "max_concurrent": 10
}
```

**Response Codes:**
- `200` - Success

---

## Lifecycle Management

### POST /api/lifecycle/start

Starts the MCP server if it's stopped.

**Request Body:**
```json
{
  "wait_for_godot": true      // Optional: wait for Godot connection
}
```

**Response:**
```json
{
  "success": true,
  "message": "MCP server started successfully",
  "pid": 12345,
  "started_at": "2026-02-04T10:00:00Z"
}
```

**Response Codes:**
- `200` - Started successfully
- `409` - Already running
- `500` - Failed to start

---

### POST /api/lifecycle/stop

Stops the MCP server gracefully.

**Request Body:**
```json
{
  "force": false,             // Optional: force immediate shutdown
  "timeout_ms": 5000          // Optional: grace period before force kill
}
```

**Response:**
```json
{
  "success": true,
  "message": "MCP server stopped successfully",
  "stopped_at": "2026-02-04T10:05:00Z",
  "active_connections_closed": 2
}
```

**Response Codes:**
- `200` - Stopped successfully
- `409` - Not running
- `500` - Failed to stop

---

### POST /api/lifecycle/restart

Restarts the MCP server (stop + start).

**Request Body:**
```json
{
  "wait_for_godot": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "MCP server restarted successfully",
  "restarted_at": "2026-02-04T10:06:00Z",
  "downtime_ms": 1250
}
```

**Response Codes:**
- `200` - Restarted successfully
- `500` - Failed to restart

---

## Logging

### GET /api/logs/stream (Server-Sent Events)

Real-time log streaming using Server-Sent Events (SSE).

**Example Request:**
```http
GET /api/logs/stream HTTP/1.1
Host: localhost:8080
Accept: text/event-stream
```

**Example Response Stream:**
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"level":"info","timestamp":"2026-02-04T10:00:00Z","message":"MCP server started","context":{}}

data: {"level":"info","timestamp":"2026-02-04T10:00:05Z","message":"Client connected","context":{"client_id":"conn-abc123"}}

data: {"level":"debug","timestamp":"2026-02-04T10:00:06Z","message":"Tool invoked: read_scene","context":{"tool":"read_scene","path":"scenes/MainMenu.tscn","latency_ms":45}}

data: {"level":"error","timestamp":"2026-02-04T10:00:10Z","message":"Tool execution failed","context":{"tool":"read_scene","error":"File not found"}}
```

**Log Event Schema:**
```typescript
interface LogEvent {
  level: "debug" | "info" | "warn" | "error";
  timestamp: string;          // ISO 8601
  message: string;
  context: Record<string, any>;
}
```

**Client-Side Usage (JavaScript):**
```javascript
const eventSource = new EventSource('/api/logs/stream');

eventSource.onmessage = (event) => {
  const log = JSON.parse(event.data);
  console.log(`[${log.level}] ${log.message}`);
};

eventSource.onerror = () => {
  console.error('Connection lost, reconnecting...');
};
```

**Response Codes:**
- `200` - Stream established
- `503` - Service unavailable

---

### GET /api/logs/history

Retrieves historical logs with filtering and pagination.

**Query Parameters:**
- `level`: Filter by log level (`debug`, `info`, `warn`, `error`)
- `start_time`: ISO 8601 timestamp (filter logs after this time)
- `end_time`: ISO 8601 timestamp (filter logs before this time)
- `search`: Text search in message and context
- `limit`: Max number of logs (default: 100, max: 1000)
- `page`: Page number (default: 1)

**Example:**
```http
GET /api/logs/history?level=error&limit=50&page=1
```

**Response:**
```json
{
  "logs": [
    {
      "id": "log-123",
      "level": "error",
      "timestamp": "2026-02-04T10:00:10Z",
      "message": "Tool execution failed",
      "context": {
        "tool": "read_scene",
        "error": "File not found",
        "path": "scenes/Missing.tscn"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 15,
    "pages": 1
  }
}
```

**Response Codes:**
- `200` - Success
- `400` - Invalid query parameters

---

## Configuration

### GET /api/settings

Retrieves current server configuration.

**Response:**
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

**Response Codes:**
- `200` - Success

---

### PUT /api/settings

Updates server configuration (requires restart for some settings).

**Request Body:**
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

**Response:**
```json
{
  "success": true,
  "message": "Settings updated successfully",
  "requires_restart": false,
  "updated_fields": ["cache.max_items", "logging.level"]
}
```

**Response Codes:**
- `200` - Success
- `400` - Invalid configuration
- `403` - Restricted setting (cannot modify)

---

## Static Assets

The Web UI serves static files from the `/public` directory:

- `GET /` - Dashboard HTML
- `GET /css/app.css` - Tailwind CSS
- `GET /js/app.js` - Alpine.js components
- `GET /favicon.ico` - Favicon

---

## WebSocket API (Phase 2)

For Phase 2, WebSocket support will be added for bi-directional communication:

**Endpoint:** `ws://localhost:8080/ws`

**Message Types:**
- `subscribe` - Subscribe to events
- `unsubscribe` - Unsubscribe from events
- `command` - Execute server command
- `notification` - Server-initiated event

**Example:**
```json
{
  "type": "subscribe",
  "channel": "tools",
  "filter": {"tool_name": "read_scene"}
}
```

---

## CORS Configuration

**Allowed Origins (Development):**
- `http://localhost:*`
- `http://127.0.0.1:*`

**Allowed Methods:**
- `GET`, `POST`, `PUT`, `OPTIONS`

**Allowed Headers:**
- `Content-Type`, `Authorization`

**Production:** CORS disabled (localhost-only binding)

---

## Error Handling

### Standard Error Response

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Failed to retrieve server status",
    "details": {
      "original_error": "Connection refused"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | Invalid request parameters |
| `NOT_FOUND` | 404 | Endpoint or resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., already running) |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | MCP server not available |

---

## Rate Limiting

**Limits:**
- 100 requests/minute per IP (general endpoints)
- 10 requests/minute per IP (lifecycle endpoints)
- 1 concurrent SSE connection per IP

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1612451200
```

**Response (Rate Limited):**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "retry_after_seconds": 42
  }
}
```

**HTTP Status:** `429 Too Many Requests`

---

## Alpine.js Integration Example

```html
<div x-data="dashboard()">
  <!-- Status Badge -->
  <div class="status-badge" :class="statusColor">
    <span x-text="status"></span>
  </div>

  <!-- Metrics -->
  <div class="metrics">
    <div>
      <span>Requests:</span>
      <span x-text="metrics.requests_total"></span>
    </div>
    <div>
      <span>Latency (p99):</span>
      <span x-text="metrics.latency_p99_ms + 'ms'"></span>
    </div>
  </div>

  <!-- Lifecycle Controls -->
  <button @click="startServer()" :disabled="status === 'running'">
    Start
  </button>
  <button @click="stopServer()" :disabled="status !== 'running'">
    Stop
  </button>

  <!-- Log Viewer -->
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

---

## Performance Considerations

**Response Times:**
- Status endpoint: <10ms
- Logs (history): <50ms
- Lifecycle operations: 500-2000ms (includes server start/stop time)

**SSE Connection:**
- Heartbeat every 30s (to keep connection alive)
- Automatic reconnection on disconnect
- Buffer last 1000 log events in browser

:::tip Best Practices
- Use SSE for real-time updates instead of polling
- Implement exponential backoff for reconnection
- Limit log buffer size in browser to prevent memory leaks
- Use Alpine.js `$watch` for reactive UI updates
:::

## Related Documentation

- [Tools API](/en/api/tools) - MCP tool specifications
- [Godot Bridge API](/en/api/godot-bridge) - JSON-RPC endpoints
- [Implementation Guide](/en/implementation/web-ui) - Building the dashboard
