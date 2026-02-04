# Godot 4.6 MCP Server

**Transform your Godot development with AI-powered assistance**

The Godot 4.6 MCP Server is a lightweight, high-performance bridge that makes Godot Engine's capabilities accessible via the Model Context Protocol (MCP). Enable AI assistants like Claude and GitHub Copilot to read, create, and modify your Godot projects directly from VS Code.

---

## What is MCP?

The **Model Context Protocol** (MCP) is an open standard for connecting AI applications to external data sources and tools. It enables Large Language Models (LLMs) to interact with your development environment in a structured, safe, and extensible way.

---

## Why Godot MCP Server?

### 🚀 AI-Powered Workflows

- **Scene Creation**: "Create a platformer level with collectible coins"
- **Code Refactoring**: "Extract this movement logic into a reusable component"
- **Debugging**: "Find all nodes with collision layers misconfigured"
- **Documentation**: "Generate comments for this GDScript class"

### ⚡ Performance First

- **<50ms p99 latency** for read operations
- **<200ms for writes** with automatic validation
- **99.9% uptime** with automatic reconnection
- **Minimal overhead** (<100MB Node.js + 50MB Godot bridge)

### 🛡️ Safe by Default

- **Path traversal protection** prevents access outside project directory
- **Input validation** on all tool invocations
- **Atomic writes** with automatic backups
- **Audit logging** for all modifications (optional)

### 🔧 Developer Friendly

- **Zero configuration** for local development
- **Sidecar Web UI** for monitoring and testing
- **Comprehensive docs** with real-world examples
- **Open source** with active community support

---

## Quick Start

### 1. Install the Server

```bash
npm install -g godot-mcp-server
```

### 2. Add to Claude Desktop

Edit your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "godot": {
      "command": "godot-mcp-server",
      "args": ["--project", "/path/to/your/godot/project"]
    }
  }
}
```

### 3. Install Godot Bridge

In your Godot project:

1. Download the `godot-mcp-bridge` addon from releases
2. Extract to `addons/godot-mcp-bridge/`
3. Enable in **Project > Project Settings > Plugins**
4. Restart Godot

### 4. Start Chatting

In Claude Desktop:

> "List all scenes in my Godot project"

> "Read the Player.gd script and suggest optimizations"

> "Create a new scene for the main menu with buttons for Start, Options, and Quit"

---

## Key Features

### 🔍 Scene & Script Operations

- **`list_scenes`** / **`read_scene`** - Scan and parse scene structures
- **`create_scene`** / **`modify_scene`** - Generate and modify scenes with node hierarchies
- **`list_scripts`** / **`read_script`** - Find and analyze GDScript/C# scripts
- **`create_script`** / **`modify_script`** - Create scripts from templates and apply edits
- **`search_nodes`** - Find nodes by name, type, property, or group
- **`get_node_properties`** / **`validate_scene`** - Inspect configurations and validate

### 🎮 Editor & Project Control

- **`launch_godot_editor`** - Open Godot editor programmatically
- **`run_godot_project`** - Execute projects in debug mode with output capture
- **`stop_godot_execution`** - Control running instances
- **`get_godot_version`** - Check installed Godot version
- **`list_godot_projects`** - Discover projects in directories
- **`analyze_project`** - Deep analysis of project structure and dependencies

### 🎨 Resource & Asset Management

- **`import_asset`** - Import textures, audio, models with custom settings
- **`create_resource`** - Generate materials, shaders, and other resources
- **`list_project_assets`** - Catalog all assets with metadata
- **`configure_import_settings`** - Update import configurations

### 📡 Signal & Event System

- **`create_signal`** - Define custom signals in scripts
- **`connect_signal`** - Wire up signal connections with validation
- **`list_node_signals`** - Discover available signals
- **`disconnect_signal`** - Remove signal connections

### ⚡ Physics System (Godot 4.5+)

- **`add_physics_body`** - Create CharacterBody, RigidBody, StaticBody nodes
- **`configure_physics_properties`** - Set mass, friction, bounce, damping
- **`setup_collision_layers`** - Configure collision layer masks
- **`create_area`** - Build Area2D/3D with signal auto-connection

### 🖼️ UI & Animation

- **`create_ui_element`** - Generate Buttons, Labels, Panels, Containers
- **`apply_theme`** - Apply custom themes to UI elements
- **`setup_container_layout`** - Build VBox/HBox/Grid layouts
- **`create_menu`** - Scaffold complete menus with navigation
- **`create_animation_player`** - Setup AnimationPlayer with keyframe tracks
- **`add_animation_keyframe`** - Add animation keyframes programmatically
- **`setup_animation_tree`** - Configure AnimationTree state machines
- **`add_particle_system`** - Create GPUParticles2D/3D effects

### 🐛 Debug & Documentation (Godot 4.5+)

- **`run_project_debug`** - Run with full output capture and performance metrics
- **`capture_debug_output`** / **`get_error_context`** - Retrieve logs and stack traces
- **`analyze_error`** - AI-powered error analysis with solutions
- **`get_class_documentation`** - Access official Godot docs for classes
- **`search_documentation`** - Search methods, properties, signals, tutorials
- **`get_method_documentation`** - Detailed method signatures with examples
- **`get_best_practices`** - Curated best practices for physics, signals, GDScript, etc.
- **`check_deprecated_features`** - Identify deprecated APIs and migration paths

### 🔑 UID Management (Godot 4.4+)

- **`get_file_uid`** - Retrieve file UIDs
- **`update_uid_references`** - Update UID refs by resaving resources

::: tip 60+ Tools Available
The MCP Server provides comprehensive coverage of the Godot development lifecycle with 60+ specialized tools. See the complete [API Tools Reference](/en/api/tools) for detailed schemas and examples.
:::

### 📦 MCP Resources

Access Godot files via URI scheme:

- `godot://scenes/MainMenu.tscn` - Scene files as JSON
- `godot://scripts/Player.gd` - Script contents
- `godot://resources/PlayerStats.tres` - Resource metadata

