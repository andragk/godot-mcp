---
title: Development Setup
description: Prerequisites, environment configuration, and workspace preparation for Godot MCP Server development
outline: [2, 3]
---

# Development Setup

This guide walks through setting up your development environment for building and testing the Godot MCP Server.

## Prerequisites

### Required Software

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20.0.0 or later | Runtime for MCP server |
| **npm** | 10.0.0 or later | Package management |
| **Godot Engine** | 4.6.0 or later | Target runtime environment |
| **Git** | Any recent version | Version control |
| **VS Code** | Latest (recommended) | IDE with MCP extensions |

### Optional Tools

| Tool | Purpose |
|------|---------|
| **Postman** or **curl** | Testing HTTP endpoints |
| **pnpm** | Alternative package manager (faster) |
| **Docker** | Containerized deployment (Phase 2) |

---

## Node.js Environment

### Installation

**Using nvm (Recommended):**
```powershell
# Install nvm-windows: https://github.com/coreybutler/nvm-windows

# Install Node.js 20 LTS
nvm install 20
nvm use 20

# Verify installation
node --version  # Should output v20.x.x
npm --version   # Should output 10.x.x
```

**Direct Installation:**
- Download from [nodejs.org](https://nodejs.org/)
- Choose "LTS" version (20.x)
- Run installer with default options

### Global Dependencies

```powershell
# TypeScript compiler
npm install -g typescript

# ts-node for development
npm install -g ts-node

# Vitest for testing
npm install -g vitest

# Optional: pnpm for faster installs
npm install -g pnpm
```

---

## Godot Engine

### Installation

**Official Build:**
1. Download from [godotengine.org](https://godotengine.org/download/)
2. Choose **Godot 4.6.x** (stable)
3. Extract to a directory (no installation needed)
4. Add to PATH (optional):
```powershell
# Add Godot to system PATH
$env:PATH += ";C:\Tools\Godot_v4.6.0-stable_win64"
```

**Verify Installation:**
```powershell
# Should open Godot project manager
godot --version
# Expected output: 4.6.0.stable.official [abcdef123]
```

### Test Project Setup

Create a minimal Godot project for testing:

```powershell
# Create test project directory
mkdir test-godot-project
cd test-godot-project

# Create project.godot
@"
config_version=5

[application]
config/name="MCP Test Project"
config/features=PackedStringArray("4.6", "Forward Plus")
"@ | Out-File -Encoding UTF8 project.godot

# Create basic folder structure
mkdir scenes, scripts, assets

# Open in Godot
godot --editor .
```

---

## Project Structure

### Clone Repository

```powershell
# Clone from GitHub
git clone https://github.com/yourusername/godot-mcp-server.git
cd godot-mcp-server

# Create feature branch
git checkout -b feature/initial-setup
```

### Directory Layout

```
godot-mcp-server/
├── mcp-server/              # Node.js MCP server
│   ├── src/
│   │   ├── server.ts        # Main entry point
│   │   ├── tools/           # Tool implementations
│   │   ├── http/            # Godot HTTP client
│   │   ├── validation/      # Zod schemas
│   │   └── utils/           # Utilities
│   ├── tests/               # Vitest tests
│   ├── package.json
│   └── tsconfig.json
├── godot-bridge/            # Godot GDScript bridge
│   ├── addons/
│   │   └── godot-mcp/
│   │       ├── plugin.cfg
│   │       ├── http_server.gd
│   │       ├── rpc_router.gd
│   │       ├── scene_manager.gd
│   │       └── script_manager.gd
│   └── project.godot
├── web-ui/                  # Sidecar dashboard
│   ├── public/
│   │   ├── index.html
│   │   ├── css/
│   │   └── js/
│   └── package.json
├── docs/                    # Documentation
├── .github/                 # CI/CD workflows
└── README.md
```

---

## Node.js MCP Server Setup

### Initialize Project

```powershell
cd mcp-server

# Initialize npm project
npm init -y

# Install core dependencies
npm install @modelcontextprotocol/sdk zod undici pino dotenv

# Install development dependencies
npm install -D typescript @types/node ts-node vitest @vitest/ui tsx

# Create .env file for feature module configuration
echo "# Godot Project
PROJECT_PATH=../godot-bridge
GODOT_PORT=7777

# Feature Modules
ENABLE_PHYSICS_MODULE=true
ENABLE_UI_MODULE=true
ENABLE_ANIMATION_MODULE=true
ENABLE_SETTINGS_MODULE=true
ENABLE_DEBUG_MODULE=true
ENABLE_DOCS_MODULE=true
ENABLE_UID_MODULE=true

# Physics Module Settings
PHYSICS_MAX_LAYERS=32
PHYSICS_VALIDATE_MATERIALS=true

# UI Module Settings
UI_MAX_HIERARCHY_DEPTH=10
UI_VALIDATE_THEMES=true

# Animation Module Settings
ANIMATION_MAX_TRACKS=100
ANIMATION_MAX_KEYFRAMES=1000

# Debug Module Settings
DEBUG_LOG_BUFFER_SIZE=10000
DEBUG_ENABLE_PROFILING=true

# Documentation Module Settings
DOCS_OUTPUT_FORMAT=markdown
DOCS_INCLUDE_PRIVATE=false

# UID Module Settings
UID_CACHE_PATH=.godot/uid_cache.bin
UID_VALIDATE_UNIQUENESS=true" > .env
npm install @modelcontextprotocol/sdk undici zod pino lru-cache
npm install express

# Install dev dependencies
npm install -D typescript @types/node @types/express
npm install -D vitest @vitest/ui
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install -D prettier
```

### TypeScript Configuration

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node", "vitest"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Package.json Scripts

Update `package.json`:
```json
{
  "name": "godot-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node --esm src/server.ts",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write \"src/**/*.ts\"",
    "clean": "rimraf dist"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  }
}
```

### ESLint Configuration

Create `.eslintrc.json`:
```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",
    "no-console": "off"
  }
}
```

### Prettier Configuration

Create `.prettierrc`:
```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

---

## Godot Bridge Setup

### Create Addon Structure

```powershell
cd godot-bridge

# Create addon directories
mkdir -p addons/godot-mcp

# Create plugin.cfg
@"
[plugin]
name="Godot MCP Bridge"
description="HTTP server exposing Godot capabilities to MCP clients"
author="Your Name"
version="1.0.0"
script="plugin.gd"
"@ | Out-File -Encoding UTF8 addons/godot-mcp/plugin.cfg
```

### Configure Godot Project

Create/update `project.godot`:
```ini
config_version=5

[application]
config/name="Godot MCP Bridge"
run/main_scene="res://test_scene.tscn"
config/features=PackedStringArray("4.6", "Forward Plus")

[editor_plugins]
enabled=PackedStringArray("res://addons/godot-mcp/plugin.cfg")

[network]
limits/debugger_stdout/max_messages_per_frame=100
```

### Enable Plugin

```powershell
# Open in Godot Editor
godot --editor .

# In Godot Editor:
# 1. Go to Project → Project Settings → Plugins
# 2. Enable "Godot MCP Bridge"
# 3. Verify "HttpServer started on port 7777" in Output panel
```

---

## Web UI Setup

### Initialize Frontend

```powershell
cd web-ui

# Create package.json
npm init -y

# Install Tailwind CSS (optional: use CDN instead)
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init
```

### Tailwind Configuration

Update `tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./public/**/*.html', './public/**/*.js'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

### Basic HTML Structure

Create `public/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Godot MCP Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>
</head>
<body class="bg-gray-100">
  <div x-data="dashboard()" class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">Godot MCP Server</h1>
    
    <div class="bg-white p-4 rounded shadow">
      <div class="status-badge" :class="statusColor">
        <span x-text="status"></span>
      </div>
      <p>Uptime: <span x-text="uptime"></span></p>
    </div>
  </div>
  
  <script src="/js/app.js"></script>
</body>
</html>
```

---

## VS Code Configuration

### Recommended Extensions

Create `.vscode/extensions.json`:
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "vitest.explorer",
    "bradlc.vscode-tailwindcss",
    "genieai.chatgpt-vscode"
  ]
}
```

### Workspace Settings

Create `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.godot": true
  }
}
```

### Debug Configuration

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug MCP Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "node",
      "runtimeArgs": ["--loader", "ts-node/esm"],
      "args": ["src/server.ts"],
      "cwd": "${workspaceFolder}/mcp-server",
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

---

## Environment Variables

Create `.env` file in project root:
```env
# Node.js MCP Server
MCP_HOST=127.0.0.1
MCP_PORT=3000
MCP_LOG_LEVEL=debug

