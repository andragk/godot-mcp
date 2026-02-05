/**
 * MCP Request Handler
 * Handles incoming MCP requests, routes to tools, and builds responses
 */
import { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { logger, logError } from '../utils/logger.js';
import { generateCorrelationId } from '../utils/correlation-id.js';
import { ToolRegistry } from '../types/tool-registry.js';
import {
  ValidationError,
  ToolNotFoundError,
  toMCPError,
  TimeoutError,
} from '../types/errors.js';

/**
 * Request Handler for MCP protocol
 */
export class RequestHandler {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  /**
   * Handle a list_tools request
   * Returns all available tools with their schemas
   */
  async handleListTools(): Promise<{
    tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
  }> {
    const tools = this.toolRegistry.getAllTools();
    
   logger.debug('List tools request', {
      service: 'godot-mcp',
      toolCount: tools.length
    });

    return { tools };
  }

  /**
   * Handle a call_tool request
   * Routes to the appropriate tool handler and builds response
   */
  async handleCallTool(request: CallToolRequest): Promise<CallToolResult> {
    // Ensure correlationId is always a string
    const rawCorrelationId = request.params._meta?.progressToken || generateCorrelationId();
    const correlationId = String(rawCorrelationId);
    const { name, arguments: args } = request.params;

    logger.info('Tool execution started', {
      service: 'godot-mcp',
      correlationId,
      tool: name,
      args: this.sanitizeArgsForLogging(args)
    });

    try {
      // Get tool definition
      const tool = this.toolRegistry.get(name);
      if (!tool) {
        throw new ToolNotFoundError(name);
      }

      // Validate arguments with Zod schema
      let validatedArgs: unknown;
      try {
        validatedArgs = tool.schema.parse(args);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(JSON.stringify(error.errors, null, 2));
        }
        throw error;
      }

      // Execute tool handler with timeout
      const result = await this.executeWithTimeout(
        tool.handler(validatedArgs, correlationId),
        30000 // 30 second default timeout
      );

      logger.info('Tool execution succeeded', {
        service: 'godot-mcp',
        correlationId,
        tool: name
      });

      // Build success response
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };

    } catch (error: unknown) {
      const err = error as Error;
      
      logError(err, 'Tool execution failed', {
        service: 'godot-mcp',
        correlationId,
        tool: name
      });

      // Build error response in MCP format
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: err.name || 'Error',
                message: err.message,
                correlationId,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Execute a promise with a timeout
   * @throws TimeoutError if execution exceeds timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError('Tool execution', timeout));
        }, timeout);
      }),
    ]);
  }

  /**
   * Sanitize arguments for logging (remove sensitive data)
   */
  private sanitizeArgsForLogging(args: unknown): unknown {
    if (!args || typeof args !== 'object') {
      return args;
    }

    const sanitized = { ...args as Record<string, unknown> };
    
    // Remove potentially sensitive fields
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'credentials'];
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Transform error to MCP protocol error format
   */
  transformError(error: Error): {
    code: number;
    message: string;
    data?: unknown;
  } {
    const mcpError = toMCPError(error);
    
    // Map string error codes to numeric MCP protocol error codes
    const codeMap: Record<string, number> = {
      'VALIDATION_ERROR': -32602, // Invalid params
      'TOOL_NOT_FOUND': -32601,   // Method not found
      'NETWORK_ERROR': -32000,    // Server error
      'TIMEOUT_ERROR': -32000,    // Server error
      'INTERNAL_ERROR': -32603,   // Internal error
    };
    
    return {
      code: codeMap[mcpError.code] || -32603,
      message: mcpError.message,
      data: mcpError.toClientError(),
    };
  }
}
