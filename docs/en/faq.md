# Frequently Asked Questions

Common questions about the Godot MCP Server.

---

## General Questions

### What is the Godot MCP Server?

The Godot MCP Server is a lightweight bridge that connects Godot Engine to AI assistants like Claude and GitHub Copilot via the Model Context Protocol (MCP). It enables AI to read, create, and modify your Godot projects directly.

### Why would I use this?

**For faster development**: AI can automate repetitive tasks like scene creation, batch updates, and code refactoring.

**For better code quality**: AI can analyze your scripts for optimization opportunities, detect collision misconfiguration, and suggest architectural improvements.

**For learning**: Ask AI to explain Godot patterns, generate documentation, or scaffold new features.

### Is it safe to let AI modify my project?

Yes, with proper safeguards:

1. **Automatic backups**: All write operations create timestamped backups in `.godot/mcp-backups/`
2. **Path validation**: AI cannot access files outside your project directory
3. **Input validation**: All tool invocations are validated against strict schemas
4. **Human approval**: You review AI suggestions before executing (in most workflows)
5. **Git integration**: Always commit before AI modifications for full rollback capability

### Does it work offline?

**Partially**:
- The MCP server itself runs locally (no internet required)
- Godot bridge runs entirely on your machine
- **But**: AI clients (Claude Desktop, Copilot) require internet for LLM inference

You can use the Sidecar Web UI (localhost:3000) to test tools without an AI client.

### Which Godot versions are supported?

- **Fully supported**: Godot 4.6+
- **Partial support**: Godot 4.3-4.5 (some features may not work)
- **Not supported**: Godot 3.x (different scene format, API incompatibility)

### Do I need to modify my Godot project?

Minimal changes:

1. Install the `godot-mcp-bridge` addon in `addons/`
2. Enable it in Project Settings
3. Restart Godot

Your scenes and scripts remain unchanged. The addon only adds an HTTP server for communication.

---

## Installation & Setup

### The server won't start. How do I debug?

**Step 1: Check Node.js version**

```bash
node --version
# Required: v20.0.0 or higher
```

**Step 2: Check port availability**

```bash
# macOS/Linux
lsof -i :7777
lsof -i :3000

# Windows PowerShell
netstat -ano | findstr :7777
netstat -ano | findstr :3000
```

If ports are in use, either kill the process or use different ports:

```bash
godot-mcp-server --project . --port 7778 --ui-port 8081
```

**Step 3: Check logs**

```bash
# Enable debug logging
godot-mcp-server --project . --log-level debug
```

Logs are written to:
- **Console** (stdout)
- **File**: `~/.godot-mcp-server/logs/server.log`

### The Godot bridge shows "Disconnected"

**Cause 1: Godot not running**

✅ **Solution**: Open your project in the Godot editor

**Cause 2: Addon not enabled**

✅ **Solution**: 
1. Open Project → Project Settings → Plugins
2. Check "Godot MCP Bridge"
3. Restart Godot

**Cause 3: Wrong project path**

✅ **Solution**: Verify `--project` points to the directory containing `project.godot`:

```bash
# ✅ Correct
godot-mcp-server --project ~/dev/my-game

# ❌ Wrong (points to subdirectory)
godot-mcp-server --project ~/dev/my-game/scenes
```

**Cause 4: Port mismatch**

✅ **Solution**: Ensure server and addon use the same port:

```bash
# Server config
godot-mcp-server --port 7777

# Addon config (addons/godot-mcp-bridge/plugin.gd)
const HTTP_PORT = 7777  # Must match
```

### Can I use multiple Godot projects simultaneously?

**Not currently** (MVP limitation). The MCP server connects to one Godot instance at a time.

**Workaround**:
1. Run separate MCP server instances on different ports
2. Configure separate MCP clients for each project

**Phase 2 feature**: Multi-project support with project switching

### How do I uninstall?

**Node.js server**:

