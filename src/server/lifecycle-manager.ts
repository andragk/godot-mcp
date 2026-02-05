/**
 * Server Lifecycle Manager
 * Handles server startup, shutdown, health checks, and signal handling
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../utils/logger.js';

/**
 * Server health status
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  version: string;
  components: {
    mcp: 'ok' | 'error';
    godotBridge: 'ok' | 'error' | 'unknown';
    toolRegistry: 'ok' | 'error';
  };
}

/**
 * Lifecycle Manager for MCP Server
 */
export class LifecycleManager {
  private readonly startTime: Date;
  private isShuttingDown = false;
  private readonly version = '0.1.0';

  constructor(
    private readonly server: Server,
    private readonly healthCheckFn?: () => Promise<boolean>
  ) {
    this.startTime = new Date();
  }

  /**
   * Initialize server and setup signal handlers
   */
  async initialize(): Promise<void> {
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
  async start(): Promise<void> {
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
  async shutdown(): Promise<void> {
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
    } catch (error) {
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
  async getHealthStatus(): Promise<HealthStatus> {
    const uptime = Date.now() - this.startTime.getTime();
    
    // Check component health
    const godotBridgeStatus = this.healthCheckFn 
      ? await this.healthCheckFn().then(() => 'ok' as const).catch(() => 'error' as const)
      : 'unknown' as const;

    const components = {
      mcp: 'ok' as const,
      godotBridge: godotBridgeStatus,
      toolRegistry: 'ok' as const,
    };

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (Object.values(components).every(s => s === 'ok')) {
      status = 'healthy';
    } else if (Object.values(components).some(s => s === 'error')) {
      status = 'unhealthy';
    } else {
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
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Get server version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Check if server is shutting down
   */
  isShuttingDownStatus(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
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
