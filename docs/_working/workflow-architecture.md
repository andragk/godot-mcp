# Godot 4.6 MCP Server - Workflow Architecture

**Document Version**: 1.0.0  
**Date**: February 3, 2026  
**Status**: Design Specification

---

## Executive Summary

This document defines the comprehensive workflow architecture for the Godot 4.6 MCP Server—a lightweight, highly functional system that exposes Godot Engine capabilities via the Model Context Protocol (MCP). The architecture enables VS Code and other MCP-compatible clients to interact with Godot projects through a Node.js server, a bridge layer, and a web-based management UI.

**Core Philosophy**: Maximum functionality with minimum footprint.

**Primary Architectural Challenge**: Establishing reliable, low-latency bidirectional communication between Node.js (MCP Server) and Godot Engine (native C++/GDScript runtime).

---

## 1. High-Level System Architecture

### 1.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          MCP Clients                                │
│  (VS Code + MCP Extension, Claude Desktop, other MCP-compatible)    │
└────────────────────────────┬────────────────────────────────────────┘
                             │ MCP Protocol (stdio/SSE)
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                    Node.js MCP Server                               │
│  - MCP SDK Implementation (stdio transport)                         │
│  - Tool/Resource/Prompt handlers                                    │
│  - Session management                                               │
│  - Authentication/Authorization                                     │
│  - Request validation & serialization                               │
└────────────────────────────┬────────────────────────────────────────┘
                             │ **CRITICAL BRIDGE LAYER**
                             │ (Communication Pattern TBD)
