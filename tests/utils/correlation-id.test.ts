/**
 * Tests for correlation ID utilities
 */
import { describe, it, expect } from 'vitest';
import { generateCorrelationId, isValidCorrelationId } from '../../src/utils/correlation-id.js';

describe('Correlation ID', () => {
  describe('generateCorrelationId', () => {
    it('should generate a valid UUID v4', () => {
      const id = generateCorrelationId();
      
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs that pass validation', () => {
      const id = generateCorrelationId();
      expect(isValidCorrelationId(id)).toBe(true);
    });
  });

  describe('isValidCorrelationId', () => {
    it('should accept valid UUID v4', () => {
      const validIds = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '12345678-1234-4234-9234-123456789012',
      ];

      validIds.forEach(id => {
        expect(isValidCorrelationId(id)).toBe(true);
      });
    });

    it('should reject invalid UUIDs', () => {
      const invalidIds = [
        '',
        'not-a-uuid',
        '550e8400-e29b-41d4-a716', // Too short
        '550e8400-e29b-41d4-a716-446655440000-extra', // Too long
      ];

      invalidIds.forEach(id => {
        expect(isValidCorrelationId(id)).toBe(false);
      });
    });
  });
});
