/**
 * Message Serializer for MCP Protocol
 * Handles serialization and deserialization of MCP messages
 */
import { logger } from '../../utils/logger.js';
/**
 * Serialize value to JSON with error handling
 */
export function serializeMessage(value) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch (error) {
        logger.error('Failed to serialize message', {
            service: 'godot-mcp',
            error: error instanceof Error ? error.message : String(error)
        });
        throw new Error('Message serialization failed');
    }
}
/**
 * Deserialize JSON string to object with error handling
 */
export function deserializeMessage(json) {
    try {
        return JSON.parse(json);
    }
    catch (error) {
        logger.error('Failed to deserialize message', {
            service: 'godot-mcp',
            error: error instanceof Error ? error.message : String(error),
            json: json.substring(0, 100) // Log first 100 chars
        });
        throw new Error('Message deserialization failed');
    }
}
/**
 * Validate message structure
 */
export function isValidMCPMessage(message) {
    if (!message || typeof message !== 'object') {
        return false;
    }
    const msg = message;
    // Check for required MCP message fields
    return (typeof msg.jsonrpc === 'string' &&
        msg.jsonrpc === '2.0' &&
        (typeof msg.method === 'string' || typeof msg.result !== 'undefined' || typeof msg.error !== 'undefined'));
}
//# sourceMappingURL=message-serializer.js.map