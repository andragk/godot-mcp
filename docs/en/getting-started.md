# Getting Started

Get up and running with Godot MCP Server in under 10 minutes.

---

## Prerequisites

### Required Software

- **Node.js 20+** ([download](https://nodejs.org/))
- **Godot 4.6+** ([download](https://godotengine.org/download))
- **VS Code** or **Claude Desktop** (MCP client)

### Knowledge Requirements

- Basic familiarity with Godot Engine
- Command-line proficiency (npm, terminal navigation)
- Understanding of JSON and REST APIs (helpful but not required)

---

## Installation

### Step 1: Install Node.js MCP Server

Install globally via npm:

```bash
npm install -g godot-mcp-server
```

Or use npx (no installation):

```bash
npx godot-mcp-server --version
```

Verify installation:

```bash
godot-mcp-server --version
# Output: godot-mcp-server v1.0.0
```

### Step 2: Install Godot Bridge Addon

1. **Download** the latest `godot-mcp-bridge.zip` from [Releases](https://github.com/your-org/godot-mcp-server/releases)

2. **Extract** to your project's `addons/` directory:

```
your-godot-project/
├── addons/
│   └── godot-mcp-bridge/
│       ├── plugin.cfg
│       ├── http_server.gd
│       ├── tool_manager.gd
│       └── ...
├── scenes/
├── scripts/
└── project.godot
```

3. **Enable** the plugin in Godot:
   - Open **Project > Project Settings > Plugins**
   - Check the box next to "Godot MCP Bridge"
   - Click "Enable"

4. **Restart Godot** to activate the HTTP server

---

## Deployment Modes

Godot MCP Server supports three deployment architectures:

### Mode 1: MCP Only (Default)

Runs only the MCP server for stdio communication with AI assistants.

```bash
npm start
```

**Use Case**: Claude Desktop, VS Code Copilot integration

**Ports**: None (stdio communication)

### Mode 2: Web UI Only (Sidecar)

Runs only the web dashboard independently.

```bash
npm run web-ui
```

**Use Case**: Standalone monitoring, separate deployment, debugging

**Ports**: HTTP 3000 (configurable via `WEB_PORT`)

**Requirements**: Godot bridge must be running on port 7777

### Mode 3: Combined (Development)

For development, run both in separate terminals:

```bash
# Terminal 1: MCP Server
npm start

# Terminal 2: Web UI Dashboard
npm run web-ui
```

**Use Case**: Local development, full-stack testing

**Ports**: stdio (MCP) + HTTP 3000 (Web UI)

---

## Environment Variable Configuration

Configure security and connection settings via environment variables.

### Create Environment File

Create a `.env` file in your project directory (where you run `godot-mcp-server`):

```bash
# .env

# Server Configuration
PORT=8080                     # Web UI server port
HOST=127.0.0.1                # Bind address (localhost only)
NODE_ENV=development          # Environment: development | production

# Godot Bridge
GODOT_PORT=7777               # Godot HTTP server port
BRIDGE_TIMEOUT=5000           # Request timeout in milliseconds

# Security (Optional but Recommended)
MCP_API_KEY=                  # API key for Web UI authentication
ALLOWED_ORIGINS=              # Comma-separated CORS origins

# Rate Limiting
RATE_LIMIT_WINDOW=900000      # Window in ms (15 minutes)
RATE_LIMIT_MAX_READS=100      # Max read requests per window
RATE_LIMIT_MAX_WRITES=20      # Max write requests per window

# Logging
LOG_LEVEL=info                # Logging level: debug | info | warn | error
LOG_FORMAT=pretty             # Log format: json | pretty
```

#### Security Configuration Examples

**Development Setup** (Minimal Security):
```bash
# .env.development
PORT=8080
HOST=127.0.0.1
NODE_ENV=development
GODOT_PORT=7777
LOG_LEVEL=debug
LOG_FORMAT=pretty
```

**Production Setup** (Enhanced Security):
```bash
# .env.production
PORT=8080
HOST=127.0.0.1
NODE_ENV=production
GODOT_PORT=7777

# Security
MCP_API_KEY=your-secure-random-key-here  # Generate with: openssl rand -hex 32
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080

# Logging
LOG_LEVEL=warn
LOG_FORMAT=json
```

#### Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Web UI HTTP server port |
| `HOST` | `127.0.0.1` | Server bind address (MUST be localhost) |
| `NODE_ENV` | `development` | Environment mode (affects logging/errors) |
| `GODOT_PORT` | `7777` | Godot bridge HTTP server port |
| `BRIDGE_TIMEOUT` | `5000` | Bridge request timeout (ms) |
| `MCP_API_KEY` | (optional) | Authentication token for Web UI |
| `ALLOWED_ORIGINS` | `localhost:8080` | CORS allowed origins (comma-separated) |
| `RATE_LIMIT_WINDOW` | `900000` | Rate limit window (15 minutes) |
| `RATE_LIMIT_MAX_READS` | `100` | Max read requests per window |
| `RATE_LIMIT_MAX_WRITES` | `20` | Max write requests per window |
| `LOG_LEVEL` | `info` | Logging verbosity (debug/info/warn/error) |
| `LOG_FORMAT` | `pretty` | Log format (pretty/json) |

**Security Notes**:
- **Never** set `HOST=0.0.0.0` - this exposes the server to your network
- Generate strong API keys: `openssl rand -hex 32` or `uuidgen`
- Use separate `.env` files for development and production
- Add `.env` to `.gitignore` to avoid committing secrets

### Step 4: Configure Your MCP Client

#### For Claude Desktop (Recommended)

Edit the config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add the Godot server:

```json
{
  "mcpServers": {
    "godot": {
      "command": "godot-mcp-server",
      "args": [
        "--project",
        "/absolute/path/to/your/godot/project",
        "--log-level",
        "info"
      ],
      "env": {
        "GODOT_PORT": "7777"
      }
    }
  }
}
```

#### For VS Code with MCP Extension

Install the [MCP Extension](https://marketplace.visualstudio.com/items?itemName=modelcontextprotocol.mcp-vscode)

Add to `.vscode/settings.json`:

```json
{
  "mcp.servers": {
    "godot": {
      "command": "godot-mcp-server",
      "args": [
        "--project",
        "${workspaceFolder}",
        "--port",
        "7777"
      ]
    }
  }
}
```

---

## Verification

### 1. Check Server Status

Open the Sidecar Web UI:

```
http://localhost:8080
```

You should see:
- ✅ **Server Status**: Running
- ✅ **Godot Connection**: Connected
- ✅ **Uptime**: 0h 0m 15s

### 2. Test Health Endpoint

```bash
curl http://localhost:7777/health
```

Expected response:

```json
{
  "status": "healthy",
  "uptime_seconds": 42,
  "godot_version": "4.6.0",
  "bridge_version": "1.0.0"
}
```

### 3. First Tool Invocation

In Claude Desktop or VS Code, try:

> "List all scenes in my Godot project"

Expected response:

```
I found 8 scenes in your project:

• scenes/MainMenu.tscn
• scenes/levels/Level1.tscn
• scenes/levels/Level2.tscn
• scenes/characters/Player.tscn
• scenes/characters/Enemy.tscn
• scenes/ui/HUD.tscn
• scenes/ui/PauseMenu.tscn
• scenes/ui/GameOverScreen.tscn
```

---

## What You Can Do

Once installed, AI assistants can help you with a comprehensive set of Godot development tasks organized into 12 feature categories:

### 🎮 Editor Control
- Launch the Godot editor programmatically
- Run Godot projects in debug mode
- Capture console output and error messages
- Stop running projects
- Get Godot version information
- List and analyze Godot projects in directories

### 🎬 Scene Management
- Create new scenes with specified root node types
- Add, remove, modify, and duplicate nodes
- Query node information and properties
- Load sprites and textures into Sprite2D nodes
- Export 3D scenes as MeshLibrary resources for GridMap
- Save scenes with options for creating variants

### 📜 Script Management
- Create GDScript files with templates (node, resource, custom)
- Attach scripts to nodes
- Validate script syntax with detailed error reporting
- Get node methods and properties
- Modify existing scripts

### 🎨 Resource Management
- Import assets with custom settings
- Create resources (materials, shaders, etc.)
- List project assets with metadata
- Configure import settings for textures, audio, and models

### 📡 Signal System
- Create custom signals in scripts
- Connect signals between nodes with validation
- List available signals on nodes
- Disconnect signal connections

### ⚡ Physics System (Godot 4.5+)
- Add physics bodies (CharacterBody2D/3D, RigidBody2D/3D, etc.)
- Configure physics properties and materials
- Setup collision layers and masks
- Create Area2D/Area3D with signal connections

### 🖼️ UI System
- Create UI elements (Button, Label, TextEdit, Panel, etc.)
- Apply themes to UI elements
- Setup container layouts (VBox, HBox, Grid, Margin)
- Create menus with buttons and navigation

### 🎞️ Animation System
- Create AnimationPlayer nodes with animations
- Add keyframes to animation tracks
- Setup AnimationTree with state machines
- Add particle systems (GPUParticles2D/3D)

### 📦 Project Management
- Get complete project structure
- Search for nodes across scenes by criteria
- Update project settings
- Configure input action mappings
- Setup autoload singletons
- Manage editor plugins (list, enable, disable)

### 🐛 Debug Module
- Run projects with full debug output capture
- Get error context with stack traces
- Intelligent error analysis with solutions
- Integration with documentation for contextual help

### 📚 Documentation Module (Godot 4.5+)
- Get detailed class information from official Godot documentation
- Search documentation for classes, methods, properties, and signals
- Get method information with parameters and examples
- Access best practices for common Godot topics
- Automatic caching for improved performance
- Support for Godot 4.5+ features and deprecated feature warnings

### 🔑 UID Management (Godot 4.4+)
- Get UID for specific files
- Update UID references by resaving resources

::: tip Over 60 Tools Available
The MCP Server provides 60+ specialized tools covering the complete Godot development lifecycle. See the [API Tools Reference](/en/api/tools) for complete documentation.
:::

---

## Your First Workflows

### Read a Scene

> "Read the Player.tscn scene and describe its structure"

The AI will invoke `read_scene` and provide a summary:

```
The Player scene has the following structure:

Root: Player (CharacterBody2D)
├── Sprite2D (texture: player_sprite.png)
├── CollisionShape2D (shape: CapsuleShape2D)
├── Camera2D (zoom: 2.0)
├── AnimationPlayer
└── HealthComponent (script: health_component.gd)

Key properties:
- Motion Mode: Grounded
- Velocity: Vector2(0, 0)
- Max Speed: 300
- Jump Force: -600

Attached script: res://scripts/player.gd
```

### Analyze Code

> "Read Player.gd and suggest performance improvements"

The AI will invoke `read_script` and provide analysis:

```
I've reviewed your Player.gd script. Here are some optimization suggestions:

1. Line 45: Cache `get_node("Sprite2D")` in _ready() instead of 
   calling it every frame in _process()

2. Line 78: Use `move_and_slide()` instead of manually calculating 
   collisions for better performance

3. Lines 120-135: The attack logic could be extracted into a 
   separate state machine for better maintainability

Would you like me to implement any of these changes?
```

### Create New Content

> "Create a simple collectible coin scene with rotation animation"

The AI will invoke `create_scene`:

```
I've created scenes/items/Coin.tscn with:

Structure:
- Coin (Area2D)
  ├── Sprite2D (placeholder texture)
  ├── CollisionShape2D (circular)
  └── AnimationPlayer (rotate_loop)

Features:
- Rotation animation (360° over 2 seconds)
- Collision detection on Area2D layer 4
- Ready for custom script attachment

The scene is saved and ready to use. Would you like me to:
1. Create a script to handle collection logic?
2. Add particle effects on collection?
3. Create a CoinManager for tracking collection?
```

---

## Command-Line Options

### Basic Usage

```bash
godot-mcp-server --project /path/to/project
```

### All Options

| Option | Description | Default |
|--------|-------------|---------|
| `--project <path>` | Path to Godot project root (required) | - |
| `--port <number>` | Godot bridge HTTP port | `7777` |
| `--ui-port <number>` | Sidecar Web UI port | `8080` |
| `--log-level <level>` | Logging verbosity (debug/info/warn/error) | `info` |
| `--cache-ttl <seconds>` | Resource cache TTL | `300` |
| `--max-cache-size <mb>` | Maximum cache size in MB | `50` |
| `--auth-key <key>` | API key for authentication (Phase 2) | - |
| `--no-ui` | Disable Sidecar Web UI | `false` |
| `--backup-dir <path>` | Directory for write operation backups | `.godot/mcp-backups` |

### Examples

**Development with debug logging**:

```bash
godot-mcp-server \
  --project ~/dev/my-game \
  --log-level debug \
  --ui-port 3000
```

**Production with caching**:

```bash
godot-mcp-server \
  --project /var/www/game-project \
  --cache-ttl 600 \
  --max-cache-size 100 \
  --auth-key $MCP_AUTH_KEY \
  --no-ui
```

---

## Troubleshooting

### Server Won't Start

**Symptom**: `Error: EADDRINUSE: address already in use`

**Cause**: Port 7777 or 8080 already in use

**Solution**:

```bash
# Check what's using the port (macOS/Linux)
lsof -i :7777

# Kill the process or use different ports
godot-mcp-server --project . --port 7778 --ui-port 8081
```

### Godot Connection Failed

**Symptom**: Web UI shows "Disconnected" status

**Causes & Solutions**:

1. **Godot not running**
   - Open your Godot project in the editor
   - Ensure the addon is enabled in Project Settings

2. **Wrong project path**
   - Verify `--project` points to the directory containing `project.godot`
   - Use absolute paths for reliability

3. **Firewall blocking localhost**
   - Check firewall settings
   - Try disabling temporarily for testing

4. **Port conflict**
   - Check if another application is using port 7777
   - Change port in both server config and Godot addon settings

### Tool Invocations Slow

**Symptom**: Operations taking >5 seconds

**Solutions**:

1. **Enable caching**:
   ```bash
   godot-mcp-server --project . --cache-ttl 300
   ```

2. **Check Godot performance**:
   - Close unnecessary editor tabs
   - Reduce viewport/inspector complexity
   - Check system resources (CPU/RAM)

3. **Network diagnostics**:
   ```bash
   # Test localhost latency
   curl -w "@curl-format.txt" http://localhost:7777/health
   ```

### Permission Errors

**Symptom**: `Error: EACCES: permission denied`

**Solutions**:

1. **Project directory permissions**:
   ```bash
   # Ensure read/write access
   chmod -R u+rw /path/to/project
   ```

2. **Backup directory**:
   ```bash
   # Create backup directory manually
   mkdir -p .godot/mcp-backups
   chmod u+w .godot/mcp-backups
   ```

---

## Next Steps

✅ **Server installed and verified**

Continue your journey:

- [Understand MCP Concepts](./concepts.md) - Learn how the protocol works
- [Explore Examples](./examples.md) - Real-world AI-assisted workflows
- [Read API Documentation](./api/tools.md) - Master all available tools
- [Review Best Practices](./best-practices.md) - Production tips

---

::: tip Quick Test Command
Verify everything works in one command:

```bash
curl -X POST http://localhost:7777/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "health.check",
    "params": {}
  }'
```
:::

::: warning Common Mistake
Don't forget to restart Godot after enabling the addon! The HTTP server won't start until Godot restarts.
:::