┌────────────────────────────▼────────────────────────────────────────┐
│                     Bridge Layer                                    │
│  - Node.js ↔ Godot communication adapter                           │
│  - Protocol translation (MCP → Godot API)                           │
│  - Message serialization/deserialization                            │
│  - Connection lifecycle management                                  │
│  - Error handling & reconnection logic                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │ Godot API Calls
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                   Godot 4.6 Engine                                  │
│  - Scene tree manipulation                                          │
│  - Node/Resource management                                         │
│  - Script execution (GDScript/C#)                                   │
│  - Asset pipeline                                                   │
│  - Build/Export operations                                          │
└─────────────────────────────────────────────────────────────────────┘

                    Parallel Component (Web UI)
┌─────────────────────────────────────────────────────────────────────┐
│                    Sidecar Web UI                                   │
│  - Server lifecycle management (Alpine.js)                          │
│  - Session tracking dashboard (Tailwind CSS)                        │
│  - Real-time observability (WebSocket to Node.js)                   │
│  - Resource browser                                                 │
│  - Tool catalog & documentation                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities

| Component | Primary Responsibility | Technology |
|-----------|------------------------|------------|
| **MCP Clients** | Initiate tool invocations, consume resources, trigger workflows | VS Code, Claude Desktop |
| **Node.js MCP Server** | MCP protocol implementation, request routing, session management | Node.js, MCP SDK |
| **Bridge Layer** | Bidirectional Node.js ↔ Godot communication, protocol translation | GDScript/GDExtension + Node.js adapter |
| **Godot Engine** | Execute game engine operations, manage scene/resource state | Godot 4.6 (C++, GDScript) |
| **Sidecar Web UI** | Human-facing management interface, observability dashboard | HTML, Tailwind CSS, Alpine.js |

---

## 2. Communication Architecture (CRITICAL ANALYSIS)

### 2.1 The Bridge Problem

**Challenge**: Node.js runs in a separate process from Godot Engine. We need **bidirectional, low-latency, reliable** inter-process communication (IPC).

**Requirements**:
1. **Latency**: <50ms round-trip for typical operations (tool invocations)
2. **Reliability**: Automatic reconnection, message queuing during disconnects
3. **Bidirectionality**: Godot must push events to Node.js (e.g., scene changes, build completion)
4. **Serialization**: Efficient encoding of complex data structures (scene trees, resources)
5. **Cross-Platform**: Must work on Windows, macOS, Linux
6. **Error Handling**: Graceful degradation, detailed error propagation
7. **Session Management**: Handle multiple concurrent client connections
8. **Development Experience**: Easy to debug, test, and monitor

### 2.2 Communication Pattern Options

#### Option 1: HTTP/REST API ⭐⭐⭐⭐

**Description**: Node.js runs an HTTP server; Godot makes HTTP requests via built-in HTTPRequest node or GDExtension HTTP client.

**Architecture**:
```
Node.js (HTTP Server :3000) ← HTTP → Godot (HTTPRequest)
```

**Pros**:
- ✅ Native Godot support (HTTPRequest node, no dependencies)
- ✅ Standard protocol, extensive tooling (curl, Postman)
- ✅ Easy to debug (inspect traffic with Wireshark, browser DevTools)
- ✅ Cross-platform (HTTP works everywhere)
- ✅ RESTful design maps well to MCP Resources
- ✅ Simple error handling (HTTP status codes)
- ✅ Stateless (scales horizontally)

**Cons**:
- ❌ Higher latency than Unix sockets (~5-15ms overhead)
- ❌ Unidirectional by default (requires polling or SSE for Godot → Node.js)
- ❌ HTTP overhead (headers, connection management)
- ❌ Requires port management (conflicts, firewall rules)
- ❌ No built-in message ordering guarantees

**Latency**: ~10-20ms local requests  
**Complexity**: Low  
**Best For**: Request/response patterns, stateless operations

---

#### Option 2: WebSocket ⭐⭐⭐⭐⭐ (RECOMMENDED)

**Description**: Full-duplex communication over a single persistent TCP connection. Node.js runs a WebSocket server; Godot connects as a client.

**Architecture**:
```
Node.js (WS Server :3001) ⟷ Godot (WebSocketClient/Peer)
```

**Pros**:
- ✅ **Bidirectional** (Godot can push events to Node.js)
- ✅ **Low latency** (~1-5ms after connection established)
- ✅ **Persistent connection** (avoid handshake overhead)
- ✅ **Built-in message framing** (send discrete messages, not byte streams)
- ✅ **Native Godot support** (WebSocketClient, WebSocketPeer nodes)
- ✅ **Efficient for high-frequency updates** (real-time observability)
- ✅ **Cross-platform** (standard protocol)
- ✅ **Heartbeat/keepalive** (detect disconnections)
- ✅ **Secure option** (WSS with TLS)

**Cons**:
- ⚠️ Stateful (requires reconnection logic)
- ⚠️ Connection management complexity (handle disconnects, timeouts)
- ⚠️ Port management (like HTTP)
- ⚠️ Requires WebSocket library in Node.js (ws, socket.io)

**Latency**: ~1-5ms for messages after connection established  
**Complexity**: Medium  
**Best For**: Real-time bidirectional communication, event streams, observability

**Implementation Notes**:
- Use `ws` library in Node.js (lightweight, no Socket.IO overhead)
- Godot: Use `WebSocketClient` for automatic reconnection
- Message format: JSON for simplicity, MessagePack for performance
- Implement exponential backoff for reconnection (1s, 2s, 4s, 8s, max 30s)
- Use ping/pong frames for keepalive (every 30s)
- Queue messages during disconnection (max 1000 messages)

---

#### Option 3: Unix Domain Sockets (UDS) ⭐⭐⭐

**Description**: IPC via filesystem sockets (POSIX) or named pipes (Windows). Fastest local communication.

**Architecture**:
```
Node.js (UDS Server /tmp/godot-mcp.sock) ⟷ Godot (StreamPeerTCP + custom protocol)
```

**Pros**:
- ✅ **Lowest latency** (<1ms, no network stack overhead)
- ✅ **No port conflicts** (uses filesystem paths)
- ✅ **More secure** (filesystem permissions, no network exposure)
- ✅ **Efficient** (kernel-level optimization)

**Cons**:
- ❌ **No native Godot support** (requires GDExtension for socket APIs)
- ❌ **Platform-specific** (different APIs for Windows named pipes vs POSIX UDS)
- ❌ **Harder to debug** (no standard tools like curl)
- ❌ **Complex implementation** (need custom protocol on top of raw sockets)
- ❌ **Not cross-platform** (Windows requires named pipes)

**Latency**: <1ms  
**Complexity**: High  
**Best For**: Ultra-low latency requirements, single-machine deployments

**Verdict**: Overkill for this project. Complexity not justified by latency gains.

---

#### Option 4: TCP Sockets (Raw) ⭐⭐

**Description**: Direct TCP connection with custom binary protocol.

**Architecture**:
```
Node.js (TCP Server :3002) ⟷ Godot (StreamPeerTCP)
```

**Pros**:
- ✅ Native Godot support (StreamPeerTCP)
- ✅ Full control over protocol design
- ✅ Efficient binary serialization

**Cons**:
- ❌ **No message framing** (must implement length-prefixed protocol)
- ❌ **No standard error handling** (custom error codes)
- ❌ **Complex to implement** (parsing, buffering, state management)
- ❌ **Harder to debug** (binary protocol, need custom tools)
- ❌ **Reinventing the wheel** (WebSocket already solves this)

**Latency**: ~2-5ms  
**Complexity**: Very High  
**Best For**: Specialized high-performance scenarios

**Verdict**: WebSocket provides the same benefits with better tooling and ecosystem.

---

#### Option 5: stdio (Standard Input/Output) ⭐

**Description**: Godot runs as a subprocess of Node.js; communicate via stdin/stdout.

**Architecture**:
```
Node.js (parent process) → stdin/stdout → Godot (child process)
```

**Pros**:
- ✅ No network stack overhead
- ✅ Simple process lifecycle (parent owns child)

**Cons**:
- ❌ **Godot not designed for headless stdio mode**
- ❌ **Stdout conflicts** (Godot uses stdout for logs)
- ❌ **No bidirectional event model** (polling required)
- ❌ **Process management complexity** (restart Godot on every request?)
- ❌ **Not suitable for long-running engine instances**

**Latency**: N/A (architectural mismatch)  
**Complexity**: Very High  
**Best For**: CLI tools, not long-running game engines

**Verdict**: Incompatible with Godot's runtime model.

---

#### Option 6: Message Queue (RabbitMQ, Redis Pub/Sub) ⭐⭐

**Description**: Use external message broker for async communication.

**Architecture**:
```
Node.js → Redis Pub/Sub ← Godot
```

**Pros**:
- ✅ Decoupled architecture
- ✅ Built-in message persistence and delivery guarantees
- ✅ Scalable (multiple Node.js instances)

**Cons**:
- ❌ **External dependency** (violates "minimum footprint" philosophy)
- ❌ **Higher latency** (~10-50ms including broker)
- ❌ **Operational complexity** (run/monitor Redis)
- ❌ **Overkill for single-machine use case**

**Latency**: ~10-50ms  
**Complexity**: High (infrastructure)  
**Best For**: Distributed systems, multi-server deployments

**Verdict**: Unnecessary for local development tool.

---

### 2.3 Recommended Communication Pattern: WebSocket

**Final Recommendation**: **WebSocket** (Option 2)

**Rationale**:
1. **Bidirectional**: Supports both MCP client → Godot (tools) and Godot → MCP client (events)
2. **Low Latency**: ~1-5ms sufficient for interactive development workflows
3. **Native Support**: Godot has built-in WebSocket nodes; Node.js has mature libraries
4. **Developer Experience**: Standard protocol, excellent debugging tools
5. **Reliability**: Built-in reconnection, message framing, error handling
6. **Observability**: Easy to integrate with Web UI for real-time monitoring
7. **Complexity**: Moderate—simpler than raw TCP, more capable than HTTP

**Hybrid Approach (Optional)**:
- **WebSocket**: Primary communication channel (tool invocations, events, observability)
- **HTTP REST API**: Secondary channel for stateless queries (resource listing, health checks)

This hybrid approach provides:
- WebSocket for performance-critical bidirectional flows
- HTTP for simple debugging and health monitoring (curl-friendly)

---

### 2.4 Message Serialization Format

**Options**:

| Format | Pros | Cons | Verdict |
|--------|------|------|---------|
| **JSON** | Human-readable, universal support, easy debugging | Larger payload (~30% overhead), slower parsing | ⭐⭐⭐⭐⭐ **Recommended for v1** |
| **MessagePack** | 20-30% smaller than JSON, faster parsing | Binary (harder to debug), requires library | ⭐⭐⭐⭐ **For v2 optimization** |
| **Protocol Buffers** | Strongly typed, efficient, versioned schemas | Complex setup, compile step, overkill for dynamic data | ⭐⭐ Too heavy |
| **CBOR** | Binary JSON, efficient | Less tooling than MessagePack | ⭐⭐⭐ Alternative to MessagePack |

**Recommendation**: Start with **JSON** for simplicity and debuggability. Optimize to **MessagePack** if profiling reveals serialization bottlenecks (unlikely for typical use cases).

**Schema Validation**: Use Zod (Node.js) and typed dictionaries (GDScript) for runtime validation.

---

### 2.5 Connection Lifecycle Management

#### Initialization Sequence
```
1. Node.js MCP Server starts
   └─> Initializes WebSocket server on ws://localhost:3001
   └─> Registers MCP tools, resources, prompts with MCP SDK
   
2. Godot Engine starts (manual launch or spawned by Node.js)
   └─> Loads Bridge autoload (GDScript singleton)
   └─> Bridge connects to WebSocket server
   └─> Sends HELLO message with Godot version, project path, PID
   
3. Node.js receives HELLO
   └─> Validates connection
   └─> Responds with SESSION_START (session ID, server capabilities)
   └─> Updates Web UI with connection status
   
4. System ready for MCP client connections
```

#### Heartbeat & Keepalive
```
Every 30 seconds:
  Node.js → PING → Godot
  Godot → PONG → Node.js
  
If no PONG received within 10 seconds:
  Node.js marks connection as stale
  Queues outbound messages
  Attempts reconnection on next message send
```

#### Disconnection & Reconnection
```
On disconnect (network error, Godot crash, etc.):
  1. Node.js detects TCP close or heartbeat timeout
  2. Transitions session to DISCONNECTED state
  3. Starts exponential backoff reconnection:
     - Wait 1s → retry
     - Wait 2s → retry
     - Wait 4s → retry
     - ...
     - Max wait 30s
  4. Godot Bridge (if still running) attempts reconnection
  5. On successful reconnect:
     - Godot re-sends HELLO (may be new PID)
     - Node.js validates session continuity
     - Flushes queued messages
     - Updates Web UI
```

#### Graceful Shutdown
```
On Node.js shutdown (SIGTERM, SIGINT):
  1. Node.js sends SHUTDOWN message to all connected Godot instances
  2. Waits up to 5 seconds for acknowledgment
  3. Closes WebSocket server
  4. Flushes logs and state
  5. Exits with code 0
  
On Godot shutdown:
  1. Bridge sends GOODBYE message
  2. Node.js acknowledges and removes session
  3. Updates Web UI
```

---

### 2.6 Error Handling & Recovery

#### Error Categories

| Category | Example | Handling Strategy |
|----------|---------|-------------------|
| **Transport Errors** | Connection refused, timeout | Retry with exponential backoff |
| **Protocol Errors** | Malformed message, unknown command | Reject with error code, log, continue |
| **Validation Errors** | Invalid tool arguments | Return structured error to MCP client |
| **Godot API Errors** | Node not found, permission denied | Map to MCP error codes, preserve stack trace |
| **System Errors** | Out of memory, disk full | Log critical error, attempt graceful shutdown |

#### Error Response Format (JSON)
```json
{
  "type": "error",
  "code": "GODOT_NODE_NOT_FOUND",
  "message": "Node 'Player' not found in scene tree",
  "details": {
    "requestedPath": "/root/Main/Player",
    "availableNodes": ["/root/Main", "/root/Main/Camera"],
    "timestamp": "2026-02-03T12:34:56.789Z"
  },
  "retryable": false,
  "source": "godot_bridge"
}
```

#### Retry Policy
- **Idempotent Operations** (read-only queries): Retry up to 3 times with 1s delay
- **Non-Idempotent Operations** (create node, delete resource): No automatic retry, return error immediately
- **Transient Errors** (network timeout): Retry with exponential backoff (max 5 attempts)
- **Permanent Errors** (invalid arguments): No retry, return to client immediately

---

## 3. Major Workflow Architectures

### 3.1 Tool Invocation Flow

**Trigger**: MCP client (VS Code) invokes a tool (e.g., `godot_create_node`)

**Workflow Stages**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Request Initiation (MCP Client → Node.js)                      │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. User triggers tool in VS Code                                        │
│ 2. VS Code MCP extension serializes request:                            │
│    {                                                                     │
│      "method": "tools/call",                                             │
│      "params": {                                                         │
│        "name": "godot_create_node",                                      │
│        "arguments": {                                                    │
│          "nodeType": "Sprite2D",                                         │
│          "parentPath": "/root/Main",                                     │
│          "nodeName": "Player"                                            │
│        }                                                                 │
│      }                                                                   │
│    }                                                                     │
│ 3. Sends via MCP stdio transport to Node.js                             │
│                                                                          │
│ ⏱️ Latency: ~1-2ms (local stdio)                                         │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Server-Side Validation (Node.js MCP Server)                    │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. MCP SDK receives and parses message                                  │
│ 2. Routes to tool handler: ToolRegistry.get("godot_create_node")        │
│ 3. Validates arguments against Zod schema:                              │
│    - nodeType: valid Godot class name?                                  │
│    - parentPath: valid scene path format?                               │
│    - nodeName: valid identifier (no special chars)?                     │
│ 4. Checks session state:                                                │
│    - Is Godot connected?                                                │
│    - Is session active?                                                 │
│    - Does session have permission for this tool?                        │
│ 5. Generates request ID (UUID) for tracking                             │
│ 6. Logs request to observability pipeline                               │
│                                                                          │
│ ⏱️ Latency: ~2-5ms (validation + session lookup)                         │
│ 🚨 Error Exit: Return MCP error if validation fails                     │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 3: Bridge Translation (Node.js → WebSocket → Godot)               │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Node.js serializes command for Godot:                                │
│    {                                                                     │
│      "type": "command",                                                  │
│      "id": "req-uuid-1234",                                              │
│      "method": "node.create",                                            │
│      "params": {                                                         │
│        "type": "Sprite2D",                                               │
│        "parent": "/root/Main",                                           │
│        "name": "Player"                                                  │
│      }                                                                   │
│    }                                                                     │
│ 2. Sends via WebSocket to Godot Bridge                                  │
│ 3. Awaits response (with 30-second timeout)                             │
│                                                                          │
│ ⏱️ Latency: ~1-5ms (WebSocket send)                                      │
│ 🚨 Error Exit: Return timeout error if no response in 30s               │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Godot Execution (Bridge → Godot API)                           │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Bridge receives WebSocket message                                    │
│ 2. Validates message structure                                          │
│ 3. Parses command: CommandRegistry.execute("node.create")               │
│ 4. Executes Godot API call:                                             │
│    var parent := get_node("/root/Main")                                 │
│    if parent == null:                                                   │
│        return error("Parent node not found")                            │
│                                                                          │
│    var node := Sprite2D.new()                                           │
│    node.name = "Player"                                                 │
│    parent.add_child(node)                                               │
│    node.owner = get_tree().edited_scene_root # For saving              │
│                                                                          │
│ 5. Captures result (node path or error)                                 │
│ 6. Emits event: "node_created" (for observability)                      │
│                                                                          │
│ ⏱️ Latency: ~5-10ms (Godot API call, scene tree update)                 │
│ 🚨 Error Exit: Catch GDScript errors, serialize to error response       │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 5: Response Serialization (Godot → WebSocket → Node.js)           │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Bridge constructs response:                                          │
│    {                                                                     │
│      "type": "response",                                                 │
│      "id": "req-uuid-1234",                                              │
│      "success": true,                                                   │
│      "result": {                                                         │
│        "nodePath": "/root/Main/Player",                                 │
│        "nodeType": "Sprite2D",                                           │
│        "instanceId": 123456                                              │
│      }                                                                   │
│    }                                                                     │
│ 2. Sends via WebSocket to Node.js                                       │
│                                                                          │
│ ⏱️ Latency: ~1-5ms (WebSocket send)                                      │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 6: MCP Response (Node.js → MCP Client)                            │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Node.js receives WebSocket response                                  │
│ 2. Matches response ID to pending request                               │
│ 3. Transforms to MCP response format:                                   │
│    {                                                                     │
│      "content": [                                                        │
│        {                                                                 │
│          "type": "text",                                                 │
│          "text": "Created Sprite2D node at /root/Main/Player"           │
│        },                                                                │
│        {                                                                 │
│          "type": "resource",                                             │
│          "resource": {                                                   │
│            "uri": "godot://node/root/Main/Player",                       │
│            "name": "Player (Sprite2D)",                                  │
│            "mimeType": "application/x-godot-node"                        │
│          }                                                               │
│        }                                                                 │
│      ]                                                                   │
│    }                                                                     │
│ 4. Sends via stdio to VS Code                                           │
│ 5. Logs completion to observability                                     │
│                                                                          │
│ ⏱️ Latency: ~1-2ms (stdio send)                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 7: Client Display (VS Code UI)                                    │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. VS Code MCP extension receives response                              │
│ 2. Displays success message in chat                                     │
│ 3. Updates resource tree (if applicable)                                │
│                                                                          │
│ ⏱️ Latency: ~10-50ms (UI rendering)                                      │
└──────────────────────────────────────────────────────────────────────────┘

🕐 Total End-to-End Latency: ~20-80ms (typical case)
```

**Error Path Example** (Node not found):
```
Stage 4 Error → Godot returns error response
              ↓
Stage 5 → Bridge serializes error:
          {
            "type": "response",
            "id": "req-uuid-1234",
            "success": false,
            "error": {
              "code": "NODE_NOT_FOUND",
              "message": "Parent node '/root/Main' not found"
            }
          }
              ↓
Stage 6 → Node.js transforms to MCP error:
          {
            "isError": true,
            "content": [{
              "type": "text",
              "text": "Error: Parent node '/root/Main' not found in scene tree"
            }]
          }
              ↓
Stage 7 → VS Code displays error in chat with red indicator
```

---

### 3.2 Resource Access Flow

**Trigger**: MCP client requests a Godot resource (e.g., `godot://scene/res://main.tscn`)

**Workflow Stages**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Resource Request (MCP Client → Node.js)                        │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Client invokes resources/read:                                       │
│    {                                                                     │
│      "method": "resources/read",                                         │
│      "params": {                                                         │
│        "uri": "godot://scene/res://main.tscn"                            │
│      }                                                                   │
│    }                                                                     │
│ 2. Sent via MCP stdio                                                   │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 2: URI Parsing & Routing (Node.js)                                │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Parse URI: godot://scene/res://main.tscn                             │
│    - Scheme: godot://                                                    │
│    - Resource type: scene                                               │
│    - Path: res://main.tscn                                              │
│ 2. Route to ResourceProvider for "scene" type                           │
│ 3. Check cache: Is this resource cached and fresh?                      │
│    - If cached → return from cache (skip Godot call)                    │
│    - If stale/missing → proceed to Godot                                │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 3: Godot Resource Query (Node.js → Godot)                         │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Send WebSocket command:                                              │
│    {                                                                     │
│      "type": "command",                                                  │
│      "id": "res-uuid-5678",                                              │
│      "method": "resource.read",                                          │
│      "params": {                                                         │
│        "path": "res://main.tscn",                                        │
│        "includeMetadata": true                                           │
│      }                                                                   │
│    }                                                                     │
│ 2. Await response (30s timeout)                                         │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Resource Loading (Godot)                                       │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Bridge receives command                                              │
│ 2. Loads resource:                                                       │
│    var scene := load("res://main.tscn") as PackedScene                  │
│ 3. Extracts metadata:                                                    │
│    - Node tree structure                                                │
│    - Script attachments                                                 │
│    - Resource dependencies                                              │
│    - File size, modification time                                       │
│ 4. Serializes scene to JSON representation                              │
│ 5. Returns response                                                     │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 5: Response Caching (Node.js)                                     │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Receive resource data from Godot                                     │
│ 2. Store in cache:                                                       │
│    - Key: "godot://scene/res://main.tscn"                               │
│    - Value: Resource data + metadata                                    │
│    - TTL: 5 minutes (or until invalidation event)                       │
│ 3. Transform to MCP resource format                                     │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 6: MCP Response (Node.js → Client)                                │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Return resource:                                                      │
│    {                                                                     │
│      "contents": [                                                       │
│        {                                                                 │
│          "uri": "godot://scene/res://main.tscn",                         │
│          "mimeType": "application/x-godot-scene",                        │
│          "text": "{ \"nodes\": [...], \"connections\": [...] }"         │
│        }                                                                 │
│      ]                                                                   │
│    }                                                                     │
└──────────────────────────────────────────────────────────────────────────┘

Cache Invalidation Trigger (Parallel):
  Godot detects file change → Emits "resource_changed" event
  → Node.js receives event → Invalidates cache entry
  → Next request fetches fresh data
```

**Supported Resource Types**:
- `godot://scene/{path}` - Packed scenes (.tscn, .scn)
- `godot://script/{path}` - GDScript files (.gd)
- `godot://resource/{path}` - Generic resources (.tres, .res)
- `godot://node/{path}` - Live scene tree nodes
- `godot://project/config` - Project settings (project.godot)
- `godot://project/export-presets` - Export configurations

**Pagination** (for large resources like file listings):
```
Request with pagination:
  URI: godot://project/files?page=2&pageSize=100

Response includes metadata:
  "page": 2,
  "pageSize": 100,
  "totalItems": 547,
  "hasNextPage": true
```

---

### 3.3 Session Lifecycle Workflow

**Workflow Stages**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Server Startup                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Load configuration from .env or config file                          │
│ 2. Initialize logging (Winston, correlation IDs)                        │
│ 3. Start WebSocket server (ws://localhost:3001)                         │
│ 4. Start HTTP server for Web UI (http://localhost:3000)                 │
│ 5. Register MCP tools, resources, prompts with MCP SDK                  │
│ 6. Initialize session manager (empty)                                   │
│ 7. Set up graceful shutdown handlers (SIGTERM, SIGINT)                  │
│ 8. Log "Server ready" with PID, ports, version                          │
│                                                                          │
│ 🎯 Output: Server ready to accept connections                           │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Godot Connection                                               │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. User launches Godot Editor with project                              │
│ 2. Bridge autoload (MCPBridge.gd) initializes in _ready()               │
│ 3. Bridge attempts WebSocket connection to ws://localhost:3001          │
│ 4. Node.js accepts connection                                           │
│ 5. Bridge sends HELLO message:                                          │
│    {                                                                     │
│      "type": "hello",                                                    │
│      "godotVersion": "4.6.0-stable",                                     │
│      "projectPath": "C:/Projects/MyGame",                                │
│      "pid": 12345,                                                       │
│      "capabilities": ["node_manipulation", "resource_access"]            │
│    }                                                                     │
│ 6. Node.js validates HELLO, creates session:                            │
│    - sessionId: "session-uuid-9876"                                     │
│    - state: CONNECTED                                                   │
│    - godotPid: 12345                                                    │
│    - connectedAt: timestamp                                             │
│ 7. Node.js responds with SESSION_START:                                 │
│    {                                                                     │
│      "type": "session_start",                                            │
│      "sessionId": "session-uuid-9876",                                   │
│      "serverVersion": "1.0.0",                                           │
│      "features": ["tools", "resources", "events"]                        │
│    }                                                                     │
│ 8. Web UI updates: Shows Godot connected, project path                  │
│                                                                          │
│ 🎯 Output: Active session established                                   │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 3: MCP Client Connection                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. User opens VS Code with MCP extension                                │
│ 2. Extension spawns Node.js MCP server (via stdio)                      │
│ 3. MCP SDK initializes stdio transport                                  │
│ 4. Client sends initialization request:                                 │
│    {                                                                     │
│      "method": "initialize",                                             │
│      "params": {                                                         │
│        "protocolVersion": "2024-11-05",                                  │
│        "capabilities": {},                                               │
│        "clientInfo": { "name": "vscode-mcp", "version": "1.2.0" }        │
│      }                                                                   │
│    }                                                                     │
│ 5. Server validates, responds with capabilities:                        │
│    {                                                                     │
│      "protocolVersion": "2024-11-05",                                    │
│      "capabilities": {                                                   │
│        "tools": {},                                                      │
│        "resources": { "subscribe": true },                               │
│        "prompts": {}                                                     │
│      },                                                                  │
│      "serverInfo": { "name": "godot-mcp-server", "version": "1.0.0" }   │
│    }                                                                     │
│ 6. Client sends tools/list request                                      │
│ 7. Server returns available tools (only if Godot connected)             │
│                                                                          │
│ 🎯 Output: MCP client can invoke tools                                  │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Active Session (Steady State)                                  │
├──────────────────────────────────────────────────────────────────────────┤
│ Concurrent activities:                                                   │
│                                                                          │
│ ┌─────────────────────┐  ┌──────────────────────┐  ┌─────────────────┐ │
│ │ Tool Invocations    │  │ Resource Queries     │  │ Event Streaming │ │
│ │ (Client → Godot)    │  │ (Client → Godot)     │  │ (Godot → Client)│ │
│ │ See Workflow 3.1    │  │ See Workflow 3.2     │  │ See Workflow 3.5│ │
│ └─────────────────────┘  └──────────────────────┘  └─────────────────┘ │
│                                                                          │
│ ┌─────────────────────┐  ┌──────────────────────┐                       │
│ │ Heartbeat/Keepalive │  │ Web UI Updates       │                       │
│ │ (Every 30s)         │  │ (Real-time via SSE)  │                       │
│ └─────────────────────┘  └──────────────────────┘                       │
│                                                                          │
│ Session state tracking:                                                 │
│ - Last activity timestamp (updated on every message)                    │
│ - Request count (for rate limiting)                                     │
│ - Error count (for circuit breaker)                                     │
│                                                                          │
│ 🎯 Output: Continuous operation                                         │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 5: Graceful Disconnection                                         │
├──────────────────────────────────────────────────────────────────────────┤
│ Scenario A: User closes Godot                                           │
│   1. Godot Bridge _exit_tree() called                                   │
│   2. Bridge sends GOODBYE message                                       │
│   3. Node.js updates session state to DISCONNECTED                      │
│   4. Node.js notifies MCP clients: "Godot disconnected"                 │
│   5. Web UI shows disconnected status                                   │
│   6. Node.js waits for reconnection (exponential backoff)               │
│                                                                          │
│ Scenario B: MCP client disconnects                                      │
│   1. VS Code extension stops (stdio closes)                             │
│   2. Node.js detects stdio close                                        │
│   3. Session remains active (Godot still connected)                     │
│   4. Other MCP clients can still connect                                │
│                                                                          │
│ Scenario C: Server shutdown                                             │
│   1. Admin sends SIGTERM to Node.js                                     │
│   2. Node.js sends SHUTDOWN to all Godot instances                      │
│   3. Node.js closes WebSocket server (no new connections)               │
│   4. Node.js waits up to 5s for acknowledgments                         │
│   5. Flushes logs, closes DB connections                                │
│   6. Exits with code 0                                                  │
│                                                                          │
│ 🎯 Output: Clean shutdown, no data loss                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

**Session State Machine**:
```
DISCONNECTED → (Godot connects) → CONNECTED
CONNECTED → (tool invocation) → ACTIVE
ACTIVE → (idle for 5min) → CONNECTED
CONNECTED → (Godot disconnects) → DISCONNECTED
CONNECTED → (heartbeat fails 3 times) → STALE
STALE → (reconnect within 5min) → CONNECTED
STALE → (timeout) → DISCONNECTED
```

---

### 3.4 Service Lifecycle Workflow

**Purpose**: Manage the startup, monitoring, and shutdown of all system components.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Bootstrap (Development Mode)                                   │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Developer runs: npm run dev                                          │
│ 2. Package.json script executes:                                        │
│    "dev": "concurrently \"npm:dev:server\" \"npm:dev:ui\""              │
│ 3. Starts Node.js server with hot reload (nodemon):                     │
│    - Watches src/**/*.ts                                                │
│    - Transpiles TypeScript                                              │
│    - Restarts on file changes                                           │
│ 4. Starts Web UI dev server (Vite):                                     │
│    - HMR enabled                                                        │
│    - Proxies API requests to Node.js                                    │
│ 5. Logs startup URLs:                                                   │
│    - MCP Server: stdio ready                                            │
│    - WebSocket: ws://localhost:3001                                     │
│    - Web UI: http://localhost:3000                                      │
│                                                                          │
│ 🎯 Manual step: Developer opens Godot Editor with project               │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Health Monitoring (Continuous)                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ Health check endpoints (HTTP):                                          │
│                                                                          │
│ GET /health                                                              │
│   Response:                                                              │
│   {                                                                      │
│     "status": "healthy",                                                 │
│     "version": "1.0.0",                                                  │
│     "uptime": 3600,                                                      │
│     "godotConnected": true,                                              │
│     "activeSessions": 1,                                                 │
│     "pendingRequests": 0                                                 │
│   }                                                                      │
│                                                                          │
│ GET /health/deep                                                         │
│   Checks:                                                                │
│   - WebSocket server responsive                                         │
│   - Godot responds to ping within 5s                                    │
│   - Disk space available (>1GB)                                         │
│   - Memory usage <80%                                                   │
│   - Response: detailed JSON with all checks                             │
│                                                                          │
│ Monitoring strategy:                                                     │
│ - Web UI polls /health every 5 seconds                                  │
│ - External monitors (if deployed) ping /health                          │
│ - Alerts on status change: healthy → unhealthy                          │
│                                                                          │
│ 🎯 Output: Real-time system health visibility                           │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 3: Error Recovery                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ Scenario A: Godot crashes                                               │
│   1. WebSocket connection closes unexpectedly                           │
│   2. Node.js detects close event                                        │
│   3. Logs error: "Godot disconnected unexpectedly (PID 12345)"          │
│   4. Updates Web UI: Shows reconnection in progress                     │
│   5. Attempts reconnection with exponential backoff                     │
│   6. If Godot restarts, Bridge auto-reconnects                          │
│   7. Session restored (or new session created)                          │
│                                                                          │
│ Scenario B: Node.js crashes                                             │
│   1. Process monitor (systemd, PM2, etc.) detects exit                  │
│   2. Automatically restarts Node.js                                     │
│   3. Node.js starts, initializes WebSocket server                       │
│   4. Godot Bridge detects reconnection opportunity                      │
│   5. Bridge reconnects, sends HELLO                                     │
│   6. New session established                                            │
│                                                                          │
│ Scenario C: Out of memory                                               │
│   1. Node.js memory usage approaches limit                              │
│   2. Monitoring detects high memory                                     │
│   3. Logs warning: "High memory usage (85%)"                            │
│   4. Triggers cache cleanup (evict old resources)                       │
│   5. If memory still high, graceful shutdown + restart                  │
│                                                                          │
│ 🎯 Output: Automatic recovery, minimal downtime                          │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Shutdown                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Trigger: SIGTERM, SIGINT, or manual shutdown                         │
│ 2. Node.js enters shutdown mode:                                        │
│    - Set flag: shuttingDown = true                                      │
│    - Reject new MCP connections                                         │
│    - Send SHUTDOWN to all Godot instances                               │
│ 3. Wait for in-flight requests (max 5s):                                │
│    - Track pending request count                                        │
│    - Allow requests to complete                                         │
│    - Timeout after 5s                                                   │
│ 4. Close WebSocket server:                                              │
│    - Disconnect all Godot clients                                       │
│    - Send close frame with reason code                                  │
│ 5. Close HTTP server (Web UI):                                          │
│    - Finish serving active requests                                     │
│    - Close listener socket                                              │
│ 6. Flush logs:                                                           │
│    - Write buffered log entries                                         │
│    - Close log file handles                                             │
│ 7. Exit with code 0 (or 1 if error)                                     │
│                                                                          │
│ Godot side:                                                              │
│ 1. Receives SHUTDOWN message                                            │
│ 2. Closes WebSocket connection                                          │
│ 3. Logs: "MCP Server shutting down"                                     │
│ 4. Cleans up Bridge state                                               │
│                                                                          │
│ 🎯 Output: Clean shutdown, no resource leaks                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Production Deployment** (systemd example):
```ini
[Unit]
Description=Godot MCP Server
After=network.target

[Service]
Type=simple
User=godot-mcp
WorkingDirectory=/opt/godot-mcp
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

---

### 3.5 Observability Flow (Events)

**Purpose**: Stream events from Godot to Node.js for monitoring, logging, and Web UI updates.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Event Source: Godot Engine                                              │
├──────────────────────────────────────────────────────────────────────────┤
│ Events emitted by Bridge:                                               │
│                                                                          │
│ 1. Scene Events:                                                         │
│    - "scene_opened": User opens scene in editor                         │
│    - "scene_saved": Scene saved to disk                                 │
│    - "scene_closed": Scene closed                                       │
│    - "node_added": Node added to scene tree                             │
│    - "node_removed": Node removed                                       │
│    - "node_renamed": Node name changed                                  │
│                                                                          │
│ 2. Resource Events:                                                      │
│    - "resource_created": New resource file created                      │
│    - "resource_modified": Resource file changed on disk                 │
│    - "resource_deleted": Resource file deleted                          │
│                                                                          │
│ 3. Build Events:                                                         │
│    - "build_started": Export/build started                              │
│    - "build_progress": Build progress update (%)                        │
│    - "build_completed": Build finished successfully                     │
│    - "build_failed": Build failed with errors                           │
│                                                                          │
│ 4. Error Events:                                                         │
│    - "error": Runtime error in GDScript                                 │
│    - "warning": Warning message                                         │
│                                                                          │
│ 🎯 All events include: timestamp, sessionId, eventType, payload         │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Event Transmission: Godot → Node.js (WebSocket)                         │
├──────────────────────────────────────────────────────────────────────────┤
│ Bridge sends event message:                                             │
│ {                                                                        │
│   "type": "event",                                                       │
│   "eventType": "node_added",                                             │
│   "timestamp": "2026-02-03T12:34:56.789Z",                               │
│   "sessionId": "session-uuid-9876",                                      │
│   "payload": {                                                           │
│     "nodePath": "/root/Main/Player",                                     │
│     "nodeType": "Sprite2D",                                              │
│     "parentPath": "/root/Main"                                           │
│   }                                                                      │
│ }                                                                        │
│                                                                          │
│ Rate limiting:                                                           │
│ - Batch high-frequency events (e.g., 10 node_added events/second)       │
│ - Debounce resource_modified events (max 1 per file per 100ms)          │
│                                                                          │
│ 🎯 Efficient event streaming                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Event Processing: Node.js MCP Server                                    │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Receive event from WebSocket                                         │
│ 2. Validate event structure                                             │
│ 3. Route to event handlers:                                             │
│                                                                          │
│    EventHandler.on("node_added", (event) => {                           │
│      // Cache invalidation                                              │
│      resourceCache.invalidate(`godot://scene/${event.scenePath}`);      │
│                                                                          │
│      // Logging                                                          │
│      logger.info("Node added", {                                        │
│        nodePath: event.payload.nodePath,                                │
│        nodeType: event.payload.nodeType,                                │
│        sessionId: event.sessionId                                       │
│      });                                                                 │
│                                                                          │
│      // Web UI update                                                   │
│      webUI.broadcast("scene_updated", event.payload);                   │
│                                                                          │
│      // Optional: Notify MCP clients (resource subscription)            │
│      if (hasResourceSubscribers(`godot://scene/${event.scenePath}`)) {  │
│        notifySubscribers(event);                                        │
│      }                                                                   │
│    });                                                                   │
│                                                                          │
│ 🎯 Multi-purpose event handling                                         │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Observability Outputs                                                   │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Structured Logging (Winston):                                        │
│    {                                                                     │
│      "level": "info",                                                    │
│      "timestamp": "2026-02-03T12:34:56.789Z",                            │
│      "message": "Node added",                                            │
│      "correlationId": "req-uuid-1234",                                   │
│      "sessionId": "session-uuid-9876",                                   │
│      "nodePath": "/root/Main/Player",                                    │
│      "nodeType": "Sprite2D"                                              │
│    }                                                                     │
│                                                                          │
│ 2. Web UI Updates (Server-Sent Events):                                 │
│    - Web UI connects to /events SSE endpoint                            │
│    - Node.js streams events to UI:                                      │
│      event: scene_updated                                               │
│      data: {"nodePath": "/root/Main/Player", ...}                       │
│    - Alpine.js updates DOM reactively                                   │
│                                                                          │
│ 3. Metrics (Optional):                                                   │
│    - Counter: godot_node_added_total                                    │
│    - Histogram: godot_tool_invocation_duration_ms                       │
│    - Gauge: godot_active_sessions                                       │
│    - Export via /metrics endpoint (Prometheus format)                   │
│                                                                          │
│ 🎯 Comprehensive observability                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Web UI Event Display** (Alpine.js example):
```html
<div x-data="observability()" x-init="connectToEventStream()">
  <h2>Recent Events</h2>
  <ul>
    <template x-for="event in events" :key="event.id">
      <li class="event" :class="`event-${event.type}`">
        <span class="timestamp" x-text="formatTime(event.timestamp)"></span>
        <span class="type" x-text="event.eventType"></span>
        <span class="details" x-text="event.summary"></span>
      </li>
    </template>
  </ul>
</div>

<script>
function observability() {
  return {
    events: [],
    eventSource: null,
    
    connectToEventStream() {
      this.eventSource = new EventSource('/events');
      this.eventSource.addEventListener('scene_updated', (e) => {
        const data = JSON.parse(e.data);
        this.events.unshift({
          id: Date.now(),
          timestamp: new Date(),
          eventType: 'Scene Updated',
          summary: `${data.nodePath} (${data.nodeType})`
        });
        if (this.events.length > 100) this.events.pop();
      });
    }
  }
}
</script>
```

---

### 3.6 Build/Export Workflow

**Purpose**: Trigger and monitor Godot project exports from MCP client.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Export Request (MCP Client → Node.js)                          │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. User invokes tool: godot_export_project                              │
│    Arguments:                                                            │
│    {                                                                     │
│      "preset": "Windows Desktop",                                        │
│      "outputPath": "builds/windows/game.exe",                            │
│      "debugMode": false                                                  │
│    }                                                                     │
│ 2. Node.js validates arguments                                          │
│ 3. Checks export preset exists in project                               │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Export Initiation (Node.js → Godot)                            │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Send WebSocket command:                                              │
│    {                                                                     │
│      "type": "command",                                                  │
│      "id": "export-uuid-4321",                                           │
│      "method": "project.export",                                         │
│      "params": {                                                         │
│        "preset": "Windows Desktop",                                      │
│        "path": "builds/windows/game.exe",                                │
│        "debug": false                                                    │
│      }                                                                   │
│    }                                                                     │
│ 2. Return immediately to MCP client:                                    │
│    "Export started. Monitor progress via events."                       │
│    (Non-blocking—export runs in background)                             │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 3: Export Execution (Godot)                                       │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Bridge receives export command                                       │
│ 2. Validates preset exists:                                             │
│    var presets := EditorExportPlatform.get_all_presets()                │
│    var preset := presets.find(func(p): return p.name == "Windows Desktop") │
│ 3. Initiates export (non-blocking via thread):                          │
│    EditorExport.export_project(preset, output_path, debug_mode)         │
│ 4. Monitors export progress:                                            │
│    - Connects to EditorExport signals                                   │
│    - Emits progress events: "build_progress" (0-100%)                   │
│ 5. On completion:                                                        │
│    - Emits "build_completed" with output file path                      │
│    - Or "build_failed" with error details                               │
│                                                                          │
│ ⏱️ Duration: 10s - 5min depending on project size                        │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Progress Streaming (Godot → Node.js → Client)                  │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Godot emits build_progress events (every 5%):                        │
│    {                                                                     │
│      "type": "event",                                                    │
│      "eventType": "build_progress",                                      │
│      "payload": {                                                        │
│        "exportId": "export-uuid-4321",                                   │
│        "progress": 45,                                                   │
│        "stage": "Compiling scripts"                                      │
│      }                                                                   │
│    }                                                                     │
│ 2. Node.js receives events, logs to console                             │
│ 3. Node.js streams to Web UI (SSE)                                      │
│ 4. Optional: Notify MCP client via resource subscription                │
│    (if client subscribed to build status resource)                      │
│                                                                          │
│ 🎯 Real-time progress visibility                                        │
└──────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ Stage 5: Completion (Godot → Node.js → Client)                          │
├──────────────────────────────────────────────────────────────────────────┤
│ Success:                                                                 │
│ 1. Godot emits build_completed:                                         │
│    {                                                                     │
│      "type": "event",                                                    │
│      "eventType": "build_completed",                                     │
│      "payload": {                                                        │
│        "exportId": "export-uuid-4321",                                   │
│        "outputPath": "C:/Projects/MyGame/builds/windows/game.exe",       │
│        "fileSize": 52428800,                                             │
│        "duration": 42.5                                                  │
│      }                                                                   │
│    }                                                                     │
│ 2. Node.js logs success                                                 │
│ 3. Web UI displays success notification                                 │
│ 4. MCP client can query build artifacts via resources                   │
│                                                                          │
│ Failure:                                                                 │
│ 1. Godot emits build_failed:                                            │
│    {                                                                     │
│      "type": "event",                                                    │
│      "eventType": "build_failed",                                        │
│      "payload": {                                                        │
│        "exportId": "export-uuid-4321",                                   │
│        "error": "Missing export templates for Windows Desktop",          │
│        "errorCode": "EXPORT_TEMPLATE_MISSING"                            │
│      }                                                                   │
│    }                                                                     │
│ 2. Node.js logs error with stack trace                                  │
│ 3. Web UI displays error notification                                   │
│ 4. User can retry with corrected parameters                             │
│                                                                          │
│ 🎯 Clear success/failure feedback                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Export Presets Discovery**:
```
Tool: godot_list_export_presets
Returns:
[
  {
    "name": "Windows Desktop",
    "platform": "Windows Desktop",
    "exportPath": "builds/windows/game.exe",
    "runnable": true
  },
  {
    "name": "Linux/X11",
    "platform": "Linux/X11",
    "exportPath": "builds/linux/game.x86_64",
    "runnable": true
  }
]
```

---

## 4. Dependencies & Execution Order

### 4.1 Component Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────┐
│ Startup Order (Critical Path)                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ 1. Node.js MCP Server                                              │
│    ├─> Load configuration                                          │
│    ├─> Initialize logging                                          │
│    ├─> Start WebSocket server       ← MUST complete before step 2 │
│    ├─> Start HTTP server (Web UI)                                  │
│    └─> Register MCP tools/resources                                │
│         └─> READY for Godot connection                             │
│                                                                     │
│ 2. Godot Engine + Bridge                                           │
│    ├─> Launch Godot Editor          ← Can start independently     │
│    ├─> Load project                                                │
│    ├─> Initialize Bridge autoload                                  │
│    └─> Connect to WebSocket server  ← Requires step 1 complete    │
│         └─> READY for MCP clients                                  │
│                                                                     │
│ 3. MCP Client (VS Code)                                            │
│    ├─> Spawn Node.js server (stdio) ← Requires step 1 available   │
│    ├─> Initialize MCP protocol                                     │
│    └─> Query tools/resources        ← Requires step 2 complete    │
│         └─> READY for user commands                                │
│                                                                     │
│ 4. Web UI (Browser)                                                │
│    ├─> Navigate to http://localhost:3000                           │
│    ├─> Load HTML/CSS/JS                                            │
│    └─> Connect to SSE endpoint      ← Requires step 1 complete    │
│         └─> READY for monitoring                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Relaxed Dependencies:
- Web UI can start before Godot (shows "Not Connected" state)
- MCP Client can connect before Godot (tools disabled until Godot ready)
- Multiple MCP Clients can connect independently
```

### 4.2 Operation Dependencies

| Operation | Requires | Can Proceed Without |
|-----------|----------|---------------------|
| **Tool Invocation** | Godot connected, session active | Web UI |
| **Resource Query** | Godot connected | Web UI, cached resources can be served |
| **Event Streaming** | Godot connected, WebSocket open | MCP clients (events still logged) |
| **Web UI Display** | HTTP server running | Godot connection (shows disconnected) |
| **Session Management** | WebSocket server running | Active Godot connection |
| **Health Checks** | HTTP server running | Godot connection (returns unhealthy) |

### 4.3 Data Flow Dependencies

```
User Request (MCP Client)
  ↓ depends on
MCP Server Session
  ↓ depends on
WebSocket Connection
  ↓ depends on
Godot Bridge Initialized
  ↓ depends on
Godot Engine Running
  ↓ depends on
Valid Project Loaded
```

**Implication**: If any dependency in the chain fails, upstream requests fail gracefully with informative errors.

---

## 5. Integration Points

### 5.1 Node.js ↔ Godot Bridge

**Integration Type**: Bidirectional WebSocket communication

**Node.js Side**:
- **Library**: `ws` (WebSocket server)
- **Port**: 3001 (configurable via environment variable)
- **Message Format**: JSON with type field (`command`, `response`, `event`)
- **Connection Handling**: One WebSocket per Godot instance
- **State Tracking**: Session manager maps WebSocket connections to sessions

**Godot Side**:
- **API**: WebSocketClient node (built-in Godot 4.6)
- **Connection URL**: `ws://localhost:3001`
- **Reconnection**: Automatic via `WebSocketClient.poll()` and error handling
- **Message Format**: JSON dictionaries (parsed with `JSON.parse_string()`)

**Shared Protocol**:
```typescript
// TypeScript (Node.js)
interface Command {
  type: 'command';
  id: string; // UUID
  method: string; // e.g., "node.create"
  params: Record<string, any>;
}

interface Response {
  type: 'response';
  id: string; // Matches command ID
  success: boolean;
  result?: any;
  error?: { code: string; message: string; };
}

interface Event {
  type: 'event';
  eventType: string; // e.g., "node_added"
  timestamp: string; // ISO 8601
  sessionId: string;
  payload: Record<string, any>;
}
```

```gdscript
# GDScript (Godot)
class_name MCPMessage

enum Type { COMMAND, RESPONSE, EVENT, HELLO, GOODBYE, PING, PONG }

static func create_command(id: String, method: String, params: Dictionary) -> Dictionary:
    return {
        "type": "command",
        "id": id,
        "method": method,
        "params": params
    }

static func create_response(id: String, success: bool, result: Variant = null, error: Dictionary = {}) -> Dictionary:
    var resp := { "type": "response", "id": id, "success": success }
    if success:
        resp["result"] = result
    else:
        resp["error"] = error
    return resp
```

---

### 5.2 MCP SDK ↔ Node.js Application

**Integration Type**: MCP SDK as a library

**Implementation**:
```typescript
// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  {
    name: "godot-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: { subscribe: true },
      prompts: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "godot_create_node",
        description: "Create a new node in the scene tree",
        inputSchema: {
          type: "object",
          properties: {
            nodeType: { type: "string", description: "Godot node class name" },
            parentPath: { type: "string", description: "Path to parent node" },
            nodeName: { type: "string", description: "Name for new node" },
          },
          required: ["nodeType", "parentPath", "nodeName"],
        },
      },
      // ... more tools
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  // Route to Godot bridge
  const result = await godotBridge.executeCommand(name, args);
  
  return {
    content: [
      {
        type: "text",
        text: result.message,
      },
    ],
  };
});

// Start server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Key Integration Points**:
- `server.setRequestHandler()` - Register handlers for MCP methods
- Tool handlers call `godotBridge.executeCommand()` to forward to Godot
- Resource handlers query cached data or forward to Godot
- Lifecycle hooks for initialization and shutdown

---

### 5.3 Node.js ↔ Web UI

**Integration Type**: HTTP REST API + Server-Sent Events (SSE)

**HTTP Endpoints** (Express.js):
```typescript
// src/routes/health.ts
app.get('/health', (req, res) => {
  res.json({
    status: godotBridge.isConnected() ? 'healthy' : 'degraded',
    version: '1.0.0',
    uptime: process.uptime(),
    godotConnected: godotBridge.isConnected(),
    activeSessions: sessionManager.getActiveCount(),
  });
});

// src/routes/sessions.ts
app.get('/api/sessions', (req, res) => {
  const sessions = sessionManager.getAll();
  res.json({ sessions });
});

// src/routes/tools.ts
app.get('/api/tools', (req, res) => {
  const tools = toolRegistry.list();
  res.json({ tools });
});

// src/routes/events.ts (SSE)
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const listener = (event: GodotEvent) => {
    res.write(`event: ${event.eventType}\n`);
    res.write(`data: ${JSON.stringify(event.payload)}\n\n`);
  };
  
  eventBus.on('*', listener);
  
  req.on('close', () => {
    eventBus.off('*', listener);
  });
});
```

**Web UI Consumption** (Alpine.js + Fetch):
```html
<div x-data="dashboard()" x-init="init()">
  <div class="status" :class="status === 'healthy' ? 'bg-green-500' : 'bg-red-500'">
    <span x-text="status === 'healthy' ? 'Connected' : 'Disconnected'"></span>
  </div>
  
  <div class="sessions">
    <h2>Active Sessions</h2>
    <ul>
      <template x-for="session in sessions" :key="session.id">
        <li x-text="`${session.id} - ${session.projectPath}`"></li>
      </template>
    </ul>
  </div>
