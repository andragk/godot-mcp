/**
 * Main entry point for the Godot MCP application
 * Starts both the MCP server (stdio) and web UI server
 */
import { GodotMCPServer } from './server/index.js';
import { WebServer } from './presentation/web-server.js';
import { GodotClient } from './bridge/index.js';
import { logger, logError } from './utils/logger.js';

const WEB_PORT = parseInt(process.env.WEB_PORT || '3000');

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  logger.info('Starting Godot MCP application');

  // Initialize Godot client
  const godotClient = new GodotClient({
    port: 7777,
    timeout: 5000,
  });

  // Initialize web server
  const webServer = new WebServer(godotClient);

  // Initialize MCP server
  const mcpServer = new GodotMCPServer();

  // Start web server
  await webServer.start(WEB_PORT);
  logger.info(`Dashboard available at http://localhost:${WEB_PORT}`);

  // Start MCP server (stdio)
  await mcpServer.start();

  // Setup graceful shutdown
  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down application...');
    try {
      await webServer.stop();
      await mcpServer.stop();
      await godotClient.close();
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

  logger.info('Application started successfully');
}

// Run the application
main().catch((error) => {
  logError(error instanceof Error ? error : new Error(String(error)), 'Fatal application error');
  process.exit(1);
});
