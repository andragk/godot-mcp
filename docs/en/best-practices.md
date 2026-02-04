# Best Practices

Production-ready patterns and optimization strategies for the Godot MCP Server.

---

## Performance Optimization

### Enable Resource Caching

**Why**: Reduces repeated file I/O and parsing by 50-70%

**How**:

```bash
godot-mcp-server \
  --project /path/to/project \
  --cache-ttl 300 \          # 5 minutes
  --max-cache-size 100       # 100MB
```

**When to increase cache**:
- Large projects (500+ files)
- Frequent AI queries for same scenes
- CI/CD pipelines (validation workflows)

**When to disable cache**:
- Active development (rapid file changes)
- Memory-constrained environments
- Debugging cache invalidation issues

### Optimize Scene Structure

**Problem**: Scenes with 500+ nodes are slow to parse and serialize

**Solution 1: Break into subscenes**

❌ **Before** (monolithic, 800 nodes):

```
Level1.tscn
├── TileMap (500 tiles)
├── Enemies (100 instances)
├── Collectibles (150 coins)
└── Decorations (50 props)
```

✅ **After** (modular, 4×<200 nodes):

```
Level1.tscn (50 nodes)
├── TileMap → [Instanced: environments/Platforms.tscn]
├── Enemies → [Instanced: spawns/EnemyWaves.tscn]
├── Collectibles → [Instanced: items/CoinLayout.tscn]
└── Decorations → [Instanced: props/DecorationSet.tscn]
```

**Benefits**:
- 3-5x faster scene reads
- Better reusability
- Easier AI analysis
- Reduced merge conflicts

**Solution 2: Use groups for batch queries**

Instead of querying individual nodes, use Godot groups:

```gdscript
# Add enemies to group in _ready()
add_to_group("enemies")

# AI can now query efficiently
search_nodes({ group: "enemies" })
```

### Connection Pooling

**Default**: Already enabled with 10 concurrent connections

**For high-throughput scenarios** (CI/CD, batch operations):

```typescript
// Custom server config
{
  "httpClient": {
    "connections": 20,      // Increase pool size
    "pipelining": 10,       // More requests per connection
    "keepAliveTimeout": 120000  // 2 minutes
  }
}
```

### Parallel Tool Invocations

**Inefficient** (sequential):

> "Read Player.tscn, then read Enemy.tscn, then read Boss.tscn"

**Efficient** (parallel):

> "Read Player.tscn, Enemy.tscn, and Boss.tscn"

The AI will automatically invoke tools in parallel when possible.

---

## Security Best Practices

### Path Validation

**Always use relative paths** from project root:

✅ **Correct**:
```
read_scene({ path: "scenes/Player.tscn" })
```

❌ **Avoid absolute paths**:
```
read_scene({ path: "/home/user/project/scenes/Player.tscn" })
```

**Why**: Absolute paths break portability and may trigger security validation errors.

### Backup Before Modifications

**Automatic backups** are enabled by default in `.godot/mcp-backups/`:

```
.godot/mcp-backups/
├── 2026-02-04_10-30-00_Player.tscn.bak
├── 2026-02-04_10-32-15_Enemy.gd.bak
└── 2026-02-04_10-35-42_MainMenu.tscn.bak
```

**Custom backup directory**:

```bash
godot-mcp-server \
  --project . \
  --backup-dir /mnt/backups/godot-mcp
```

**Retention policy** (manual cleanup recommended):

```bash
# Delete backups older than 7 days
find .godot/mcp-backups -name "*.bak" -mtime +7 -delete
```

### Git Integration

**Always commit before AI modifications**:

```bash
# Create checkpoint
git add .
git commit -m "Before AI refactoring: extract movement component"

# Let AI modify
# ... AI operations ...

# Review changes
git diff

# If satisfied:
git add .
git commit -m "After AI refactoring: movement component extracted"

# If not satisfied:
git reset --hard HEAD
```

**Pre-commit validation** (optional):

```bash
# .git/hooks/pre-commit
#!/bin/bash

# Validate all scenes before committing
curl -s -X POST http://localhost:7777/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"scene.validate_all","params":{}}' \
  | jq -e '.result.valid' > /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Scene validation failed. Fix errors before committing."
  exit 1
fi

echo "✅ Scene validation passed"
```

### API Key Authentication (Phase 2)

**For remote/team deployments**:

```bash
# Generate secure key (32 bytes)
export MCP_AUTH_KEY=$(openssl rand -hex 32)

# Start server with auth
godot-mcp-server \
  --project . \
  --auth-key $MCP_AUTH_KEY \
  --bind 0.0.0.0  # Allow remote connections
```

