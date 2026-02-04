---
title: Error Handling Architecture
description: Comprehensive error classification system with structured error types, correlation IDs, and client-safe error responses
outline: [2, 3]
---

# Error Handling Architecture

The Godot MCP Server implements a structured error handling system with classification, correlation tracking, and sanitized client responses to ensure reliability and debuggability.

---

## Error Classification System

### Error Hierarchy

All errors extend the base `MCPError` class with standardized properties:

```typescript
abstract class MCPError extends Error {
  abstract readonly code: string;        // Machine-readable error code
  abstract readonly statusCode: number;  // HTTP status code equivalent
  readonly correlationId?: string;       // Request tracking ID
  readonly timestamp: Date;              // Error occurrence time
  
  toClientError(): ClientError;          // Sanitized error for clients
}
```

### Error Types

#### ValidationError (400)

**Purpose**: Invalid input from client (malformed requests, schema violations, path traversal attempts)

**Properties**:
- `code`: `"VALIDATION_ERROR"`
- `statusCode`: `400`
- `field?`: Name of the invalid field
- `issues?`: Detailed validation failures from Zod

**Example**:
```typescript
throw new ValidationError(
  'Invalid scene path: path traversal detected',
  correlationId,
  'path',
  [{ path: ['path'], message: 'Must start with res://' }]
);
```

**Client Response**:
```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid scene path: path traversal detected",
    "correlationId": "550e8400-e29b-41d4-a716-446655440000",
    "field": "path",
    "issues": [
      { "path": ["path"], "message": "Must start with res://" }
    ]
  }
}
```

**Common Causes**:
- Path traversal attempts (`../../etc/passwd`)
- Missing required parameters
- Invalid type for parameter (string instead of number)
- Schema constraint violations (string too long, number out of range)
- Invalid Godot resource paths (not starting with `res://`)

---

#### NetworkError (503)

**Purpose**: Communication failures with Godot bridge (connection refused, timeouts, HTTP errors)

**Properties**:
- `code`: `"NETWORK_ERROR"`
- `statusCode`: `503`
- `retryable`: Boolean indicating if retry is recommended

**Example**:
```typescript
throw new NetworkError(
  'Failed to connect to Godot bridge on port 7777',
  correlationId,
  true  // retryable
);
```

**Client Response**:
```json
{
  "jsonrpc": "2.0",
  "id": "req-002",
  "error": {
    "code": "NETWORK_ERROR",
    "message": "Failed to connect to Godot bridge on port 7777",
    "correlationId": "550e8400-e29b-41d4-a716-446655440001",
    "retryable": true
  }
}
```

**Common Causes**:
- Godot editor not running
- HTTP server plugin disabled
- Port conflict (7777 already in use)
- Firewall blocking localhost connections
- Godot crashed or hung

**Recovery Actions**:
1. Verify Godot editor is running
2. Check plugin is enabled: **Project → Project Settings → Plugins → Godot MCP Bridge**
3. Restart Godot editor
4. Check system logs for port conflicts

---

#### ToolNotFoundError (404)

**Purpose**: Client requested a tool that doesn't exist in the registry

**Properties**:
- `code`: `"TOOL_NOT_FOUND"`
- `statusCode`: `404`
- `toolName`: Name of the requested tool

**Example**:
```typescript
throw new ToolNotFoundError('scene.create_advanced', correlationId);
```

**Client Response**:
```json
{
  "jsonrpc": "2.0",
  "id": "req-003",
  "error": {
    "code": "TOOL_NOT_FOUND",
    "message": "Tool not found: scene.create_advanced",
    "correlationId": "550e8400-e29b-41d4-a716-446655440002",
    "toolName": "scene.create_advanced"
  }
}
```

**Common Causes**:
- Typo in tool name
- Tool not implemented yet (check roadmap)
- Tool disabled in configuration
- Version mismatch (tool requires newer Godot version)

---