</div>

<script>
function dashboard() {
  return {
    status: 'disconnected',
    sessions: [],
    eventSource: null,
    
    async init() {
      await this.fetchStatus();
      await this.fetchSessions();
      this.connectEvents();
      
      // Poll status every 5 seconds
      setInterval(() => this.fetchStatus(), 5000);
    },
    
    async fetchStatus() {
      const res = await fetch('/health');
      const data = await res.json();
      this.status = data.status;
    },
    
    async fetchSessions() {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      this.sessions = data.sessions;
    },
    
    connectEvents() {
      this.eventSource = new EventSource('/events');
      this.eventSource.addEventListener('session_connected', (e) => {
        this.fetchSessions(); // Refresh session list
      });
    }
  }
}
</script>
```

---

### 5.4 VS Code ↔ MCP Extension ↔ Node.js

**Integration Type**: MCP extension spawns Node.js server via stdio

**VS Code MCP Extension Configuration** (`.vscode/mcp.json`):
```json
{
  "servers": {
    "godot-mcp": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "${workspaceFolder}/godot-mcp-server",
      "env": {
        "NODE_ENV": "production",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Data Flow**:
1. User opens VS Code with workspace containing Godot project
2. MCP extension reads `.vscode/mcp.json`
3. Extension spawns `node dist/index.js` as subprocess
4. Extension communicates via stdin/stdout using JSON-RPC
5. Node.js server handles MCP protocol via MCP SDK
6. Server forwards tool calls to Godot via WebSocket
7. Responses flow back through the chain

**Error Handling**:
- If Node.js server crashes, extension detects exit code
- Extension shows notification: "MCP server exited unexpectedly"
- User can restart server via command palette

---

## 6. Data Flow Diagrams

### 6.1 Tool Invocation Data Flow

```
INPUT: User types "Create a Sprite2D node named Player in Main"

┌─────────────────────────────────────────────────────────────────┐
│ 1. VS Code UI                                                   │
│    User input: Natural language or direct tool call             │
│    ↓                                                             │
│    Transformed to MCP tool call:                                │
│    {                                                             │
│      method: "tools/call",                                       │
│      params: {                                                   │
│        name: "godot_create_node",                                │
│        arguments: {                                              │
│          nodeType: "Sprite2D",                                   │
│          parentPath: "/root/Main",                               │
│          nodeName: "Player"                                      │
│        }                                                         │
│      }                                                           │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘
                          ↓ (JSON over stdio)
┌─────────────────────────────────────────────────────────────────┐
│ 2. Node.js MCP Server (MCP SDK)                                 │
│    Receives JSON-RPC message via stdio                          │
│    ↓                                                             │
│    MCP SDK parses and routes to CallToolRequestSchema handler   │
│    ↓                                                             │
│    Handler validates arguments with Zod:                        │
│    const argsSchema = z.object({                                │
│      nodeType: z.string().min(1),                               │
│      parentPath: z.string().regex(/^\/root\/.+/),               │
│      nodeName: z.string().regex(/^[a-zA-Z0-9_]+$/)              │
│    });                                                           │
│    ↓                                                             │
│    Checks session: Is Godot connected?                          │
│    ↓                                                             │
│    Transforms to Godot command format:                          │
│    {                                                             │
│      type: "command",                                            │
│      id: "uuid-1234",                                            │
│      method: "node.create",                                      │
│      params: { type: "Sprite2D", parent: "/root/Main", name: "Player" } │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘
                          ↓ (JSON over WebSocket)
┌─────────────────────────────────────────────────────────────────┐
│ 3. Godot Bridge (GDScript)                                      │
│    Receives WebSocket message                                   │
│    ↓                                                             │
│    Parses JSON: var msg := JSON.parse_string(data)              │
│    ↓                                                             │
│    Routes to command handler:                                   │
│    CommandRegistry.execute("node.create", msg.params)           │
│    ↓                                                             │
│    Executes Godot API:                                          │
│    var parent := get_node("/root/Main")                         │
│    var node := Sprite2D.new()                                   │
│    node.name = "Player"                                         │
│    parent.add_child(node)                                       │
│    node.owner = get_tree().edited_scene_root                    │
│    ↓                                                             │
│    Captures result:                                             │
│    {                                                             │
│      nodePath: node.get_path(),                                 │
│      nodeType: node.get_class(),                                │
│      instanceId: node.get_instance_id()                         │
│    }                                                             │
│    ↓                                                             │
│    Constructs response:                                         │
│    {                                                             │
│      type: "response",                                           │
│      id: "uuid-1234",                                            │
│      success: true,                                             │
│      result: { nodePath: "/root/Main/Player", ... }             │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘
                          ↓ (JSON over WebSocket)
┌─────────────────────────────────────────────────────────────────┐
│ 4. Node.js MCP Server (Response Handler)                        │
│    Receives response via WebSocket                              │
│    ↓                                                             │
│    Matches response.id to pending request                       │
│    ↓                                                             │
│    Transforms to MCP response:                                  │
│    {                                                             │
│      content: [                                                  │
│        {                                                         │
│          type: "text",                                           │
│          text: "Created Sprite2D node 'Player' at /root/Main/Player" │
│        },                                                        │
│        {                                                         │
│          type: "resource",                                       │
│          resource: {                                             │
│            uri: "godot://node/root/Main/Player",                 │
│            name: "Player (Sprite2D)",                            │
│            mimeType: "application/x-godot-node"                  │
│          }                                                       │
│        }                                                         │
│      ]                                                           │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘
                          ↓ (JSON over stdio)
┌─────────────────────────────────────────────────────────────────┐
│ 5. VS Code MCP Extension                                        │
│    Receives JSON-RPC response                                   │
│    ↓                                                             │
│    Parses content array                                         │
│    ↓                                                             │
│    Displays in chat UI:                                         │
│    ✓ Created Sprite2D node 'Player' at /root/Main/Player        │
│    🔗 [View Node Resource]                                       │
└─────────────────────────────────────────────────────────────────┘

OUTPUT: User sees success message, node created in Godot scene tree

TRANSFORMATIONS:
- Natural language → Structured tool call (VS Code)
- MCP format → Godot command format (Node.js)
- Godot API result → MCP response format (Node.js)
- MCP response → UI display (VS Code)

DATA ENRICHMENT:
- Node.js adds: Request ID, timestamp, session ID
- Godot adds: Instance ID, full node path, class metadata
- Node.js adds: Resource URI for further queries
```

---

### 6.2 Event Streaming Data Flow

```
TRIGGER: User adds a node manually in Godot Editor

┌─────────────────────────────────────────────────────────────────┐
│ 1. Godot Editor (SceneTree)                                     │
│    User drags Sprite2D from node panel into scene               │
│    ↓                                                             │
│    SceneTree emits signal: node_added(node: Node)               │
│    ↓                                                             │
│    Bridge connects to signal in _ready():                       │
│    get_tree().connect("node_added", _on_node_added)             │
└─────────────────────────────────────────────────────────────────┘
                          ↓ (Signal callback)
┌─────────────────────────────────────────────────────────────────┐
│ 2. Bridge Event Handler (GDScript)                              │
│    func _on_node_added(node: Node):                             │
│      var event := {                                             │
│        "type": "event",                                          │
│        "eventType": "node_added",                                │
│        "timestamp": Time.get_datetime_string_from_system(),      │
│        "sessionId": session_id,                                  │
│        "payload": {                                              │
│          "nodePath": node.get_path(),                            │
│          "nodeType": node.get_class(),                           │
│          "parentPath": node.get_parent().get_path(),             │
│          "instanceId": node.get_instance_id()                    │
│        }                                                         │
│      }                                                           │
│      websocket.send_text(JSON.stringify(event))                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓ (JSON over WebSocket)
┌─────────────────────────────────────────────────────────────────┐
│ 3. Node.js Event Bus                                            │
│    WebSocket message handler receives event                     │
│    ↓                                                             │
│    Validates event structure                                    │
│    ↓                                                             │
│    Emits to internal event bus:                                 │
│    eventBus.emit('node_added', event);                          │
│    ↓                                                             │
│    Multiple listeners react:                                    │
│                                                                  │
│    Listener 1: Cache Invalidation                               │
│      resourceCache.invalidate(`godot://scene/${scenePath}`);    │
│                                                                  │
│    Listener 2: Structured Logging                               │
│      logger.info('Node added', {                                │
│        nodePath: event.payload.nodePath,                        │
│        correlationId: event.sessionId                           │
│      });                                                         │
│                                                                  │
│    Listener 3: Web UI Broadcast                                 │
│      sseClients.forEach(client => {                             │
│        client.write(`event: node_added\n`);                     │
│        client.write(`data: ${JSON.stringify(event.payload)}\n\n`); │
│      });                                                         │
│                                                                  │
│    Listener 4: MCP Resource Subscription (Optional)             │
│      if (hasSubscribers(`godot://scene/${scenePath}`)) {        │
│        mcpServer.notifyResourceUpdated(uri);                    │
│      }                                                           │
└─────────────────────────────────────────────────────────────────┘
                          ↓ (Server-Sent Events)
┌─────────────────────────────────────────────────────────────────┐
│ 4. Web UI (Alpine.js)                                           │
│    EventSource receives SSE message                             │
│    ↓                                                             │
│    eventSource.addEventListener('node_added', (e) => {          │
│      const data = JSON.parse(e.data);                           │
│      this.events.unshift({                                      │
│        id: Date.now(),                                          │
│        type: 'Node Added',                                      │
│        details: `${data.nodePath} (${data.nodeType})`          │
│      });                                                         │
│    });                                                           │
│    ↓                                                             │
│    Alpine.js reactivity updates DOM                             │
│    ↓                                                             │
│    UI displays:                                                  │
│    [12:34:56] Node Added: /root/Main/Sprite2D (Sprite2D)        │
└─────────────────────────────────────────────────────────────────┘

OUTPUT: Real-time event visible in Web UI, cache invalidated, logs recorded

DATA FLOW SUMMARY:
- Godot Signal → Bridge Handler → JSON Serialization → WebSocket
- Node.js EventBus → Multiple Listeners (cache, logs, Web UI, MCP)
- SSE → Web UI → DOM Update

PARALLELISM:
- All event listeners execute concurrently (non-blocking)
- Web UI update doesn't block logging or cache invalidation
- Multiple SSE clients receive events simultaneously
```

---

## 7. Concurrency & Parallelism

### 7.1 Parallel Operations

**Scenarios that can run in parallel**:

1. **Multiple MCP Clients**:
   - Multiple VS Code instances can connect to the same Node.js server
   - Each client has its own stdio connection
   - Tool calls from different clients are processed concurrently
   - Node.js uses async/await (non-blocking I/O) to handle concurrent requests

2. **Event Streaming + Tool Invocations**:
   - Godot can send events while processing tool commands
   - WebSocket is full-duplex (send/receive simultaneously)
   - Node.js event loop handles both streams independently

3. **Web UI + MCP Operations**:
   - Web UI queries (HTTP/SSE) run independently of MCP tool calls
   - Different Node.js request handlers, no shared locks

4. **Resource Caching + Live Queries**:
   - Cached resource reads serve immediately
   - Fresh resource queries to Godot run async
   - Cache invalidation happens in background (event listener)

5. **Logging + Core Operations**:
   - Winston logger uses async I/O (non-blocking)
   - Log writes don't block tool invocations or events

**Implementation Pattern** (Node.js):
```typescript
// Concurrent tool invocations
async function handleToolCall(request: CallToolRequest): Promise<ToolResponse> {
  const { name, arguments: args } = request.params;
  
  // All tool calls are async (non-blocking)
  const result = await godotBridge.executeCommand(name, args);
  
  // Meanwhile, other tool calls can execute concurrently
  return { content: [{ type: "text", text: result.message }] };
}

// Concurrent event handling
eventBus.on('node_added', async (event) => {
  // Fire and forget (non-blocking)
  await Promise.all([
    cache.invalidate(event.scenePath),
    logger.info('Node added', event),
    webUI.broadcast(event),
  ]);
});
```

---

### 7.2 Sequential Operations (Must be Serialized)

**Scenarios that require serialization**:

1. **Godot Scene Tree Modifications**:
   - Godot is single-threaded (main thread)
   - Node add/remove operations must execute sequentially
   - Example: Can't add two children to same parent simultaneously
   - **Mitigation**: Bridge queues commands, executes one at a time

2. **WebSocket Connection Initialization**:
   - HELLO → SESSION_START handshake must complete before tool calls
   - Can't send commands before session established
   - **Enforcement**: Node.js rejects tool calls if session not CONNECTED

3. **Resource File Writes**:
   - Godot resource system is not thread-safe for writes
   - Save operations must be serialized per file
   - **Mitigation**: Bridge locks per-file during save operations

4. **Export/Build Operations**:
   - Godot can only run one export at a time (EditorExportPlatform limitation)
   - **Enforcement**: Bridge rejects new export requests if one in progress

**Implementation Pattern** (GDScript):
```gdscript
# Bridge command queue
class_name MCPBridge extends Node

var _command_queue: Array[Dictionary] = []
var _processing_command: bool = false

func _on_websocket_message(data: String) -> void:
    var msg := JSON.parse_string(data) as Dictionary
    if msg.type == "command":
        _command_queue.append(msg)
        _process_next_command()

func _process_next_command() -> void:
    if _processing_command or _command_queue.is_empty():
        return
    
    _processing_command = true
    var cmd := _command_queue.pop_front()
    
    # Execute command (blocking Godot main thread)
    var result := _execute_command(cmd)
    
    # Send response
    _send_response(cmd.id, result)
    
    _processing_command = false
    
    # Process next command (if any)
    _process_next_command()
```

---

### 7.3 Concurrency Limits & Rate Limiting

**Rate Limiting Strategy**:

| Operation Type | Limit | Reasoning |
|----------------|-------|-----------|
| **Tool Invocations** | 100 requests/minute per client | Prevent abuse, protect Godot stability |
| **Resource Queries** | 1000 requests/minute per client | Higher limit (read-only, cacheable) |
| **Event Streaming** | 1000 events/minute per session | Batch high-frequency events |
| **Web UI SSE Connections** | 10 connections per IP | Prevent DoS on SSE endpoints |

**Implementation** (Node.js with rate-limit middleware):
```typescript
import rateLimit from 'express-rate-limit';

const toolRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyGenerator: (req) => req.mcpClientId, // Per MCP client
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { clientId: req.mcpClientId });
    res.status(429).json({ error: 'Too many requests' });
  },
});

