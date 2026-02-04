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

---

## Feature Modules

The Web UI is organized into seven core feature modules that provide comprehensive monitoring, control, and debugging capabilities.

### 1. Tool Exploration & Invocation

Interactive interface for discovering and testing MCP tools directly from the browser.

#### Tool Catalog

**Endpoint:** `GET /api/tools`

**Response:**
```json
{
  "tools": [
    {
      "name": "read_scene",
      "description": "Read and parse a Godot scene file",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "description": "Scene file path relative to project root"
          }
        },
        "required": ["path"]
      }
    }
  ],
  "total": 15
}
```

#### Interactive Tool Testing

**Endpoint:** `POST /api/tools/invoke`

**Request:**
```json
{
  "tool": "read_scene",
  "arguments": {
    "path": "scenes/Player.tscn"
  }
}
```

**Response:**
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

#### Schema Viewer

Interactive JSON Schema viewer with:
- Property type and constraint display
- Required field highlighting
- Description tooltips
- Example value generation

---

### 2. Resource Management

Browse, preview, and search MCP resources exposed by the server.

#### Resource Browser

**Endpoint:** `GET /api/resources`

**Query Parameters:**
- `type`: Filter by resource type (`scene`, `script`, `asset`)
- `search`: Text search in resource URIs
- `limit`: Max results (default: 100)

**Response:**
```json
{
  "resources": [
    {
      "uri": "godot://scene/MainMenu.tscn",
      "name": "MainMenu",
      "type": "PackedScene",
      "mimeType": "application/x-godot-scene",
      "size": 2048,
      "description": "Main menu scene with UI buttons"
    },
    {
      "uri": "godot://script/Player.gd",
      "name": "Player",
      "type": "GDScript",
      "mimeType": "text/x-gdscript",
      "size": 1024,
      "description": "Player controller script"
    }
  ],
  "total": 42,
  "filtered": 2
}
```

#### Content Preview

**Endpoint:** `GET /api/resources/content`

**Query Parameters:**
- `uri`: Resource URI to fetch

**Response:**
```json
{
  "uri": "godot://script/Player.gd",
  "content": "extends CharacterBody2D\n\nvar speed = 300.0\n...",
  "mimeType": "text/x-gdscript",
  "size": 1024,
  "encoding": "utf-8"
}
```

#### Search & Filter

Advanced filtering capabilities:
- **Full-text search** across resource content
- **Type filtering** (scenes, scripts, assets)
- **Tag/group filtering** for organized resources
- **Date range** (last modified)
- **Size range** filtering

---

### 3. Real-Time Logging & Monitoring

Comprehensive logging infrastructure with categorized output and performance tracking.

#### Traffic Log

**Endpoint:** `GET /api/traffic/stream` (SSE)

Real-time JSON-RPC message inspection between client and server.

**Event Stream:**
```
data: {"direction":"incoming","timestamp":"2026-02-04T10:00:00Z","type":"request","method":"tools/call","params":{"name":"read_scene","arguments":{"path":"scenes/Player.tscn"}}}

data: {"direction":"outgoing","timestamp":"2026-02-04T10:00:01Z","type":"response","result":{...},"latency_ms":45}
```

**Traffic Log Schema:**
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

#### Error Console

**Endpoint:** `GET /api/errors/history`

**Query Parameters:**
- `severity`: `critical`, `error`, `warning`
- `start_time`: ISO 8601 timestamp
- `limit`: Max results

