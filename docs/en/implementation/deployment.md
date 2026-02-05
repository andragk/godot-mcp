---
title: Deployment Guide
description: Package, publish, and deploy the Godot MCP Server for production use
outline: [2, 3]
---

# Deployment Guide

This guide covers packaging, publishing, and deploying the Godot MCP Server for production use.

## Pre-Deployment Checklist

### Core Requirements
- [ ] All tests passing (unit, integration, E2E)
- [ ] Code coverage ≥80%
- [ ] Documentation up to date
- [ ] CHANGELOG.md updated
- [ ] Version bumped in `package.json`
- [ ] Security audit clean (`npm audit`)
- [ ] Performance benchmarks met
- [ ] License headers present

### Feature Module Validation
- [ ] **Physics Module**: Test all 32 collision layers, validate physics materials
- [ ] **UI Module**: Verify Control node creation, theme loading, anchor presets
- [ ] **Animation Module**: Test animation creation, keyframe insertion, method tracks
- [ ] **Settings Module**: Validate project.godot writes, autoload prevention
- [ ] **Debug Module**: Test log capture, profiling, output filtering
- [ ] **Documentation Module**: Verify GDScript parsing, Markdown generation
- [ ] **UID Module**: Test UID assignment, uniqueness validation, cache integrity

### Production Hardening
- [ ] Feature modules respect security boundaries (no autoload/plugin access)
- [ ] All module operations logged for audit trail
- [ ] Rate limits configured per module (if applicable)
- [ ] Module-specific error handling implemented
- [ ] Feature flags tested (enable/disable individual modules)

## NPM Package Deployment

### Configure package.json

Update `mcp-server/package.json`:

```json
{
  "name": "@your-org/godot-mcp-server",
  "version": "1.0.0",
  "description": "Model Context Protocol server for Godot Engine 4.6+",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "godot-mcp-server": "./dist/cli.js"
  },
  "files": [
    "dist/**/*",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "prepublishOnly": "npm run build && npm test",
    "build": "tsc",
    "test": "vitest run",
    "pack:check": "npm pack --dry-run"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/godot-mcp-server.git"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "godot",
    "game-engine",
    "ai",
    "llm"
  ],
  "author": "Your Name <your@email.com>",
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  }
}
```

### Build for Production

```powershell
cd mcp-server

# Clean previous builds
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue

# Build TypeScript
npm run build

# Verify output
Get-ChildItem dist -Recurse
```

### Test Package Locally

```powershell
# Create tarball without publishing
npm pack

# Extract and inspect
tar -xzf your-org-godot-mcp-server-1.0.0.tgz

# Test installation locally
npm install -g ./your-org-godot-mcp-server-1.0.0.tgz

# Verify CLI works
godot-mcp-server --version
```

### Publish to NPM

```powershell
# Login to NPM (first time only)
npm login

# Publish package
npm publish

# Or publish with tag
npm publish --tag beta
```

:::tip Version Management
Use semantic versioning:
- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New features (backward compatible)
- **Patch** (1.0.0 → 1.0.1): Bug fixes

Pre-release tags:
- `1.0.0-alpha.1`: Early unstable
- `1.0.0-beta.1`: Feature complete, testing
- `1.0.0-rc.1`: Release candidate
:::

## Godot Addon Deployment

### Package for Asset Library

Create addon structure:

```
godot-mcp-bridge/
├── addons/
│   └── godot_mcp_bridge/
│       ├── plugin.cfg
│       ├── plugin.gd
│       ├── http_server.gd
│       ├── rpc_router.gd
│       ├── scene_manager.gd
│       └── icon.png
├── README.md
└── LICENSE
```

### Configure plugin.cfg

```ini
[plugin]

name="Godot MCP Bridge"
description="HTTP server bridge for Model Context Protocol integration"
author="Your Name"
version="1.0.0"
script="plugin.gd"
```

### Create Asset Library Package

```powershell
# Navigate to project root
cd godot-mcp-bridge

# Create zip for Asset Library
Compress-Archive -Path addons,README.md,LICENSE -DestinationPath godot-mcp-bridge-v1.0.0.zip

# Verify contents
Expand-Archive godot-mcp-bridge-v1.0.0.zip -DestinationPath temp-check
Get-ChildItem temp-check -Recurse
```

### Submit to Asset Library

