/**
 * Tests for path validation utilities
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  validatePathSync,
  isPathSafe,
  ValidationError,
} from '../../src/utils/path-validator.js';

describe('Path Validator', () => {
  describe('validatePathSync', () => {
    it('should accept valid relative paths', () => {
      const result = validatePathSync('subdir/file.txt');
      expect(result).toContain('file.txt');
    });

    it('should reject parent directory traversal', () => {
      expect(() => validatePathSync('../etc/passwd')).toThrow(ValidationError);
      expect(() => validatePathSync('subdir/../../etc/passwd')).toThrow(ValidationError);
    });

    it('should reject absolute paths when not allowed', () => {
      expect(() => validatePathSync('/etc/passwd')).toThrow(ValidationError);
      expect(() => validatePathSync('C:\\Windows\\System32')).toThrow(ValidationError);
    });

    it('should allow absolute paths when explicitly allowed', () => {
      const result = validatePathSync('/tmp/test.txt', { allowAbsolute: true });
      expect(result).toBe(resolve('/tmp/test.txt'));
    });

    it('should enforce base directory restrictions', () => {
      const baseDir = resolve('/home/user/projects');
      const options = { baseDir };

      // Valid path within base
      const valid = validatePathSync('myproject/scene.tscn', options);
      expect(valid).toContain('myproject');

      // Invalid path outside base (traversal)
      expect(() => validatePathSync('../../../etc/passwd', options)).toThrow(ValidationError);
    });

    it('should reject null byte injection', () => {
      expect(() => validatePathSync('file.txt\0.exe')).toThrow(ValidationError);
    });

    it('should reject invalid filename characters', () => {
      expect(() => validatePathSync('file<script>.txt')).toThrow(ValidationError);
      expect(() => validatePathSync('file|pipe.txt')).toThrow(ValidationError);
      expect(() => validatePathSync('file?.txt')).toThrow(ValidationError);
    });

    it('should reject home directory references', () => {
      expect(() => validatePathSync('~/sensitive/file.txt')).toThrow(ValidationError);
    });

    it('should enforce maximum path length', () => {
      const longPath = 'a'.repeat(5000);
      expect(() => validatePathSync(longPath)).toThrow(ValidationError);
      
      // Should allow with custom max length
      const shortPath = 'a'.repeat(50);
      validatePathSync(shortPath, { maxLength: 100 });
    });

    it('should validate file extensions', () => {
      const options = { allowedExtensions: ['tscn', 'gd', 'tres'] };

      validatePathSync('scene.tscn', options);
      validatePathSync('script.gd', options);
      
      expect(() => validatePathSync('file.txt', options)).toThrow(ValidationError);
      expect(() => validatePathSync('file.exe', options)).toThrow(ValidationError);
    });

    it('should handle paths without base directory', () => {
      const result = validatePathSync('relative/path.txt');
      expect(result).toContain('path.txt');
    });

    it('should normalize paths properly', () => {
      const result = validatePathSync('dir1//dir2/./file.txt');
      expect(result).not.toContain('//');
      expect(result).not.toContain('./');
    });
  });

  describe('isPathSafe', () => {
    it('should return true for safe paths', () => {
      expect(isPathSafe('project/scene.tscn')).toBe(true);
      expect(isPathSafe('scripts/player.gd')).toBe(true);
    });

    it('should return false for unsafe paths', () => {
      expect(isPathSafe('../etc/passwd')).toBe(false);
      expect(isPathSafe('file\0.exe')).toBe(false);
      expect(isPathSafe('~/private')).toBe(false);
      expect(isPathSafe('file<script>.txt')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty paths', () => {
      expect(() => validatePathSync('')).toThrow();
    });

    it('should handle Windows-style paths', () => {
      // Without allowAbsolute, should reject
      expect(() => validatePathSync('C:\\Users\\Test')).toThrow(ValidationError);
      
      // With allowAbsolute, should accept if on Windows
      if (process.platform === 'win32') {
        const result = validatePathSync('C:\\Users\\Test', { allowAbsolute: true });
        expect(result).toContain('Users');
      }
    });

    it('should handle Unix-style paths', () => {
      expect(() => validatePathSync('/usr/bin/godot')).toThrow(ValidationError);
      
      const result = validatePathSync('/usr/bin/godot', { allowAbsolute: true });
      expect(result).toContain('godot');
    });

    it('should handle mixed path separators', () => {
      const result = validatePathSync('dir1\\dir2/file.txt');
      expect(result).toContain('file.txt');
    });

    it('should ensure path stays within base directory', () => {
      const baseDir = resolve('/safe/projects');
      
      // Try to escape using encoded characters (should be normalized and caught)
      expect(() => validatePathSync('./../../../etc', { baseDir })).toThrow(ValidationError);
    });

    it('should handle the base directory itself', () => {
      const baseDir = resolve('/safe/projects');
      const result = validatePathSync('.', { baseDir });
      expect(result).toBe(baseDir);
    });
  });
});
