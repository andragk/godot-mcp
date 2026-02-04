#!/usr/bin/env node
/**
 * Standalone Web UI server for Godot MCP
 * Can be run independently as a sidecar service
 */
import { logger } from './utils/logger.js';
import { GodotClient } from './bridge/index.js';
import { WebServer } from './presentation/web-server.js';

/**
 * Start the Web UI server independently
 */
async function main(): Promise<void> {
  logger.info('Starting Godot MCP Web UI (Sidecar Mode)');

  // Initialize Godot client for the Web UI
  const godotClient = new GodotClient({
    port: parseInt(process.env.GODOT_BRIDGE_PORT || '7777'),
    timeout: parseInt(process.env.GODOT_BRIDGE_TIMEOUT || '5000'),
  });

  // Initialize web server
  const webServer = new WebServer(godotClient);

  const port = parseInt(process.env.WEB_UI_PORT || '3000');
  await webServer.start(port);

  logger.info('Web UI started successfully in sidecar mode', { port });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down Web UI...');
    await webServer.stop();
    await godotClient.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  logger.error('Failed to start Web UI', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
