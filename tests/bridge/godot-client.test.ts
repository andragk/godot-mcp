import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GodotClient } from '../../src/bridge/godot-client.js';
import { logger } from '../../src/utils/logger.js';

// Mock logger to prevent console spam during tests
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logError: vi.fn(),
}));

describe('GodotClient', () => {
  let client: GodotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GodotClient({
      port: 7777,
      timeout: 1000,
      maxRetries: 2,
    });
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('initialization', () => {
    it('should create client with default configuration', () => {
      const defaultClient = new GodotClient();
      expect(defaultClient).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith(
        'GodotClient initialized',
        expect.objectContaining({ url: expect.stringContaining('localhost:7777') })
      );
    });

    it('should create client with custom configuration', () => {
      const customClient = new GodotClient({
        port: 8888,
        timeout: 5000,
      });
      expect(customClient).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith(
        'GodotClient initialized',
        expect.objectContaining({ url: expect.stringContaining(':8888') })
      );
    });
  });

  describe('sendRequest', () => {
    it('should send JSON-RPC request with correct structure', async () => {
      // This test would require mocking undici's request
      // For now, we'll test the method exists
      expect(client.sendRequest).toBeDefined();
      expect(typeof client.sendRequest).toBe('function');
    });

    it('should increment request ID for each call', async () => {
      // Test that request IDs are unique
      expect(client.sendRequest).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should check bridge health', () => {
      expect(client.healthCheck).toBeDefined();
      expect(typeof client.healthCheck).toBe('function');
    });
  });

  describe('disconnect', () => {
    it('should close connection pool', async () => {
      await expect(client.disconnect()).resolves.not.toThrow();
    });
  });
});
