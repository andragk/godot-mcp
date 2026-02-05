/**
 * SSE Client Manager
 * Manages Server-Sent Events client connections, broadcasting, and lifecycle
 */
import type { Response } from 'express';
import { logger } from '../utils/logger.js';

/**
 * SSE event types for type-safe broadcasting
 */
export type SSEEventType = 'log' | 'status' | 'metric' | 'error' | 'info' | 'heartbeat';

/**
 * SSE client connection
 */
export interface SSEClient {
  id: string;
  response: Response;
  connectedAt: Date;
  lastActivity: Date;
  eventsSent: number;
}

/**
 * SSE event payload
 */
export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  id?: string;
}

/**
 * Manages SSE client connections and event broadcasting
 */
export class SSEClientManager {
  private readonly clients: Map<string, SSEClient> = new Map();
  private eventCounter = 0;

  /**
   * Add a new SSE client connection
   */
  addClient(clientId: string, response: Response): void {
    const client: SSEClient = {
      id: clientId,
      response,
      connectedAt: new Date(),
      lastActivity: new Date(),
      eventsSent: 0,
    };

    this.clients.set(clientId, client);

    logger.info('SSE client connected', {
      service: 'web-server',
      clientId,
      totalClients: this.clients.size
    });

    // Send initial connection event
    this.sendToClient(clientId, {
      type: 'info',
      data: {
        message: 'Connected to SSE stream',
        clientId,
        connectedAt: client.connectedAt.toISOString()
      }
    });
  }

  /**
   * Remove an SSE client connection
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    const sessionDuration = Date.now() - client.connectedAt.getTime();
    
    logger.info('SSE client disconnected', {
      service: 'web-server',
      clientId,
      sessionDuration: `${sessionDuration}ms`,
      eventsSent: client.eventsSent,
      totalClients: this.clients.size - 1
    });

    this.clients.delete(clientId);
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(event: SSEEvent): void {
    const eventId = event.id ?? `event-${++this.eventCounter}`;
    const deadClients: string[] = [];

    logger.debug('Broadcasting SSE event', {
      service: 'web-server',
      type: event.type,
      eventId,
      recipients: this.clients.size
    });

    for (const [clientId, client] of this.clients) {
      const sent = this.sendEventToClient(client, event, eventId);
      if (!sent) {
        deadClients.push(clientId);
      }
    }

    // Cleanup dead clients
    for (const clientId of deadClients) {
      this.removeClient(clientId);
    }
  }

  /**
   * Send event to a specific client
   */
  sendToClient(clientId: string, event: SSEEvent): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn('Attempted to send to non-existent client', {
        service: 'web-server',
        clientId
      });
      return false;
    }

    const eventId = event.id ?? `event-${++this.eventCounter}`;
    return this.sendEventToClient(client, event, eventId);
  }

  /**
   * Send event to client with error handling
   */
  private sendEventToClient(client: SSEClient, event: SSEEvent, eventId: string): boolean {
    try {
      // Format SSE message
      let message = '';
      if (eventId) {
        message += `id: ${eventId}\n`;
      }
      if (event.type !== 'heartbeat') {
        message += `event: ${event.type}\n`;
      }
      message += `data: ${JSON.stringify(event.data)}\n\n`;

      client.response.write(message);
      client.lastActivity = new Date();
      client.eventsSent++;

      return true;
    } catch (error) {
      logger.warn('Failed to send SSE event to client', {
        service: 'web-server',
        clientId: client.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Send heartbeat to all clients
   */
  sendHeartbeat(): void {
    const deadClients: string[] = [];

    for (const [clientId, client] of this.clients) {
      try {
        client.response.write(': heartbeat\n\n');
        client.lastActivity = new Date();
      } catch (error) {
        logger.debug('Client heartbeat failed', {
          service: 'web-server',
          clientId,
          error: error instanceof Error ? error.message : String(error)
        });
        deadClients.push(clientId);
      }
    }

    // Cleanup dead clients
    for (const clientId of deadClients) {
      this.removeClient(clientId);
    }
  }

  /**
   * Get client statistics
   */
  getStats(): {
    totalClients: number;
    totalEventsSent: number;
    clients: Array<{
      id: string;
      connectedAt: string;
      lastActivity: string;
      eventsSent: number;
      sessionDuration: number;
    }>;
  } {
    const clients = Array.from(this.clients.values()).map(client => ({
      id: client.id,
      connectedAt: client.connectedAt.toISOString(),
      lastActivity: client.lastActivity.toISOString(),
      eventsSent: client.eventsSent,
      sessionDuration: Date.now() - client.connectedAt.getTime()
    }));

    const totalEventsSent = clients.reduce((sum, c) => sum + c.eventsSent, 0);

    return {
      totalClients: this.clients.size,
      totalEventsSent,
      clients
    };
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Check if a client is connected
   */
  hasClient(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  /**
   * Close all client connections
   */
  closeAll(): void {
    logger.info('Closing all SSE clients', {
      service: 'web-server',
      totalClients: this.clients.size
    });

    for (const [clientId, client] of this.clients) {
      try {
        // Send final message
        client.response.write('event: close\ndata: {"message": "Server shutting down"}\n\n');
        client.response.end();
      } catch (error) {
        logger.debug('Error closing SSE client', {
          service: 'web-server',
          clientId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.clients.clear();
  }
}