1. Go to [Godot Asset Library](https://godotengine.org/asset-library)
2. Click **Submit Asset**
3. Fill in details:
   - **Name:** Godot MCP Bridge
   - **Category:** Script
   - **Godot Version:** 4.6+
   - **License:** MIT
   - **Repository:** GitHub URL
   - **Download Link:** GitHub Release URL
4. Upload screenshots
5. Submit for review

:::warning Asset Library Guidelines
- Icon must be 256x256 PNG
- No external dependencies in addon code
- Must work on all platforms (Windows, macOS, Linux)
- Include usage examples in README
- Test on Godot 4.6+ before submission
:::

## Docker Deployment

### Create Dockerfile

Create `Dockerfile`:

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY mcp-server/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY mcp-server/src ./src
COPY mcp-server/tsconfig.json ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

# Install Godot headless
RUN apk add --no-cache wget unzip && \
    wget https://downloads.tuxfamily.org/godotengine/4.6/Godot_v4.6-stable_linux_headless.64.zip && \
    unzip Godot_v4.6-stable_linux_headless.64.zip -d /usr/local/bin && \
    mv /usr/local/bin/Godot_v4.6-stable_linux_headless.64 /usr/local/bin/godot && \
    chmod +x /usr/local/bin/godot && \
    rm Godot_v4.6-stable_linux_headless.64.zip && \
    apk del wget unzip

WORKDIR /app

# Copy from build stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Copy Godot project
COPY godot-bridge /app/godot-bridge

# Expose ports
EXPOSE 7777 3000

# Environment variables
ENV NODE_ENV=production
ENV GODOT_PROJECT_PATH=/app/godot-bridge
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start both servers
CMD ["sh", "-c", "godot --headless --path $GODOT_PROJECT_PATH & node dist/server.js"]
```

### Build Docker Image

```powershell
# Build image
docker build -t godot-mcp-server:1.0.0 .

# Tag for registry
docker tag godot-mcp-server:1.0.0 your-registry.io/godot-mcp-server:1.0.0
docker tag godot-mcp-server:1.0.0 your-registry.io/godot-mcp-server:latest

# Push to registry
docker push your-registry.io/godot-mcp-server:1.0.0
docker push your-registry.io/godot-mcp-server:latest
```

### Run with Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  godot-mcp-server:
    image: godot-mcp-server:1.0.0
    container_name: godot-mcp
    ports:
      - "7777:7777"  # Godot bridge
      - "3000:3000"  # Web UI
    volumes:
      - ./projects:/app/projects  # Mount Godot projects
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 3s
      retries: 3
```

Run:

```powershell
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## GitHub Releases

### Automated Release Workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci
        working-directory: ./mcp-server

      - name: Run tests
        run: npm test
        working-directory: ./mcp-server

      - name: Build
        run: npm run build
        working-directory: ./mcp-server

      - name: Publish to NPM
        run: npm publish
        working-directory: ./mcp-server
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Package Godot addon
        run: |
          Compress-Archive -Path addons,README.md,LICENSE -DestinationPath godot-mcp-bridge.zip
        working-directory: ./godot-bridge

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            mcp-server/dist/**
            godot-bridge/godot-mcp-bridge.zip
          body: |
            ## Changes in this release
            See [CHANGELOG.md](CHANGELOG.md) for details.

            ## Installation

            **NPM Package:**
            ```bash
            npm install -g @your-org/godot-mcp-server@${{ github.ref_name }}
            ```

            **Godot Addon:**
            Download `godot-mcp-bridge.zip` and extract to your project's `addons/` folder.
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Manual Release

```powershell
# Create tag
git tag -a v1.0.0 -m "Release version 1.0.0"

# Push tag
git push origin v1.0.0

# GitHub Actions will automatically:
# 1. Run tests
# 2. Build project
# 3. Publish to NPM
# 4. Create GitHub release with assets
```

## Production Configuration

### Environment Variables

Create `.env.production`:

```env
# Server
NODE_ENV=production
PORT=3000

# Godot Bridge
GODOT_BRIDGE_URL=http://localhost:7777
GODOT_BRIDGE_TIMEOUT=30000

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/godot-mcp/server.log

# Cache
CACHE_MAX_SIZE=1000
CACHE_TTL=300

# Security
ALLOWED_ORIGINS=https://your-app.com
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW=60000
```

### Systemd Service (Linux)

Create `/etc/systemd/system/godot-mcp.service`:

```ini
[Unit]
Description=Godot MCP Server
After=network.target

[Service]
Type=simple
User=godot-mcp
WorkingDirectory=/opt/godot-mcp
ExecStart=/usr/bin/node /opt/godot-mcp/dist/server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/godot-mcp/.env.production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable godot-mcp
sudo systemctl start godot-mcp
sudo systemctl status godot-mcp
```

## Monitoring & Logging

### Structured Logging

Configure Pino for production:

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true },
      },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
```

### Health Check Endpoint

```typescript
app.get('/api/health', async (req, res) => {
  const godotHealthy = await godotClient.healthCheck();

  const health = {
    status: godotHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version,
    components: {
      godot: godotHealthy ? 'up' : 'down',
      cache: 'up',
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
      },
    },
  };

  res.status(godotHealthy ? 200 : 503).json(health);
});
```

## Rollback Strategy

### NPM Package Rollback

```powershell
# Unpublish specific version (within 72 hours)
npm unpublish @your-org/godot-mcp-server@1.0.1

# Or deprecate version
npm deprecate @your-org/godot-mcp-server@1.0.1 "Use version 1.0.2 instead"
```

### Docker Rollback

```powershell
# Pull previous version
docker pull your-registry.io/godot-mcp-server:1.0.0

# Restart with previous version
docker-compose down
# Update docker-compose.yml to use 1.0.0
docker-compose up -d
```

## Security Considerations

### Production Hardening

- **Bind to localhost only:** Prevent external access to Godot bridge
- **Use HTTPS:** Encrypt traffic with TLS certificates
- **Rate limiting:** Protect against abuse
- **Input validation:** Sanitize all user inputs
- **Secrets management:** Use environment variables or secret managers
- **Regular updates:** Apply security patches promptly

### Security Checklist

- [ ] No secrets in source code or Docker images
- [ ] TLS/SSL certificates configured
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] CORS configured properly
- [ ] Security headers set (Helmet.js)
- [ ] Regular dependency audits (`npm audit`)

## Next Steps

- [Testing Guide](/en/implementation/testing) - Verify deployment
- [Best Practices](/en/best-practices) - Production guidelines

:::tip Deployment Best Practices
- **Automate everything:** CI/CD pipeline for consistent releases
- **Test before deploy:** Run full test suite on production build
- **Monitor health:** Set up alerts for failures
- **Document changes:** Keep CHANGELOG.md updated
- **Version dependencies:** Lock versions with package-lock.json
- **Plan rollbacks:** Always have a rollback strategy
:::

:::warning Production Considerations
- Never expose Godot bridge (port 7777) to public internet
- Always use environment variables for configuration
- Enable structured logging for debugging
- Set up health checks for container orchestration
- Monitor resource usage (CPU, memory, disk)
- Implement graceful shutdown handling
:::
