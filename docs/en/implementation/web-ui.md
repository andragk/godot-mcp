---
title: Building the Sidecar Web UI
description: Creating the Alpine.js + Tailwind CSS monitoring dashboard with real-time status and log streaming
outline: [2, 3]
---

# Building the Sidecar Web UI

This guide shows how to build the browser-based monitoring dashboard using Alpine.js and Tailwind CSS.

## Project Structure

```
web-ui/
├── public/
│   ├── index.html          # Main dashboard
│   ├── js/
│   │   └── app.js          # Alpine.js components
│   └── css/
│       └── app.css         # Custom styles (minimal)
└── package.json            # Optional: build tools
```

## Step 1: HTML Structure

Create `public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Godot MCP Server - Dashboard</title>
  
  <!-- Tailwind CSS (CDN for simplicity) -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- Alpine.js -->
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>
  
  <style>
    [x-cloak] { display: none !important; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <div x-data="dashboard()" x-cloak>
    <!-- Header -->
    <header class="bg-white shadow">
      <div class="container mx-auto px-4 py-6">
        <h1 class="text-3xl font-bold text-gray-900">Godot MCP Server</h1>
        <p class="text-gray-600">Monitoring Dashboard</p>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8">
      <!-- Status Card -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4">Server Status</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Status Badge -->
          <div>
            <span class="text-sm text-gray-600">Status</span>
            <div class="mt-2">
              <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                    :class="statusBadgeClass">
                <svg class="w-2 h-2 mr-2" :class="statusColor" fill="currentColor" viewBox="0 0 8 8">
                  <circle cx="4" cy="4" r="3"/>
                </svg>
                <span x-text="status"></span>
              </span>
            </div>
          </div>
          
          <!-- Uptime -->
          <div>
            <span class="text-sm text-gray-600">Uptime</span>
            <p class="mt-2 text-2xl font-semibold text-gray-900" x-text="formattedUptime"></p>
          </div>
          
          <!-- Active Clients -->
          <div>
            <span class="text-sm text-gray-600">Connected Clients</span>
            <p class="mt-2 text-2xl font-semibold text-gray-900" x-text="clientsConnected"></p>
          </div>
        </div>
      </div>

      <!-- Metrics Card -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4">Performance Metrics</h2>
        
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="text-center">
            <p class="text-sm text-gray-600">Total Requests</p>
            <p class="text-2xl font-bold text-gray-900" x-text="metrics.requests_total || 0"></p>
          </div>
          <div class="text-center">
            <p class="text-sm text-gray-600">Success Rate</p>
            <p class="text-2xl font-bold text-green-600" x-text="successRate"></p>
          </div>
          <div class="text-center">
            <p class="text-sm text-gray-600">Latency (p99)</p>
            <p class="text-2xl font-bold text-blue-600" x-text="(metrics.latency_p99_ms || 0) + 'ms'"></p>
          </div>
          <div class="text-center">
            <p class="text-sm text-gray-600">Cache Hit Rate</p>
            <p class="text-2xl font-bold text-purple-600" x-text="cacheHitRate"></p>
          </div>
        </div>
      </div>

      <!-- Controls Card -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4">Server Control</h2>
        
        <div class="flex gap-4">
          <button @click="startServer()" 
                  :disabled="status === 'running'"
                  class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
            Start Server
          </button>
          
          <button @click="stopServer()" 
                  :disabled="status !== 'running'"
                  class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
            Stop Server
          </button>
          
          <button @click="restartServer()" 
                  :disabled="status !== 'running'"
                  class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            Restart Server
          </button>
        </div>
      </div>

      <!-- Logs Card -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold">Live Logs</h2>
          
          <div class="flex gap-2">
            <select x-model="logFilter" class="px-3 py-1 border rounded">
              <option value="all">All Levels</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
            
            <button @click="clearLogs()" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">
              Clear
            </button>
          </div>
        </div>
        
        <div class="bg-gray-900 text-gray-100 rounded p-4 h-96 overflow-y-auto font-mono text-sm">
          <template x-for="log in filteredLogs" :key="log.id">
            <div class="mb-2" :class="logLineClass(log.level)">
              <span class="text-gray-500" x-text="log.timestamp"></span>
              <span class="font-bold mx-2" x-text="'[' + log.level.toUpperCase() + ']'"></span>
              <span x-text="log.message"></span>
            </div>
          </template>
          
          <div x-show="filteredLogs.length === 0" class="text-gray-500 text-center py-8">
            No logs to display
          </div>
        </div>
      </div>
    </main>
  </div>

  <script src="/js/app.js"></script>
</body>
</html>
```

## Step 2: Alpine.js Components

Create `public/js/app.js`:

```javascript
function dashboard() {
  return {
    // State
    status: 'connecting',
    uptime: 0,
    clientsConnected: 0,
    metrics: {},
    logs: [],
    logFilter: 'all',
    eventSource: null,

    // Lifecycle
    init() {
      this.pollStatus();
      this.connectLogs();
      
      // Poll status every second
      setInterval(() => this.pollStatus(), 1000);
    },

    // API Methods
    async pollStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        this.status = data.status;
        this.uptime = data.uptime_ms;
        this.clientsConnected = data.mcp?.clients_connected || 0;
        this.metrics = data.mcp || {};
      } catch (error) {
        console.error('Failed to fetch status:', error);
        this.status = 'error';
      }
    },

    connectLogs() {
      this.eventSource = new EventSource('/api/logs/stream');
      
      this.eventSource.onmessage = (event) => {
        const log = JSON.parse(event.data);
        log.id = Date.now() + Math.random(); // Unique ID
        log.timestamp = new Date(log.timestamp).toLocaleTimeString();
        
        this.logs.push(log);
        
        // Keep only last 1000 logs
        if (this.logs.length > 1000) {
          this.logs.shift();
        }
        
        // Auto-scroll to bottom
        this.$nextTick(() => {
          const container = document.querySelector('.overflow-y-auto');
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        });
      };
      
      this.eventSource.onerror = () => {
        console.error('Log stream disconnected, reconnecting...');
        setTimeout(() => this.connectLogs(), 5000);
      };
    },

    async startServer() {
      try {
        const res = await fetch('/api/lifecycle/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        
        if (data.success) {
          await this.pollStatus();
        }
      } catch (error) {
        console.error('Failed to start server:', error);
      }
    },

    async stopServer() {
      try {
        const res = await fetch('/api/lifecycle/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        
        if (data.success) {
          await this.pollStatus();
        }
      } catch (error) {
        console.error('Failed to stop server:', error);
      }
    },

    async restartServer() {
      try {
        const res = await fetch('/api/lifecycle/restart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        
        if (data.success) {
          await this.pollStatus();
        }
      } catch (error) {
        console.error('Failed to restart server:', error);
      }
    },

    clearLogs() {
      this.logs = [];
    },

    // Computed Properties
    get statusBadgeClass() {
      const classes = {
        running: 'bg-green-100 text-green-800',
        starting: 'bg-yellow-100 text-yellow-800',
        stopping: 'bg-orange-100 text-orange-800',
        stopped: 'bg-gray-100 text-gray-800',
        error: 'bg-red-100 text-red-800',
        connecting: 'bg-blue-100 text-blue-800'
      };
      return classes[this.status] || classes.connecting;
    },

    get statusColor() {
      const colors = {
        running: 'text-green-500',
        starting: 'text-yellow-500',
        error: 'text-red-500'
      };
      return colors[this.status] || 'text-gray-500';
    },

    get formattedUptime() {
      const seconds = Math.floor(this.uptime / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      
      if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
      } else {
        return `${seconds}s`;
      }
    },

    get successRate() {
      const total = this.metrics.requests_total || 0;
      const success = this.metrics.requests_success || 0;
      
      if (total === 0) return '100%';
      
      const rate = (success / total * 100).toFixed(1);
      return `${rate}%`;
    },

    get cacheHitRate() {
      const hits = this.metrics.cache_hits || 0;
      const total = hits + (this.metrics.cache_misses || 0);
      
      if (total === 0) return '0%';
      
      const rate = (hits / total * 100).toFixed(1);
      return `${rate}%`;
    },

    get filteredLogs() {
      if (this.logFilter === 'all') {
        return this.logs;
      }
      return this.logs.filter(log => log.level === this.logFilter);
    },

    logLineClass(level) {
      const classes = {
        debug: 'text-gray-400',
        info: 'text-blue-300',
        warn: 'text-yellow-300',
        error: 'text-red-300'
      };
      return classes[level] || '';
    }
  };
}
```

## Step 3: Integration with Express

Update `src/presentation/web-server.ts` to serve static files:

```typescript
// Already covered in node-server.md
this.app.use(express.static('public'));
```

## Step 4: Testing

### Manual Testing

1. Start Node.js server: `npm run dev`
2. Open browser: `http://localhost:8080`
3. Verify:
   - Status badge shows "running" (green)
   - Metrics update every second
   - Logs stream in real-time
   - Start/Stop buttons work

### Browser Console Testing

```javascript
// Test status endpoint
fetch('/api/status').then(r => r.json()).then(console.log);

// Test lifecycle
fetch('/api/lifecycle/stop', { method: 'POST' }).then(r => r.json()).then(console.log);
```

## Step 5: Styling Enhancements

Create `public/css/app.css` for custom styles:

```css
/* Scrollbar styling for logs */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #1f2937;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}

/* Smooth animations */
[x-cloak] {
  display: none !important;
}

.fade-in {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

## Best Practices

### Performance
- Keep log buffer at 1000 max entries
- Use `x-show` instead of `x-if` for frequently toggled elements
- Debounce search/filter inputs
- Use `$nextTick()` for DOM-dependent operations

### Accessibility
- Use semantic HTML (proper heading hierarchy)
- Include ARIA labels for controls
- Ensure sufficient color contrast
- Support keyboard navigation

### Responsive Design
- Mobile-first approach (Tailwind default)
- Test on different screen sizes
- Use responsive grid classes (`md:`, `lg:`)

## Next Steps

- [Testing Strategy](/en/implementation/testing) - Test the UI
- [Deployment Guide](/en/implementation/deployment) - Bundle for production

:::tip Development Tips
- Use browser DevTools Network tab to debug SSE connection
- Add `console.log()` in Alpine methods for debugging
- Use Tailwind Play for rapid prototyping
- Test with browser extensions disabled (ad blockers can break SSE)
:::