#### InternalError (500)

**Purpose**: Unexpected server failures (programming errors, unhandled exceptions)

**Properties**:
- `code`: `"INTERNAL_ERROR"`
- `statusCode`: `500`
- **Message is always sanitized** to prevent information leakage

**Example**:
```typescript
try {
  // ... operation that might throw
} catch (error) {
  throw new InternalError(
    error.message,  // Original message logged but NOT sent to client
    correlationId
  );
}
```

**Client Response** (sanitized):
```json
{
  "jsonrpc": "2.0",
  "id": "req-004",
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal error occurred. Please contact support with the correlation ID.",
    "correlationId": "550e8400-e29b-41d4-a716-446655440003"
  }
}
```

**Security Note**: The actual error message and stack trace are **logged server-side** but never sent to the client to prevent information leakage about internal implementation details.

---

#### TimeoutError (504)

**Purpose**: Operation exceeded configured timeout threshold

**Properties**:
- `code`: `"TIMEOUT_ERROR"`
- `statusCode`: `504`
- `timeoutMs`: Configured timeout duration
- `operation`: Human-readable operation description

**Example**:
```typescript
throw new TimeoutError(
  'scene.read',
  5000,  // 5 seconds
  correlationId
);
```

**Client Response**:
```json
{
  "jsonrpc": "2.0",
  "id": "req-005",
  "error": {
    "code": "TIMEOUT_ERROR",
    "message": "Operation timed out after 5000ms: scene.read",
    "correlationId": "550e8400-e29b-41d4-a716-446655440004",
    "timeoutMs": 5000,
    "operation": "scene.read"
  }
}
```

**Common Causes**:
- Large scene files (>10MB)
- Godot editor busy/frozen
- Complex resource loading (many dependencies)
- Slow disk I/O

**Recovery Actions**:
1. Increase timeout in configuration
2. Optimize scene file (reduce node count)
3. Check Godot editor responsiveness
4. Monitor system resources (CPU/RAM)

---

#### CircuitBreakerError (503)

**Purpose**: Service is temporarily unavailable due to repeated failures (circuit breaker OPEN)

**Properties**:
- `code`: `"CIRCUIT_BREAKER_OPEN"`
- `statusCode`: `503`
- `retryAfterMs`: Time until circuit breaker attempts recovery

**Example**:
```typescript
throw new CircuitBreakerError(
  30000,  // Retry after 30 seconds
  correlationId
);
```

**Client Response**:
```json
{
  "jsonrpc": "2.0",
  "id": "req-006",
  "error": {
    "code": "CIRCUIT_BREAKER_OPEN",
    "message": "Circuit breaker is OPEN - service unavailable. Retry after 30000ms",
    "correlationId": "550e8400-e29b-41d4-a716-446655440005",
    "retryAfterMs": 30000
  }
}
```

**Cause**: The Godot bridge has failed 5 consecutive requests, triggering the circuit breaker to prevent cascading failures.

**Recovery**: Wait for the specified `retryAfterMs` duration. The circuit breaker will automatically transition to `HALF_OPEN` and attempt recovery.

---

## Correlation IDs

### Purpose

Correlation IDs enable request tracing across the entire system:

```
Client Request → Node.js MCP Server → HTTP Client → Godot Bridge → Response
                       ↓                   ↓             ↓
                   [UUID-1]           [UUID-1]      [UUID-1]
```

### Format

UUIDs (v4) generated per request:
```
550e8400-e29b-41d4-a716-446655440000
```

### HTTP Headers

#### Request Headers (Node.js → Godot)

```http
POST /rpc HTTP/1.1
Host: localhost:7777
Content-Type: application/json
X-Correlation-ID: 550e8400-e29b-41d4-a716-446655440000

{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "scene.read",
  "params": { "path": "res://main.tscn" }
}
```

#### Response Headers (Godot → Node.js)

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Correlation-ID: 550e8400-e29b-41d4-a716-446655440000

