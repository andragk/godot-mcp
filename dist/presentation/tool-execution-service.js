import { EditorControlTools } from '../tools/editor-control.js';
import { ToolRegistry } from '../types/tool-registry.js';
import { registerAllTools } from '../server/tool-registration.js';
import { RequestHandler } from '../server/request-handler.js';
export class ToolExecutionService {
    toolRegistry;
    requestHandler;
    constructor(godotClient) {
        const editorTools = new EditorControlTools(godotClient);
        this.toolRegistry = new ToolRegistry();
        registerAllTools(this.toolRegistry, godotClient, editorTools);
        this.requestHandler = new RequestHandler(this.toolRegistry);
    }
    listTools() {
        return this.toolRegistry.getAllToolSummaries();
    }
    async executeTool(name, args, correlationId) {
        return this.requestHandler.executeTool(name, args, correlationId);
    }
}
//# sourceMappingURL=tool-execution-service.js.map