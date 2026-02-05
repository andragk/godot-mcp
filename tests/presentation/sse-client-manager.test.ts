/**
 * Tests for SSEClientManager class
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { SSEClientManager } from '../../src/presentation/sse-client-manager.js';
import type { Response } from 'express';

// Mock Express Response
function createMockResponse(): Response {
  const response = {
    write: vi.fn(),
    end: vi.fn(),
    headersSent: false,
    finished: false,
    on: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Response;
  
  return response;
}

describe('SSEClientManager', () => {
  let manager: SSEClientManager;

  beforeEach(() => {
    manager = new SSEClientManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.closeAll();
    vi.restoreAllMocks();
  });

  describe('addClient', () => {
    it('should add new client', () => {
      const response = createMockResponse();
      manager.addClient('client-1', response);
      
      expect(manager.getClientCount()).toBe(1);
    });

    it('should add multiple clients', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      
      manager.addClient('client-1', response1);
      manager.addClient('client-2', response2);
      
      expect(manager.getClientCount()).toBe(2);
    });

    it('should not add duplicate client IDs', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      
      manager.addClient('client-1', response1);
      manager.addClient('client-1', response2); // Same ID
      
      expect(manager.getClientCount()).toBe(1);
    });

    it('should initialize client metadata', () => {
      const response = createMockResponse();
      const beforeAdd = Date.now();
      
      manager.addClient('client-1', response);
      
      const stats = manager.getStats();
      const client = stats.clients[0];
      
      expect(client.id).toBe('client-1');
      expect(client.eventsSent).toBe(1); // Initial info event is sent
      expect(new Date(client.connectedAt).getTime()).toBeGreaterThanOrEqual(beforeAdd);
      expect(new Date(client.lastActivity).getTime()).toBeGreaterThanOrEqual(beforeAdd);
    });
  });

  describe('removeClient', () => {
    it('should remove existing client', () => {
      const response = createMockResponse();
      manager.addClient('client-1', response);
      
      expect(manager.getClientCount()).toBe(1);
      
      manager.removeClient('client-1');
      
      expect(manager.getClientCount()).toBe(0);
    });

    it('should handle removing non-existent client', () => {
      expect(() => manager.removeClient('non-existent')).not.toThrow();
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('should send event to all clients', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      
      manager.addClient('client-1', response1);
      manager.addClient('client-2', response2);
      
      manager.broadcast({
        type: 'log',
        data: { message: 'Test log' }
      });
      
      expect(response1.write).toHaveBeenCalledWith(expect.stringContaining('event: log'));
      expect(response1.write).toHaveBeenCalledWith(expect.stringContaining('"message":"Test log"'));
      expect(response2.write).toHaveBeenCalledWith(expect.stringContaining('event: log'));
    });

    it('should increment events sent counter', () => {
      const response = createMockResponse();
      manager.addClient('client-1', response);
      
      manager.broadcast({ type: 'status', data: { status: 'ok' } });
      manager.broadcast({ type: 'metric', data: { value: 100 } });
      
      const stats = manager.getStats();
      expect(stats.clients[0].eventsSent).toBe(3); // 1 initial info + 2 broadcast events
    });

    it('should update last activity timestamp', () => {
      const response = createMockResponse();
      manager.addClient('client-1', response);
      
      const initialStats = manager.getStats();
      const initialActivity = new Date(initialStats.clients[0].lastActivity);
      
      vi.advanceTimersByTime(1000);
      
      manager.broadcast({ type: 'info', data: {} });
      
      const updatedStats = manager.getStats();
      const updatedActivity = new Date(updatedStats.clients[0].lastActivity);
      
      expect(updatedActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
    });

    it('should remove dead clients that fail to write', () => {
      const workingResponse = createMockResponse();
      const deadResponse = createMockResponse();
      
      (deadResponse.write as Mock).mockImplementation(() => {
        throw new Error('Client disconnected');
      });
      
      manager.addClient('client-working', workingResponse);
      manager.addClient('client-dead', deadResponse);
      
      expect(manager.getClientCount()).toBe(2);
      
      manager.broadcast({ type: 'log', data: {} });
      
      expect(manager.getClientCount()).toBe(1);
      expect(workingResponse.write).toHaveBeenCalled();
    });

    it('should format SSE event correctly', () => {
      const response = createMockResponse();
      manager.addClient('client-1', response);
      
      manager.broadcast({
        type: 'error',
        data: { code: 'ERR001', message: 'Test error' }
      });
      
      const calls = (response.write as Mock).mock.calls;
      const fullMessage = calls.map((call: any) => call[0]).join('');
      
      expect(fullMessage).toContain('event: error');
      expect(fullMessage).toContain('data: ');
      expect(fullMessage).toContain('"code":"ERR001"');
      expect(fullMessage).toMatch(/\n\n$/); // Should end with double newline
    });
  });

  describe('sendToClient', () => {
    it('should send event to specific client', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      
      manager.addClient('client-1', response1);
      manager.addClient('client-2', response2);
      
      // Clear the initial connection event calls
      (response1.write as Mock).mockClear();
      (response2.write as Mock).mockClear();
      
      manager.sendToClient('client-1', {
        type: 'log',
        data: { message: 'Only for client 1' }
      });
      
      expect(response1.write).toHaveBeenCalled();
      expect(response2.write).not.toHaveBeenCalled();
    });

    it('should handle sending to non-existent client', () => {
      expect(() => {
        manager.sendToClient('non-existent', {
          type: 'info',
          data: {}
        });
      }).not.toThrow();
    });

    it('should increment events sent for specific client only', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      
      manager.addClient('client-1', response1);
      manager.addClient('client-2', response2);
      
      manager.sendToClient('client-1', { type: 'log', data: {} });
      
      const stats = manager.getStats();
      expect(stats.clients.find(c => c.id === 'client-1')?.eventsSent).toBe(2); // 1 initial + 1 sendToClient
      expect(stats.clients.find(c => c.id === 'client-2')?.eventsSent).toBe(1); // 1 initial only
    });
  });

  describe('sendHeartbeat', () => {
    it('should send heartbeat comment to all clients', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      
      manager.addClient('client-1', response1);
      manager.addClient('client-2', response2);
      
      // Clear initial connection event calls
      (response1.write as Mock).mockClear();
      (response2.write as Mock).mockClear();
      
      manager.sendHeartbeat();
      
      expect(response1.write).toHaveBeenCalledWith(': heartbeat\n\n');
      expect(response2.write).toHaveBeenCalledWith(': heartbeat\n\n');
    });

    it('should not increment eventsSent counter for heartbeats', () => {
      const response = createMockResponse();
      manager.addClient('client-1', response);
      
      const statsBeforeHeartbeat = manager.getStats();
      const eventsSentBefore = statsBeforeHeartbeat.clients[0].eventsSent;
      
      manager.sendHeartbeat();
      
      const statsAfterHeartbeat = manager.getStats();
      const eventsSentAfter = statsAfterHeartbeat.clients[0].eventsSent;
      
      expect(eventsSentAfter).toBe(eventsSentBefore); // Heartbeat doesn't count as event
    });

    it('should remove dead clients during heartbeat', () => {
      const workingResponse = createMockResponse();
      const deadResponse = createMockResponse();
      
      (deadResponse.write as Mock).mockImplementation(() => {
        throw new Error('Connection closed');
      });
      
      manager.addClient('client-working', workingResponse);
      manager.addClient('client-dead', deadResponse);
      
      expect(manager.getClientCount()).toBe(2);
      
      manager.sendHeartbeat();
      
      expect(manager.getClientCount()).toBe(1);
    });
  });

  describe('closeAll', () => {
    it('should close all clients', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      
      manager.addClient('client-1', response1);
      manager.addClient('client-2', response2);
      
      expect(manager.getClientCount()).toBe(2);
      
      manager.closeAll();
      
      expect(manager.getClientCount()).toBe(0);
      expect(response1.end).toHaveBeenCalled();
      expect(response2.end).toHaveBeenCalled();
    });

    it('should handle empty client list', () => {
      expect(() => manager.closeAll()).not.toThrow();
      expect(manager.getClientCount()).toBe(0);
    });

    it('should handle errors when closing clients', () => {
      const response = createMockResponse();
      (response.end as Mock).mockImplementation(() => {
        throw new Error('End failed');
      });
      
      manager.addClient('client-1', response);
      
      expect(() => manager.closeAll()).not.toThrow();
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return statistics for all clients', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      
      manager.addClient('client-1', response1);
      manager.addClient('client-2', response2);
      
      manager.broadcast({ type: 'log', data: {} });
      
      const stats = manager.getStats();
      
      expect(stats.totalClients).toBe(2);
      expect(stats.totalEventsSent).toBe(4); // 1 initial + 1 broadcast per client = 2 * 2 = 4
      expect(stats.clients).toHaveLength(2);
    });

    it('should include client session duration', () => {
      const response = createMockResponse();
      const beforeAdd = Date.now();
      
      manager.addClient('client-1', response);
      
      vi.advanceTimersByTime(5000); // 5 seconds
      
      const stats = manager.getStats();
      const client = stats.clients[0];
      
      expect(client.sessionDuration).toBeGreaterThanOrEqual(5000);
    });

    it('should update total events sent', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      
      manager.addClient('client-1', response1);
      manager.addClient('client-2', response2);
      
      manager.broadcast({ type: 'log', data: {} }); // 2 events (1 per client)
      manager.sendToClient('client-1', { type: 'info', data: {} }); // 1 event
      
      const stats = manager.getStats();
      expect(stats.totalEventsSent).toBe(5); // client-1: 3 (initial + broadcast + sendTo), client-2: 2 (initial + broadcast)
    });

    it('should return empty stats when no clients', () => {
      const stats = manager.getStats();
      
      expect(stats.totalClients).toBe(0);
      expect(stats.totalEventsSent).toBe(0);
      expect(stats.clients).toHaveLength(0);
    });
  });

  describe('getClientCount', () => {
    it('should return zero initially', () => {
      expect(manager.getClientCount()).toBe(0);
    });

    it('should return correct count after adding clients', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      const response3 = createMockResponse();
      
      manager.addClient('client-1', response1);
      expect(manager.getClientCount()).toBe(1);
      
      manager.addClient('client-2', response2);
      expect(manager.getClientCount()).toBe(2);
      
      manager.addClient('client-3', response3);
      expect(manager.getClientCount()).toBe(3);
    });

    it('should return correct count after removing clients', () => {
      const response1 = createMockResponse();
      const response2 = createMockResponse();
      
      manager.addClient('client-1', response1);
      manager.addClient('client-2', response2);
      
      expect(manager.getClientCount()).toBe(2);
      
      manager.removeClient('client-1');
      expect(manager.getClientCount()).toBe(1);
      
      manager.removeClient('client-2');
      expect(manager.getClientCount()).toBe(0);
    });
  });
});
