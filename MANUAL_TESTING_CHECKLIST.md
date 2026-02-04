# Manual Testing Checklist - Phase 1 UI and Server

## Prerequisites
- [ ] Godot 4.6+ installed
- [ ] Node.js 18+ installed
- [ ] Project dependencies installed (`npm install`)
- [ ] MCP bridge addon installed in Godot project

## Web UI Dashboard Testing

### Initial Load
- [ ] Navigate to `http://localhost:8080`
- [ ] Dashboard loads without errors
- [ ] Tailwind CSS styles applied correctly
- [ ] Alpine.js reactive data binds properly
- [ ] No console errors in browser DevTools

### Status Cards
- [ ] **Server Status Card**
  - [ ] Shows "Connected" or "Disconnected" badge
  - [ ] Displays uptime in hours/minutes/seconds format
  - [ ] Shows active sessions count
  - [ ] Updates every 5 seconds automatically

- [ ] **Bridge Status Card**
  - [ ] Shows bridge status (healthy/unhealthy/degraded/unknown)
  - [ ] Displays port number (7777)
  - [ ] Shows Godot version when connected
  - [ ] Updates every 10 seconds automatically

- [ ] **Activity Card**
  - [ ] Shows log entry count
  - [ ] Displays last update time
  - [ ] Updates in real-time

### Refresh Button
- [ ] Click refresh button in header
- [ ] All status cards update immediately
- [ ] Button shows loading/disabled state during refresh
- [ ] No errors in console

### Log Viewer
- [ ] **Connection Status**
  - [ ] Shows "connecting" badge on initial load
  - [ ] Changes to "connected" when SSE establishes
  - [ ] Changes to "error" if connection fails

- [ ] **Log Display**
  - [ ] Logs appear in real-time
  - [ ] Log levels color-coded correctly:
    - Debug: Gray
    - Info: Blue
    - Warn: Yellow
    - Error: Red
  - [ ] Timestamps formatted correctly
  - [ ] Scrollbar appears when >10 logs

- [ ] **Auto-scroll**
  - [ ] Auto-scroll button toggles blue/gray
  - [ ] When enabled, scrolls to bottom automatically
  - [ ] When disabled, stays at current scroll position
  - [ ] State persists across log additions

- [ ] **Clear Logs**
  - [ ] Click "Clear" button
  - [ ] All logs removed from display
  - [ ] Counter resets to 0
  - [ ] No errors

- [ ] **Export Logs**
  - [ ] Click "Export" button
  - [ ] File download initiates
  - [ ] Filename includes timestamp
  - [ ] File contains all logs in plain text format
  - [ ] Format: `[timestamp] LEVEL: message`

### SSE Reconnection
- [ ] Stop Node server while dashboard is open
- [ ] Connection status changes to "error"
- [ ] Wait 10 seconds
- [ ] Restart Node server
- [ ] Connection automatically re-establishes
- [ ] Status changes back to "connected"
- [ ] Logs resume streaming
- [ ] Maximum 10 reconnection attempts observed

### Responsiveness
- [ ] Desktop (1920x1080)
  - [ ] All elements visible and aligned
  - [ ] 3-column grid for status cards
  
- [ ] Tablet (768x1024)
  - [ ] Status cards stack vertically
  - [ ] Buttons remain accessible
  
- [ ] Mobile (375x667)
  - [ ] Single column layout
  - [ ] All controls usable

### Browser Compatibility
- [ ] Chrome/Edge (Chromium)
  - [ ] All features work
  - [ ] No console errors
  
- [ ] Firefox
  - [ ] All features work
  - [ ] SSE streaming functional
  
- [ ] Safari
  - [ ] All features work
  - [ ] Tailwind CDN loads

## API Endpoint Testing

### Using curl or Postman

#### GET /api/health
```bash
curl http://localhost:8080/api/health
```
- [ ] Returns 200 OK
- [ ] JSON response with `status: "ok"` and `uptime`

#### GET /api/status
```bash
curl http://localhost:8080/api/status
```
- [ ] Returns 200 OK
- [ ] JSON includes:
  - [ ] `uptime` (number)
  - [ ] `bridgeConnected` (boolean)
  - [ ] `activeSessions` (number)
  - [ ] `lastActivity` (ISO timestamp)

#### GET /api/bridge/health
```bash
curl http://localhost:8080/api/bridge/health
```
- [ ] Returns 200 OK when Godot running
- [ ] Returns 503 when Godot not running
- [ ] JSON includes `status`, `port`, `version`

#### GET /api/bridge/version
```bash
curl http://localhost:8080/api/bridge/version
```
- [ ] Returns 200 OK when Godot running
- [ ] Returns 503 when Godot not running
- [ ] JSON includes `version` string

#### GET /api/logs/stream (SSE)
```bash
curl -N http://localhost:8080/api/logs/stream
```
- [ ] Returns `text/event-stream` content type
- [ ] Streams log entries as SSE events
- [ ] Initial connection message received
- [ ] Real-time logs appear as generated