app.use('/api/tools', toolRateLimiter);
```

---

## 8. Performance Characteristics

### 8.1 Latency Breakdown

| Operation | Component | Typical Latency | Notes |
|-----------|-----------|-----------------|-------|
| **Tool Call (End-to-End)** | Full pipeline | **20-80ms** | Highly optimized path |
| ├─ MCP Client → Node.js | stdio | 1-2ms | Local IPC |
| ├─ Node.js validation | CPU | 2-5ms | Zod schema validation |
| ├─ Node.js → Godot | WebSocket | 1-5ms | Local network stack |
| ├─ Godot API execution | Engine | 5-50ms | Varies by operation |
| ├─ Godot → Node.js | WebSocket | 1-5ms | Response serialization |
| └─ Node.js → MCP Client | stdio | 1-2ms | JSON serialization |
| **Resource Query (Cached)** | Node.js | **<1ms** | In-memory cache hit |
| **Resource Query (Uncached)** | Full pipeline | **10-100ms** | Depends on resource size |
| **Event Streaming** | Godot → Web UI | **5-20ms** | Low latency (WebSocket + SSE) |
| **Heartbeat Round-Trip** | WebSocket | **2-10ms** | Keepalive ping/pong |

### 8.2 Throughput

| Metric | Capacity | Bottleneck |
|--------|----------|------------|
| **Concurrent MCP Clients** | 10-50 | Node.js event loop, Godot thread |
| **Tool Invocations/Second** | 50-200 | Godot single-threaded execution |
| **Events/Second** | 1000+ | WebSocket + Node.js event bus |
| **Resource Cache Size** | 100-1000 entries | Memory (configurable TTL) |
| **Web UI SSE Clients** | 100+ | Node.js connection limits |

### 8.3 Scalability Considerations

**Current Design** (Single Node.js + Single Godot):
- **Vertical Scaling**: Limited by Godot's single-threaded architecture
- **Horizontal Scaling**: Not supported (one Godot instance per Node.js server)

**Future Enhancements**:
1. **Multi-Godot Support**: One Node.js server managing multiple Godot instances
   - Use case: Multi-project development, parallel builds
   - Requires: Session routing by project path

2. **Distributed Architecture**: Multiple Node.js servers + load balancer
   - Use case: Team collaboration, cloud deployment
   - Requires: Shared state (Redis), sticky sessions

3. **Read Replicas**: Cache Godot state in Redis for fast queries
   - Use case: High read volume (resource queries)
   - Requires: Event-driven cache invalidation

---

## 9. Error Scenarios & Recovery

### 9.1 Common Error Scenarios

| Error | Cause | Detection | Recovery |
|-------|-------|-----------|----------|
| **Godot Crash** | Engine bug, out of memory | WebSocket disconnect | Reconnect with backoff, notify clients |
| **WebSocket Timeout** | Network issue, Godot hang | No response in 30s | Retry command, mark session STALE |
| **Invalid Tool Arguments** | Client error, validation failure | Zod schema validation | Return error to client, log warning |
| **Node Not Found** | Invalid path, scene not loaded | Godot API returns null | Return structured error with suggestions |
| **Resource Load Failure** | File not found, corrupted file | Godot `load()` returns null | Return error, suggest `godot_list_resources` |
| **Export Template Missing** | Godot export config incomplete | EditorExport error | Return actionable error (download link) |
| **Rate Limit Exceeded** | Client spam, infinite loop | Rate limiter middleware | Return 429 error, suggest backoff |

### 9.2 Circuit Breaker Pattern

**Scenario**: Godot becomes unresponsive (hang, infinite loop)

**Implementation**:
```typescript
class GodotCircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  
  async executeCommand(cmd: Command): Promise<Response> {
    if (this.state === 'OPEN') {
      // Circuit open: Fail fast
      if (Date.now() - this.lastFailureTime < 60000) { // 1 minute
        throw new Error('Circuit breaker OPEN: Godot unresponsive');
      }
      // Try to recover
      this.state = 'HALF_OPEN';
    }
    
    try {
      const result = await this.sendToGodot(cmd);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= 5) {
      this.state = 'OPEN'; // Trip circuit breaker
      logger.error('Circuit breaker OPEN: Too many failures');
      // Notify Web UI, attempt Godot restart (optional)
    }
  }
}
```

---

## 10. Security Considerations

### 10.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| **Malicious MCP Client** | Rate limiting, input validation (Zod), tool authorization |
| **Command Injection** | Validate all paths/names, never use `eval()` or `execute()` with user input |
| **Path Traversal** | Restrict file access to project directory, validate `res://` paths |
| **Resource Exhaustion** | Limit cache size, timeout long operations, rate limit requests |
| **Unauthorized Access** | Optional authentication (API key, OAuth), session tokens |
| **Man-in-the-Middle** | Use `wss://` (WebSocket Secure) for remote deployments |

