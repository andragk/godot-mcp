# Phase 1 Manual Testing Checklist

**Test Date**: ___________  
**Tester**: ___________  
**Build/Branch**: `integration/phase1-ui-server`  
**Environment**: Windows / macOS / Linux (circle one)

---

## Pre-Test Setup

### Environment Configuration
- [ ] Create `.env` file with required variables:
  ```env
  LOG_LEVEL=info
  MCP_API_KEY=test-api-key-12345
  ALLOWED_ORIGINS=http://localhost:8080
  ```
- [ ] Install dependencies: `npm install`
- [ ] Build project: `npm run build`
- [ ] Verify Godot 4.6+ installed

---

## Test Suite 1: MCP Server Basics

### 1.1 Server Startup
**Objective**: Verify MCP server starts correctly

**Steps**:
1. Run `npm start` in terminal
2. Observe console output

**Expected Results**:
- [ ] Server starts without errors
- [ ] Log message: "MCP server started with stdio transport"
- [ ] No crash or exception

**Notes**: ___________________________________________

---

### 1.2 Health Check
**Objective**: Verify basic connectivity tools work

**Steps**:
1. Connect MCP client (VS Code extension or CLI)
2. Invoke `ping` tool
3. Invoke `get_version` tool
4. Invoke `health_check` tool

**Expected Results**:
- [ ] `ping` returns `{ "status": "ok" }`
- [ ] `get_version` returns version info
- [ ] `health_check` returns health status
- [ ] All tools respond within 100ms

**Notes**: ___________________________________________

---

## Test Suite 2: Web UI Dashboard

### 2.1 Dashboard Access
**Objective**: Verify web dashboard is accessible

**Steps**:
1. Ensure MCP server is running
2. Open browser to `http://localhost:8080`
3. Observe dashboard UI

**Expected Results**:
- [ ] Dashboard loads without errors
- [ ] Status widget shows server info
- [ ] Log viewer is visible
- [ ] Responsive design works on mobile/tablet

**Notes**: ___________________________________________

---

### 2.2 Log Streaming (SSE)
**Objective**: Verify real-time log streaming works

**Steps**:
1. Open dashboard in browser
2. Open browser DevTools → Network tab
3. Look for `/api/logs/stream` connection
4. Trigger a tool invocation from MCP client
5. Observe logs in dashboard

**Expected Results**:
- [ ] SSE connection established (EventSource)
- [ ] Logs appear in real-time without refresh
- [ ] Color-coded by level (info/warn/error)
- [ ] Timestamps are accurate
- [ ] No memory leak after 1000+ log entries

**Notes**: ___________________________________________

---

### 2.3 Status Widget
**Objective**: Verify status widget updates correctly

**Steps**:
1. Observe initial status (server running)
2. Stop Godot bridge
3. Wait 5 seconds
4. Restart Godot bridge
5. Observe status changes

**Expected Results**:
- [ ] Initial status shows "connected"
- [ ] Status changes to "disconnected" after bridge stops
- [ ] Uptime counter increments
- [ ] Active sessions count is accurate
- [ ] Last activity timestamp updates

**Notes**: ___________________________________________

---

## Test Suite 3: Security Features

### 3.1 Rate Limiting
**Objective**: Verify rate limiting protects endpoints

**Steps**:
1. Make 150 rapid requests to `/api/status` (exceeds 100/15min limit)
2. Observe response after 100th request

**Expected Results**:
- [ ] First 100 requests succeed (200 OK)
- [ ] Requests 101+ return 429 Too Many Requests
- [ ] Error message: "Too many requests, please try again later."
- [ ] Rate limit resets after 15 minutes

**Notes**: ___________________________________________

---

### 3.2 CORS Validation
**Objective**: Verify CORS only allows configured origins

**Steps**:
1. Try accessing `/api/status` from allowed origin (localhost:8080)
2. Try accessing from disallowed origin (e.g., example.com)

**Expected Results**:
- [ ] Allowed origin receives CORS headers
- [ ] Disallowed origin is blocked
- [ ] Credentials flag only set for valid origins

**Notes**: ___________________________________________

---

### 3.3 SSE Authentication
**Objective**: Verify SSE endpoint requires authentication

**Steps**:
1. Try accessing `/api/logs/stream` without API key
2. Try with incorrect API key in `X-API-Key` header
3. Try with correct API key

**Expected Results**:
- [ ] No API key → 401 Unauthorized (localhost: allowed for MVP)
- [ ] Wrong API key → 401 Unauthorized
- [ ] Correct API key → 200 OK with stream
- [ ] Localhost always allowed (MVP behavior)

**Notes**: ___________________________________________

---

### 3.4 Security Headers
**Objective**: Verify Helmet security headers are applied

**Steps**:
1. Open browser DevTools → Network tab
2. Make request to `/api/status`
3. Inspect response headers

