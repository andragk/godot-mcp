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
2. Open browser: `http://localhost:3000`
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

---

## Feature Implementation Guides

### Implementing Tool Exploration & Invocation

#### Tool Catalog Component

```html
<div x-data="toolCatalog()" class="bg-white rounded-lg shadow p-6">
  <h2 class="text-xl font-semibold mb-4">Tool Catalog</h2>
  
  <!-- Search -->
  <input type="text" 
         x-model="searchQuery" 
         @input.debounce="filterTools()"
         placeholder="Search tools..."
         class="w-full px-4 py-2 border rounded mb-4">
  
  <!-- Tool List -->
  <div class="space-y-2">
    <template x-for="tool in filteredTools" :key="tool.name">
      <div class="border rounded p-4 hover:bg-gray-50 cursor-pointer"
           @click="selectTool(tool)">
        <h3 class="font-semibold text-lg" x-text="tool.name"></h3>
        <p class="text-sm text-gray-600" x-text="tool.description"></p>
        
        <!-- Required params badge -->
        <div class="mt-2">
          <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
            <span x-text="countRequiredParams(tool)"></span> required params
          </span>
        </div>
      </div>
    </template>
  </div>
  
  <!-- Selected Tool Details -->
  <div x-show="selectedTool" x-transition class="mt-6 border-t pt-6">
    <h3 class="font-semibold mb-3">Test Tool: <span x-text="selectedTool?.name"></span></h3>
    
    <!-- Dynamic Form -->
    <form @submit.prevent="invokeTool()">
      <template x-for="(prop, key) in selectedTool?.inputSchema?.properties" :key="key">
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">
            <span x-text="key"></span>
            <span x-show="isRequired(key)" class="text-red-500">*</span>
          </label>
          <input :type="getInputType(prop.type)"
                 x-model="toolArguments[key]"
                 :placeholder="prop.description"
                 class="w-full px-3 py-2 border rounded">
          <p class="text-xs text-gray-500 mt-1" x-text="prop.description"></p>
        </div>
      </template>
      
      <button type="submit" 
              :disabled="invoking"
              class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
        <span x-text="invoking ? 'Invoking...' : 'Invoke Tool'"></span>
      </button>
    </form>
    
    <!-- Result Display -->
    <div x-show="lastResult" x-transition class="mt-4 bg-gray-100 rounded p-4">
      <h4 class="font-semibold mb-2">Result:</h4>
      <pre class="text-sm overflow-auto" x-text="JSON.stringify(lastResult, null, 2)"></pre>
    </div>
  </div>
</div>

<script>
function toolCatalog() {
  return {
    tools: [],
    filteredTools: [],
    selectedTool: null,
    toolArguments: {},
    invoking: false,
    lastResult: null,
    searchQuery: '',
    
    async init() {
      await this.loadTools();
      this.filteredTools = this.tools;
    },
    
    async loadTools() {
      const res = await fetch('/api/tools');
      const data = await res.json();
      this.tools = data.tools;
    },
    
    filterTools() {
      const query = this.searchQuery.toLowerCase();
      this.filteredTools = this.tools.filter(tool => 
        tool.name.toLowerCase().includes(query) || 
        tool.description.toLowerCase().includes(query)
      );
    },
    
    selectTool(tool) {
      this.selectedTool = tool;
      this.toolArguments = {};
      this.lastResult = null;
    },
    
    async invokeTool() {
      this.invoking = true;
      try {
        const res = await fetch('/api/tools/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: this.selectedTool.name,
            arguments: this.toolArguments
          })
        });
        this.lastResult = await res.json();
      } catch (error) {
        this.lastResult = { error: error.message };
      } finally {
        this.invoking = false;
      }
    },
    
    countRequiredParams(tool) {
      return tool.inputSchema?.required?.length || 0;
    },
    
    isRequired(key) {
      return this.selectedTool?.inputSchema?.required?.includes(key);
    },
    
    getInputType(type) {
      return type === 'number' ? 'number' : 'text';
    }
  };
}
</script>
```

