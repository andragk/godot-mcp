---
title: Sidecar Web UI erstellen
description: Schritt-für-Schritt-Anleitung zur Implementierung des Web-basierten Monitoring-Dashboards mit Alpine.js und Tailwind CSS
outline: [2, 3]
---

# Sidecar Web UI erstellen

Diese Anleitung führt durch die Implementierung des Sidecar Web UI - eines leichtgewichtigen Dashboards zur Überwachung von MCP-Server-Aktivität, Tool-Aufrufen und Godot-Verbindungsstatus.

## Projektstruktur

```
src/presentation/
├── web-server.ts              # Express HTTP + SSE Server
├── public/
│   ├── index.html            # Haupt-Dashboard
│   ├── styles.css            # Tailwind Kompilierung
│   └── app.js                # Alpine.js Komponenten
```

## Schritt 1: Web Server Setup

### Express Server mit SSE

`src/presentation/web-server.ts` erstellen:

```typescript
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { EventEmitter } from 'events';
import { logger } from '../infrastructure/logger.js';

export class WebUIServer extends EventEmitter {
  private app = express();
  private clients: Response[] = [];
  private server: any;

  constructor() {
    super();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  private setupRoutes() {
    // Health-Endpoint
    this.app.get('/api/health', (_req, res) => {
      res.json({ status: 'healthy', uptime: process.uptime() });
    });

    // Server-Ereignisse (SSE)
    this.app.get('/api/events', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      this.clients.push(res);
      logger.debug('SSE-Client verbunden');

      // Initiale Verbindungsnachricht
      this.sendEvent(res, 'connected', { timestamp: Date.now() });

      req.on('close', () => {
        this.clients = this.clients.filter(client => client !== res);
        logger.debug('SSE-Client getrennt');
      });
    });

    // Tool-Aufrufliste abrufen
    this.app.get('/api/invocations', (_req, res) => {
      // TODO: Aus Datenbank/Speicher abrufen
      res.json({ invocations: [] });
    });
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        logger.info({ port }, 'Web UI Server läuft');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.clients.forEach(client => client.end());
      this.clients = [];
    }
  }

  // Event an alle SSE-Clients senden
  sendEvent(client: Response | null, event: string, data: any) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    
    if (client) {
      client.write(payload);
    } else {
      this.clients.forEach(c => c.write(payload));
    }
  }

  // Tool-Aufruf-Event broadcasten
  broadcastInvocation(toolName: string, params: any, result: any, latencyMs: number) {
    this.sendEvent(null, 'tool_invocation', {
      tool: toolName,
      params,
      result,
      latencyMs,
      timestamp: Date.now(),
    });
  }
}
```

## Schritt 2: HTML Dashboard

### Haupt-HTML-Datei

`src/presentation/public/index.html` erstellen:

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Godot MCP Server Dashboard</title>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <div x-data="dashboard()" x-init="init()" class="min-h-screen">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 shadow">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex justify-between items-center">
          <h1 class="text-2xl font-bold">Godot MCP Server</h1>
          
          <!-- Verbindungsstatus -->
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2">
              <div 
                class="w-3 h-3 rounded-full"
                :class="isConnected ? 'bg-green-500' : 'bg-red-500'"
              ></div>
              <span class="text-sm" x-text="isConnected ? 'Verbunden' : 'Getrennt'"></span>
            </div>
            
            <div class="text-sm text-gray-500">
              Uptime: <span x-text="formatUptime(uptime)"></span>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Haupt-Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Statistiken -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="text-sm font-medium text-gray-500 dark:text-gray-400">Tool-Aufrufe gesamt</div>
          <div class="text-3xl font-bold mt-2" x-text="stats.totalInvocations"></div>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="text-sm font-medium text-gray-500 dark:text-gray-400">Durchschn. Latenz</div>
          <div class="text-3xl font-bold mt-2" x-text="stats.avgLatency + 'ms'"></div>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="text-sm font-medium text-gray-500 dark:text-gray-400">Fehlerrate</div>
          <div class="text-3xl font-bold mt-2" x-text="stats.errorRate + '%'"></div>
        </div>
      </div>

      <!-- Aktuelle Aufrufe -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-semibold">Aktuelle Tool-Aufrufe</h2>
        </div>
        
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          <template x-for="invocation in recentInvocations" :key="invocation.timestamp">
            <div class="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700">
              <div class="flex justify-between items-start">
                <div class="flex-1">
                  <div class="flex items-center space-x-2">
                    <span class="font-mono text-sm font-medium" x-text="invocation.tool"></span>
                    <span 
                      class="px-2 py-1 text-xs rounded"
                      :class="invocation.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
                      x-text="invocation.success ? 'Erfolg' : 'Fehler'"
                    ></span>
                  </div>
                  
                  <div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    <details>
                      <summary class="cursor-pointer">Parameter anzeigen</summary>
                      <pre class="mt-2 bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto" x-text="JSON.stringify(invocation.params, null, 2)"></pre>
                    </details>
                  </div>
                </div>
                
                <div class="ml-4 text-right">
                  <div class="text-sm font-medium" x-text="invocation.latencyMs + 'ms'"></div>
                  <div class="text-xs text-gray-500" x-text="formatTimestamp(invocation.timestamp)"></div>
                </div>
              </div>
            </div>
          </template>
          
          <div x-show="recentInvocations.length === 0" class="px-6 py-12 text-center text-gray-500">
            Noch keine Tool-Aufrufe
          </div>
        </div>
      </div>
    </main>
  </div>

  <script src="/app.js"></script>
