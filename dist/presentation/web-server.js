/**
 * Express web server for monitoring and visualization
 */
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { logger, logError } from '../utils/logger.js';
import { MCPServerProcessManager } from '../utils/server-process-manager.js';
import { getCacheMetrics } from '../tools/read-tools.js';
import { SSEHeartbeat } from './sse-heartbeat.js';
import { SSEClientManager } from './sse-client-manager.js';
import { MCPError, ValidationError, ToolNotFoundError, NetworkError, TimeoutError, CircuitBreakerError, ConfigurationError, InternalError, } from '../types/errors.js';
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
    serverManager;
    sseClientManager;
    sseHeartbeat;
    startTime;
    server = null;
    constructor(godotClient) {
        this.app = express();
        this.godotClient = godotClient;
        this.serverManager = new MCPServerProcessManager();
        this.sseClientManager = new SSEClientManager();
        this.sseHeartbeat = new SSEHeartbeat({ interval: 30000 });
        this.startTime = new Date();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupLogStreaming();
        this.setupHeartbeat();
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
                    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval required for Alpine.js expressions
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
        // Request logging with detailed information
        this.app.use((req, res, next) => {
            const startTime = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                // Build comprehensive log context
                const logContext = {
                    method: req.method,
                    path: req.path,
                    status: res.statusCode,
                    duration: `${duration}ms`,
                    ip: req.ip,
                };
                // Add query parameters if present
                if (Object.keys(req.query).length > 0) {
                    logContext.query = req.query;
                }
                // Add request body summary for non-GET requests (first 100 chars)
                if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
                    const bodyStr = JSON.stringify(req.body);
                    logContext.body = bodyStr.length > 100 ? bodyStr.substring(0, 100) + '...' : bodyStr;
                }
                // Add user agent
                const userAgent = req.get('user-agent');
                if (userAgent) {
                    logContext.userAgent = userAgent;
                }
                // Add content type for POST/PUT requests
                const contentType = req.get('content-type');
                if (contentType && req.method !== 'GET') {
                    logContext.contentType = contentType;
                }
                logger.info('HTTP request', logContext);
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
        // Write limiter for POST/PUT/DELETE endpoints
        const writeLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 20, // 20 requests per window
            standardHeaders: true,
            legacyHeaders: false,
            message: { error: 'Too many requests, please try again later' },
        });
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
                    activeSessions: this.sseClientManager.getClientCount(),
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
            // Add client to manager
            this.sseClientManager.addClient(clientId, res);
            // Handle client disconnect
            req.on('close', () => {
                this.sseClientManager.removeClient(clientId);
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
        // MCP Server lifecycle endpoints
        this.app.post('/api/server/start', writeLimiter, this.authenticateRequest.bind(this), async (_req, res) => {
            try {
                await this.serverManager.start();
                const info = this.serverManager.getInfo();
                res.json({ success: true, message: 'MCP server started', info });
            }
            catch (error) {
                logError(error instanceof Error ? error : new Error(String(error)), 'Failed to start MCP server');
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to start server' });
            }
        });
        this.app.post('/api/server/stop', writeLimiter, this.authenticateRequest.bind(this), async (req, res) => {
            try {
                const force = req.body?.force === true;
                await this.serverManager.stop(force);
                const info = this.serverManager.getInfo();
                res.json({ success: true, message: 'MCP server stopped', info });
            }
            catch (error) {
                logError(error instanceof Error ? error : new Error(String(error)), 'Failed to stop MCP server');
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to stop server' });
            }
        });
        this.app.post('/api/server/restart', writeLimiter, this.authenticateRequest.bind(this), async (_req, res) => {
            try {
                await this.serverManager.restart();
                const info = this.serverManager.getInfo();
                res.json({ success: true, message: 'MCP server restarted', info });
            }
            catch (error) {
                logError(error instanceof Error ? error : new Error(String(error)), 'Failed to restart MCP server');
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to restart server' });
            }
        });
        this.app.get('/api/server/status', readLimiter, (_req, res) => {
            const info = this.serverManager.getInfo();
            res.json(info);
        });
        // Cache metrics endpoint
        this.app.get('/api/cache/metrics', readLimiter, (_req, res) => {
            const metrics = getCacheMetrics();
            res.json(metrics);
        });
        // SSE stats endpoint
        this.app.get('/api/sse/stats', readLimiter, (_req, res) => {
            const clientStats = this.sseClientManager.getStats();
            const heartbeatStats = this.sseHeartbeat.getStats();
            res.json({
                clients: clientStats,
                heartbeat: heartbeatStats
            });
        });
        // Tool Explorer API endpoints
        this.app.get('/api/tools', readLimiter, (_req, res) => {
            // Return list of available MCP tools
            // This will be populated by the MCP server's tool registry
            res.json({
                tools: [] // Placeholder - will be populated from MCP server  
            });
        });
        this.app.post('/api/execute', writeLimiter, async (req, res) => {
            try {
                const { tool, arguments: args } = req.body;
                if (!tool) {
                    res.status(400).json({ error: 'Tool name is required' });
                    return;
                }
                // Execute tool via MCP server (placeholder)
                // In production, this would call the MCP server's tool execution
                res.json({
                    result: 'Tool execution not yet implemented',
                    tool,
                    arguments: args
                });
            }
            catch (error) {
                logError(error instanceof Error ? error : new Error(String(error)), 'Tool execution failed');
                res.status(500).json({ error: error instanceof Error ? error.message : 'Tool execution failed' });
            }
        });
        // Error handling middleware - must be last
        this.app.use((err, req, res, _next) => {
            // Extract correlation ID from request or error
            const correlationId = req.headers['x-correlation-id'] ||
                (err instanceof MCPError ? err.correlationId : undefined) ||
                `err-${Date.now()}`;
            // Log full error details server-side with correlation ID
            logger.error('Request error', {
                service: 'godot-mcp',
                correlationId,
                error: err.message,
                stack: err.stack,
                path: req.path,
                method: req.method,
                errorType: err.constructor.name,
            });
            // Handle MCP-specific errors with appropriate status codes
            if (err instanceof ValidationError) {
                res.status(err.statusCode).json({
                    error: 'Validation Error',
                    message: err.message,
                    field: err.field,
                    issues: err.issues,
                    correlationId,
                });
                return;
            }
            if (err instanceof ToolNotFoundError) {
                res.status(err.statusCode).json({
                    error: 'Tool Not Found',
                    message: err.message,
                    toolName: err.toolName,
                    correlationId,
                });
                return;
            }
            if (err instanceof NetworkError) {
                res.status(err.statusCode).json({
                    error: 'Network Error',
                    message: err.message,
                    retryable: err.retryable,
                    correlationId,
                });
                return;
            }
            if (err instanceof TimeoutError) {
                res.status(err.statusCode).json({
                    error: 'Timeout Error',
                    message: err.message,
                    timeoutMs: err.timeoutMs,
                    operation: err.operation,
                    correlationId,
                });
                return;
            }
            if (err instanceof CircuitBreakerError) {
                res.status(err.statusCode).json({
                    error: 'Service Unavailable',
                    message: err.message,
                    retryAfterMs: err.retryAfterMs,
                    correlationId,
                });
                return;
            }
            if (err instanceof ConfigurationError) {
                res.status(err.statusCode).json({
                    error: 'Configuration Error',
                    message: err.message,
                    configKey: err.configKey,
                    correlationId,
                });
                return;
            }
            if (err instanceof InternalError) {
                res.status(err.statusCode).json({
                    error: 'Internal Server Error',
                    message: err.message,
                    correlationId,
                });
                return;
            }
            // Generic error handling for non-MCP errors
            const statusCode = 500;
            const message = process.env.NODE_ENV === 'production'
                ? 'An unexpected error occurred'
                : err.message;
            res.status(statusCode).json({
                error: 'Internal Server Error',
                message,
                correlationId,
            });
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
        this.sseClientManager.broadcast({
            type: 'log',
            data: entry
        });
    }
    /**
     * Setup heartbeat for SSE connections
     */
    setupHeartbeat() {
        // Subscribe heartbeat to send to all clients
        this.sseHeartbeat.subscribe(() => {
            this.sseClientManager.sendHeartbeat();
        });
        // Start heartbeat
        this.sseHeartbeat.start();
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
        // Stop heartbeat
        this.sseHeartbeat.stop();
        // Close all SSE clients
        this.sseClientManager.closeAll();
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