**Client configuration**:

```json
{
  "mcpServers": {
    "godot": {
      "command": "godot-mcp-server",
      "args": ["--project", "/path/to/project"],
      "env": {
        "MCP_AUTH_KEY": "your-secret-key-here"
      }
    }
  }
}
```

**Security checklist**:
- ✅ Use HTTPS for remote connections (not HTTP)
- ✅ Rotate keys every 90 days
- ✅ Never commit keys to git (use environment variables)
- ✅ Enable audit logging (`--audit-log /var/log/mcp-audit.log`)
- ✅ Rate limit AI clients (`--rate-limit 100`)

::: tip Deep Dive: Security Architecture
For comprehensive security guidelines including threat modeling, security controls, authentication strategies, and incident response procedures, see the [Security Architecture](./architecture/security.md) page.
:::

---

## Reliability Patterns

### Health Monitoring

**Automated health checks**:

```bash
# Cron job (every 5 minutes)
*/5 * * * * curl -f http://localhost:7777/health || systemctl restart godot-mcp-server
```

**Health check response**:

```json
{
  "status": "healthy",
  "uptime_seconds": 3600,
  "godot_connected": true,
  "godot_version": "4.6.0",
  "bridge_version": "1.0.0",
  "cache_size_mb": 23.5,
  "request_count": 1247,
  "error_count": 3,
  "p99_latency_ms": 45
}
```

**Alert on unhealthy state**:

```bash
#!/bin/bash
# health-monitor.sh

STATUS=$(curl -s http://localhost:7777/health | jq -r '.status')

if [ "$STATUS" != "healthy" ]; then
  echo "⚠️ MCP Server unhealthy!" | mail -s "Alert" admin@example.com
fi
```

### Graceful Shutdown

**Ensure clean termination**:

```bash
# Send SIGTERM (not SIGKILL)
kill -TERM $(pgrep -f godot-mcp-server)

# Server will:
# 1. Stop accepting new requests
# 2. Finish in-flight operations
# 3. Flush cache to disk
# 4. Close Godot connection
# 5. Exit with code 0
```

**Avoid**:

```bash
# ❌ Force kill (may corrupt cache)
kill -9 $(pgrep -f godot-mcp-server)
```

### Connection Recovery

**Automatic reconnection** is enabled by default:

- **Initial connection timeout**: 10s
- **Retry interval**: Exponential backoff (1s, 2s, 4s, 8s, max 30s)
- **Max retries**: Infinite (until manual stop)

**Custom retry policy**:

```bash
godot-mcp-server \
  --project . \
  --reconnect-interval 5 \    # Fixed 5s interval
  --reconnect-max-attempts 10 # Give up after 10 tries
```

### Request Queuing

**During disconnection**, requests are queued (max 100):

```
Godot disconnected
↓
Queue: [req1, req2, req3, ...]
↓
Godot reconnected
↓
Flush queue (process in order)
```

**Queue size monitoring**:

```bash
curl -s http://localhost:8080/api/status | jq '.queue_size'
```

**Alert on queue overflow**:

```bash
if [ $(curl -s http://localhost:8080/api/status | jq '.queue_size') -gt 50 ]; then
  echo "⚠️ Request queue is filling up!"
fi
```

---

## Development Workflow

### Local Development

**Recommended setup**:

```bash
# Terminal 1: Start Godot
godot --path /path/to/project

# Terminal 2: Start MCP Server with debug logging
godot-mcp-server \
  --project /path/to/project \
  --log-level debug

# Terminal 3: Monitor logs in real-time
tail -f ~/.godot-mcp-server/logs/server.log

# Browser: Open Sidecar UI
open http://localhost:8080
```

### Testing Changes

**Before deploying AI modifications**:

1. **AI suggests changes** → Review in chat
2. **Approve operations** → AI executes tools
3. **Open Godot editor** → Check Output panel for errors
4. **Open modified scene** → Verify structure
5. **Run scene (F6)** → Test behavior
6. **If issues found** → Ask AI to fix or rollback

**Rollback procedure**:

```bash
# Option 1: Restore from MCP backup
cp .godot/mcp-backups/2026-02-04_10-30-00_Player.tscn.bak scenes/Player.tscn

# Option 2: Git revert
git checkout HEAD -- scenes/Player.tscn

# Option 3: Interactive restore
> "Undo the last modification to Player.tscn"
```

### Staging Environment

**For team workflows**, use a staging project:

```
project-staging/
├── .git  (separate repo)
├── scenes/
├── scripts/
└── project.godot

godot-mcp-server \
  --project project-staging \
  --port 7778  # Different port
```

**Workflow**:

1. AI modifies `project-staging/`
2. Test in staging Godot instance
3. If approved, manually apply to `project-production/`
4. Or use git to merge changes

---

## AI Interaction Patterns

### Effective Prompting

**Be specific**:

✅ **Good**:
> "Read Player.gd and extract the movement logic (lines 45-120) into a new MovementComponent script. The component should expose speed, jump_force, and gravity as exported variables."

❌ **Vague**:
> "Make Player.gd better"

**Provide context**:

✅ **Good**:
> "I'm building a 2D platformer. Create a collectible coin scene with: 1) Area2D for collision, 2) Sprite2D with rotation animation, 3) AudioStreamPlayer for pickup sound. Use layer 4 for collectibles."

❌ **Lacks context**:
> "Create a coin scene"

**Request validation**:

✅ **Good**:
> "Modify Player.tscn to add a HealthComponent node. After making the change, verify the scene still has valid structure."

**Iterate incrementally**:

✅ **Good**:
1. "Create basic enemy scene with sprite and collision"
2. "Add patrol movement to enemy"
3. "Add attack behavior when player is in range"
4. "Add health system to enemy"

❌ **Too much at once**:
> "Create a complete enemy with movement, attacks, health, AI, animations, and sound effects"

### Tool Selection

**Let AI choose tools**:

✅ **Good**:
> "Find all scenes that use the old PlayerController script"

AI will automatically use:
1. `get_project_structure()` → List all scenes
2. `read_scene(path)` → Check each for PlayerController
3. Return filtered list

❌ **Over-specify**:
> "Use list_scenes, then read_scene for each one, then filter by script property"

**Combine related operations**:

✅ **Good**:
> "Read Player.tscn, analyze the collision layers, and suggest improvements based on Godot best practices"

AI will:
1. `read_scene` → Get structure
2. `get_node_properties` → Get collision details
3. Analyze and respond

### Error Handling

**When operations fail**:

1. **AI reports error** → Read error message
2. **Diagnose root cause** → Check logs, Godot Output
3. **Provide clarification** → Give AI more context
4. **Retry with fixes** → AI adjusts approach

**Example**:

> "Create a scene called TestLevel"

```
❌ Error: File already exists: scenes/TestLevel.tscn
```

**Follow-up**:

> "TestLevel already exists. Read it and add 3 enemy spawn points instead"

---

## Monitoring & Observability

### Structured Logging

**Log levels**:

- `debug`: All operations, request/response payloads
- `info`: Tool invocations, connection state changes (default)
- `warn`: Retries, cache evictions, recoverable errors
- `error`: Failed operations, unhandled exceptions

**Log format (JSON)**:

```json
{
  "timestamp": "2026-02-04T10:30:00.123Z",
  "level": "info",
  "message": "Tool invoked",
  "tool": "read_scene",
  "params": {"path": "scenes/Player.tscn"},
  "latency_ms": 45,
  "request_id": "req-abc123"
}
```

**Query logs**:

```bash
# Find all errors in last hour
jq 'select(.level == "error" and (.timestamp | fromdateiso8601) > (now - 3600))' \
  ~/.godot-mcp-server/logs/server.log

# Calculate average latency for read_scene
jq -s 'map(select(.tool == "read_scene")) | map(.latency_ms) | add/length' \
  ~/.godot-mcp-server/logs/server.log
```

### Metrics Dashboard

**Sidecar Web UI** (`http://localhost:8080`) displays:

- **Request rate**: req/s (real-time graph)
- **Error rate**: % failed requests
- **Latency**: p50, p95, p99 (histograms)
- **Cache hit rate**: % cache hits
- **Connection status**: Godot health, uptime
- **Recent operations**: Last 50 tool invocations

**Export metrics** (Phase 2: Prometheus format):

```bash
curl http://localhost:8080/metrics

# Output:
# godot_mcp_requests_total{tool="read_scene"} 1247
# godot_mcp_latency_seconds{quantile="0.99"} 0.045
# godot_mcp_cache_hits_total 823
# godot_mcp_godot_connection{status="connected"} 1
```

### Audit Logging (Phase 2)

**Track all write operations**:

```bash
godot-mcp-server \
  --project . \
  --audit-log /var/log/godot-mcp-audit.log
```

**Audit log format**:

```json
{
  "timestamp": "2026-02-04T10:30:00.123Z",
  "operation": "modify_scene",
  "user": "claude-desktop",
  "path": "scenes/Player.tscn",
  "changes": {
    "type": "add_node",
    "node_path": "Player/HealthComponent"
  },
  "backup": ".godot/mcp-backups/2026-02-04_10-30-00_Player.tscn.bak",
  "success": true
}
```