## MCP Server Testing

### Tool List
Test with MCP inspector or Claude Desktop:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

- [ ] Returns list of 9 tools:
  - [ ] ping
  - [ ] get_version
  - [ ] health_check
  - [ ] launch_godot_editor
  - [ ] run_godot_project
  - [ ] stop_godot_execution
  - [ ] get_godot_version
  - [ ] list_godot_projects
  - [ ] analyze_project

### Basic Connectivity Tools

#### ping
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "ping",
    "arguments": {}
  }
}
```
- [ ] Returns success response
- [ ] Bridge responds with status

#### health_check
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "health_check",
    "arguments": {}
  }
}
```
- [ ] Returns health status
- [ ] Includes uptime, status, port

### Editor Control Tools

**Note:** These require Godot bridge handlers to be implemented.

#### launch_godot_editor
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "launch_godot_editor",
    "arguments": {
      "projectPath": "/path/to/godot/project"
    }
  }
}
```
- [ ] Validates project path
- [ ] Sends request to Godot bridge
- [ ] Returns process ID on success
- [ ] Returns error if project not found

#### run_godot_project
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "run_godot_project",
    "arguments": {
      "projectPath": "/path/to/godot/project",
      "debug": true
    }
  }
}
```
- [ ] Validates parameters
- [ ] Sends request to Godot bridge
- [ ] Returns process ID on success

#### stop_godot_execution
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "stop_godot_execution",
    "arguments": {
      "processId": 12345
    }
  }
}
```
- [ ] Validates process ID
- [ ] Sends termination request
- [ ] Returns termination status

#### get_godot_version
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "get_godot_version",
    "arguments": {}
  }
}
```
- [ ] Returns Godot version string
- [ ] Includes version metadata

#### list_godot_projects
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "list_godot_projects",
    "arguments": {
      "searchPaths": ["/home/user/godot"],
      "recursive": true
    }
  }
}
```
- [ ] Validates search paths
- [ ] Returns array of discovered projects
- [ ] Includes project metadata

#### analyze_project
```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "tools/call",
  "params": {
    "name": "analyze_project",
    "arguments": {
      "projectPath": "/path/to/godot/project"
    }
  }
}
```
- [ ] Validates project path
- [ ] Returns project structure analysis
- [ ] Includes scene count, script count, resources

## Error Handling

### Web UI
- [ ] Invalid API endpoint returns 404
- [ ] Bridge disconnected shows graceful error message
- [ ] Network timeout shows user-friendly error
- [ ] Malformed JSON handled without crash

### MCP Server
- [ ] Unknown tool name returns error
- [ ] Invalid arguments validated by Zod schema
- [ ] Bridge unavailable returns proper error response
- [ ] Timeout errors handled gracefully

## Performance Testing

### Latency
- [ ] API endpoints respond <100ms (p95)
- [ ] SSE events delivered <50ms
- [ ] Dashboard updates smooth (no lag)

### Load
- [ ] Multiple SSE clients (3+) connected simultaneously
- [ ] Log streaming remains stable with 100+ logs
- [ ] Memory usage remains stable over 30+ minutes

### Stress Test
- [ ] Rapidly refresh status (10x in 10 seconds)
- [ ] Toggle auto-scroll 20x rapidly
- [ ] Clear logs while streaming high-volume
- [ ] No memory leaks observed
- [ ] No crashes or freezes

## Code Quality

### TypeScript
- [ ] `npm run build` succeeds with zero errors
- [ ] `npm run lint` passes with zero warnings
- [ ] Strict mode enabled and enforced

### Tests
- [ ] `npm test` runs successfully
- [ ] Editor control tests: 20/20 passing
- [ ] Coverage reports generated
- [ ] No flaky tests

## Deployment Readiness

- [ ] README.md updated with new features
- [ ] PHASE1_IMPLEMENTATION_SUMMARY.md created
- [ ] No hardcoded credentials or secrets
- [ ] Environment variables documented
- [ ] Dependencies listed in package.json
- [ ] Build artifacts in dist/ ignored by git

## Acceptance Criteria

### Must Pass
- ✅ All Web UI features functional
- ✅ SSE streaming working with reconnection
- ✅ API endpoints responding correctly
- ✅ MCP server listing all tools
- ✅ Unit tests passing (20/20 for editor control)
- ✅ Build and lint succeed
- ✅ No console errors in browser
- ✅ Documentation updated

### Should Pass (requires Godot bridge implementation)
- ⏳ Editor control tools fully functional
- ⏳ End-to-end Godot integration tested

## Sign-off

**Tester Name:** _______________________  
**Date:** _______________________  
**Overall Status:** [ ] PASS [ ] FAIL [ ] BLOCKED  
**Notes:**

---

## Issues Found

| Issue # | Severity | Description | Status |
|---------|----------|-------------|--------|
| | | | |

---

**Legend:**
- ✅ Complete and passing
- ⏳ Waiting on dependencies (Godot bridge)
- ❌ Failing
- 🚧 In progress
