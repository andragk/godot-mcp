---
title: Architectural Decision Records (ADRs)
description: Key architectural decisions for the Godot MCP Server with rationale, trade-offs, and consequences
outline: [2, 3]
---

# Architectural Decision Records

This document captures the key architectural decisions made during the design of the Godot MCP Server, including the context, options considered, and rationale for each choice.

## ADR-001: GDScript vs GDExtension for Godot Bridge

**Status:** Accepted  
**Date:** February 3, 2026  
**Decision Makers:** @architecture-team

### Context

The Godot Bridge needs to expose engine capabilities via HTTP. We must choose between:
- **GDScript**: Native scripting language, interpreted
- **GDExtension**: C++ native extensions, compiled

### Decision

**Use GDScript for MVP (Phase 1)**. Benchmark early; pivot to GDExtension only if performance bottlenecks are identified.

### Rationale

**GDScript Advantages:**
- ✅ **No build toolchain**: No C++ compiler, SCons, or platform-specific builds required
- ✅ **Hot-reload**: Instant testing during development
- ✅ **Easy debugging**: GDScript debugger built into Godot Editor
- ✅ **Simpler maintenance**: No memory management, no platform-specific code
- ✅ **Sufficient performance**: HTTP server is I/O-bound, not CPU-bound
- ✅ **Faster development**: Write and test immediately

**GDExtension Disadvantages:**
- ❌ **Complex setup**: Requires C++ environment, build scripts, cross-platform compilation
- ❌ **Overkill for MVP**: HTTP operations are not computationally expensive
- ❌ **Harder debugging**: Requires GDB/LLDB, no hot-reload
- ❌ **Maintenance burden**: Memory leaks, crashes, ABI compatibility issues

### Performance Validation

**Benchmark Criteria** (Week 1 of implementation):
- HTTP throughput: ≥50 requests/second
- CPU usage: ≤10% during typical operations
- Latency: <50ms p99 for read operations

**Decision Rule:**
```
IF (throughput < 50 req/s OR cpu_usage > 10% OR p99_latency > 50ms)
THEN pivot to GDExtension in Phase 2
ELSE continue with GDScript
```

### Consequences

**Positive:**
- Faster development cycle (no compilation)
- Lower barrier to entry for contributors
- Easier to test and debug

**Negative:**
- Potential performance limitations at scale
- May need to rewrite in C++ if bottlenecks emerge

**Mitigation:**
- Early performance benchmarking (Sprint 1)
- Architecture allows gradual migration to GDExtension if needed

---

## ADR-002: HTTP REST vs WebSockets

**Status:** Accepted  
**Date:** February 3, 2026

### Context

Communication between Node.js MCP Server and Godot Bridge requires a transport protocol. Options:
- **HTTP REST**: Request-response, stateless
- **WebSockets**: Bi-directional, persistent connection

### Decision

**Use HTTP REST with JSON-RPC 2.0 for MVP**. Add WebSocket support in Phase 2 for real-time events (optional).

### Rationale

**HTTP REST Advantages:**
- ✅ **Simplicity**: Standard request-response model, well-understood
- ✅ **Stateless**: No connection management, automatic recovery
- ✅ **Debuggable**: Easy to test with curl, Postman, browser devtools
- ✅ **Caching**: Can leverage HTTP caching headers (Phase 2)
- ✅ **Connection pooling**: undici provides keep-alive for performance

**WebSocket Disadvantages:**
- ❌ **Complexity**: Connection lifecycle management, reconnection logic
- ❌ **Overkill for MVP**: MCP protocol is request-response, not event-driven
- ❌ **Harder debugging**: Binary frames, requires specialized tools
- ❌ **State management**: Must track connection state, handle disconnects

### Performance Comparison

| Metric | HTTP (Keep-Alive) | WebSocket |
|--------|-------------------|-----------|
| Latency (first request) | 15ms | 25ms (handshake) |
| Latency (subsequent) | 3-5ms | 2-4ms |
| Throughput | 100 req/s | 150 req/s |
| Complexity | Low | Medium |

**Conclusion**: HTTP with keep-alive provides 95% of WebSocket performance with 50% of the complexity.

### Consequences

**Positive:**
- Simpler implementation and testing
- Standard tooling for debugging
- Easier for contributors to understand

