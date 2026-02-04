/**
 * Correlation ID generator for request tracing
 */
import { randomUUID } from 'node:crypto';
/**
 * Generate a correlation ID for request tracing
 */
export function generateCorrelationId() {
    return randomUUID();
}
/**
 * Validate correlation ID format
 */
export function isValidCorrelationId(id) {
    // UUID v4 format - more flexible to accept various UUID versions
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
}
//# sourceMappingURL=correlation-id.js.map