```bash
npm uninstall -g godot-mcp-server
```

**Godot addon**:

1. Delete `addons/godot-mcp-bridge/` directory
2. Remove from Project Settings → Plugins
3. Restart Godot

**Client config**:

Remove the `"godot"` entry from your MCP client config (Claude Desktop, VS Code).

---

## Performance & Reliability

### Operations are slow (>5 seconds)

**Cause 1: Large scenes**

Scene with 500+ nodes take longer to parse.

✅ **Solution**: 
- Enable caching: `--cache-ttl 300`
- Break large scenes into smaller instanced scenes

**Cause 2: No caching**

Repeated reads without caching re-parse files every time.

✅ **Solution**:

```bash
godot-mcp-server --project . --cache-ttl 300 --max-cache-size 100
```

**Cause 3: Godot editor lag**

Heavy editor load (many open tabs, large viewport) slows bridge response.

✅ **Solution**:
- Close unnecessary editor tabs
- Simplify viewport (2D/3D complexity)
- Restart Godot editor

**Cause 4: Network issues**

Localhost HTTP should be <20ms. Higher latency indicates network problems.

✅ **Test**:

```bash
curl -w "@curl-format.txt" http://localhost:7777/health

# Expected: < 20ms
# If > 100ms, check system resources
```

### The server crashes frequently

**Cause 1: Out of memory**

Large projects with many cached resources can exhaust memory.

✅ **Solution**:

```bash
# Limit cache size
godot-mcp-server --project . --max-cache-size 50

# Increase Node.js heap
NODE_OPTIONS="--max-old-space-size=4096" godot-mcp-server --project .
```

**Cause 2: Godot bridge error**

Malformed scene files can crash the Godot parser.

✅ **Solution**:
- Check Godot editor Output panel for errors
- Validate `.tscn` files manually
- Report issue on GitHub with sample file

**Cause 3: Unhandled exceptions**

Bug in tool implementation.

✅ **Solution**:
- Check logs: `~/.godot-mcp-server/logs/server.log`
- Report issue with error stack trace

### Can I use this in production (CI/CD)?

**Current status**: Not recommended for MVP

**Limitations**:
- No authentication (localhost-only safe)
- Limited error recovery
- No horizontal scaling

**Phase 2 improvements**:
- API key authentication
- Headless Godot support
- Docker containerization
- Prometheus metrics

**Workaround for testing**: Use in CI for automated scene validation:

```yaml
# .github/workflows/validate-scenes.yml
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install -g godot-mcp-server
      - run: |
          godot-mcp-server --project . &
          sleep 5
          curl -X POST http://localhost:7777/rpc \
            -d '{"method": "scene.validate_all"}'
```

---

## Features & Capabilities

### Can AI run my game or export builds?

**Not in MVP**. Phase 2 will add:
- `run_scene` tool (execute scene in headless Godot)
- `export_project` tool (trigger Godot export)
- `run_tests` tool (GUT unit tests)

**Current workaround**: AI can generate build scripts:

> "Create a bash script to export my game for Windows, macOS, and Linux"

AI generates the script, you run it manually.

### Can AI modify binary resources (.res, .import)?

**Read**: Yes, metadata only (file size, type, dependencies)  
**Write**: No (binary format too complex)

**Workaround**: AI can modify the corresponding text format (.tres) and you convert to binary in Godot.

### Does it support C# scripts?