### 10.2 Input Validation

**All tool arguments validated with Zod**:
```typescript
const CreateNodeArgsSchema = z.object({
  nodeType: z.string()
    .min(1)
    .regex(/^[A-Z][a-zA-Z0-9]*$/) // Valid Godot class name
    .refine(type => GodotClassRegistry.exists(type), {
      message: 'Unknown Godot class',
    }),
  parentPath: z.string()
    .regex(/^\/root\/[a-zA-Z0-9_/]+$/), // Valid scene path
  nodeName: z.string()
    .regex(/^[a-zA-Z0-9_]+$/), // Valid identifier
});
```

**Godot side validation**:
```gdscript
func _validate_node_path(path: String) -> bool:
    # Prevent directory traversal
    if path.contains(".."):
        push_error("Invalid path: contains '..'")
        return false
    
    # Must start with /root/ (scene tree root)
    if not path.begins_with("/root/"):
        push_error("Invalid path: must start with /root/")
        return false
    
    return true
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

**Node.js**:
- Test tool handlers with mock GodotBridge
- Test validation schemas (Zod)
- Test error handling paths

**Godot (GDScript)**:
- Test Bridge command handlers
- Test message serialization/deserialization
- Test reconnection logic

### 11.2 Integration Tests

**WebSocket Communication**:
```typescript
// Node.js test
describe('WebSocket Bridge', () => {
  it('should execute tool call via WebSocket', async () => {
    // Start mock Godot WebSocket client
    const mockGodot = new MockGodotClient('ws://localhost:3001');
    await mockGodot.connect();
    
    // Send HELLO
    await mockGodot.sendHello();
    
    // Execute tool via MCP server
    const result = await mcpServer.executeTool('godot_create_node', {
      nodeType: 'Sprite2D',
      parentPath: '/root/Main',
      nodeName: 'Test',
    });
    
    // Verify command sent to Godot
    expect(mockGodot.receivedCommands).toHaveLength(1);
    expect(mockGodot.receivedCommands[0].method).toBe('node.create');
    
    // Mock Godot response
    mockGodot.sendResponse({ success: true, result: { nodePath: '/root/Main/Test' } });
    
    // Verify MCP response
    expect(result.content[0].text).toContain('Created Sprite2D');
  });
});
```

### 11.3 End-to-End Tests

**Automated Godot Headless**:
```bash
# Run Godot in headless mode with test scene
godot --headless --path ./test-project --script test_bridge.gd

