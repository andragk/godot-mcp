---
title: Entwicklungsumgebung einrichten
description: Voraussetzungen, Umgebungskonfiguration und Workspace-Vorbereitung für die Godot MCP Server-Entwicklung
outline: [2, 3]
---

# Entwicklungsumgebung einrichten

Diese Anleitung führt durch die Einrichtung Ihrer Entwicklungsumgebung zum Erstellen und Testen des Godot MCP Servers.

## Voraussetzungen

### Erforderliche Software

| Tool | Version | Zweck |
|------|---------|---------|
| **Node.js** | 20.0.0 oder später | Runtime für MCP-Server |
| **npm** | 10.0.0 oder später | Paketverwaltung |
| **Godot Engine** | 4.6.0 oder später | Ziel-Laufzeitumgebung |
| **Git** | Beliebige aktuelle Version | Versionskontrolle |
| **VS Code** | Neueste (empfohlen) | IDE mit MCP-Erweiterungen |

### Optionale Tools

| Tool | Zweck |
|------|---------|
| **Postman** oder **curl** | HTTP-Endpunkte testen |
| **pnpm** | Alternative Paketverwaltung (schneller) |
| **Docker** | Containerisierte Bereitstellung (Phase 2) |

## Node.js-Umgebung

### Installation

**nvm verwenden (Empfohlen):**
```powershell
# nvm-windows installieren: https://github.com/coreybutler/nvm-windows

# Node.js 20 LTS installieren
nvm install 20
nvm use 20

# Installation verifizieren
node --version  # Sollte v20.x.x ausgeben
npm --version   # Sollte 10.x.x ausgeben
```

