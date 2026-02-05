/**
 * Tool Execution Service
 * Provides tool listing and execution for the Web UI.
 */
import type { GodotClient } from '../bridge/godot-client.js';
import { EditorControlTools } from '../tools/editor-control.js';
import { ToolRegistry } from '../types/tool-registry.js';
import { registerAllTools } from '../server/tool-registration.js';
import { RequestHandler } from '../server/request-handler.js';

export class ToolExecutionService {
  private readonly toolRegistry: ToolRegistry;
  private readonly requestHandler: RequestHandler;

  constructor(godotClient: GodotClient) {
    const editorTools = new EditorControlTools(godotClient);
    this.toolRegistry = new ToolRegistry();
    registerAllTools(this.toolRegistry, godotClient, editorTools);
    this.requestHandler = new RequestHandler(this.toolRegistry);
  }

  listTools() {
    return this.toolRegistry.getAllToolSummaries();
  }

  async executeTool(name: string, args: unknown, correlationId?: string) {
    return this.requestHandler.executeTool(name, args, correlationId);
  }
}