**Compliance use case**: Prove what AI changed and when (for code audits).

---

## Scaling Strategies

### Horizontal Scaling (Phase 2)

**Not currently supported** (MVP is single-instance)

**Future**: Run multiple servers for different projects:

```bash
# Project A
godot-mcp-server --project /path/to/project-a --port 7777

# Project B
godot-mcp-server --project /path/to/project-b --port 7778

# Load balancer distributes requests
```

### Vertical Scaling

**Increase Node.js heap for large projects**:

```bash
NODE_OPTIONS="--max-old-space-size=8192" godot-mcp-server --project .
# 8GB heap (default: 4GB)
```

**Increase cache for memory-rich servers**:

```bash
godot-mcp-server \
  --project . \
  --max-cache-size 500  # 500MB cache
```

### Resource Limits

**Prevent runaway operations**:

```bash
godot-mcp-server \
  --project . \
  --max-concurrent 5 \     # Max 5 simultaneous operations
  --request-timeout 30 \   # 30s timeout per request
  --rate-limit 50          # 50 req/min per client
```

---

## CI/CD Integration

### Automated Validation

**GitHub Actions workflow**:

```yaml
name: Validate Godot Project

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - name: Install MCP Server
        run: npm install -g godot-mcp-server
      
      - name: Install Godot
        run: |
          wget https://downloads.tuxfamily.org/godotengine/4.6/Godot_v4.6_linux.x86_64.zip
          unzip Godot_v4.6_linux.x86_64.zip
          chmod +x Godot_v4.6_linux.x86_64
      
      - name: Start MCP Server
        run: |
          godot-mcp-server --project . --no-ui &
          sleep 10
      
      - name: Validate Scenes
        run: |
          curl -X POST http://localhost:7777/rpc \
            -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","id":1,"method":"scene.validate_all","params":{}}' \
            | jq -e '.result.valid'
      
      - name: Check for Errors
        run: |
          ERRORS=$(curl -s http://localhost:7777/rpc \
            -d '{"jsonrpc":"2.0","id":2,"method":"project.analyze","params":{}}' \
            | jq '.result.errors | length')
          
          if [ "$ERRORS" -gt 0 ]; then
            echo "❌ Found $ERRORS project errors"
            exit 1
          fi
```

### Docker Deployment

**Dockerfile** (Phase 2):

```dockerfile
FROM node:20-alpine

RUN apk add --no-cache godot-headless

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 7777 8080

CMD ["godot-mcp-server", "--project", "/project", "--bind", "0.0.0.0"]
```

**Usage**:

```bash
docker run -d \
  -p 7777:7777 \
  -p 8080:8080 \
  -v /path/to/project:/project \
  -e MCP_AUTH_KEY=your-secret-key \
  godot-mcp-server:latest
```

---

## Troubleshooting Checklist

### Before Reporting Issues

1. ✅ Check logs: `~/.godot-mcp-server/logs/server.log`
2. ✅ Verify Godot connection: `curl http://localhost:7777/health`
3. ✅ Test with minimal project (reproduction case)
4. ✅ Update to latest version: `npm update -g godot-mcp-server`
5. ✅ Clear cache: `rm -rf ~/.godot-mcp-server/cache`
6. ✅ Check system resources (CPU, RAM, disk)
7. ✅ Review Godot Output panel for errors
8. ✅ Test without AI client (direct HTTP requests)

### Performance Tuning Matrix

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| Slow reads | No caching | Enable `--cache-ttl 300` |
| Slow writes | Large scenes | Break into subscenes |
| High memory | Large cache | Reduce `--max-cache-size` |
| Frequent timeouts | Heavy Godot load | Close editor tabs, simplify viewport |
| Connection drops | Network issues | Check firewall, use fixed port |
| Cache thrashing | Rapid file changes | Increase `--cache-ttl` or disable |

---

::: tip Production Checklist
Before deploying to production:

- [ ] Enable caching with appropriate TTL
- [ ] Configure authentication (if remote access)
- [ ] Set up health monitoring (cron/systemd)
- [ ] Enable audit logging
- [ ] Configure backup retention policy
- [ ] Document recovery procedures
- [ ] Test failover scenarios
- [ ] Establish performance baselines
- [ ] Set up alerting (email/Slack)
- [ ] Plan for Godot version upgrades
:::

::: warning Performance vs. Safety Trade-offs
**High performance** (development):
```bash
godot-mcp-server --project . --cache-ttl 600 --no-backup
```

**High safety** (production):
```bash
godot-mcp-server --project . --cache-ttl 60 --backup-dir /mnt/backups --audit-log /var/log/mcp
```

Choose based on your risk tolerance.
:::
