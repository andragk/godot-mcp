## Problem Description

Implement read-only tools for accessing Godot project structure and content, along with Web UI lifecycle controls and real-time log streaming. These capabilities enable AI assistants to understand project organization and provide users with visibility into MCP operations.

**Why this matters:**
- Provides project introspection capabilities for AI context gathering
- Implements caching for performance optimization
- Establishes Web UI control plane for server management
- Enables real-time monitoring of operations

## Acceptance Criteria

- [ ] All 5 read tools implemented: `list_scenes`, `read_scene`, `list_scripts`, `read_script`, `get_project_structure`
- [ ] LRU cache working with 50MB memory limit
- [ ] Scene file parsing completes in <100ms for typical scenes
- [ ] Cache hit ratio >50% under normal usage
- [ ] Web UI lifecycle controls functional (start/stop/restart MCP server)
- [ ] SSE log streaming stable for >1 hour continuous operation
- [ ] No memory leaks under sustained read operations

## Technical Requirements

### Read Tools Implementation

#### 1. `list_scenes`
- Recursively scan project for `.tscn` files
- Return paths relative to project root
- Include metadata (file size, modification time)
- Filter by directory pattern (optional)
- Sort by path or modification time

#### 2. `read_scene`
- Parse `.tscn` file format (Godot's custom format)
- Extract node hierarchy and properties
- Handle external resource references
- Support both text and binary scene formats
- Validate scene file integrity

#### 3. `list_scripts`
- Scan for `.gd` files recursively
- Detect script class names (via `class_name`)
- Return metadata (lines of code, docstrings)
- Filter by directory or search pattern

#### 4. `read_script`
- Read GDScript file content
- Preserve formatting and comments
- Extract function signatures and documentation
- Parse `extends` hierarchy
- Handle UTF-8 encoding properly

#### 5. `get_project_structure`
- Generate directory tree representation
- Count files by type (scenes, scripts, resources, assets)
- Calculate total project size
- Identify key directories (addons, autoload, exports)
- Return as structured JSON

### LRU Cache Implementation
- In-memory cache with configurable size (50MB default)
- Key: file path + modification timestamp
- Automatic eviction based on LRU policy
- Cache invalidation on file modification detection
- Thread-safe operations
- Cache hit/miss metrics exposed

### Web UI Lifecycle Controls
- `/api/server/start` - Start MCP server process
- `/api/server/stop` - Graceful shutdown
- `/api/server/restart` - Stop + Start
- `/api/server/status` - Health check and metrics
- Process state management (running, stopped, error)
- Prevent concurrent start operations

### SSE Real-Time Log Streaming
- SSE endpoint: `/api/logs/stream`
- Log levels: debug, info, warn, error
- Message format: `{ timestamp, level, component, message, metadata }`
- Automatic reconnection on connection loss
- Heartbeat every 30 seconds
- Client-side connection state indicator

## Test Requirements

### Unit Tests
- [ ] Scene file parser with various .tscn formats
- [ ] Script content reader with edge cases
- [ ] LRU cache eviction logic
- [ ] Directory tree generation
- [ ] SSE message formatting

### Integration Tests
- [ ] List 100+ scenes and verify performance
- [ ] Read large scene file (>1MB) with caching
- [ ] Cache hit ratio measurement over 50 operations
- [ ] Concurrent read operations (10 clients)
- [ ] File modification detection and cache invalidation

### Performance Tests
- [ ] Scene parsing benchmark (<100ms for 50KB scene)
- [ ] Cache lookup performance (<1ms)
- [ ] Memory usage under max cache size (50MB limit)
- [ ] SSE throughput (500 messages/sec sustained)

### Web UI Tests
- [ ] Start/stop server via Web UI
- [ ] Restart server and verify reconnection
- [ ] Real-time log display in browser
- [ ] SSE connection recovery after network interruption
- [ ] Multiple browser tabs receiving same logs

### Manual Tests
- [ ] Browse project structure in Web UI
- [ ] View scene content with syntax highlighting
- [ ] Monitor cache hit ratio in real-time
- [ ] Control server lifecycle from Web UI
- [ ] Verify logs streaming for long-running operations

## Documentation Requirements

- [ ] Tool catalog for all 5 read tools with examples
- [ ] Cache configuration guide
- [ ] Web UI usage guide (screenshots)
- [ ] API documentation for lifecycle endpoints
- [ ] SSE protocol specification
- [ ] Performance tuning recommendations
- [ ] Cache invalidation strategy explanation

## Estimated Effort

**Story Points:** 13

**Breakdown:**
- Read tools implementation: 5 points
- LRU cache system: 3 points
- Web UI lifecycle controls: 2 points
- SSE streaming: 2 points
- Testing and documentation: 1 point

**Dependencies:**
- Blocked by: #1 (Foundation), #2 (Editor Control)
- Blocks: #4 (Node Operations), #5 (Scene Operations), #6 (Script Operations)

**Timeline:** Sprint 3 (1 week)