**Response:**
```json
{
  "errors": [
    {
      "id": "err-123",
      "severity": "error",
      "timestamp": "2026-02-04T10:00:10Z",
      "tool": "read_scene",
      "message": "File not found: scenes/Missing.tscn",
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

#### Performance Metrics

**Endpoint:** `GET /api/metrics/performance`

**Response:**
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

**Real-Time Metrics (SSE):**
```http
GET /api/metrics/stream
```

---

### 4. Configuration & Security

Manage environment variables, client access, and prompt templates.

#### Environment Variables

**Endpoint:** `GET /api/config/environment`

**Response:**
```json
{
  "variables": [
    {
      "name": "GODOT_HOST",
      "value": "127.0.0.1",
      "type": "string",
      "description": "Godot bridge host address",
      "editable": true
    },
    {
      "name": "GODOT_PORT",
      "value": "7777",
      "type": "number",
      "description": "Godot bridge port",
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

**Update Variables:**
```http
PUT /api/config/environment
Content-Type: application/json

{
  "GODOT_PORT": "8888",
  "LOG_LEVEL": "debug"
}
```

:::warning Restart Required
Most environment variable changes require a server restart to take effect. The UI will display a warning when this is necessary.
:::

#### Access Control

**Endpoint:** `GET /api/security/access`

**Response:**
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

**Disconnect Client:**
```http
POST /api/security/disconnect
Content-Type: application/json

{
  "client_id": "conn-abc123",
  "reason": "Maintenance"
}
```

#### Prompts Gallery

**Endpoint:** `GET /api/prompts`

**Response:**
```json
{
  "prompts": [
    {
      "name": "scene_analysis",
      "description": "Analyze scene structure and suggest improvements",
      "template": "Analyze the scene at {{scene_path}} and provide optimization suggestions for performance and maintainability.",
      "variables": [
        {
          "name": "scene_path",
          "type": "string",
          "description": "Path to the scene file",
          "required": true
        }
      ]
    },
    {
      "name": "code_review",
      "description": "Review GDScript code for best practices",
      "template": "Review the script {{script_path}} for:\n1. Code quality\n2. Performance issues\n3. Godot best practices\n4. Security concerns",
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

**Test Prompt:**
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

### 5. Connection & Session Management

Monitor and control active client connections with detailed session tracking.

#### Active Client List

**Endpoint:** `GET /api/connections` (enhanced from basic version)

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

#### Session Duration Tracking

Real-time session analytics:
- Active connection time
- Idle time detection
- Request rate monitoring
- Bandwidth usage (future)

#### Connection Metadata

**Endpoint:** `GET /api/connections/{connection_id}`

**Response:**
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

#### Kill Switch

**Endpoint:** `POST /api/connections/{connection_id}/disconnect`

**Request:**
```json
{
  "reason": "Unresponsive client",
  "force": false,
  "notify_client": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Connection closed gracefully",
  "client_id": "conn-abc123",
  "disconnected_at": "2026-02-04T10:10:00Z"
}
```

---

### 6. Service State & Lifecycle Control

Comprehensive process management with visual state indicators and health monitoring.

#### State Indicators

**Enhanced Status Endpoint:** `GET /api/status` (additional fields)

**Response:**
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

**Status Values:**
- 🟢 **running** / **healthy** - Fully operational
- 🟡 **starting** / **initializing** - Loading resources
- 🟡 **running** / **degraded** - Operational with warnings
- 🔴 **stopped** - Process not running
- 🔴 **error** / **crashed** - Critical failure

#### Health Checks

**Endpoint:** `GET /api/health`

**Response:**
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

**Health Check Standards:**
- Follows RFC 7234 (Caching) and draft-inadarei-api-health-check
- `/health` endpoint for monitoring systems
- 200 OK = healthy, 503 Service Unavailable = unhealthy

#### Process Control

**Start Server:**
```http
POST /api/lifecycle/start
```

**Stop Server:**
```http
POST /api/lifecycle/stop
```

**Restart Server:**
```http
POST /api/lifecycle/restart
```

**Reload Configuration:**
```http
POST /api/lifecycle/reload
Content-Type: application/json

{
  "preserve_connections": true
}
```

---

### 7. Advanced Logging & Observability

Professional-grade logging with traffic inspection, categorization, and export capabilities.

#### Traffic Inspection (The "Inspector")

**Split-View Log Endpoint:** `GET /api/inspector/stream` (SSE)

**Event Format:**
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

**Example Stream:**
```
data: {"id":"msg-1","timestamp":"2026-02-04T10:00:00Z","direction":"client_to_server","protocol":"jsonrpc","message":{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_scene","arguments":{"path":"scenes/Player.tscn"}}},"metadata":{"client_id":"conn-abc123","size_bytes":128}}

data: {"id":"msg-2","timestamp":"2026-02-04T10:00:01Z","direction":"server_to_client","protocol":"jsonrpc","message":{"jsonrpc":"2.0","id":1,"result":{...}},"metadata":{"client_id":"conn-abc123","size_bytes":2048,"latency_ms":45}}
```

#### Log Levels

**Filter Endpoint:** `GET /api/logs/stream?levels=debug,info,warn,error`

**Supported Levels:**
- `DEBUG` - Verbose debugging information
- `INFO` - General informational messages
- `WARN` - Warning messages (non-critical)
- `ERROR` - Error messages (failures)

**Toggle Example (Alpine.js):**
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
    Warning
  </label>
  <label>
    <input type="checkbox" x-model="logLevels" value="error">
    Error
  </label>
</div>
```

#### Auto-Scroll & Freeze

**UI Implementation:**
```html
<div x-data="logViewer()">
  <div class="controls">
    <button @click="autoScroll = !autoScroll">
      <span x-text="autoScroll ? 'Freeze' : 'Auto-Scroll'"></span>
    </button>
    <button @click="clearLogs()">Clear</button>
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

<script>
function logViewer() {
  return {
    logs: [],
    autoScroll: true,
    
    init() {
      this.connectLogs();
    },
    
    connectLogs() {
      const eventSource = new EventSource('/api/logs/stream');
      eventSource.onmessage = (event) => {
        const log = JSON.parse(event.data);
        this.logs.push(log);
        
        if (this.logs.length > 1000) {
          this.logs.shift();
        }
        
        if (this.autoScroll) {
          this.$nextTick(() => {
            this.$refs.logsContainer.scrollTop = 
              this.$refs.logsContainer.scrollHeight;
          });
        }
      };
    },
    
    handleScroll() {
      const container = this.$refs.logsContainer;
      const isAtBottom = container.scrollHeight - container.scrollTop 
                        === container.clientHeight;
      this.autoScroll = isAtBottom;
    },
    
    clearLogs() {
      this.logs = [];
    }
  };
}
</script>
```

#### Export Logs

**Endpoint:** `GET /api/logs/export`

**Query Parameters:**
- `format`: `json`, `csv`, `txt`
- `start_time`: ISO 8601 timestamp
- `end_time`: ISO 8601 timestamp
- `levels`: Comma-separated log levels

**Example:**
```http
GET /api/logs/export?format=json&start_time=2026-02-04T09:00:00Z&end_time=2026-02-04T10:00:00Z&levels=error,warn
```

**Response (JSON):**
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
      "message": "Tool execution failed",
      "context": {...}
    }
  ],
  "total": 15
}
```

**Response (CSV):**
```csv
timestamp,level,message,context
2026-02-04T09:15:00Z,error,"Tool execution failed","{\"tool\":\"read_scene\"}"
```

**Download Button:**
```html
<button @click="exportLogs()" class="btn-export">
  Export Logs (JSON)
</button>

<script>
async function exportLogs() {
  const params = new URLSearchParams({
    format: 'json',
    start_time: this.startTime,
    end_time: this.endTime,
    levels: this.selectedLevels.join(',')
  });
  
  const response = await fetch(`/api/logs/export?${params}`);
  const blob = await response.blob();
  
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `godot-mcp-logs-${Date.now()}.json`;
  a.click();
  window.URL.revokeObjectURL(url);
}
</script>
```

---

## UI Integration Guide

### Dashboard Layout

Recommended structure for the Web UI:

```
┌─────────────────────────────────────────────────┐
│ Header: Godot MCP Server                       │
│ [Status Badge] [Version] [Controls]            │
├─────────────────────────────────────────────────┤
│ Navigation: Status | Tools | Resources | Logs  │
├─────────────────────────────────────────────────┤
│                                                 │
│ Main Content Area (route-specific)             │
│                                                 │
│ - Status: Metrics cards + Health checks        │
│ - Tools: Catalog + Interactive tester          │
│ - Resources: Browser + Content preview         │
│ - Logs: Traffic inspector + Log viewer         │
│                                                 │
├─────────────────────────────────────────────────┤
│ Footer: © 2026 | Docs | GitHub                 │
└─────────────────────────────────────────────────┘
```

### Tailwind CSS Component Library

Reusable components for consistent UI:

**Status Badge:**
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

**Metric Card:**
```html
<div class="bg-white rounded-lg shadow p-6">
  <h3 class="text-sm font-medium text-gray-500 mb-2">Total Requests</h3>
  <p class="text-3xl font-bold text-gray-900" x-text="metrics.requests_total"></p>
  <p class="text-sm text-gray-600 mt-1">
    <span class="text-green-600">↑ 12%</span> from last hour
  </p>
</div>
```

**Log Entry:**
```html
<div :class="{
  'border-l-4 p-3 mb-2': true,
  'border-blue-500 bg-blue-50': log.level === 'debug',
  'border-green-500 bg-green-50': log.level === 'info',
  'border-yellow-500 bg-yellow-50': log.level === 'warn',
  'border-red-500 bg-red-50': log.level === 'error'
}">
  <div class="flex justify-between items-start">
    <span class="text-xs text-gray-500" x-text="log.timestamp"></span>
    <span class="text-xs font-semibold uppercase" x-text="log.level"></span>
  </div>
  <p class="mt-1 text-sm text-gray-900" x-text="log.message"></p>
</div>
```

### Alpine.js State Management

**Global Store Pattern:**
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

**Component Usage:**
```html
<div x-data>
  <span x-text="$store.server.status"></span>
  <span x-text="$store.server.metrics.requests_total"></span>
</div>
```

---

## Performance Optimization

### Client-Side Caching

Cache API responses to reduce server load:

```javascript
const cache = {
  tools: null,
  resources: null,
  ttl: 60000, // 1 minute
  
  async getTools() {
    if (this.tools && Date.now() - this.tools.timestamp < this.ttl) {
      return this.tools.data;
    }
    
    const res = await fetch('/api/tools');
    const data = await res.json();
    this.tools = { data, timestamp: Date.now() };
    return data;
  }
};
```

### SSE Reconnection Strategy

Implement exponential backoff for SSE reconnections:

```javascript
function connectLogs(retries = 0) {
  const eventSource = new EventSource('/api/logs/stream');
  
  eventSource.onerror = () => {
    eventSource.close();
    const delay = Math.min(1000 * Math.pow(2, retries), 30000);
    console.log(`Reconnecting in ${delay}ms...`);
    setTimeout(() => connectLogs(retries + 1), delay);
  };
  
  eventSource.onmessage = (event) => {
    // Reset retry counter on successful message
    retries = 0;
    handleLogEvent(JSON.parse(event.data));
  };
}
```

### Virtual Scrolling for Large Logs

For logs with 10,000+ entries, use virtual scrolling:

```html
<div x-data="virtualScroll()" class="logs-container h-96 overflow-auto">
  <div :style="{ height: totalHeight + 'px' }">
    <template x-for="log in visibleLogs" :key="log.id">
      <div class="log-entry" :style="{ transform: 'translateY(' + log.offset + 'px)' }">
        <!-- Log content -->
      </div>
    </template>
  </div>
</div>
```

---

## Security Considerations

### CORS Configuration

For development, allow localhost origins:

```javascript
// server.js
app.use(cors({
  origin: ['http://localhost:8080', 'http://127.0.0.1:8080'],
  methods: ['GET', 'POST', 'PUT'],
  credentials: true
}));
```

### Content Security Policy

Set restrictive CSP headers:

```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline' cdn.tailwindcss.com cdn.jsdelivr.net; 
               style-src 'self' 'unsafe-inline' cdn.tailwindcss.com; 
               connect-src 'self';">
```

### Input Validation

Always validate and sanitize user inputs:

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

## Related Documentation

- [Tools API](/en/api/tools) - MCP tool specifications
- [Godot Bridge API](/en/api/godot-bridge) - JSON-RPC endpoints
- [Implementation Guide](/en/implementation/web-ui) - Building the dashboard
