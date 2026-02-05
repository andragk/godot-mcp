---
title: Deployment-Leitfaden
description: Produktions-Deployment-Strategien für NPM-Pakete, Docker-Container und GitHub-Releases
outline: [2, 3]
---

# Deployment-Leitfaden

Diese Anleitung behandelt Produktions-Deployment-Strategien für das Godot MCP Server-Projekt, einschließlich NPM-Veröffentlichung, Docker-Containerisierung und GitHub-Release-Automatisierung.

## Deployment-Optionen

1. **NPM-Paket** - Einfache Installation via `npm install`
2. **Docker-Container** - Isolierte, reproduzierbare Umgebung
3. **Standalone-Binary** - Mit `pkg` gepackte ausführbare Datei
4. **GitHub-Release** - Versionierte Distributionen mit Assets

## Schritt 1: NPM-Paket-Deployment

### package.json vorbereiten

`package.json` für Veröffentlichung aktualisieren:

```json
{
  "name": "@your-org/godot-mcp-server",
  "version": "1.0.0",
  "description": "Model Context Protocol Server für Godot Engine",
  "type": "module",
  "main": "./dist/server.js",
  "bin": {
    "godot-mcp": "./dist/server.js"
  },
  "files": [
    "dist/**/*",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "prepublishOnly": "npm run build && npm test",
    "build": "tsc",
    "test": "vitest run"
  },
  "keywords": [
    "godot",
    "mcp",
    "model-context-protocol",
    "ai",
    "llm"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/godot-mcp.git"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "license": "MIT"
}
```

### NPM veröffentlichen

```powershell
# NPM-Registry anmelden
npm login

# Dry-run zur Vorschau
npm publish --dry-run

# Veröffentlichen
npm publish --access public

# Spezifische Version
npm publish --tag beta
```

### Installation testen

```powershell
# Global installieren
npm install -g @your-org/godot-mcp-server

# In Projekt installieren
npm install @your-org/godot-mcp-server

# Ausführen
godot-mcp
```

## Schritt 2: Docker-Deployment

### Dockerfile

`Dockerfile` im Projekt-Root erstellen:

```dockerfile
# Build-Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Dependencies installieren
COPY package*.json ./
RUN npm ci --only=production

# Source kopieren und bauen
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production-Stage
FROM node:20-alpine

WORKDIR /app

# Nur Production-Dependencies und gebaute Dateien
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Non-root User erstellen
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Port für Web UI
EXPOSE 3000

# Health-Check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/server.js"]
```

### Docker Compose

`docker-compose.yml` erstellen:

```yaml
version: '3.8'

services:
  godot-mcp:
    build: .
    image: godot-mcp-server:latest
    container_name: godot-mcp
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - GODOT_BRIDGE_URL=http://host.docker.internal:7777
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    networks:
      - mcp-network

networks:
  mcp-network:
    driver: bridge
```

### Docker-Image bauen und ausführen

```powershell
# Image bauen
docker build -t godot-mcp-server:latest .

# Container ausführen
docker run -d `
  --name godot-mcp `
  -p 3000:3000 `
  -e NODE_ENV=production `
  godot-mcp-server:latest

# Logs anzeigen
docker logs -f godot-mcp

# Mit Docker Compose
docker compose up -d
```

### Docker Hub veröffentlichen

```powershell
# Tag für Docker Hub
docker tag godot-mcp-server:latest your-username/godot-mcp-server:1.0.0
docker tag godot-mcp-server:latest your-username/godot-mcp-server:latest

# Push zu Docker Hub
docker push your-username/godot-mcp-server:1.0.0
docker push your-username/godot-mcp-server:latest
```

## Schritt 3: Standalone-Binary

### pkg verwenden

`pkg` installieren und konfigurieren:

```powershell
npm install -g pkg
```

`package.json` aktualisieren:

```json
{
  "pkg": {
    "scripts": "dist/**/*.js",
    "targets": [
      "node20-win-x64",
      "node20-linux-x64",
      "node20-macos-x64"
    ],
    "outputPath": "binaries"
  }
}
```

Binary erstellen:

```powershell
# Alle Plattformen bauen
pkg . --out-path binaries

# Spezifische Plattform
pkg . --targets node20-win-x64 --output binaries/godot-mcp-win.exe
```

## Schritt 4: GitHub-Releases

### Release-Workflow automatisieren

