# Godot MCP Bridge Addon

## Purpose

This addon provides the **bridge layer** between the Model Context Protocol (MCP) server and the Godot editor. It exposes a limited set of Godot-specific operations via HTTP/JSON-RPC that the main MCP server (TypeScript) can call.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   MCP Client (IDE/CLI)                   │
└─────────────────────┬───────────────────────────────────┘
                      │ stdio/SSE
┌─────────────────────▼───────────────────────────────────┐
│              MCP Server (TypeScript)                     │
│  - 19 registered tools (read, write, node, scene ops)   │
│  - Most operations handled in TypeScript                 │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP/JSON-RPC (port 7777)
┌─────────────────────▼───────────────────────────────────┐
│          Godot MCP Bridge Addon (GDScript)              │
│  - HTTP server on port 7777                              │
│  - Limited Godot-specific operations only:               │
│    • launch_editor                                       │
│    • run_project                                         │
│    • stop_execution                                      │
│    • get_godot_version                                   │
│    • list_projects                                       │
│    • analyze_project                                     │
│    • health_check                                        │
│    • ping                                                │
└─────────────────────┬───────────────────────────────────┘
                      │ Godot Engine APIs
┌─────────────────────▼───────────────────────────────────┐
│                    Godot Editor                          │
│  - Engine.get_version_info()                            │
│  - OS.create_process()                                   │
│  - DirAccess / FileAccess                                │
└─────────────────────────────────────────────────────────┘
```

## Why Only 8 Operations Here?

The MCP server has 19 registered tools, but **most are implemented in TypeScript** because they operate on file system data and don't need a running Godot instance:

### TypeScript-Implemented Tools (File System Based)
- read_scene
- read_script
- read_resource
- read_project_config
- list_nodes
- list_scenes
- create_scene
- modify_scene
- create_script
- modify_script
- (etc.)

### Bridge-Implemented Operations (Require Godot)
Only operations that **must** run inside Godot are implemented here:
- **launch_editor** - Requires OS integration and Godot executable
- **run_project** - Launches project instances
- **stop_execution** - Process management
- **get_godot_version** - Engine.get_version_info()
- **list_projects** - Recursive directory scanning with Godot APIs
- **analyze_project** - Parse project.godot files
- **health_check** - Server status
- **ping** - Connection test

## File Structure

```
addons/godot-mcp-bridge/
├── plugin.gd                         # Plugin lifecycle management
├── plugin.cfg                        # Plugin metadata
├── http_server.gd                    # Main TCP coordinator (368 lines)
├── http_server_original_backup.gd    # Backup of original monolithic version
│
├── logger.gd                         # MCPLogger - Centralized logging
├── http_request_parser.gd            # HTTPRequestParser - HTTP parsing
├── http_response_builder.gd          # HTTPResponseBuilder - Response building
├── jsonrpc_handler.gd                # JSONRPCHandler - JSON-RPC 2.0 protocol
│
├── editor_control_handler.gd         # EditorControlHandler - Editor ops
└── project_discovery_handler.gd      # ProjectDiscoveryHandler - Project ops
```

## Design Principles

### Single Responsibility Principle (SRP)
Each class has ONE focused responsibility:
- **MCPLogger**: Logging only
- **HTTPRequestParser**: HTTP parsing only
- **HTTPResponseBuilder**: HTTP response building only
- **JSONRPCHandler**: JSON-RPC protocol only
- **EditorControlHandler**: Editor control operations only
- **ProjectDiscoveryHandler**: Project discovery and analysis only
- **http_server.gd**: TCP coordination and delegation only

### Dependency Injection
All handlers receive their dependencies via constructor:
```gdscript
editor_handler = EditorControlHandler.new(logger)
project_handler = ProjectDiscoveryHandler.new(logger)
```

### Separation of Concerns
- **Protocol Layer**: HTTP/JSON-RPC handling (parser, builder, handler)
- **Business Logic**: Editor operations, project discovery
- **Infrastructure**: Logging, TCP server management

## Why This Structure?

**Previous State**: Monolithic `http_server.gd` (558 lines) violated SRP
- Mixed TCP, HTTP, JSON-RPC, logging, editor control, project discovery

**Current State**: Focused classes (368 lines in main file, 34% reduction)
- Easy to test each concern independently
- Clear separation between protocol and business logic
- Dependency injection enables mocking for tests
- Comprehensive WHY comments explain architectural decisions

## Future Improvements

1. **Directory Organization**: Move handlers into subdirectories:
   ```
   core/
     logger.gd
   protocol/
     http_request_parser.gd
     http_response_builder.gd
     jsonrpc_handler.gd
   handlers/
     editor_control_handler.gd
     project_discovery_handler.gd
   ```

2. **GDScript Unit Tests**: Add unit tests for each handler

3. **More Operations**: Add Godot-specific operations that can't be done from TypeScript:
   - Run tests in Godot test framework
   - Profile scene performance
   - Export projects
   - Manage plugins

## Testing

**Current Status**: Manual testing required
1. Open Godot project with plugin enabled
2. Verify HTTP server starts on port 7777
3. Test each JSON-RPC method via HTTP client
4. Validate responses match JSON-RPC 2.0 spec

**Future**: GDScript unit tests for each handler class