# Godot Bridge
GODOT_HOST=127.0.0.1
GODOT_PORT=7777
GODOT_TIMEOUT_MS=10000

# Web UI
WEB_UI_PORT=3000

# Cache
CACHE_ENABLED=true
CACHE_MAX_ITEMS=100
CACHE_TTL_SECONDS=300

# Logging
LOG_TO_FILE=true
LOG_FILE_PATH=./logs/server.log
```

Add to `.gitignore`:
```gitignore
# Environment
.env.local
.env.*.local

# Dependencies
node_modules/
dist/
.godot/

# Logs
logs/
*.log

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
```

---

## Verification Steps

### 1. Test Node.js Setup

```powershell
cd mcp-server
npm run build   # Should compile without errors
npm run test    # Should run tests (0 tests initially)
```

### 2. Test Godot Bridge

```powershell
# Start Godot with HTTP server
cd godot-bridge
godot --headless .

# In another terminal, test health endpoint
curl http://localhost:7777/health
# Expected: {"status":"ok","uptime_ms":...}
```

### 3. Test Full Integration

```powershell
# Terminal 1: Start Godot
cd godot-bridge
godot --headless .

# Terminal 2: Start MCP server
cd mcp-server
npm run dev

# Terminal 3: Test MCP tool
# (Use MCP inspector or VS Code extension)
```

---

## Troubleshooting

### Node.js Issues

**Error: Cannot find module '@modelcontextprotocol/sdk'**
```powershell
# Reinstall dependencies
rm -Recurse -Force node_modules, package-lock.json
npm install
```

**Error: TypeScript compilation failed**
```powershell
# Check TypeScript version
npx tsc --version  # Should be 5.3+