**Read**: Yes, full support (list, read, analyze structure)  
**Write**: Partial (create/modify text, but no C# compilation validation)

**Limitation**: AI can't verify C# syntax correctness. Always test in Godot editor.

### Can AI access my Godot editor settings?

**No**, for security reasons. The MCP server only accesses:
- `project.godot`
- User-created scenes, scripts, resources
- Project-specific settings

**Not accessible**:
- `~/.godot/` (global editor config)
- System paths outside project
- Godot export templates

### Can I create custom tools?

**Phase 2 feature**: Plugin API for custom tools

**Current workaround**: Fork the repository and add tools to `src/tools/custom/`:

```typescript
// src/tools/custom/my_tool.ts
export const myCustomTool = {
  name: "my_custom_operation",
  description: "Does something specific to my project",
  schema: { /* JSON Schema */ },
  async handler(params: any) {
    // Implementation
  }
};
```

Then register in `src/tools/registry.ts`.

---

## Security & Privacy

### What data does the server access?

**Accessible**:
- Files inside your Godot project directory
- Project configuration (`project.godot`)
- Godot editor state (via bridge addon)

**Not accessible**:
- Files outside project directory
- System configuration
- Other applications
- Network resources (unless you explicitly enable)

### Does it send data to external servers?

**MCP Server**: No. Runs entirely on localhost, no external connections.

**AI Clients**: Yes. Claude Desktop, GitHub Copilot send tool results to their cloud services for LLM inference.

**Privacy concern**: Your code/scenes are sent to AI provider for analysis.

**Mitigation**:
- Use local LLMs (Phase 2: Ollama integration)
- Avoid using AI on sensitive/proprietary projects
- Review AI provider privacy policies

### Can AI delete files?

**Not by default**. The MVP tools don't include deletion operations.

**Phase 2**: Explicit `delete_file` tool with extra confirmation:

```typescript
// Requires explicit confirmation
delete_file({
  path: "scenes/old_level.tscn",
  confirm: true,
  create_backup: true
})
```

**Backups**: Even with deletion tools, backups are created in `.godot/mcp-backups/`.

### Should I use authentication?

**For localhost development**: Not necessary (server only binds to `127.0.0.1`)

**For remote/team access** (Phase 2):

```bash
# Generate secure API key
export MCP_AUTH_KEY=$(openssl rand -hex 32)

# Start server with auth
godot-mcp-server --project . --auth-key $MCP_AUTH_KEY
```

AI clients must include the key in headers:

```json
{
  "headers": {
    "Authorization": "Bearer <your-api-key>"
  }
}
```

---

## Troubleshooting Specific Errors

### Error: "Path traversal attempt detected"

**Cause**: Tool invocation tried to access file outside project directory.

**Example**:

```
read_scene({ path: "../../../etc/passwd" })
```

**Solution**: This is a security feature. Only access files within your project:

```
✅ read_scene({ path: "scenes/Player.tscn" })
❌ read_scene({ path: "/etc/passwd" })
❌ read_scene({ path: "../other-project/scene.tscn" })
```

### Error: "Godot bridge timeout"

**Cause**: Godot didn't respond within timeout (default: 5s for reads, 10s for writes).

**Solutions**:

1. **Large file**: Increase timeout

```bash
godot-mcp-server --project . --read-timeout 10 --write-timeout 30
```

2. **Godot frozen**: Check Godot editor for modal dialogs or hangs

3. **Bridge crashed**: Check Godot Output panel for errors, restart Godot

### Error: "JSON-RPC parse error"

**Cause**: Malformed response from Godot bridge.

**Debug**:

1. Check Godot Output panel for GDScript errors
2. Test bridge directly:

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

3. If curl fails, reinstall the Godot addon

### Error: "Scene format not supported"

**Cause**: Scene is binary (.scn) or Godot 3.x format.

**Solution**: Convert to Godot 4.6 text format:

1. Open scene in Godot 4.6 editor
2. File → Save Scene As
3. Ensure "Save As Scene" uses `.tscn` extension
4. Try MCP operation again

### Warning: "Cache size exceeded, evicting entries"

**Not an error**, just informational. The LRU cache is working as designed.

**If it happens frequently**:

```bash
# Increase cache size
godot-mcp-server --project . --max-cache-size 100
```

---

## Getting Help

### Where can I report bugs?

**GitHub Issues**: [https://github.com/your-org/godot-mcp-server/issues](https://github.com)

Include:
- OS and versions (Node.js, Godot, MCP client)
- Minimal reproduction steps
- Logs (`~/.godot-mcp-server/logs/server.log`)
- Sample project (if applicable)

### Where can I ask questions?

- **GitHub Discussions**: Architecture, design, best practices
- **Discord**: Real-time chat, community support
- **Stack Overflow**: Tag with `godot-mcp-server`

### How can I contribute?

See [CONTRIBUTING.md](https://github.com) for:
- Setting up dev environment
- Code style guide
- Pull request process
- Testing requirements

Areas needing help:
- Additional tools (export, debugging, profiling)
- Performance optimization
- Documentation improvements
- Example projects

### Is there a roadmap?

See [Implementation Roadmap](./implementation-roadmap.md) for:
- **Phase 1** (MVP): Core read/write tools ✅
- **Phase 2** (Beta): Advanced features, authentication 🚧
- **Phase 3** (v1.0): Polish, optimization, community feedback 📋

---

## Advanced Topics

### Can I use a different port?

Yes:

```bash
godot-mcp-server --project . --port 9000 --ui-port 9001
```

Update Godot addon config (`addons/godot-mcp-bridge/plugin.gd`):

```gdscript
const HTTP_PORT = 9000  # Match server config
```

### How does caching work?

**LRU Cache** (Least Recently Used):
- **Max items**: 100 (configurable)
- **Max size**: 50MB (configurable)
- **TTL**: 5 minutes (configurable)

**Cache key format**: `{type}:{path}:{checksum}`

Example: `scene:scenes/Player.tscn:abc123...`

**Invalidation**:
- **Time-based**: After TTL expires
- **Content-based**: File modification changes checksum
- **Manual**: Write operations invalidate related cache entries

**Benefits**:
- 50-70% latency reduction on cache hits
- Reduces Godot file I/O load
- Improves AI response time

**Disable caching**:

```bash
godot-mcp-server --project . --cache-ttl 0
```

### Can I integrate with other tools (Git, CI/CD)?

**Yes**, the MCP server is designed for composability:

**Git pre-commit hook** (validate scenes before commit):

```bash
#!/bin/bash
# .git/hooks/pre-commit

curl -X POST http://localhost:7777/rpc \
  -d '{"method": "scene.validate_all"}' \
  > /dev/null 2>&1

if [ $? -ne 0 ]; then
  echo "Scene validation failed. Fix errors before committing."
  exit 1
fi
```

**CI/CD** (GitHub Actions):

```yaml
- name: Start MCP Server
  run: |
    npm install -g godot-mcp-server
    godot-mcp-server --project . &
    sleep 5

- name: Validate Project
  run: |
    curl -X POST http://localhost:7777/rpc \
      -d '{"method": "project.analyze"}' \
      | jq '.result.errors | length' \
      | grep -q '^0$' || exit 1
```

### What's the performance impact on Godot?

**Minimal** for typical workflows:

- **Memory**: +50MB for HTTP server and tool managers
- **CPU**: <5% during idle, spikes during tool invocations
- **I/O**: Only when MCP operations execute

**Best practice**: Close the Godot editor when not actively developing to free resources.

---

::: tip Pro Tip
Create a `.godot-mcp-server.json` config file in your project root for persistent settings:

```json
{
  "port": 7777,
  "uiPort": 3000,
  "logLevel": "info",
  "cacheTTL": 300,
  "maxCacheSize": 50
}
```

Then start the server without flags:

```bash
godot-mcp-server --project .
```
:::

::: warning Known Limitations
1. **Single project**: Only one Godot project at a time
2. **No deletions**: MVP doesn't include delete operations
3. **Text formats only**: Binary .scn, .res not editable
4. **No C# compilation**: Can modify C# text, but no syntax validation
5. **Localhost only**: No remote access in MVP

Phase 2 addresses most of these limitations.
:::