---

### Implementing Resource Management

#### Resource Browser Component

```html
<div x-data="resourceBrowser()" class="bg-white rounded-lg shadow p-6">
  <h2 class="text-xl font-semibold mb-4">Resource Browser</h2>
  
  <!-- Filters -->
  <div class="flex gap-4 mb-4">
    <select x-model="typeFilter" @change="loadResources()" class="px-3 py-2 border rounded">
      <option value="">All Types</option>
      <option value="scene">Scenes</option>
      <option value="script">Scripts</option>
      <option value="asset">Assets</option>
    </select>
    
    <input type="text" 
           x-model="searchQuery" 
           @input.debounce="loadResources()"
           placeholder="Search resources..."
           class="flex-1 px-4 py-2 border rounded">
  </div>
  
  <!-- Resource List -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <template x-for="resource in resources" :key="resource.uri">
      <div class="border rounded p-4 hover:bg-gray-50 cursor-pointer"
           @click="previewResource(resource)">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h3 class="font-semibold" x-text="resource.name"></h3>
            <p class="text-sm text-gray-600 truncate" x-text="resource.uri"></p>
          </div>
          <span class="text-xs bg-gray-200 px-2 py-1 rounded" x-text="resource.type"></span>
        </div>
        <p class="text-sm text-gray-500 mt-2" x-text="resource.description"></p>
        <div class="text-xs text-gray-400 mt-2">
          <span x-text="formatBytes(resource.size)"></span>
        </div>
      </div>
    </template>
  </div>
  
  <!-- Preview Modal -->
  <div x-show="previewingResource" 
       x-transition
       class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
       @click.self="closePreview()">
    <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
      <div class="px-6 py-4 border-b flex justify-between items-center">
        <h3 class="text-lg font-semibold" x-text="previewingResource?.name"></h3>
        <button @click="closePreview()" class="text-gray-500 hover:text-gray-700">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      
      <div class="p-6 overflow-auto max-h-[60vh]">
        <pre class="text-sm bg-gray-100 p-4 rounded overflow-auto" 
             x-text="previewContent"></pre>
      </div>
    </div>
  </div>
</div>

<script>
function resourceBrowser() {
  return {
    resources: [],
    typeFilter: '',
    searchQuery: '',
    previewingResource: null,
    previewContent: '',
    
    async init() {
      await this.loadResources();
    },
    
    async loadResources() {
      const params = new URLSearchParams();
      if (this.typeFilter) params.set('type', this.typeFilter);
      if (this.searchQuery) params.set('search', this.searchQuery);
      params.set('limit', '100');
      
      const res = await fetch(`/api/resources?${params}`);
      const data = await res.json();
      this.resources = data.resources;
    },
    
    async previewResource(resource) {
      this.previewingResource = resource;
      this.previewContent = 'Loading...';
      
      const params = new URLSearchParams({ uri: resource.uri });
      const res = await fetch(`/api/resources/content?${params}`);
      const data = await res.json();
      this.previewContent = data.content;
    },
    
    closePreview() {
      this.previewingResource = null;
      this.previewContent = '';
    },
    
    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
  };
}
</script>
```

---

### Implementing Traffic Inspector

#### Split-View Inspector Component