{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": { ... }
}
```

### Logging with Correlation IDs

All log entries include correlation IDs for traceability:

```typescript
logger.info('Processing tool invocation', {
  correlationId: '550e8400-e29b-41d4-a716-446655440000',
  tool: 'scene.read',
  path: 'res://main.tscn'
});
```

**Log Output**:
```
2026-02-04T10:30:45.123Z [INFO] Processing tool invocation
  correlationId: 550e8400-e29b-41d4-a716-446655440000
  tool: scene.read
  path: res://main.tscn
```

### Troubleshooting with Correlation IDs

**Step 1: Get Correlation ID from Error Response**

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal error occurred...",
    "correlationId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Step 2: Search Logs**

```bash
grep "550e8400-e29b-41d4-a716-446655440000" server.log
```

**Step 3: Trace Request Flow**

```
2026-02-04T10:30:45.120Z [DEBUG] Received MCP request
  correlationId: 550e8400-e29b-41d4-a716-446655440000
  
2026-02-04T10:30:45.121Z [DEBUG] Forwarding to Godot bridge
  correlationId: 550e8400-e29b-41d4-a716-446655440000
  url: http://localhost:7777/rpc
  
2026-02-04T10:30:45.150Z [ERROR] Bridge request failed
  correlationId: 550e8400-e29b-41d4-a716-446655440000
  error: ECONNREFUSED
  
2026-02-04T10:30:45.151Z [ERROR] Tool invocation failed
  correlationId: 550e8400-e29b-41d4-a716-446655440000
  error: NetworkError: Failed to connect to Godot bridge