**Expected Results**:
- [ ] `X-Frame-Options: SAMEORIGIN` present
- [ ] `X-Content-Type-Options: nosniff` present
- [ ] `Content-Security-Policy` present
- [ ] `Strict-Transport-Security` present (if HTTPS)

**Notes**: ___________________________________________

---

## Test Suite 4: Error Handling

### 4.1 Invalid Tool Arguments
**Objective**: Verify validation errors are properly returned

**Steps**:
1. Invoke `launch_godot_editor` with invalid args:
   ```json
   { "projectPath": 12345 }
   ```
2. Observe error response

**Expected Results**:
- [ ] Returns ValidationError (400)
- [ ] Error message includes field details
- [ ] Correlation ID included in response
- [ ] No stack trace exposed
- [ ] Error logged server-side with stack

**Notes**: ___________________________________________

---

### 4.2 Network Errors
**Objective**: Verify network errors are handled gracefully

**Steps**:
1. Stop Godot bridge
2. Invoke any tool (e.g., `ping`)
3. Observe error response

**Expected Results**:
- [ ] Returns NetworkError (503)
- [ ] Error message: "Bridge unavailable" (generic)
- [ ] No internal details exposed
- [ ] Correlation ID included
- [ ] Retry logic triggered (if retryable)

**Notes**: ___________________________________________

---

### 4.3 Circuit Breaker
**Objective**: Verify circuit breaker opens after failures

**Steps**:
1. Stop Godot bridge
2. Make 10 rapid requests
3. Observe circuit breaker state
4. Restart bridge after 30 seconds
5. Make another request

**Expected Results**:
- [ ] First 5 requests fail with NetworkError
- [ ] Circuit opens after 5th failure
- [ ] Subsequent requests fail immediately with CircuitBreakerError
- [ ] After 30s, circuit transitions to HALF_OPEN
- [ ] Successful request closes circuit

**Notes**: ___________________________________________

---

### 4.4 Correlation ID Tracing
**Objective**: Verify correlation IDs enable request tracing

**Steps**:
1. Invoke a tool
2. Note the correlation ID in error/success response
3. Search server logs for that correlation ID

**Expected Results**:
- [ ] Correlation ID is valid UUID v4
- [ ] Same ID appears in all related log entries
- [ ] ID persists across retries
- [ ] Easy to trace request lifecycle in logs

**Notes**: ___________________________________________

---

## Test Suite 5: Editor Control Tools

### 5.1 Launch Godot Editor
**Objective**: Verify `launch_godot_editor` works

**Steps**:
1. Invoke `launch_godot_editor` with valid project path
2. Observe Godot editor launches

**Expected Results**:
- [ ] Godot editor GUI opens
- [ ] Correct project loaded
- [ ] Process ID returned in response
- [ ] Output captured in logs
- [ ] No errors in dashboard

**Notes**: ___________________________________________

---

### 5.2 Run Godot Project
**Objective**: Verify `run_godot_project` works

**Steps**:
1. Invoke `run_godot_project` with valid project path
2. Observe Godot project runs

**Expected Results**:
- [ ] Project runs (window opens or headless mode)
- [ ] Process ID returned
- [ ] Game output streamed to logs
- [ ] Can specify debug vs. release mode
- [ ] Optional scene parameter works

**Notes**: ___________________________________________

---

### 5.3 Stop Godot Execution
**Objective**: Verify `stop_godot_execution` works

**Steps**:
1. Launch a Godot project (previous test)
2. Note the process ID
3. Invoke `stop_godot_execution` with that PID

**Expected Results**:
- [ ] Process terminates gracefully (SIGTERM)
- [ ] If not, force kill after 5s (SIGKILL)
- [ ] Exit code reported
- [ ] Logs show process termination
- [ ] No zombie processes left

**Notes**: ___________________________________________

---

### 5.4 Get Godot Version
**Objective**: Verify `get_godot_version` works

**Steps**:
1. Invoke `get_godot_version` tool
2. Observe version info

**Expected Results**:
- [ ] Returns Godot version (e.g., "4.3.0")
- [ ] Returns commit hash
- [ ] Returns build type (official/custom)
- [ ] Cached for subsequent calls
- [ ] Works with custom Godot builds

**Notes**: ___________________________________________

---

### 5.5 List Godot Projects
**Objective**: Verify `list_godot_projects` works

**Steps**:
1. Create 2-3 test projects in known directory
2. Invoke `list_godot_projects` with search paths
3. Observe results

**Expected Results**:
- [ ] All projects found
- [ ] Returns project name, path, version
- [ ] Recursive search works
- [ ] Ignores non-project directories
- [ ] Performance acceptable (<500ms for 100 projects)

**Notes**: ___________________________________________

---

### 5.6 Analyze Project
**Objective**: Verify `analyze_project` works