```html
<div x-data="trafficInspector()" class="bg-white rounded-lg shadow p-6">
  <h2 class="text-xl font-semibold mb-4">Traffic Inspector</h2>
  
  <!-- Controls -->
  <div class="flex justify-between items-center mb-4">
    <div class="flex gap-2">
      <button @click="isPaused = !isPaused" 
              class="px-3 py-1 border rounded"
              :class="isPaused ? 'bg-yellow-100' : 'bg-white'">
        <span x-text="isPaused ? '▶ Resume' : '⏸ Pause'"></span>
      </button>
      <button @click="clearTraffic()" class="px-3 py-1 border rounded hover:bg-gray-50">
        Clear
      </button>
    </div>
    
    <div class="text-sm text-gray-600">
      <span x-text="traffic.length"></span> messages
    </div>
  </div>
  
  <!-- Split View -->
  <div class="grid grid-cols-2 gap-4 h-96">
    <!-- Incoming (Left) -->
    <div class="border rounded">
      <div class="bg-blue-50 px-4 py-2 border-b font-semibold">
        Client → Server
      </div>
      <div class="overflow-auto h-80 p-2 space-y-2">
        <template x-for="msg in incomingMessages" :key="msg.id">
          <div class="bg-gray-100 rounded p-3 text-xs font-mono cursor-pointer hover:bg-gray-200"
               @click="selectMessage(msg)">
            <div class="flex justify-between mb-1">
              <span class="font-semibold text-blue-600" x-text="msg.message.method"></span>
              <span class="text-gray-500" x-text="formatTime(msg.timestamp)"></span>
            </div>
            <pre class="text-gray-700 overflow-hidden" 
                 x-text="JSON.stringify(msg.message.params, null, 2).substring(0, 100) + '...'"></pre>
          </div>
        </template>
      </div>
    </div>
    
    <!-- Outgoing (Right) -->
    <div class="border rounded">
      <div class="bg-green-50 px-4 py-2 border-b font-semibold">
        Server → Client
      </div>
      <div class="overflow-auto h-80 p-2 space-y-2">
        <template x-for="msg in outgoingMessages" :key="msg.id">
          <div class="bg-gray-100 rounded p-3 text-xs font-mono cursor-pointer hover:bg-gray-200"
               @click="selectMessage(msg)">
            <div class="flex justify-between mb-1">
              <span class="font-semibold" 
                    :class="msg.message.error ? 'text-red-600' : 'text-green-600'"
                    x-text="msg.message.error ? 'ERROR' : 'SUCCESS'"></span>
              <span class="text-gray-500">
                <span x-text="msg.metadata.latency_ms"></span>ms
              </span>
            </div>
            <pre class="text-gray-700 overflow-hidden" 
                 x-text="JSON.stringify(msg.message.result || msg.message.error, null, 2).substring(0, 100) + '...'"></pre>
          </div>
        </template>
      </div>
    </div>
  </div>
  
  <!-- Selected Message Detail -->
  <div x-show="selectedMessage" x-transition class="mt-4 border-t pt-4">
    <h3 class="font-semibold mb-2">Message Details</h3>
    <pre class="text-xs bg-gray-100 p-4 rounded overflow-auto max-h-64"
         x-text="JSON.stringify(selectedMessage, null, 2)"></pre>
  </div>
</div>

<script>
function trafficInspector() {
  return {
    traffic: [],
    selectedMessage: null,
    isPaused: false,
    eventSource: null,
    
    init() {
      this.connectTraffic();
    },
    
    connectTraffic() {
      this.eventSource = new EventSource('/api/inspector/stream');
      this.eventSource.onmessage = (event) => {
        if (this.isPaused) return;
        
        const msg = JSON.parse(event.data);
        this.traffic.push(msg);
        
        if (this.traffic.length > 500) {
          this.traffic.shift();
        }
      };
    },
    
    get incomingMessages() {
      return this.traffic.filter(m => m.direction === 'client_to_server');
    },
    
    get outgoingMessages() {
      return this.traffic.filter(m => m.direction === 'server_to_client');
    },
    
    selectMessage(msg) {
      this.selectedMessage = msg;
    },
    
    clearTraffic() {
      this.traffic = [];
      this.selectedMessage = null;
    },
    
    formatTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString();
    }
  };
}
</script>
```

---

### Implementing Connection Management

#### Active Sessions Component

