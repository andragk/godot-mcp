/**
 * Express web server for monitoring and visualization
 */
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { logger, logError } from '../utils/logger.js';
/**
 * Allowed origins for CORS
 */
const ALLOWED_ORIGINS = Object.freeze([
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    ...(process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? []),
]);
/**
 * API key for authentication (for MVP: optional, but logged)
 */
const API_KEY = process.env.MCP_API_KEY;
/**
 * Maximum request body size
 */
const MAX_BODY_SIZE = '100kb';
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
        // Security headers
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.tailwindcss.com'], // unsafe-eval required for Alpine.js expressions, CDN for Tailwind
                    imgSrc: ["'self'", 'data:', 'https:'],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                },
            },
            crossOriginEmbedderPolicy: false,
        }));
        // CORS configuration with origin validation
        this.app.use(cors({
            origin: (origin, callback) => {
                // Allow requests with no origin (e.g., mobile apps, Postman)
                if (!origin) {
                    callback(null, true);
                    return;
                }
                if (ALLOWED_ORIGINS.includes(origin)) {
                    callback(null, true);
                }
                else {
                    logger.warn('CORS: Origin not allowed', { origin });
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
            maxAge: 86400, // 24 hours
        }));
        // JSON body parser with size limit
        this.app.use(express.json({ limit: MAX_BODY_SIZE }));
        // Request validation middleware
        this.app.use(this.validateRequest.bind(this));
        // Request logging (only log non-debug routes)
        this.app.use((req, res, next) => {
            // Skip logging for health checks and other noisy endpoints
            if (req.path === '/api/health') {
                return next();
            }
            const startTime = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                logger.info('HTTP request', {
                    method: req.method,
                    path: req.path,
                    status: res.statusCode,
                    duration: `${duration}ms`,
                    ip: req.ip,
                });
            });
            next();
        });
    }
    /**
     * Validate request middleware
     * @param req - Express request
     * @param res - Express response
     * @param next - Next middleware function
     */
    validateRequest(req, res, next) {
        // Validate JSON body structure for POST requests
        if (req.method === 'POST' && req.body) {
            if (typeof req.body !== 'object' || Array.isArray(req.body)) {
                res.status(400).json({ error: 'Invalid request format' });
                return;
            }
            // Sanitize string inputs (basic XSS prevention)
            this.sanitizeObject(req.body);
        }
        next();
    }
    /**
     * Sanitize object properties to prevent XSS
     * @param obj - Object to sanitize
     */
    sanitizeObject(obj) {
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                // Remove potentially dangerous characters
                obj[key] = obj[key]
                    .replace(/[<>'"]/g, '')
                    .trim();
            }
            else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                this.sanitizeObject(obj[key]);
            }
        }
    }
    /**
     * Authentication middleware for protected endpoints
     * @param req - Express request
     * @param res - Express response
     * @param next - Next middleware function
     */
    authenticateRequest(req, res, next) {
        // For MVP: Only allow requests from localhost
        const clientIp = req.ip || req.socket.remoteAddress || '';
        const isLocalhost = clientIp === '127.0.0.1' ||
            clientIp === '::1' ||
            clientIp === '::ffff:127.0.0.1' ||
            clientIp.startsWith('127.') ||
            clientIp === 'localhost';
        if (!isLocalhost) {
            logger.warn('Unauthorized access attempt to SSE endpoint', {
                ip: clientIp,
                userAgent: req.get('user-agent'),
            });
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        // Optional: Check API key if provided
        if (API_KEY) {
            const providedKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
            if (providedKey !== API_KEY) {
                logger.warn('Invalid API key provided', { ip: clientIp });
                res.status(401).json({ error: 'Authentication required' });
                return;
            }
        }
        next();
    }
    /**
     * Setup Express routes
     */
    setupRoutes() {
        // Rate limiters
        const readLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // 100 requests per window
            standardHeaders: true,
            legacyHeaders: false,
            message: { error: 'Too many requests, please try again later' },
        });
        // Write limiter for future POST/PUT/DELETE endpoints
        // const writeLimiter = rateLimit({
        //   windowMs: 15 * 60 * 1000, // 15 minutes
        //   max: 20, // 20 requests per window
        //   standardHeaders: true,
        //   legacyHeaders: false,
        //   message: { error: 'Too many requests, please try again later' },
        // });
        // Static file serving
        this.app.use(express.static('public'));
        this.app.use('/node_modules', express.static('node_modules'));
        // Health endpoint (read limiter)
        this.app.get('/api/health', readLimiter, (_req, res) => {
            res.json({ status: 'ok', uptime: this.getUptime() });
        });
        // Status endpoint (read limiter)
        this.app.get('/api/status', readLimiter, async (_req, res) => {
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
                res.status(500).json({ error: 'Service temporarily unavailable' });
            }
        });
        // SSE endpoint for log streaming (authentication + read limiter)
        this.app.get('/api/logs/stream', readLimiter, this.authenticateRequest.bind(this), (req, res) => {
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
        // Bridge health check endpoint (read limiter)
        this.app.get('/api/bridge/health', readLimiter, async (_req, res) => {
            try {
                const health = await this.godotClient.healthCheck();
                res.json(health);
            }
            catch (error) {
                logError(error instanceof Error ? error : new Error(String(error)), 'Bridge health check failed');
                res.status(503).json({ error: 'Service temporarily unavailable' });
            }
        });
        // Bridge version endpoint (read limiter)
        this.app.get('/api/bridge/version', readLimiter, async (_req, res) => {
            try {
                const version = await this.godotClient.getVersion();
                res.json({ version });
            }
            catch (error) {
                logError(error instanceof Error ? error : new Error(String(error)), 'Version check failed');
                res.status(503).json({ error: 'Service temporarily unavailable' });
            }
        });
        // Error handling middleware
        this.app.use((err, _req, res, _next) => {
            // Log full error details server-side
            logError(err, 'Express error handler');
            logger.error('Additional error context', {
                name: err.name,
                stack: err.stack,
            });
            // Return generic error to client (never expose internal details)
            res.status(500).json({ error: 'An unexpected error occurred' });
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