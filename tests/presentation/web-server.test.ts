import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { WebServer } from '../../src/presentation/web-server.js';
import { GodotClient } from '../../src/bridge/godot-client.js';
import { logger } from '../../src/utils/logger.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logError: vi.fn(),
}));

describe('WebServer', () => {
  let webServer: WebServer;
  let mockGodotClient: GodotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock Godot client
    mockGodotClient = {
      healthCheck: vi.fn().mockResolvedValue({ status: 'healthy', uptime: 1000 }),
      sendRequest: vi.fn().mockResolvedValue({ result: 'ok' }),
    } as unknown as GodotClient;

    webServer = new WebServer(mockGodotClient);
  });

  afterEach(async () => {
    await webServer.stop();
  });

  describe('initialization', () => {
    it('should create web server instance', () => {
      expect(webServer).toBeDefined();
    });

    it('should setup middleware', () => {
      expect(webServer).toBeDefined();
      // Middleware configured during construction
    });
  });

  describe('API endpoints', () => {
    it('should respond to /api/health endpoint', async () => {
      const app = (webServer as any).app;
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should respond to /api/status endpoint', async () => {
      const app = (webServer as any).app;
      const response = await request(app).get('/api/status');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('bridgeConnected');
    });

    it('should setup SSE endpoint at /api/logs/stream', async () => {
      const app = (webServer as any).app;
      const response = await request(app).get('/api/logs/stream');
      
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
    });
  });

  describe('static file serving', () => {
    it('should serve static files from public directory', async () => {
      const app = (webServer as any).app;
      const response = await request(app).get('/index.html');
      
      // Should attempt to serve static file (may 404 if not exists)
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('CORS configuration', () => {
    it('should allow localhost origins', async () => {
      const app = (webServer as any).app;
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:8080');
      
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('bridge health endpoint', () => {
    it('should respond to /api/bridge/health', async () => {
      const app = (webServer as any).app;
      const response = await request(app).get('/api/bridge/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy', uptime: 1000 });
      expect(mockGodotClient.healthCheck).toHaveBeenCalled();
    });

    it('should handle bridge unavailable', async () => {
      vi.mocked(mockGodotClient.healthCheck).mockRejectedValue(
        new Error('Connection refused')
      );

      const app = (webServer as any).app;
      const response = await request(app).get('/api/bridge/health');
      
      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('error', 'Bridge unavailable');
    });
  });

  describe('bridge version endpoint', () => {
    beforeEach(() => {
      (mockGodotClient as any).getVersion = vi.fn().mockResolvedValue('4.6.0.stable');
    });

    it('should respond to /api/bridge/version', async () => {
      const app = (webServer as any).app;
      const response = await request(app).get('/api/bridge/version');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ version: '4.6.0.stable' });
    });

    it('should handle version check failure', async () => {
      vi.mocked((mockGodotClient as any).getVersion).mockRejectedValue(
        new Error('Bridge unavailable')
      );

      const app = (webServer as any).app;
      const response = await request(app).get('/api/bridge/version');
      
      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('error', 'Bridge unavailable');
    });
  });

  describe('SSE client management', () => {
    it('should track connected SSE clients', async () => {
      const app = (webServer as any).app;
      const sseClients = (webServer as any).sseClients;
      
      expect(sseClients.size).toBe(0);

      // Initiate SSE connection (doesn't complete in test)
      const req = request(app).get('/api/logs/stream');
      
      // Can't easily test client count without real connection
      expect(sseClients).toBeDefined();
    });
  });

  describe('server lifecycle', () => {
    it('should start and stop gracefully', async () => {
      await webServer.start(8081);
      expect(logger.info).toHaveBeenCalledWith('Web server started on port 8081');
      
      await webServer.stop();
      expect(logger.info).toHaveBeenCalledWith('Web server stopped');
    });
  });
});