```html
<div x-data="connectionManager()" class="bg-white rounded-lg shadow p-6">
  <h2 class="text-xl font-semibold mb-4">Active Connections</h2>
  
  <!-- Connection List -->
  <div class="space-y-4">
    <template x-for="conn in connections" :key="conn.id">
      <div class="border rounded p-4">
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <h3 class="font-semibold" x-text="conn.client_name"></h3>
              <span class="w-2 h-2 rounded-full"
                    :class="conn.active ? 'bg-green-500' : 'bg-gray-400'"></span>
            </div>
            <p class="text-sm text-gray-600">
              ID: <code class="bg-gray-100 px-1 rounded" x-text="conn.id"></code>
            </p>
          </div>
          
          <button @click="disconnectClient(conn.id)"
                  class="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm">
            Disconnect
          </button>
        </div>
        
        <!-- Connection Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
          <div>
            <p class="text-gray-500">Duration</p>
            <p class="font-semibold" x-text="formatDuration(conn.session_duration_ms)"></p>
          </div>
          <div>
            <p class="text-gray-500">Requests</p>
            <p class="font-semibold" x-text="conn.requests_count"></p>
          </div>
          <div>
            <p class="text-gray-500">Success Rate</p>
            <p class="font-semibold" x-text="calculateSuccessRate(conn) + '%'"></p>
          </div>
          <div>
            <p class="text-gray-500">Idle</p>
            <p class="font-semibold" x-text="formatDuration(conn.idle_time_ms)"></p>
          </div>
        </div>
        
        <!-- Capabilities -->
        <div class="mt-3 flex gap-2 flex-wrap">
          <template x-for="(enabled, cap) in conn.capabilities" :key="cap">
            <span x-show="enabled" 
                  class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded"
                  x-text="cap"></span>
          </template>
        </div>
      </div>
    </template>
    
    <div x-show="connections.length === 0" class="text-center text-gray-500 py-8">
      No active connections
    </div>
  </div>
  
  <!-- Summary Stats -->
  <div class="mt-6 grid grid-cols-3 gap-4 border-t pt-4">
    <div class="text-center">
      <p class="text-2xl font-bold text-gray-900" x-text="connections.length"></p>
      <p class="text-sm text-gray-500">Active Now</p>
    </div>
    <div class="text-center">
      <p class="text-2xl font-bold text-gray-900" x-text="maxConcurrent"></p>
      <p class="text-sm text-gray-500">Max Concurrent</p>
    </div>
    <div class="text-center">
      <p class="text-2xl font-bold text-gray-900" x-text="totalSessionsToday"></p>
      <p class="text-sm text-gray-500">Total Today</p>
    </div>
  </div>
</div>

<script>
function connectionManager() {
  return {
    connections: [],
    maxConcurrent: 10,
    totalSessionsToday: 0,
    
    init() {
      this.loadConnections();
      setInterval(() => this.loadConnections(), 2000);
    },
    
    async loadConnections() {
      const res = await fetch('/api/connections');
      const data = await res.json();
      this.connections = data.connections;
      this.maxConcurrent = data.max_concurrent;
      this.totalSessionsToday = data.total_sessions_today || 0;
    },
    
    async disconnectClient(clientId) {
      if (!confirm('Disconnect this client?')) return;
      
      await fetch(`/api/connections/${clientId}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Manual disconnect' })
      });
      
      await this.loadConnections();
    },
    
    formatDuration(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
      return `${seconds}s`;
    },
    
    calculateSuccessRate(conn) {
      const total = conn.requests_count;
      if (total === 0) return 100;
      return Math.round((conn.requests_success / total) * 100);
    }
  };
}
</script>
```

---

### Implementing Health Monitoring

#### Health Dashboard Component

```html
<div x-data="healthMonitor()" class="bg-white rounded-lg shadow p-6">
  <h2 class="text-xl font-semibold mb-4">System Health</h2>
  
  <!-- Overall Status -->
  <div class="mb-6 p-4 rounded-lg"
       :class="{
         'bg-green-50 border border-green-200': health.overall === 'healthy',
         'bg-yellow-50 border border-yellow-200': health.overall === 'degraded',
         'bg-red-50 border border-red-200': health.overall === 'unhealthy'
       }">
    <div class="flex items-center gap-3">
      <div class="text-3xl">
        <span x-show="health.overall === 'healthy'">🟢</span>
        <span x-show="health.overall === 'degraded'">🟡</span>
        <span x-show="health.overall === 'unhealthy'">🔴</span>
      </div>
      <div>
        <h3 class="text-lg font-semibold capitalize" x-text="health.overall"></h3>
        <p class="text-sm text-gray-600">All systems operational</p>
      </div>
    </div>
  </div>
  
  <!-- Health Checks -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <template x-for="(check, name) in health.checks" :key="name">
      <div class="border rounded p-4">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h4 class="font-semibold capitalize" x-text="name.replace('_', ' ')"></h4>
            <p class="text-sm text-gray-600 mt-1">
              Last checked: <span x-text="formatTime(check.last_check)"></span>
            </p>
          </div>
          <span class="text-2xl">
            <span x-show="check.status === 'healthy'">✅</span>
            <span x-show="check.status === 'degraded'">⚠️</span>
            <span x-show="check.status === 'unhealthy'">❌</span>
          </span>
        </div>
        
        <!-- Check-specific metrics -->
        <div class="mt-3 text-sm">
          <template x-if="check.latency_ms !== undefined">
            <p>Latency: <strong x-text="check.latency_ms + 'ms'"></strong></p>
          </template>
          <template x-if="check.lag_ms !== undefined">
            <p>Event Loop Lag: <strong x-text="check.lag_ms + 'ms'"></strong></p>
          </template>
          <template x-if="check.usage_mb !== undefined">
            <p>Memory: <strong x-text="check.usage_mb + ' / ' + check.limit_mb + ' MB'"></strong></p>
          </template>
          <template x-if="check.free_gb !== undefined">
            <p>Disk Free: <strong x-text="check.free_gb + ' GB'"></strong></p>
          </template>
        </div>
      </div>
    </template>
  </div>
  
  <!-- State Transitions -->
  <div class="mt-6 border-t pt-4">
    <h3 class="font-semibold mb-3">Recent State Transitions</h3>
    <div class="space-y-2">
      <template x-for="transition in transitions" :key="transition.timestamp">
        <div class="flex items-center gap-3 text-sm">
          <span class="text-gray-500" x-text="formatTime(transition.timestamp)"></span>
          <span class="text-gray-400">→</span>
          <span class="font-medium capitalize" x-text="transition.from"></span>
          <span class="text-gray-400">→</span>
          <span class="font-medium capitalize text-green-600" x-text="transition.to"></span>
        </div>
      </template>
    </div>
  </div>
