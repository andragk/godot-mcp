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

### 🔍 Read Operations

- **`list_scenes`** - Scan project for all .tscn files
- **`read_scene`** - Parse scene structure, nodes, properties
- **`list_scripts`** - Find all GDScript and C# scripts
- **`read_script`** - Read script contents with metadata
- **`get_project_structure`** - Full directory tree
- **`search_nodes`** - Find nodes by name, type, or property
- **`get_node_properties`** - Inspect specific node configuration

### ✏️ Write Operations

- **`create_scene`** - Generate new scenes from templates
- **`modify_scene`** - Add/remove nodes, update properties
- **`create_script`** - Scaffold new GDScript classes
- **`modify_script`** - Edit script content with validation
- **`rename_node`** - Safely rename nodes across scenes

### 📦 MCP Resources

Access Godot files via URI scheme:

- `godot://scenes/MainMenu.tscn` - Scene files as JSON
- `godot://scripts/Player.gd` - Script contents
- `godot://resources/PlayerStats.tres` - Resource metadata

### 🖥️ Sidecar Web UI

Visit `http://localhost:8080` to:

- Monitor server status and connection health
- View real-time request/response logs
- Browse available tools and schemas
- Test tools with interactive forms
- Track performance metrics (latency, error rates)

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

Start with [Getting Started](./en/getting-started) for installation and your first tool invocation.

### 🧠 Learn the Concepts

Understand [MCP Protocol & Architecture](./en/concepts) to see how it all works together.

### 💡 See It in Action

Explore [Real-World Examples](./en/examples) of AI-assisted game development workflows.

### 🏗️ Build It Yourself

Follow the [Implementation Guide](./en/implementation/setup) to create your own MCP server.

### 🔐 Production Deployment

Review [Best Practices](./en/best-practices) for security, performance, and reliability.

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