**Negative:**
- No server-initiated events (Godot cannot push to Node.js)
- Slightly higher latency for high-frequency operations

**Future Enhancement:**
- Add WebSocket endpoint in Phase 2 for real-time editor events
- Use HTTP for tool invocations, WebSocket for event streaming

---

## ADR-003: JSON vs MessagePack Serialization

**Status:** Accepted (JSON for MVP)  
**Date:** February 3, 2026

### Context

Data serialization format for Node.js ↔ Godot communication. Options:
- **JSON**: Text-based, human-readable
- **MessagePack**: Binary, more compact

### Decision

**Use JSON for MVP**. Evaluate MessagePack in Phase 2 only if profiling shows serialization overhead >10%.

### Rationale

**JSON Advantages:**
- ✅ **Human-readable**: Easy to debug, log, and inspect
- ✅ **Native support**: Built-in parsing in Node.js and Godot
- ✅ **Standard**: Well-understood, extensive tooling
- ✅ **Sufficient performance**: <5ms for typical payloads

**MessagePack Disadvantages:**
- ❌ **Binary format**: Harder to debug, requires hex viewers
- ❌ **Library dependency**: Requires external library in Godot
- ❌ **Premature optimization**: JSON overhead unlikely to be bottleneck

### Performance Characteristics

**Typical Scene Payload** (100-node scene):
- JSON size: 15KB
- JSON parse time: 3-5ms
- MessagePack size: 10KB (33% smaller)
- MessagePack parse time: 1-2ms (60% faster)

**Decision Threshold:**
```
IF (json_serialization_time > 10% of total_request_time)
THEN evaluate MessagePack
ELSE continue with JSON
```

### Consequences

**Positive:**
- Easier debugging and development
- No external dependencies
- Simpler testing

**Negative:**
- Larger payload sizes (not significant for localhost)
- Slightly slower parsing (acceptable for MVP)

**Migration Path:**
- Add MessagePack as optional format in Phase 2
- Support both formats via `Content-Type` header negotiation

---

## ADR-004: LRU Cache vs Redis

**Status:** Accepted (LRU for MVP)  
**Date:** February 3, 2026

### Context

Caching strategy for scene/script data. Options:
- **In-memory LRU** (lru-cache npm package)
- **Redis**: External key-value store

### Decision

**Use in-memory LRU cache for MVP**. Consider Redis only for multi-instance deployments (Phase 3).

### Rationale

**LRU Cache Advantages:**
- ✅ **No external process**: Simpler operations, fewer failure modes
- ✅ **Lower latency**: Memory access <1ms vs. Redis ~2-5ms
- ✅ **Sufficient capacity**: 100 items (~10MB) adequate for single user
- ✅ **Automatic eviction**: Least-recently-used eviction policy

**Redis Disadvantages:**
- ❌ **Operational complexity**: Requires Redis server, additional configuration
- ❌ **Network overhead**: Even localhost Redis adds 2-5ms latency
- ❌ **Overkill for MVP**: Single-user dev tool doesn't need distributed caching

### Capacity Planning

**Target Cache Size:**
- Max items: 100
- Average item size: 100KB (scene data)
- Total memory: ~10MB
- Cache hit ratio target: >70%

**Decision Rule:**
```
IF (multi_instance_deployment OR cache_size > 100MB)
THEN use Redis
ELSE use in-memory LRU
```

### Consequences

**Positive:**
- Simpler architecture, fewer dependencies
- Lower latency for cache hits
- Easier testing (no external services)

**Negative:**
- Cache not shared across processes
- Cache cleared on server restart

**Future Enhancement:**
- Persist cache to disk on shutdown (Phase 2)
- Add Redis support for team/server deployments (Phase 3)

---

## ADR-005: Alpine.js vs React for Web UI

**Status:** Accepted  
**Date:** February 3, 2026

### Context

Framework choice for Sidecar Web UI. Options:
- **Alpine.js**: Lightweight (15KB), HTML-first
- **React**: Full-featured (45KB), component-based
- **Vue.js**: Progressive (35KB), component-based

### Decision

**Use Alpine.js for Sidecar Web UI**.

### Rationale

