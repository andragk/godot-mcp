/**
 * SSE Client Manager
 * Manages Server-Sent Events client connections, broadcasting, and lifecycle
 */
import type { Response } from 'express';
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
export declare class SSEClientManager {
    private readonly clients;
    private eventCounter;
    /**
     * Add a new SSE client connection
     */
    addClient(clientId: string, response: Response): void;
    /**
     * Remove an SSE client connection
     */
    removeClient(clientId: string): void;
    /**
     * Broadcast event to all connected clients
     */
    broadcast(event: SSEEvent): void;
    /**
     * Send event to a specific client
     */
    sendToClient(clientId: string, event: SSEEvent): boolean;
    /**
     * Send event to client with error handling
     */
    private sendEventToClient;
    /**
     * Send heartbeat to all clients
     */
    sendHeartbeat(): void;
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
    };
    /**
     * Get number of connected clients
     */
    getClientCount(): number;
    /**
     * Check if a client is connected
     */
    hasClient(clientId: string): boolean;
    /**
     * Close all client connections
     */
    closeAll(): void;
}
//# sourceMappingURL=sse-client-manager.d.ts.map