**Direkte Installation:**
- Von [nodejs.org](https://nodejs.org/) herunterladen
- "LTS"-Version wählen (20.x)
- Installer mit Standardoptionen ausführen

### Globale Abhängigkeiten

```powershell
# TypeScript-Compiler
npm install -g typescript

# ts-node für Entwicklung
npm install -g ts-node

# Vitest für Tests
npm install -g vitest

# Optional: pnpm für schnellere Installationen
npm install -g pnpm
```

## Godot Engine

### Installation

**Offizieller Build:**
1. Von [godotengine.org](https://godotengine.org/download/) herunterladen
2. **Godot 4.6.x** (stable) wählen
3. In ein Verzeichnis extrahieren (keine Installation erforderlich)
4. Zu PATH hinzufügen (optional):
```powershell
# Godot zu System-PATH hinzufügen
$env:PATH += ";C:\Tools\Godot_v4.6.0-stable_win64"
```

**Installation verifizieren:**
```powershell
# Sollte Godot Projektmanager öffnen
godot --version
# Erwartete Ausgabe: 4.6.0.stable.official [abcdef123]
```

### Testprojekt-Setup

Minimales Godot-Projekt zum Testen erstellen:

```powershell
# Testprojekt-Verzeichnis erstellen
mkdir test-godot-project
cd test-godot-project

# project.godot erstellen
@"
config_version=5

[application]
config/name="MCP Test Project"
config/features=PackedStringArray("4.6", "Forward Plus")
"@ | Out-File -Encoding UTF8 project.godot

# Basis-Ordnerstruktur erstellen
mkdir scenes, scripts, assets

# In Godot öffnen
godot --editor .
```

## Projektstruktur

### Repository klonen

```powershell
# Von GitHub klonen
git clone https://github.com/yourusername/godot-mcp-server.git
cd godot-mcp-server

# Feature-Branch erstellen
git checkout -b feature/initial-setup
```

### Verzeichnis-Layout

```
godot-mcp-server/
├── mcp-server/              # Node.js MCP-Server
│   ├── src/
│   │   ├── server.ts        # Haupt-Einstiegspunkt
│   │   ├── tools/           # Tool-Implementierungen
│   │   ├── http/            # Godot HTTP-Client
│   │   ├── validation/      # Zod-Schemas
│   │   └── utils/           # Utilities
│   ├── tests/               # Vitest-Tests
│   ├── package.json
│   └── tsconfig.json
├── godot-bridge/            # Godot GDScript-Bridge
│   ├── addons/
│   │   └── godot-mcp/
│   │       ├── plugin.cfg
│   │       ├── http_server.gd
│   │       ├── rpc_router.gd
│   │       ├── scene_manager.gd
│   │       └── script_manager.gd
│   └── project.godot
├── web-ui/                  # Sidecar-Dashboard
│   ├── public/
│   │   ├── index.html
│   │   ├── css/
│   │   └── js/
│   └── package.json
├── docs/                    # Dokumentation
├── .github/                 # CI/CD-Workflows
└── README.md
```

## Node.js MCP Server-Setup

### Projekt initialisieren

```powershell
cd mcp-server

# npm-Projekt initialisieren
npm init -y

# Abhängigkeiten installieren
npm install @modelcontextprotocol/sdk undici zod pino lru-cache express

# Dev-Abhängigkeiten installieren
npm install -D typescript @types/node @types/express
npm install -D vitest @vitest/ui
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install -D prettier
```

### TypeScript-Konfiguration

`tsconfig.json` erstellen:
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

### Package.json-Scripts

`package.json` aktualisieren:
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

## Godot Bridge-Setup

### Addon-Struktur erstellen

```powershell
cd godot-bridge

# Addon-Verzeichnisse erstellen
mkdir -p addons/godot-mcp

# plugin.cfg erstellen
@"
[plugin]
name="Godot MCP Bridge"
description="HTTP-Server-Bridge für Model Context Protocol-Integration"
author="Your Name"
version="1.0.0"
script="plugin.gd"
"@ | Out-File -Encoding UTF8 addons/godot-mcp/plugin.cfg
```

### Godot-Projekt konfigurieren

`project.godot` erstellen/aktualisieren:
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

### Plugin aktivieren

```powershell
# In Godot Editor öffnen
godot --editor .

# Im Godot Editor:
# 1. Zu Projekt → Projekteinstellungen → Plugins gehen
# 2. "Godot MCP Bridge" aktivieren
# 3. "HttpServer started on port 7777" im Ausgabepanel verifizieren
```

## Web-UI-Setup

### Frontend initialisieren

```powershell
cd web-ui

# package.json erstellen
npm init -y

# Tailwind CSS installieren (optional: stattdessen CDN verwenden)
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init
```

### Basis-HTML-Struktur

`public/index.html` erstellen:
```html
<!DOCTYPE html>
<html lang="de">
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

## Umgebungsvariablen

`.env`-Datei im Projektstamm erstellen:
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
```

Zu `.gitignore` hinzufügen:
```gitignore
# Umgebung
.env.local
.env.*.local

# Abhängigkeiten
node_modules/
dist/
.godot/

# Logs
logs/
*.log
```

## Verifizierungsschritte

### 1. Node.js-Setup testen

```powershell
cd mcp-server
npm run build   # Sollte ohne Fehler kompilieren
npm run test    # Sollte Tests ausführen (initial 0 Tests)
```

### 2. Godot Bridge testen

```powershell
# Godot mit HTTP-Server starten
cd godot-bridge
godot --headless .

# In anderem Terminal, Health-Endpunkt testen
curl http://localhost:7777/health
# Erwartet: {"status":"ok","uptime_ms":...}
```

### 3. Vollständige Integration testen

```powershell
# Terminal 1: Godot starten
cd godot-bridge
godot --headless .

# Terminal 2: MCP-Server starten
cd mcp-server
npm run dev

# Terminal 3: MCP-Tool testen
# (MCP-Inspector oder VS Code-Erweiterung verwenden)
```

## Fehlerbehebung

### Node.js-Probleme

**Fehler: Cannot find module '@modelcontextprotocol/sdk'**
```powershell
# Abhängigkeiten neu installieren
rm -Recurse -Force node_modules, package-lock.json
npm install
```

### Godot-Probleme

**Fehler: Port 7777 bereits verwendet**
```powershell
# Prozess finden und beenden, der Port 7777 verwendet
netstat -ano | findstr :7777
# PID notieren, dann:
taskkill /PID <PID> /F
```

**Fehler: Plugin lädt nicht**
- Verifizieren, dass `plugin.cfg` in `addons/godot-mcp/` existiert
- Godot Editor → Projekt → Projekteinstellungen → Plugins prüfen
- Godot Editor neu starten
- Ausgabepanel auf Fehler prüfen

## Nächste Schritte

- [Node.js Server-Implementierung](/de/implementation/node-server) - MCP-Server erstellen
- [Godot Bridge-Implementierung](/de/implementation/godot-bridge) - HTTP-Server erstellen
- [Teststrategie](/de/implementation/testing) - Umfassende Tests schreiben

:::tip Entwicklungs-Workflow
1. Godot im Headless-Modus starten (`godot --headless .`)
2. Node.js-Server im Watch-Modus starten (`npm run dev`)
3. VS Code-Debugger für Breakpoints verwenden
4. Tests zuerst schreiben (TDD-Ansatz)
5. Häufig in Feature-Branch committen
:::
