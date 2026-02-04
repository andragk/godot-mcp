/**
 * Main entry point for the Godot MCP server (stdio mode)
 * For standalone Web UI, use web-ui.ts instead
 */
import { GodotMCPServer } from './server/index.js';
import { logger, logError } from './utils/logger.js';

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  logger.info('Starting Godot MCP Server (stdio mode)');

  // Initialize MCP server
  const mcpServer = new GodotMCPServer();

  // Start MCP server (stdio)
  await mcpServer.start();

  logger.info('MCP server started successfully');
  logger.info('Note: For Web UI dashboard, run "npm run web-ui" in a separate terminal');

  // Setup graceful shutdown
  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down MCP server...');
    try {
      await mcpServer.stop();
      process.exit(0);
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'Shutdown error');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

// Run the application
main().catch((error) => {
  logError(error instanceof Error ? error : new Error(String(error)), 'Fatal application error');
  process.exit(1);
});
