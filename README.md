# Godot MCP Server

Node.js-based Model Context Protocol server for Godot Engine integration.

## Quick Start

### Installation

```bash
npm install
```

### Build

```bash
npm run build
```

### Development

```bash
npm run dev
```

### Start Server

```bash
npm start
```

## Components

- **MCP Server**: Handles stdio-based MCP protocol communication
- **Godot Bridge**: HTTP server for JSON-RPC communication with Godot
- **Web UI**: Dashboard for monitoring server status and logs

## Ports

- **7777**: Godot Bridge HTTP server
- **8080**: Web UI dashboard

## Dashboard

Access the monitoring dashboard at: http://localhost:8080

## Architecture

```
src/
├── server/         # MCP server implementation
├── bridge/         # Godot HTTP client
├── presentation/   # Web UI server
├── types/          # TypeScript definitions
└── utils/          # Utilities (logging, etc.)
```

## License

MIT