**Steps**:
1. Invoke `analyze_project` with valid project path
2. Observe analysis results

**Expected Results**:
- [ ] Returns project metadata (name, version)
- [ ] Returns Godot version requirement
- [ ] Returns scene count
- [ ] Returns script count
- [ ] Returns plugin list
- [ ] Returns autoload scripts

**Notes**: ___________________________________________

---

## Test Suite 6: Cross-Platform Compatibility

### 6.1 Windows Testing
**Platform**: Windows 10/11

- [ ] MCP server starts
- [ ] Godot executable detected (Program Files, Steam)
- [ ] Editor launches correctly
- [ ] Paths with spaces handled correctly
- [ ] Web UI accessible
- [ ] All tools functional

**Notes**: ___________________________________________

---

### 6.2 macOS Testing
**Platform**: macOS (Intel/Apple Silicon)

- [ ] MCP server starts
- [ ] Godot.app detected in /Applications
- [ ] Editor launches correctly
- [ ] Permissions handled correctly
- [ ] Web UI accessible
- [ ] All tools functional

**Notes**: ___________________________________________

---

### 6.3 Linux Testing
**Platform**: Ubuntu/Fedora/Arch

- [ ] MCP server starts
- [ ] Godot detected in /usr/bin or flatpak/snap
- [ ] Editor launches correctly
- [ ] Permissions handled correctly
- [ ] Web UI accessible
- [ ] All tools functional

**Notes**: ___________________________________________

---

## Test Suite 7: Performance & Stress Testing

### 7.1 Response Time
**Objective**: Verify tools meet performance targets

**Steps**:
1. Invoke `ping` tool 100 times
2. Measure p50, p95, p99 latency

**Expected Results**:
- [ ] p50 latency < 20ms
- [ ] p95 latency < 40ms
- [ ] p99 latency < 50ms (target met)

**Notes**: ___________________________________________

---

### 7.2 Memory Leak Test
**Objective**: Verify no memory leaks over time

**Steps**:
1. Start MCP server
2. Note initial memory usage
3. Run 10,000 tool invocations
4. Note final memory usage

**Expected Results**:
- [ ] Memory growth < 50MB after 10k requests
- [ ] No continuous upward trend
- [ ] Garbage collection working
- [ ] Connection pool stable

**Notes**: ___________________________________________

---

### 7.3 Concurrent Requests
**Objective**: Verify server handles concurrent requests

**Steps**:
1. Make 100 concurrent requests to `/api/status`
2. Observe response times and errors

**Expected Results**:
- [ ] All requests succeed
- [ ] Response time < 200ms p99
- [ ] No 500 errors
- [ ] Connection pool manages load
- [ ] Circuit breaker doesn't trip

**Notes**: ___________________________________________

---

## Test Suite 8: End-to-End Workflows

### 8.1 Full Development Workflow
**Objective**: Verify typical usage scenario

**Steps**:
1. Start MCP server
2. Open Web UI dashboard
3. List available Godot projects
4. Analyze a project
5. Launch Godot editor for that project
6. Make changes in editor
7. Run project from MCP
8. Stop execution
9. Check logs in dashboard

**Expected Results**:
- [ ] All steps complete successfully
- [ ] No errors in dashboard
- [ ] Logs show all operations
- [ ] Correlation IDs traceable
- [ ] Performance acceptable

**Notes**: ___________________________________________

---

## Test Suite 9: Documentation & Developer Experience

### 9.1 Documentation Accuracy
**Objective**: Verify documentation matches implementation

**Steps**:
1. Follow getting started guide
2. Try example commands
3. Check API documentation

**Expected Results**:
- [ ] Getting started guide works
- [ ] Example commands execute correctly
- [ ] API documentation accurate
- [ ] Environment variables documented
- [ ] Error codes documented

**Notes**: ___________________________________________

---

### 9.2 Error Messages
**Objective**: Verify error messages are helpful

**Steps**:
1. Trigger various errors (missing path, invalid args, etc.)
2. Read error messages

**Expected Results**:
- [ ] Error messages are clear
- [ ] Suggest how to fix the issue
- [ ] Include correlation ID for support
- [ ] No confusing technical jargon
- [ ] Actionable information provided

**Notes**: ___________________________________________

---

## Sign-Off

### Test Summary
- **Total Test Cases**: 51
- **Passed**: _______
- **Failed**: _______
- **Skipped**: _______
- **Blocker Issues**: _______

### Critical Issues Found
1. _______________________________________
2. _______________________________________
3. _______________________________________

### Recommendations
_______________________________________
_______________________________________
_______________________________________

### Approval
- [ ] All critical tests passing
- [ ] Performance targets met
- [ ] Security validated
- [ ] Documentation complete
- [ ] **APPROVED FOR NEXT PHASE**

**Tester Signature**: ___________________  
**Date**: ___________________  
**Build/Commit**: ___________________