</div>

<script>
function healthMonitor() {
  return {
    health: {
      overall: 'connecting',
      checks: {}
    },
    transitions: [],
    
    init() {
      this.loadHealth();
      setInterval(() => this.loadHealth(), 5000);
    },
    
    async loadHealth() {
      const res = await fetch('/api/status');
      const data = await res.json();
      this.health = data.health || { overall: 'unknown', checks: {} };
      this.transitions = data.transitions || [];
    },
    
    formatTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString();
    }
  };
}
</script>
```

---

## Production Build

### Bundling with Vite (Optional)

For production, bundle Alpine.js and Tailwind CSS:

```javascript
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'public/dist',
    rollupOptions: {
      input: {
        main: 'src/web-ui/main.js'
      }
    }
  }
});
```

### CDN vs Local Assets

**Development:** Use CDN for fast iteration
**Production:** Bundle locally for reliability

```html
<!-- Production -->
<link href="/dist/app.css" rel="stylesheet">
<script src="/dist/app.js"></script>

<!-- Development -->
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/alpinejs@3"></script>
```

:::tip Development Tips
- Use browser DevTools Network tab to debug SSE connection
- Add `console.log()` in Alpine methods for debugging
- Use Tailwind Play for rapid prototyping
- Test with browser extensions disabled (ad blockers can break SSE)
:::

## Related Documentation

- [Web UI API Reference](/en/api/web-ui) - Complete API documentation
- [Testing Strategy](/en/implementation/testing) - Test the UI
- [Deployment Guide](/en/implementation/deployment) - Bundle for production