`.github/workflows/release.yml` erstellen:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Test
        run: npm test
      
      - name: Publish to NPM
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      
      - name: Build binaries
        run: |
          npm install -g pkg
          pkg . --targets node20-win-x64,node20-linux-x64,node20-macos-x64 --out-path binaries
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: binaries/*
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  
  docker:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      
      - name: Extract version
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            your-username/godot-mcp-server:${{ steps.version.outputs.VERSION }}
            your-username/godot-mcp-server:latest
          cache-from: type=registry,ref=your-username/godot-mcp-server:buildcache
          cache-to: type=registry,ref=your-username/godot-mcp-server:buildcache,mode=max
```

### Release erstellen

```powershell
# Version bumpen
npm version patch  # oder minor, major

# Git-Tag erstellen
git tag -a v1.0.0 -m "Release v1.0.0"

# Tag pushen (löst Workflow aus)
git push origin v1.0.0
```

## Schritt 5: Umgebungskonfiguration

### Produktions-Umgebungsvariablen

`.env.production` erstellen:

```bash
NODE_ENV=production
LOG_LEVEL=info
GODOT_BRIDGE_URL=http://localhost:7777
WEB_UI_PORT=3000

# Optional: Observability
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
OTEL_SERVICE_NAME=godot-mcp-server
```

### Config-Management

`src/config/environment.ts` erstellen:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  GODOT_BRIDGE_URL: z.string().url().default('http://localhost:7777'),
  WEB_UI_PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
});

export const env = envSchema.parse(process.env);
```

## Schritt 6: Monitoring & Observability

### Health-Check-Endpoint

```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    version: process.env.npm_package_version,
    timestamp: new Date().toISOString(),
  });
});

app.get('/readiness', async (req, res) => {
  const godotHealthy = await godotClient.healthCheck();
  
  if (!godotHealthy) {
    return res.status(503).json({
      status: 'not ready',
      reason: 'Godot Bridge nicht erreichbar',
    });
  }
  
  res.json({ status: 'ready' });
});
```

### Strukturiertes Logging (Produktion)

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Produktion: JSON-Format
  // Entwicklung: Pretty-Print
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});
```

### Metriken mit Prometheus

```typescript
import client from 'prom-client';

const register = new client.Registry();

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP-Request-Dauer in Sekunden',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const toolInvocations = new client.Counter({
  name: 'tool_invocations_total',
  help: 'Tool-Aufrufe gesamt',
  labelNames: ['tool_name', 'status'],
  registers: [register],
});

// Metriken-Endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

## Schritt 7: Rollback-Strategie

### NPM-Versions-Rollback

```powershell
# Spezifische Version deprecaten
npm deprecate @your-org/godot-mcp-server@1.0.1 "Bitte auf 1.0.2 upgraden"

# Zu vorheriger Version zurück
npm publish --tag latest-1
```

### Docker-Rollback

```powershell
# Zu vorherigem Image-Tag zurück
docker pull your-username/godot-mcp-server:1.0.0
docker tag your-username/godot-mcp-server:1.0.0 your-username/godot-mcp-server:latest
docker push your-username/godot-mcp-server:latest

# Container neu starten
docker compose down
docker compose up -d
```

## Best Practices

:::tip Deployment Best Practices
- **Semantic Versioning** (SemVer) verwenden
- **Tests vor Deployment** ausführen (`prepublishOnly`)
- **Umgebungsspezifische Configs** nutzen
- **Health-Checks** in Produktionsumgebungen implementieren
- **Graceful Shutdown** für laufende Requests
- **Structured Logging** für Observability
- **Immutable Deployments** (Docker-Images)
- **Automatisierte Rollbacks** für Ausfälle
:::

## Checkliste für Production-Readiness

- [ ] Alle Tests bestehen
- [ ] Code-Coverage ≥80%
- [ ] Keine bekannten Sicherheitslücken (`npm audit`)
- [ ] Umgebungsvariablen dokumentiert
- [ ] Health-Check-Endpoints implementiert
- [ ] Structured Logging konfiguriert
- [ ] Error-Tracking eingerichtet (z.B. Sentry)
- [ ] Monitoring-Dashboards erstellt
- [ ] Dokumentation aktualisiert
- [ ] Rollback-Prozedur getestet

## Nächste Schritte

- [Monitoring-Setup](/de/architecture/overview#observability)
- [Sicherheits-Hardening](/de/security-architecture)
- [Performance-Tuning](/de/best-practices#performance)

## Zusätzliche Ressourcen

- [NPM Publishing Guide](https://docs.npmjs.com/cli/v10/commands/npm-publish)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Node.js Production Checklist](https://github.com/goldbergyoni/nodebestpractices)
