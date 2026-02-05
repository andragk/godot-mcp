/**
 * Standard I/O Transport for MCP Server
 * Handles stdio communication with MCP clients
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../../utils/logger.js';

/**
 * Create and configure stdio transport
 */
export function createStdioTransport(): StdioServerTransport {
  logger.debug('Creating stdio transport', {
    service: 'godot-mcp'
  });

  const transport = new StdioServerTransport();

  // Log transport events for debugging
  transport.onclose = () => {
    logger.info('Transport closed', {
      service: 'godot-mcp'
    });
  };

  transport.onerror = (error) => {
    logger.error('Transport error', {
      service: 'godot-mcp',
      error: error instanceof Error ? error.message : String(error)
    });
  };

  return transport;
}
