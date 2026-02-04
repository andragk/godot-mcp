## Problem Description

Implement advanced node query and property introspection tools, along with MCP resource endpoints and the Web UI Tool Explorer. This enables AI assistants to discover and interact with Godot scenes at a granular level, while users gain interactive testing capabilities through the Web UI.

**Why this matters:**
- Provides fine-grained scene introspection for AI agents
- Implements MCP resource protocol for standardized access
- Delivers interactive tool testing interface for developers
- Enables rapid prototyping and debugging workflows

## Acceptance Criteria

- [ ] `search_nodes` tool functional with multiple query patterns
- [ ] `get_node_properties` returns complete node metadata
- [ ] Node search completes in <500ms for projects with 1000+ scenes
- [ ] MCP resources accessible via `godot://` URI scheme
- [ ] Tool Explorer UI displays all available tools
- [ ] JSON Schema forms generate correctly for all tool parameters
- [ ] Interactive tool invocation works end-to-end (UI → MCP → Godot)
- [ ] Tool execution results display properly formatted

## Technical Requirements

### Node Operations Tools

#### 1. `search_nodes`
- Search by node name (exact, prefix, regex)
- Filter by node type (Node2D, Control, etc.)
- Search by property value (position, visibility, etc.)
- Return node path within scene hierarchy
- Support multiple search criteria (AND/OR)
- Limit and offset for pagination
- Performance optimization with indexing

#### 2. `get_node_properties`
- Accept node path in scene
- Return all properties with types and values
- Include inherited properties
- Handle complex types (Vector2, Color, Resource references)
- Show property metadata (export, category, hints)
- Return connected signals
- Include node children and parent information

### MCP Resources Implementation

**URI Scheme:** `godot://<project-id>/<resource-type>/<path>`

**Resource Types:**
- `scenes` - Scene files (.tscn)
- `scripts` - GDScript files (.gd)
- `nodes` - Specific nodes within scenes
- `project` - Project configuration

**Operations:**
- List resources (e.g., `godot://my-project/scenes/`)
- Read resource content
- Subscribe to resource changes (optional)
- Resource metadata (MIME type, size, modification time)

**Implementation:**
- Resource registry with URI pattern matching
- Content negotiation (JSON, text, binary)
- Efficient caching integration with LRU cache from Issue #3
- Resource URIs in tool responses

### Web UI Tool Explorer Module

#### Features:
1. **Tool Catalog View**
   - List all available MCP tools
   - Group by category (Editor, Read, Write, Node Operations)
   - Show tool descriptions and parameter schemas
   - Search and filter tools

2. **Interactive Tool Invocation**
   - Select tool from catalog
   - Generate form from JSON Schema
   - Input validation with real-time feedback
   - "Try it out" button for execution
   - Clear/reset form functionality

3. **JSON Schema Form Generation**
   - Parse tool parameter schemas
   - Generate appropriate input controls (text, number, select, checkbox)
   - Handle nested objects and arrays
   - Support for enum and pattern validation
   - Optional parameter indicators

4. **Result Display**
   - Syntax-highlighted JSON output
   - Error message formatting
   - Execution time display
   - Copy result to clipboard
   - Export result as JSON file

#### Technical Stack:
- Alpine.js for reactive UI
- Tailwind CSS for styling
- JSON Schema Form library integration
- Monaco Editor for JSON editing (optional)
- SSE for real-time execution updates

## Test Requirements

### Unit Tests
- [ ] Node search with various query patterns
- [ ] Property extraction for different node types
- [ ] URI parsing and validation
- [ ] Resource content serialization
- [ ] JSON Schema form field generation

### Integration Tests
- [ ] Search across multiple scenes
- [ ] Get properties for deeply nested nodes
- [ ] Resource access via different URI patterns
- [ ] Tool invocation from Web UI to MCP server
- [ ] Form validation and error handling

### Performance Tests
- [ ] Node search in project with 1000+ scenes (<500ms)
- [ ] Property retrieval for complex nodes (<100ms)
- [ ] Resource listing for large directories (<200ms)
- [ ] UI responsiveness with 50+ tools in catalog

### Web UI Tests
- [ ] Tool catalog loads and displays correctly
- [ ] Form generation for all parameter types
- [ ] Tool invocation with valid parameters
- [ ] Error handling for invalid inputs
- [ ] Result display for various response types
- [ ] Browser compatibility (Chrome, Firefox, Safari)

### Manual Tests
- [ ] Search for specific node types across project
- [ ] Inspect properties of scene root nodes
- [ ] Access resources via godot:// URIs
- [ ] Test every tool through Web UI
- [ ] Verify form validation behavior
- [ ] Test error scenarios in UI

## Documentation Requirements

- [ ] Tool documentation for search_nodes and get_node_properties
- [ ] Resource URI scheme specification
- [ ] Tool Explorer user guide with screenshots
- [ ] JSON Schema form generator documentation
- [ ] Example queries and use cases
- [ ] API reference for resource endpoints
- [ ] Developer guide for adding new tools to catalog

## Estimated Effort

**Story Points:** 13

**Breakdown:**
- Node operation tools: 4 points
- MCP resources implementation: 3 points
- Tool Explorer UI: 4 points
- Testing and documentation: 2 points

**Dependencies:**
- Blocked by: #1 (Foundation), #2 (Editor Control), #3 (Read Tools)
- Blocks: #5 (Scene Operations), #6 (Script Operations)

**Timeline:** Sprint 4 (1 week)
