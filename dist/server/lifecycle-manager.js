import { logger } from '../utils/logger.js';
/**
 * Lifecycle Manager for MCP Server
 */
export class LifecycleManager {
    server;
    healthCheckFn;
    startTime;
    isShuttingDown = false;
    version = '0.1.0';
    constructor(server, healthCheckFn) {
        this.server = server;
        this.healthCheckFn = healthCheckFn;
        this.startTime = new Date();
    }
    /**
     * Initialize server and setup signal handlers
     */
    async initialize() {
        // Setup graceful shutdown handlers
        this.setupSignalHandlers();
        logger.info('Server initialized', {
            service: 'godot-mcp',
            version: this.version,
            startTime: this.startTime.toISOString()
        });
    }
    /**
     * Start the MCP server
     */
    async start() {
        logger.info('Starting MCP server', {
            service: 'godot-mcp'
        });
        // Server startup is handled by SDK's run() method
        // This method is for any additional startup logic
        logger.info('MCP server started successfully', {
            service: 'godot-mcp',
            version: this.version
        });
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        if (this.isShuttingDown) {
            logger.warn('Shutdown already in progress', {
                service: 'godot-mcp'
            });
            return;
        }
        this.isShuttingDown = true;
        logger.info('Initiating graceful shutdown', {
            service: 'godot-mcp'
        });
        try {
            // Close server
            await this.server.close();
            // Additional cleanup can be added here
            // - Close database connections
            // - Flush logs
            // - Save state
            logger.info('Server shut down successfully', {
                service: 'godot-mcp'
            });
            process.exit(0);
        }
        catch (error) {
            logger.error('Error during shutdown', {
                service: 'godot-mcp',
                error: error instanceof Error ? error.message : String(error)
            });
            // Force exit on error
            process.exit(1);
        }
    }
    /**
     * Get server health status
     */
    async getHealthStatus() {
        const uptime = Date.now() - this.startTime.getTime();
        // Check component health
        const godotBridgeStatus = this.healthCheckFn
            ? await this.healthCheckFn().then(() => 'ok').catch(() => 'error')
            : 'unknown';
        const components = {
            mcp: 'ok',
            godotBridge: godotBridgeStatus,
            toolRegistry: 'ok',
        };
        // Determine overall status
        let status;
        if (Object.values(components).every(s => s === 'ok')) {
            status = 'healthy';
        }
        else if (Object.values(components).some(s => s === 'error')) {
            status = 'unhealthy';
        }
        else {
            status = 'degraded';
        }
        return {
            status,
            uptime,
            timestamp: new Date().toISOString(),
            version: this.version,
            components,
        };
    }
    /**
     * Get server uptime in milliseconds
     */
    getUptime() {
        return Date.now() - this.startTime.getTime();
    }
    /**
     * Get server version
     */
    getVersion() {
        return this.version;
    }
    /**
     * Check if server is shutting down
     */
    isShuttingDownStatus() {
        return this.isShuttingDown;
    }
    /**
     * Setup signal handlers for graceful shutdown
     */
    setupSignalHandlers() {
        // Handle SIGTERM (e.g., from Kubernetes, Docker)
        process.on('SIGTERM', () => {
            logger.info('Received SIGTERM signal', {
                service: 'godot-mcp'
            });
            this.shutdown();
        });
        // Handle SIGINT (Ctrl+C)
        process.on('SIGINT', () => {
            logger.info('Received SIGINT signal', {
                service: 'godot-mcp'
            });
            this.shutdown();
        });
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', {
                service: 'godot-mcp',
                error: error.message,
                stack: error.stack
            });
            // Attempt graceful shutdown
            this.shutdown();
        });
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled promise rejection', {
                service: 'godot-mcp',
                reason: reason instanceof Error ? reason.message : String(reason),
                promise: String(promise)
            });
            // Attempt graceful shutdown
            this.shutdown();
        });
    }
}
//# sourceMappingURL=lifecycle-manager.js.map