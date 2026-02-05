/**
 * Express web server for monitoring and visualization
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { logger, logError } from '../utils/logger.js';
import { GodotClient } from '../bridge/index.js';
import { MCPServerProcessManager } from '../utils/server-process-manager.js';
import { getCacheMetrics } from '../tools/read-tools.js';
import type { ServerStatus, LogEntry } from '../types/index.js';
import { SSEHeartbeat } from './sse-heartbeat.js';
import { SSEClientManager } from './sse-client-manager.js';
import { ToolExecutionService } from './tool-execution-service.js';
import {
  MCPError,
  ValidationError,
  ToolNotFoundError,
  NetworkError,
  TimeoutError,
  CircuitBreakerError,
  ConfigurationError,
  InternalError,
} from '../types/errors.js';

/**
 * Allowed origins for CORS
 */
const ALLOWED_ORIGINS: readonly string[] = Object.freeze([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
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

const RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.RATE_LIMIT_WINDOW ?? '', 10) || 15 * 60 * 1000;
const RATE_LIMIT_MAX_READS = Number.parseInt(process.env.RATE_LIMIT_MAX_READS ?? '', 10) || 100;
const RATE_LIMIT_MAX_WRITES = Number.parseInt(process.env.RATE_LIMIT_MAX_WRITES ?? '', 10) || 20;
const EXECUTE_WINDOW_MS = 60 * 1000;
const EXECUTE_MAX = Math.max(30, RATE_LIMIT_MAX_WRITES);
const LIFECYCLE_WINDOW_MS = 5 * 60 * 1000;
const LIFECYCLE_MAX = Math.max(5, Math.floor(RATE_LIMIT_MAX_WRITES / 2));
const SSE_WINDOW_MS = 60 * 1000;
const SSE_MAX = 10;

/**
 * Web server for dashboard and API endpoints
 */
export class WebServer {
  private readonly app: express.Application;
  private readonly godotClient: GodotClient;
  private readonly serverManager: MCPServerProcessManager;
  private readonly sseClientManager: SSEClientManager;
  private readonly sseHeartbeat: SSEHeartbeat;
  private readonly toolExecutionService: ToolExecutionService;
  private isBroadcastingLog = false;
  private readonly startTime: Date;
  private server: ReturnType<typeof this.app.listen> | null = null;

  constructor(godotClient: GodotClient) {
    this.app = express();
    this.godotClient = godotClient;
    this.serverManager = new MCPServerProcessManager();
    this.sseClientManager = new SSEClientManager();
    this.sseHeartbeat = new SSEHeartbeat({ interval: 30000 });
    this.toolExecutionService = new ToolExecutionService(godotClient);
    this.startTime = new Date();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupLogStreaming();
    this.setupHeartbeat();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security headers
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval required for Alpine.js expressions
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      })
    );

    // CORS configuration with origin validation
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (e.g., mobile apps, Postman)
          if (!origin) {
            callback(null, true);
            return;
          }

          if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
          } else {
            logger.warn('CORS: Origin not allowed', { origin });
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        maxAge: 86400, // 24 hours
      })
    );

    // JSON body parser with size limit
    this.app.use(express.json({ limit: MAX_BODY_SIZE }));

    // Request validation middleware
    this.app.use(this.validateRequest.bind(this));

    // Request logging with detailed information
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        
        // Build comprehensive log context
        const logContext: Record<string, unknown> = {
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
  private validateRequest(req: Request, res: Response, next: NextFunction): void {
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
  private sanitizeObject(obj: Record<string, unknown>): void {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Remove potentially dangerous characters
        obj[key] = (obj[key] as string)
          .replace(/[<>'"]/g, '')
          .trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        this.sanitizeObject(obj[key] as Record<string, unknown>);
      }
    }
  }

  /**
   * Authentication middleware for protected endpoints
   * @param req - Express request
   * @param res - Express response
   * @param next - Next middleware function
   */
  private authenticateRequest(req: Request, res: Response, next: NextFunction): void {
    // For MVP: Only allow requests from localhost
    const clientIp = req.ip || req.socket.remoteAddress || '';
    const isLocalhost =
      clientIp === '127.0.0.1' ||
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
  private setupRoutes(): void {
    const readLimiter = this.createRateLimiter('read', RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_READS, (req) =>
      this.getClientKey(req)
    );
    const executeLimiter = this.createRateLimiter('execute', EXECUTE_WINDOW_MS, EXECUTE_MAX, (req) => {
      const toolName = typeof req.body?.tool === 'string' ? req.body.tool : 'unknown';
      return `${this.getClientKey(req)}:tool:${toolName}`;
    });
    const lifecycleLimiter = this.createRateLimiter(
      'lifecycle',
      LIFECYCLE_WINDOW_MS,
      LIFECYCLE_MAX,
      (req) => this.getClientKey(req)
    );
    const sseLimiter = this.createRateLimiter('sse', SSE_WINDOW_MS, SSE_MAX, (req) =>
      this.getClientKey(req)
    );

    // Static file serving
    this.app.use(express.static('public'));
    this.app.use('/node_modules', express.static('node_modules'));

    // Health endpoint (read limiter)
    this.app.get('/api/health', readLimiter, (_req: Request, res: Response) => {
      res.json({ status: 'ok', uptime: this.getUptime() });
    });

    // Status endpoint (read limiter)
    this.app.get('/api/status', readLimiter, async (_req: Request, res: Response) => {
      try {
        const bridgeHealth = await this.godotClient.healthCheck();
        const status: ServerStatus = {
          uptime: this.getUptime(),
          bridgeConnected: bridgeHealth.status === 'healthy',
          activeSessions: this.sseClientManager.getClientCount(),
          lastActivity: new Date(),
        };
        res.json(status);
      } catch (error) {
        logError(error instanceof Error ? error : new Error(String(error)), 'Status check failed');
        res.status(500).json({ error: 'Service temporarily unavailable' });
      }
    });

    // SSE endpoint for log streaming (authentication + read limiter)
    this.app.get(
      '/api/logs/stream',
      sseLimiter,
      this.authenticateRequest.bind(this),
      (req: Request, res: Response) => {
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
      }
    );

    // Bridge health check endpoint (read limiter)
    this.app.get('/api/bridge/health', readLimiter, async (_req: Request, res: Response) => {
      try {
        const health = await this.godotClient.healthCheck();
        res.json(health);
      } catch (error) {
        logError(
          error instanceof Error ? error : new Error(String(error)),
          'Bridge health check failed'
        );
        res.status(503).json({ error: 'Service temporarily unavailable' });
      }
    });

    // Bridge version endpoint (read limiter)
    this.app.get('/api/bridge/version', readLimiter, async (_req: Request, res: Response) => {
      try {
        const version = await this.godotClient.getVersion();
        res.json({ version });
      } catch (error) {
        logError(
          error instanceof Error ? error : new Error(String(error)),
          'Version check failed'
        );
        res.status(503).json({ error: 'Service temporarily unavailable' });
      }
    });

    // MCP Server lifecycle endpoints
    this.app.post('/api/server/start', lifecycleLimiter, this.authenticateRequest.bind(this), async (_req: Request, res: Response) => {
      try {
        await this.serverManager.start();
        const info = this.serverManager.getInfo();
        res.json({ success: true, message: 'MCP server started', info });
      } catch (error) {
        logError(error instanceof Error ? error : new Error(String(error)), 'Failed to start MCP server');
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to start server' });
      }
    });

    this.app.post('/api/server/stop', lifecycleLimiter, this.authenticateRequest.bind(this), async (req: Request, res: Response) => {
      try {
        const force = req.body?.force === true;
        await this.serverManager.stop(force);
        const info = this.serverManager.getInfo();
        res.json({ success: true, message: 'MCP server stopped', info });
      } catch (error) {
        logError(error instanceof Error ? error : new Error(String(error)), 'Failed to stop MCP server');
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to stop server' });
      }
    });

    this.app.post('/api/server/restart', lifecycleLimiter, this.authenticateRequest.bind(this), async (_req: Request, res: Response) => {
      try {
        await this.serverManager.restart();
        const info = this.serverManager.getInfo();
        res.json({ success: true, message: 'MCP server restarted', info });
      } catch (error) {
        logError(error instanceof Error ? error : new Error(String(error)), 'Failed to restart MCP server');
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to restart server' });
      }
    });

    this.app.get('/api/server/status', readLimiter, (_req: Request, res: Response) => {
      const info = this.serverManager.getInfo();
      res.json(info);
    });

    // Cache metrics endpoint
    this.app.get('/api/cache/metrics', readLimiter, (_req: Request, res: Response) => {
      const metrics = getCacheMetrics();
      res.json(metrics);
    });

    // SSE stats endpoint
    this.app.get('/api/sse/stats', readLimiter, (_req: Request, res: Response) => {
      const clientStats = this.sseClientManager.getStats();
      const heartbeatStats = this.sseHeartbeat.getStats();
      
      res.json({
        clients: clientStats,
        heartbeat: heartbeatStats
      });
    });

    // Tool Explorer API endpoints
    this.app.get('/api/tools', readLimiter, (_req: Request, res: Response) => {
      const tools = this.toolExecutionService.listTools();
      res.json({ tools });
    });

    this.app.post(
      '/api/execute',
      executeLimiter,
      this.authenticateRequest.bind(this),
      async (req: Request, res: Response) => {
      try {
        const { tool, arguments: args } = req.body;
        
        if (!tool) {
          res.status(400).json({ error: 'Tool name is required' });
          return;
        }

        const execution = await this.toolExecutionService.executeTool(tool, args);

        if (!execution.success) {
          const statusCode = this.mapToolErrorToStatus(execution.error?.name);
          res.status(statusCode).json(execution);
          return;
        }

        res.json(execution);
      } catch (error) {
        logError(error instanceof Error ? error : new Error(String(error)), 'Tool execution failed');
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tool execution failed' });
      }
    });

    // Error handling middleware - must be last
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      // Extract correlation ID from request or error
      const correlationId = 
        (req.headers['x-correlation-id'] as string) ||
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

  private getClientKey(req: Request): string {
    const apiKey = this.getApiKey(req);

    if (apiKey && apiKey.length > 0) {
      return `key:${apiKey}`;
    }

    return `ip:${this.getClientIp(req)}`;
  }

  private getClientIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    const forwardedIp = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : undefined;
    return forwardedIp || req.ip || req.socket.remoteAddress || 'unknown';
  }

  private getApiKey(req: Request): string | undefined {
    const apiKeyHeader = req.headers['x-api-key'];
    const authHeader = req.headers.authorization;
    if (typeof apiKeyHeader === 'string') {
      return apiKeyHeader;
    }
    return authHeader?.replace('Bearer ', '');
  }

  private isLocalRequest(req: Request): boolean {
    const clientIp = this.getClientIp(req);
    return (
      clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp === '::ffff:127.0.0.1' ||
      clientIp.startsWith('127.') ||
      clientIp === 'localhost'
    );
  }

  private isValidApiKey(req: Request): boolean {
    if (!API_KEY) {
      return false;
    }
    const apiKey = this.getApiKey(req);
    return apiKey === API_KEY;
  }

  private isTrustedClient(req: Request): boolean {
    return this.isLocalRequest(req) || this.isValidApiKey(req);
  }

  private createRateLimiter(
    name: string,
    windowMs: number,
    max: number,
    keyGenerator: (req: Request) => string
  ) {
    return rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator,
      skip: (req) => this.isTrustedClient(req),
      handler: (req, res, _next, options) => {
        logger.warn('Rate limit exceeded', {
          limiter: name,
          key: keyGenerator(req),
          path: req.path,
          method: req.method,
        });
        res.status(options.statusCode).json({
          error: 'Too many requests, please try again later',
        });
      },
    });
  }

  /**
   * Setup log streaming to SSE clients
   */
  private setupLogStreaming(): void {
    // Intercept Winston logger to stream to SSE clients
    const originalLog = logger.log.bind(logger);
    const self = this;
    
    // Override log method - uses any to work around Winston type complexity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (logger.log as any) = function (
      level: string,
      message: string,
      ...meta: unknown[]
    ): typeof logger {
      // Call original logger
      originalLog(level, message, ...meta);

      // Broadcast to SSE clients
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        context: meta.length > 0 ? (meta[0] as Record<string, unknown>) : undefined,
      };

      if (!self.isBroadcastingLog) {
        self.isBroadcastingLog = true;
        try {
          self.broadcastLog(logEntry);
        } finally {
          self.isBroadcastingLog = false;
        }
      }

      return logger;
    };
  }

  /**
   * Broadcast a log entry to all connected SSE clients
   * @param entry - Log entry to broadcast
   */
  private broadcastLog(entry: LogEntry): void {
    this.sseClientManager.broadcast({
      type: 'log',
      data: entry
    });
  }

  /**
   * Setup heartbeat for SSE connections
   */
  private setupHeartbeat(): void {
    // Subscribe heartbeat to send to all clients
    this.sseHeartbeat.subscribe(() => {
      this.sseClientManager.sendHeartbeat();
    });
    
    // Start heartbeat
    this.sseHeartbeat.start();
  }

  /**
   * Map tool execution errors to HTTP status codes
   */
  private mapToolErrorToStatus(errorName?: string): number {
    switch (errorName) {
      case 'ToolNotFoundError':
        return 404;
      case 'ValidationError':
        return 400;
      case 'TimeoutError':
        return 504;
      case 'NetworkError':
      case 'CircuitBreakerError':
        return 503;
      default:
        return 500;
    }
  }

  /**
   * Get server uptime in seconds
   */
  private getUptime(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Start the web server
   * @param port - Port to listen on
   */
  async start(port: number): Promise<void> {
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
  async stop(): Promise<void> {
    // Stop heartbeat
    this.sseHeartbeat.stop();

    // Close all SSE clients
    this.sseClientManager.closeAll();

    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server!.close((error) => {
          if (error) {
            reject(error);
          } else {
            logger.info('Web server stopped');
            resolve();
          }
        });
      });
    }
  }
}
