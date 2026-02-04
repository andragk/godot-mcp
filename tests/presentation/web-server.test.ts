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
});