# Clean and rebuild
npm run clean
npm run build
```

### Godot Issues

**Error: Port 7777 already in use**
```powershell
# Find and kill process using port 7777
netstat -ano | findstr :7777
# Note PID, then:
taskkill /PID <PID> /F

# Or change port in Godot bridge
```

**Error: Plugin not loading**
- Verify `plugin.cfg` exists in `addons/godot-mcp/`
- Check Godot Editor → Project → Project Settings → Plugins
- Restart Godot Editor
- Check Output panel for errors

### Integration Issues

**Error: Godot not responding to HTTP requests**
```powershell
# Verify Godot is running
curl http://localhost:7777/health

# Check firewall isn't blocking localhost
# Check Godot console for error messages
```

---

## Next Steps

- [Implementation Roadmap](/en/implementation/roadmap) - Complete Sprint 1-12 timeline
- [Node.js Server Implementation](/en/implementation/node-server) - Build the MCP server
- [Godot Bridge Implementation](/en/implementation/godot-bridge) - Create the HTTP server
- [Testing Strategy](/en/implementation/testing) - Write comprehensive tests

:::tip Development Workflow
Follow the [Implementation Roadmap](./roadmap.md) for a structured 6-month plan from MVP to v1.0. Sprint 1 covers the foundation setup detailed on this page.
:::
1. Start Godot in headless mode (`godot --headless .`)
2. Start Node.js server in watch mode (`npm run dev`)
3. Use VS Code debugger for breakpoints
4. Write tests first (TDD approach)
5. Commit frequently to feature branch
:::