# Test script connects to Node.js, executes commands, validates responses
```

---

## 12. Deployment Architecture

### 12.1 Development Mode

```
Developer Machine:
  ├─ Node.js MCP Server (npm run dev)
  ├─ Godot Editor (manual launch)
  └─ VS Code + MCP Extension
```

### 12.2 Production Mode (Team Collaboration)

```
Cloud Server:
  ├─ Node.js MCP Server (systemd service)
  ├─ Godot Headless (automated launch)
  ├─ Redis (session state, caching)
  ├─ Nginx (reverse proxy, TLS termination)
  └─ Monitoring (Prometheus, Grafana)

Developer Machines:
  └─ VS Code + MCP Extension (connects remotely via WSS)
```

---

## 13. Summary & Recommendations

### 13.1 Key Architectural Decisions

1. **Communication Pattern**: **WebSocket** (bidirectional, low-latency, native support)
2. **Serialization Format**: **JSON** (v1), **MessagePack** (v2 optimization)
3. **Transport for MCP**: **stdio** (VS Code spawns Node.js server)
4. **Session Management**: Stateful WebSocket connections with reconnection logic
5. **Observability**: Event streaming via WebSocket + SSE to Web UI
6. **Error Handling**: Circuit breaker pattern, structured errors, retries

### 13.2 Critical Success Factors

- **Reliability**: Robust reconnection logic, circuit breaker, comprehensive error handling
- **Performance**: <80ms end-to-end latency for typical tool calls
- **Developer Experience**: Clear error messages, Web UI for monitoring, easy debugging
- **Scalability**: Design supports future multi-Godot and distributed architectures

### 13.3 Implementation Priorities

**Phase 1 (MVP)**:
1. WebSocket bridge (Node.js ↔ Godot)
2. Core MCP tools (node manipulation, resource queries)
3. Basic Web UI (connection status, event log)
4. Session lifecycle management

**Phase 2 (Enhancements)**:
1. Resource caching and invalidation
2. Observability pipeline (structured logging, metrics)
3. Export/build workflow
4. Comprehensive error handling

**Phase 3 (Production-Ready)**:
1. Authentication and authorization
2. Rate limiting and security hardening
3. Multi-Godot session support
4. Performance optimization (MessagePack, connection pooling)

---

## Appendix A: Message Protocol Specification

### Command Message
```typescript
{
  type: 'command',
  id: string, // UUID v4
  method: string, // Dot-separated: "node.create", "resource.read"
  params: Record<string, any>,
  timeout?: number, // Optional timeout in ms (default: 30000)
}
```

### Response Message
```typescript
{
  type: 'response',
  id: string, // Matches command ID
  success: boolean,
  result?: any, // Present if success=true
  error?: {
    code: string, // Machine-readable error code
    message: string, // Human-readable message
    details?: Record<string, any>, // Additional context
  },
  duration?: number, // Execution time in ms
}
```

### Event Message
```typescript
{
  type: 'event',
  eventType: string, // E.g., "node_added", "build_completed"
  timestamp: string, // ISO 8601
  sessionId: string,
  payload: Record<string, any>,
}
```

---

## Appendix B: Tool Catalog (Examples)

| Tool Name | Description | Arguments | Returns |
|-----------|-------------|-----------|---------|
| `godot_create_node` | Create node in scene tree | `nodeType`, `parentPath`, `nodeName` | Node path, instance ID |
| `godot_delete_node` | Remove node from scene | `nodePath` | Success confirmation |
| `godot_get_node_properties` | Query node properties | `nodePath` | Property dictionary |
| `godot_set_node_property` | Update node property | `nodePath`, `property`, `value` | Success confirmation |
| `godot_list_scenes` | List all scene files | `filter` (optional) | Array of scene paths |
| `godot_open_scene` | Open scene in editor | `scenePath` | Success confirmation |
| `godot_save_scene` | Save current scene | None | File path |
| `godot_export_project` | Export project build | `preset`, `outputPath` | Export status (async) |
| `godot_run_script` | Execute GDScript code | `script` (string) | Execution result |

---

**END OF DOCUMENT**

---

This comprehensive workflow architecture document provides the foundation for implementing the Godot MCP Server. The WebSocket-based communication pattern offers the optimal balance of performance, reliability, and developer experience for this use case.