</body>
</html>
```

## Schritt 3: Alpine.js Komponente

### Dashboard-Logik

`src/presentation/public/app.js` erstellen:

```javascript
function dashboard() {
  return {
    isConnected: false,
    uptime: 0,
    stats: {
      totalInvocations: 0,
      avgLatency: 0,
      errorRate: 0,
    },
    recentInvocations: [],
    eventSource: null,

    async init() {
      await this.fetchHealth();
      this.connectSSE();
      
      // Uptime alle 5s aktualisieren
      setInterval(() => this.fetchHealth(), 5000);
    },

    async fetchHealth() {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        this.isConnected = true;
        this.uptime = data.uptime;
      } catch (error) {
        this.isConnected = false;
        console.error('Health-Check fehlgeschlagen:', error);
      }
    },

    connectSSE() {
      this.eventSource = new EventSource('/api/events');
      
      this.eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        console.log('Mit SSE verbunden:', data);
        this.isConnected = true;
      });
      
      this.eventSource.addEventListener('tool_invocation', (event) => {
        const invocation = JSON.parse(event.data);
        this.handleInvocation(invocation);
      });
      
      this.eventSource.onerror = () => {
        this.isConnected = false;
        console.error('SSE-Verbindung verloren');
      };
    },

    handleInvocation(invocation) {
      // Zu aktuellen Aufrufen hinzufügen
      this.recentInvocations.unshift({
        ...invocation,
        success: !invocation.result?.error,
      });
      
      // Auf 50 begrenzen
      if (this.recentInvocations.length > 50) {
        this.recentInvocations.pop();
      }
      
      // Statistiken aktualisieren
      this.updateStats();
    },

    updateStats() {
      const invocations = this.recentInvocations;
      
      this.stats.totalInvocations = invocations.length;
      
      if (invocations.length > 0) {
        const totalLatency = invocations.reduce((sum, inv) => sum + inv.latencyMs, 0);
        this.stats.avgLatency = Math.round(totalLatency / invocations.length);
        
        const errors = invocations.filter(inv => !inv.success).length;
        this.stats.errorRate = Math.round((errors / invocations.length) * 100);
      }
    },

    formatUptime(seconds) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      return `${hours}h ${minutes}m ${secs}s`;
    },

    formatTimestamp(timestamp) {
      return new Date(timestamp).toLocaleTimeString('de-DE');
    },
  };
}
```

## Schritt 4: Integration mit Tool Registry

### Tool Registry aktualisieren

In `src/domain/tool-registry.ts` Web-Server-Events hinzufügen:

```typescript
import { WebUIServer } from '../presentation/web-server.js';

export class ToolRegistry {
  constructor(
    private godotClient: GodotClient,
    private webUI?: WebUIServer  // Optional für Broadcast
  ) {}

  async execute(toolName: string, params: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const validated = tool.inputSchema.parse(params);
    const startTime = Date.now();
    
    try {
      const result = await tool.handler(validated);
      const latencyMs = Date.now() - startTime;
      
      // An Web UI broadcasten
      this.webUI?.broadcastInvocation(toolName, validated, result, latencyMs);
      
      logger.info({ tool: toolName, latencyMs }, 'Tool erfolgreich ausgeführt');
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      
      // Fehler an Web UI broadcasten
      this.webUI?.broadcastInvocation(toolName, validated, { error: error.message }, latencyMs);
      
      logger.error({ tool: toolName, latencyMs, error }, 'Tool-Ausführung fehlgeschlagen');
      throw error;
    }
  }
}
```

## Schritt 5: Testen

### Entwicklung starten

```powershell
npm run dev
```

### Dashboard öffnen

Browser öffnen unter: `http://localhost:8080`

### Tool-Aufrufe simulieren

```powershell
# MCP-Server über stdio aufrufen
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/server.js
```

## Styling-Anpassungen

### Custom Tailwind-Konfiguration

`src/presentation/public/styles.css` erstellen:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .status-indicator {
    @apply w-3 h-3 rounded-full animate-pulse;
  }
  
  .card {
    @apply bg-white dark:bg-gray-800 rounded-lg shadow;
  }
  
  .metric-value {
    @apply text-3xl font-bold mt-2;
  }
}
```

## Nächste Schritte

- [Tests schreiben](/de/implementation/testing) - Web-UI-Komponenten testen
- [Bereitstellung](/de/implementation/deployment) - Produktionsaufbau
- [API-Referenz](/de/api/web-ui) - Vollständige REST/SSE-API-Dokumentation

:::tip Best Practices
- Server-Sent Events (SSE) für Echtzeit-Updates verwenden
- Alpine.js-Komponenten klein und fokussiert halten
- Tailwind Utility-Klassen statt Custom-CSS bevorzugen
- Dark-Mode mit `dark:`-Variante unterstützen
- Fehler-States elegant behandeln
:::

---

## Vollständige Feature-Implementierungen

Für vollständige Alpine.js-Komponenten, Tailwind-Styling und Best Practices siehe die [englische Web-UI-Implementierungsdokumentation](/en/implementation/web-ui), die detaillierte Code-Beispiele für alle 7 Feature-Module enthält:

1. **Tool-Exploration & -Aufruf** - Dynamische Formulare, Schema-Viewer
2. **Ressourcenverwaltung** - Browser mit Vorschau und Suche  
3. **Traffic-Inspektion** - Split-View JSON-RPC-Monitor
4. **Verbindungsverwaltung** - Session-Tracking mit Kill-Switch
5. **Gesundheitsüberwachung** - Statusanzeigen und Health-Checks
6. **Konfiguration & Sicherheit** - Umgebungsvariablen, Zugriffskontrolle
7. **Erweiterte Protokollierung** - Log-Export und Filterung

Alle Komponenten sind vollständig lokalisierbar und können mit deutschen Texten angepasst werden.