```

---

## Error Response Format

### JSON-RPC Error Structure

All errors follow JSON-RPC 2.0 specification with custom extensions:

```typescript
interface ErrorResponse {
  jsonrpc: "2.0";
  id: string | number;
  error: {
    code: string;              // Custom error code (VALIDATION_ERROR, etc.)
    message: string;            // Human-readable error message
    correlationId?: string;     // Request correlation ID
    
    // Type-specific fields
    field?: string;             // ValidationError
    issues?: ValidationIssue[]; // ValidationError
    retryable?: boolean;        // NetworkError, CircuitBreakerError
    toolName?: string;          // ToolNotFoundError
    timeoutMs?: number;         // TimeoutError
    operation?: string;         // TimeoutError
    retryAfterMs?: number;      // CircuitBreakerError
  };
}
```

### Error Code Mapping

| Error Type | Code | HTTP Status | Retryable |
|-----------|------|-------------|-----------|
| ValidationError | `VALIDATION_ERROR` | 400 | No |
| ToolNotFoundError | `TOOL_NOT_FOUND` | 404 | No |
| InternalError | `INTERNAL_ERROR` | 500 | No |
| NetworkError | `NETWORK_ERROR` | 503 | Yes |
| TimeoutError | `TIMEOUT_ERROR` | 504 | Yes |
| CircuitBreakerError | `CIRCUIT_BREAKER_OPEN` | 503 | Yes (after delay) |

---

## Client Error Handling Best Practices

### 1. Check Error Codes, Not Messages

**Bad**:
```typescript
if (error.message.includes('not found')) {
  // Fragile - message may change
}
```

**Good**:
```typescript
if (error.code === 'TOOL_NOT_FOUND') {
  // Reliable - code is stable API
}
```

### 2. Implement Retry Logic for Retryable Errors

```typescript
async function callToolWithRetry(tool: string, params: unknown) {
  const maxRetries = 3;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.callTool(tool, params);
    } catch (error) {
      if (error.code === 'NETWORK_ERROR' && error.retryable) {
        await sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
        continue;
      }
      throw error; // Non-retryable error
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

### 3. Log Correlation IDs for Support

```typescript
try {
  await client.callTool('scene.read', { path: 'res://main.tscn' });
} catch (error) {
  console.error('Tool invocation failed:', {
    correlationId: error.correlationId,
    code: error.code,
    message: error.message
  });
  
  // Show user-friendly message with correlation ID
  alert(`Operation failed. Please contact support with ID: ${error.correlationId}`);
}
```

### 4. Handle Circuit Breaker Gracefully

```typescript
if (error.code === 'CIRCUIT_BREAKER_OPEN') {
  const retryAfterSec = Math.ceil(error.retryAfterMs / 1000);
  
  console.warn(`Service unavailable. Retrying in ${retryAfterSec}s...`);
  
  await sleep(error.retryAfterMs);
  return callToolWithRetry(tool, params); // Retry after cooldown
}
```

---

## Server-Side Error Handling

### Try-Catch Boundaries

```typescript
// Tool handler with proper error conversion
async function handleToolCall(tool: string, params: unknown, correlationId: string) {
  try {
    // Validation
    const validated = toolSchema.parse(params);
    
    // Business logic
    const result = await executeTool(tool, validated);
    
    return { success: true, result };
  } catch (error) {
    // Convert known errors
    if (error instanceof ZodError) {
      throw new ValidationError('Invalid parameters', correlationId, undefined, error.issues);
    }
    
    if (error.code === 'ECONNREFUSED') {
      throw new NetworkError('Godot bridge not reachable', correlationId, true);
    }
    
    // Unknown errors → InternalError (sanitized)
    logError(error, { correlationId }); // Log full error server-side
    throw new InternalError(error.message, correlationId); // Sanitized client response
  }
}
```

### Error Logging

```typescript
function logError(error: Error, context: Record<string, unknown>) {
  logger.error(error.message, {
    ...context,
    stack: error.stack,
    name: error.name,
    timestamp: new Date().toISOString()
  });
}
```

**Server Log** (full details):
```json
{
  "level": "error",
  "message": "TypeError: Cannot read property 'nodes' of undefined",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "stack": "TypeError: Cannot read property...\n  at GodotClient.readScene...",
  "timestamp": "2026-02-04T10:30:45.151Z"
}
```

**Client Response** (sanitized):
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal error occurred. Please contact support with the correlation ID.",
    "correlationId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

## Configuration

### Environment Variables

```bash
# Error handling configuration
BRIDGE_TIMEOUT=5000           # Request timeout (ms)
CIRCUIT_BREAKER_THRESHOLD=5   # Failures before opening circuit
CIRCUIT_BREAKER_TIMEOUT=30000 # Cooldown before retry (ms)
```

### TypeScript Configuration

```typescript
// src/config/errors.config.ts
export const ERROR_CONFIG = {
  timeout: {
    default: 5000,      // 5 seconds
    read: 3000,         // 3 seconds (read operations)
    write: 10000,       // 10 seconds (write operations)
    editor: 30000       // 30 seconds (editor launch)
  },
  circuitBreaker: {
    threshold: 5,       // Open after 5 failures
    timeout: 30000,     // Wait 30s before retry
    successThreshold: 3 // Close after 3 successes
  }
} as const;
```

---

## Future Enhancements

### Phase 2 Error Handling

- **Audit Logging**: Persist all errors to database with correlation IDs
- **Error Metrics**: Track error rates, types, and trends (Prometheus)
- **Alerting**: Notify on high error rates or critical failures (PagerDuty)
- **Error Recovery**: Automatic recovery strategies for known error patterns
- **Distributed Tracing**: OpenTelemetry integration for multi-service tracing
- **User Notifications**: Real-time error notifications via Web UI SSE

---

## Related Documentation

- [Security Architecture](./security.md) - Security controls and threat model
- [MCP Protocol Specification](../api/protocol.md) - JSON-RPC error codes
- [Godot Bridge API](../api/godot-bridge.md) - Bridge error responses
- [Testing Strategy](../implementation/testing.md) - Error handling test coverage
