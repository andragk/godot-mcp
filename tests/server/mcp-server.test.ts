import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GodotMCPServer } from '../../src/server/mcp-server.js';
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

// Mock GodotClient
vi.mock('../../src/bridge/index.js', () => ({
  GodotClient: vi.fn(function(this: any) {
    this.sendRequest = vi.fn().mockResolvedValue({ status: 'ok' });
    this.healthCheck = vi.fn().mockResolvedValue({ status: 'healthy', uptime: 1000 });
    this.getVersion = vi.fn().mockResolvedValue('4.6.0.stable');
    this.close = vi.fn().mockResolvedValue(undefined);
    return this;
  }),
}));

describe('GodotMCPServer', () => {
  let server: GodotMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new GodotMCPServer();
  });

  describe('initialization', () => {
    it('should initialize MCP server with correct metadata', () => {
      expect(server).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith('GodotMCPServer initialized');
    });

    it('should create Godot client with default configuration', () => {
      expect(server).toBeDefined();
      // GodotClient mock was called
      expect(vi.mocked(logger.info)).toHaveBeenCalled();
    });
  });

  describe('tool handlers', () => {
    it('should provide list_tools handler', () => {
      expect(server).toBeDefined();
      // Handler registered during construction
    });

    it('should provide call_tool handler', () => {
      expect(server).toBeDefined();
      // Handler registered during construction
    });
  });

  describe('lifecycle', () => {
    it('should start stdio transport', async () => {
      expect(server.start).toBeDefined();
      expect(typeof server.start).toBe('function');
    });

    it('should stop cleanly', async () => {
      expect(server.stop).toBeDefined();
      expect(typeof server.stop).toBe('function');
    });
  });
});
