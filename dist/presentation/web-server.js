/**
 * Express web server for monitoring and visualization
 */
import express from 'express';
import cors from 'cors';
import { logger, logError } from '../utils/logger.js';
/**
 * Web server for dashboard and API endpoints
 */
export class WebServer {
    app;
    godotClient;
    sseClients = new Set();
    startTime;
    server = null;
    constructor(godotClient) {
        this.app = express();
        this.godotClient = godotClient;
        this.startTime = new Date();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupLogStreaming();
    }
    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // CORS configuration
        this.app.use(cors({
            origin: ['http://localhost:8080', 'http://127.0.0.1:8080'],
            credentials: true,
        }));
        // JSON body parser
        this.app.use(express.json());
        // Request logging
        this.app.use((req, _res, next) => {
            logger.debug('HTTP request', {
                method: req.method,
                path: req.path,
                ip: req.ip,
            });
            next();
        });
    }
    /**
     * Setup Express routes
     */
    setupRoutes() {
        // Static file serving
        this.app.use(express.static('public'));
        // Health endpoint
        this.app.get('/api/health', (_req, res) => {
            res.json({ status: 'ok', uptime: this.getUptime() });
        });
        // Status endpoint
        this.app.get('/api/status', async (_req, res) => {
            try {
                const bridgeHealth = await this.godotClient.healthCheck();
                const status = {
                    uptime: this.getUptime(),
                    bridgeConnected: bridgeHealth.status === 'healthy',
                    activeSessions: this.sseClients.size,
                    lastActivity: new Date(),
                };
                res.json(status);
            }
            catch (error) {
                logError(error instanceof Error ? error : new Error(String(error)), 'Status check failed');
                res.status(500).json({ error: 'Failed to get status' });
            }
        });
        // SSE endpoint for log streaming
        this.app.get('/api/logs/stream', (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            const clientId = `client-${Date.now()}-${Math.random()}`;
            const client = { id: clientId, response: res };
            this.sseClients.add(client);
            logger.info('SSE client connected', { clientId, total: this.sseClients.size });
            // Send initial connection message
            this.sendLogToClient(client, {
                timestamp: new Date().toISOString(),
                level: 'info',
                message: 'Connected to log stream',
            });
            // Handle client disconnect
            req.on('close', () => {
                this.sseClients.delete(client);
                logger.info('SSE client disconnected', { clientId, total: this.sseClients.size });
            });
        });
        // Bridge health check endpoint
        this.app.get('/api/bridge/health', async (_req, res) => {
            try {
                const health = await this.godotClient.healthCheck();
                res.json(health);
            }
            catch (error) {
                logError(error instanceof Error ? error : new Error(String(error)), 'Bridge health check failed');
                res.status(503).json({ error: 'Bridge unavailable' });
            }
        });
        // Bridge version endpoint
        this.app.get('/api/bridge/version', async (_req, res) => {
            try {
                const version = await this.godotClient.getVersion();
                res.json({ version });
            }
            catch (error) {
                logError(error instanceof Error ? error : new Error(String(error)), 'Version check failed');
                res.status(503).json({ error: 'Bridge unavailable' });
            }
        });
        // Error handling middleware
        this.app.use((err, _req, res, _next) => {
            logError(err, 'Express error handler');
            res.status(500).json({ error: 'Internal server error' });
        });
    }
    /**
     * Setup log streaming to SSE clients
     */
    setupLogStreaming() {
        // Intercept Winston logger to stream to SSE clients
        const originalLog = logger.log.bind(logger);
        const self = this;
        // Override log method - uses any to work around Winston type complexity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger.log = function (level, message, ...meta) {
            // Call original logger
            originalLog(level, message, ...meta);
            // Broadcast to SSE clients
            const logEntry = {
                timestamp: new Date().toISOString(),
                level,
                message,
                context: meta.length > 0 ? meta[0] : undefined,
            };
            self.broadcastLog(logEntry);
            return logger;
        };
    }
    /**
     * Broadcast a log entry to all connected SSE clients
     * @param entry - Log entry to broadcast
     */
    broadcastLog(entry) {
        for (const client of this.sseClients) {
            this.sendLogToClient(client, entry);
        }
    }
    /**
     * Send a log entry to a specific SSE client
     * @param client - SSE client
     * @param entry - Log entry
     */
    sendLogToClient(client, entry) {
        try {
            client.response.write(`data: ${JSON.stringify(entry)}\n\n`);
        }
        catch {
            // Client may have disconnected
            this.sseClients.delete(client);
        }
    }
    /**
     * Get server uptime in seconds
     */
    getUptime() {
        return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    }
    /**
     * Start the web server
     * @param port - Port to listen on
     */
    async start(port) {
        return new Promise((resolve) => {
            this.server = this.app.listen(port, () => {
                logger.info(`Web server started on port ${port}`);
                resolve();
            });
        });
    }
    /**
     * Stop the web server
     */
    async stop() {
        if (this.server) {
            return new Promise((resolve, reject) => {
                this.server.close((error) => {
                    if (error) {
                        reject(error);
                    }
                    else {
                        logger.info('Web server stopped');
                        resolve();
                    }
                });
            });
        }
    }
}
//# sourceMappingURL=web-server.js.map