**Alpine.js Advantages:**
- ✅ **66% smaller**: 15KB vs. 45KB (React) vs. 35KB (Vue)
- ✅ **No build step**: No webpack, vite, babel required
- ✅ **HTML-first**: Easy to read, less context switching
- ✅ **Perfect for simple UI**: Dashboard, forms, log viewer
- ✅ **Faster learning curve**: Minimal API surface

**React/Vue Disadvantages:**
- ❌ **Overkill**: No complex state management needed
- ❌ **Build complexity**: Tooling, transpilation, bundling
- ❌ **Larger bundle**: Slower initial load
- ❌ **More dependencies**: Maintenance burden

### Feature Comparison

| Feature | Alpine.js | React | Vue |
|---------|-----------|-------|-----|
| Bundle size | 15KB | 45KB | 35KB |
| Build required | No | Yes | Yes |
| Learning curve | Easy | Medium | Medium |
| Reactivity | Yes | Yes | Yes |
| Component model | HTML-centric | JSX | SFC |

### UI Complexity Assessment

**Sidecar UI Requirements:**
- Status dashboard (simple)
- Log viewer (medium)
- Connection list (simple)
- Control panel (simple)

**Complexity Score**: Low → Alpine.js is sufficient

### Consequences

**Positive:**
- Faster development (no build setup)
- Smaller bundle, faster load times
- Easier for contributors to understand

**Negative:**
- Limited for complex UIs (not needed)
- Less structured than component frameworks

**Migration Path:**
- If UI complexity grows significantly in Phase 2+, consider Vue.js
- Keep Alpine.js components modular for easier migration

---

## ADR-006: Zod vs Joi for Validation

**Status:** Accepted  
**Date:** February 3, 2026

### Context

Schema validation library for Node.js. Options:
- **Zod**: TypeScript-first, type inference
- **Joi**: Mature, JavaScript-first

### Decision

**Use Zod for all validation schemas**.

### Rationale

**Zod Advantages:**
- ✅ **TypeScript-first**: Infers types automatically from schemas
- ✅ **Better DX**: Type safety at compile time
- ✅ **Smaller bundle**: 10KB vs. 20KB (Joi)
- ✅ **Modern API**: Chaining, immutable schemas

**Example** (Type Inference):
```typescript
const UserSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
});

type User = z.infer<typeof UserSchema>;
// TypeScript knows: { name: string; age: number }
```

**Joi Disadvantages:**
- ❌ **Manual type definitions**: Must write types separately
- ❌ **JavaScript-first**: Less TypeScript integration
- ❌ **Larger bundle**: 2x size of Zod

### Consequences

**Positive:**
- Type safety from schemas to application code
- Reduced boilerplate (no manual type definitions)
- Better IDE autocomplete

**Negative:**
- Less mature than Joi (fewer community resources)
- Breaking changes possible in future releases

**Mitigation:**
- Pin Zod version in package.json
- Write comprehensive tests for validation logic

---

## ADR-007: Pino vs Winston for Logging

**Status:** Accepted  
**Date:** February 3, 2026

### Context

Logging library for Node.js. Options:
- **Pino**: High-performance, JSON-first
- **Winston**: Feature-rich, flexible

### Decision

**Use Pino for structured logging**.

### Rationale

**Pino Advantages:**
- ✅ **5x faster**: Minimal overhead (<1ms per log)
- ✅ **JSON by default**: Structured logs, easy to parse
- ✅ **Low overhead**: Suitable for high-frequency operations
- ✅ **Child loggers**: Contextual logging with bindings

**Performance Comparison:**
| Logger | Ops/sec | Overhead |
|--------|---------|----------|
| Pino | 50,000 | <1ms |
| Winston | 10,000 | 3-5ms |
| Bunyan | 15,000 | 2-3ms |

**Winston Disadvantages:**
- ❌ **Slower**: 5x performance penalty
- ❌ **Text-first**: Requires configuration for JSON
- ❌ **More complex**: Transports, formatters, levels

