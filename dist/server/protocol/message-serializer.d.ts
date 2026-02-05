/**
 * Serialize value to JSON with error handling
 */
export declare function serializeMessage(value: unknown): string;
/**
 * Deserialize JSON string to object with error handling
 */
export declare function deserializeMessage<T = unknown>(json: string): T;
/**
 * Validate message structure
 */
export declare function isValidMCPMessage(message: unknown): boolean;
//# sourceMappingURL=message-serializer.d.ts.map