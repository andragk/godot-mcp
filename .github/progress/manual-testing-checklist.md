# Manual Testing Checklist

## Scope
- Validate Web UI REST endpoints, SSE streaming, and Tool Explorer behavior.
- Confirm auth and rate limiting behavior for localhost-only access.
- Verify MCP server lifecycle controls and bridge health endpoints.

## Preconditions
- Node 18+ installed.
- Install dependencies: `npm install` in repo root and `npm install` in docs folder if needed.
- Build TypeScript: `npm run build` (if running web UI from dist).
- Start Web UI: `npm run web-ui`.

## Checklist

### 1) Health and status endpoints
- [ ] GET `/api/health` returns `{ "status": "ok", "uptime": <number> }` with HTTP 200.
- [ ] GET `/api/status` returns `{ "uptime": <number>, "bridgeConnected": <bool>, "activeSessions": <number>, "lastActivity": <iso> }` with HTTP 200.
- [ ] GET `/api/bridge/health` returns `{ "status": "healthy", ... }` or HTTP 503 when bridge is unavailable.
- [ ] GET `/api/bridge/version` returns `{ "version": "<string>" }` or HTTP 503 when bridge is unavailable.

### 2) Server lifecycle controls
- [ ] POST `/api/server/start` starts MCP server and returns `{ success: true, info: { state: "running", pid: <number> } }`.
- [ ] GET `/api/server/status` returns current process state with `pid` when running.
- [ ] POST `/api/server/stop` stops MCP server and returns `{ success: true, info: { state: "stopped" } }`.
- [ ] POST `/api/server/restart` restarts MCP server and returns `{ success: true, info: { state: "running" } }`.

### 3) Tool Explorer API
- [ ] GET `/api/tools` returns a tools array with `name`, `description`, `category`, `securityLevel`, `version`, and `inputSchema`.
- [ ] POST `/api/execute` with a valid tool name returns `{ success: true, data: <payload>, correlationId, durationMs }`.
- [ ] POST `/api/execute` with missing tool name returns HTTP 400 and error message.
- [ ] POST `/api/execute` with invalid args returns `{ success: false, error: { name: "ValidationError" } }` and HTTP 400.

### 4) SSE logs
- [ ] GET `/api/logs/stream` opens an SSE stream and receives `event: log` payloads.
- [ ] Verify SSE heartbeat events are received periodically.
- [ ] Verify client disconnect removes the SSE client (no server errors).

### 5) Auth and access control
- [ ] From localhost, access to read endpoints succeeds without API key when `MCP_API_KEY` is unset.
- [ ] When `MCP_API_KEY` is set, requests without correct key return HTTP 401.
- [ ] When `MCP_API_KEY` is set, requests with `X-API-Key` or `Authorization: Bearer <key>` succeed.
- [ ] Remote access is blocked with HTTP 403 for write endpoints and `/api/logs/stream`.

### 6) Rate limiting
- [ ] Repeated GET requests exceed the read limit and return HTTP 429 with `{ "error": "Too many requests, please try again later" }`.
- [ ] Repeated POST requests exceed the write limit and return HTTP 429 with the same payload.

### 7) UI behavior
- [ ] Open `/tool-explorer.html` and verify tool catalog loads.
- [ ] Select a tool, input parameters, and execute; verify response renders.
- [ ] Verify error responses render in the error panel.

## Notes
- Record any deviations from expected behavior with reproduction steps.
- If bridge endpoints return 503, validate that the Godot bridge is running and reachable.