### Logging Strategy

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Structured logging
logger.info({
  operation: 'read_scene',
  path: 'scenes/MainMenu.tscn',
  latency_ms: 45,
  cache_hit: false,
}, 'Tool execution completed');
```

### Consequences

**Positive:**
- Fast logging doesn't impact performance
- Structured logs easy to query/analyze
- Low memory footprint

**Negative:**
- JSON logs less human-readable in console
- Fewer built-in features than Winston

**Mitigation:**
- Use `pino-pretty` for development (human-readable)
- JSON logs in production for structured analysis

---

## ADR-008: Localhost-Only vs Optional Remote Access

**Status:** Accepted (Localhost MVP, Remote Phase 2)  
**Date:** February 3, 2026

### Context

Network binding strategy for MCP server. Options:
- **Localhost-only** (`127.0.0.1`)
- **Configurable** (`0.0.0.0` with authentication)

### Decision

**Bind to localhost-only for MVP (Phase 1)**. Add optional remote access with authentication in Phase 2.

### Rationale

**Localhost-Only Advantages:**
- ✅ **Secure by default**: No external network exposure
- ✅ **Simpler**: No authentication, TLS, or firewall concerns
- ✅ **Sufficient for MVP**: Single-user development tool
- ✅ **Reduced attack surface**: Cannot be accessed remotely

**Remote Access Disadvantages (for MVP):**
- ❌ **Security complexity**: Requires API keys, TLS certificates
- ❌ **Overkill**: MVP targets single-user, local development
- ❌ **Operational burden**: Certificate management, renewal

### Security Validation

**MVP Security Controls:**
```typescript
const SERVER_CONFIG = {
  host: '127.0.0.1',  // MUST NOT be '0.0.0.0' in MVP
  port: 3000,
};

// Runtime validation
if (SERVER_CONFIG.host === '0.0.0.0') {
  throw new Error('Remote binding not allowed in MVP');
}
```

### Phase 2 Requirements (Remote Access)

**Authentication:**
- API key-based authentication
- Key rotation support
- Per-key rate limits

**Transport Security:**
- TLS 1.3 mandatory
- Certificate validation
- HSTS headers

**Access Control:**
- IP allowlist (optional)
- Audit logging of all access
- Session management

### Consequences

**Positive:**
- Secure by default, minimal attack surface
- Simpler MVP implementation
- No certificate management

**Negative:**
- Cannot access from remote machines (e.g., team deployments)
- Must be on same machine as Godot Editor

**Future Enhancement:**
```typescript
// Phase 2: Optional remote access
const SERVER_CONFIG = {
  host: process.env.MCP_HOST || '127.0.0.1',
  port: process.env.MCP_PORT || 3000,
  tlsEnabled: process.env.MCP_TLS === 'true',
  apiKey: process.env.MCP_API_KEY,
};

if (SERVER_CONFIG.host !== '127.0.0.1' && !SERVER_CONFIG.apiKey) {
  throw new Error('API key required for remote access');
}
```

---

## Summary of Architectural Decisions

| ADR | Decision | Phase | Risk | Impact |
|-----|----------|-------|------|--------|
| ADR-001 | GDScript (MVP), GDExtension (Phase 2) | 1 | Low | High |
| ADR-002 | HTTP REST over WebSockets | 1 | Low | Medium |
| ADR-003 | JSON over MessagePack | 1 | Low | Low |
| ADR-004 | LRU Cache over Redis | 1 | Low | Medium |
| ADR-005 | Alpine.js over React/Vue | 1 | Low | Medium |
| ADR-006 | Zod over Joi | 1 | Low | Medium |
| ADR-007 | Pino over Winston | 1 | Low | Low |
| ADR-008 | Localhost-only (MVP) | 1 | Low | High |

## Decision Principles

All architectural decisions follow these principles:

1. **Simplicity First**: Choose simpler solutions for MVP
2. **Measure Before Optimize**: Defer optimizations until proven necessary
3. **Secure by Default**: Prioritize security over convenience
4. **Extensible Architecture**: Allow future enhancements without rewrites
5. **Developer Experience**: Optimize for ease of development and debugging

:::tip Decision Review
These ADRs are living documents. They should be reviewed:
- After completing each phase
- When performance issues are identified
- When new requirements emerge
- When better technologies become available
:::

## Related Documents

- [Component Architecture](/en/architecture/components) - System design details
- [Data Flow](/en/architecture/data-flow) - Request/response patterns
- [Security Architecture](../../security-architecture.md) - Security controls and threat model
- [Implementation Roadmap](../../implementation-roadmap.md) - Phased delivery plan