### 🖥️ Sidecar Web UI

Visit `http://localhost:8080` for comprehensive monitoring and control:

#### 🔍 **Tool Exploration & Invocation**
- Interactive tool catalog with JSON Schema viewer
- Dynamic form generation from tool schemas
- Real-time tool testing with result preview
- Execution time tracking

#### 📚 **Resource Management**
- Browse all MCP resources (scenes, scripts, assets)
- Full-text content preview
- Advanced filtering by type, size, and date
- Quick search across resource URIs

#### 📊 **Real-Time Logging & Monitoring**
- Live JSON-RPC traffic inspection (split-view)
- Performance metrics (p50/p95/p99 latency)
- Error console with stack traces
- Event categorization (debug/info/warn/error)

#### ⚙️ **Configuration & Security**
- Environment variable editor (with restart detection)
- Active client access control
- Prompt template gallery with testing
- Rate limiting and permission management

#### 🔌 **Connection & Session Management**
- Active client list with connection metadata
- Session duration and idle time tracking
- Request success/failure rates per client
- Force disconnect (kill switch) for hung clients

#### 🏥 **Service State & Lifecycle Control**
- Visual status indicators (🟢 healthy, 🟡 degraded, 🔴 error)
- Comprehensive health checks (Godot, event loop, memory, disk)
- Process control (start/stop/restart/reload)
- State transition history

#### 🧰 **Advanced Logging & Observability**
- Split-view traffic inspector (client ↔ server)
- Auto-scroll and freeze controls for log inspection
- Multi-level filtering (debug/info/warn/error)
- Export logs (JSON/CSV/TXT) with time range filtering

**Access:** Open browser to `http://localhost:8080` while the MCP server is running.

---

## Architecture Overview

```
┌──────────────┐
│  VS Code /   │  stdio
│ Claude App   ├────────────┐
└──────────────┘            │
                            ▼
                  ┌──────────────────┐
                  │   Node.js MCP    │
                  │     Server       │
                  └────────┬─────────┘
                           │ HTTP POST
                           │ localhost:7777
                           ▼
                  ┌──────────────────┐
                  │  Godot Bridge    │
                  │  (GDScript HTTP  │
                  │     Server)      │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  Godot Engine    │
                  │  File System     │
                  └──────────────────┘
```

**Communication Flow**:

1. AI client sends tool request via stdio (MCP protocol)
2. Node.js server validates and transforms to JSON-RPC
3. HTTP POST to Godot bridge on localhost:7777
4. GDScript executes operation on engine/filesystem
5. Response flows back through the chain

**Latency Budget**: 45-150ms total (within AI workflow expectations)

---

## Next Steps

<div class="next-steps">

### 📚 New to MCP?

Start with [Getting Started](./getting-started.md) for installation and your first tool invocation.

### 🧠 Learn the Concepts

Understand [MCP Protocol & Architecture](./concepts.md) to see how it all works together.

### 💡 See It in Action

Explore [Real-World Examples](./examples.md) of AI-assisted game development workflows.

### 🏗️ Build It Yourself

Follow the [Implementation Guide](./implementation/setup.md) to create your own MCP server.

### 🔐 Production Deployment

Review [Best Practices](./best-practices.md) for security, performance, and reliability.

</div>

---

## Community & Support

- **GitHub**: [github.com/your-org/godot-mcp-server](https://github.com) (stars welcome!)
- **Discord**: [Join our community](https://discord.gg/example)
- **Issues**: Report bugs or request features on GitHub
- **Discussions**: Ask questions, share workflows

---

## License

MIT License - Use freely in personal and commercial projects.

---

::: tip Performance Tip
Enable resource caching in production for 50% faster repeated reads:

```bash
godot-mcp-server --project /path/to/project --cache-ttl 300
```
:::

::: warning Security Notice
By default, the server only accepts connections from localhost. For remote/team deployments, enable authentication:

```bash
godot-mcp-server --project /path/to/project --auth-key your-secret-key
```
:::
