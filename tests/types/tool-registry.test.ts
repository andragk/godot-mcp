/**
 * Tests for tool registry
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../src/types/tool-registry.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('should register a tool', () => {
      const schema = z.object({ name: z.string() });
      
      registry.register({
        metadata: {
          name: 'test_tool',
          version: '1.0.0',
          category: 'connectivity',
          securityLevel: 'safe',
          description: 'Test tool',
        },
        schema,
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        handler: async (args) => ({ result: args.name }),
      });

      expect(registry.has('test_tool')).toBe(true);
      expect(registry.getToolNames()).toContain('test_tool');
    });

    it('should throw if tool already registered', () => {
      const schema = z.object({});
      const definition = {
        metadata: {
          name: 'duplicate',
          version: '1.0.0',
          category: 'connectivity' as const,
          securityLevel: 'safe' as const,
          description: 'Test',
        },
        schema,
        inputSchema: { type: 'object' as const, properties: {} },
        handler: async () => ({}),
      };

      registry.register(definition);
      
      expect(() => registry.register(definition)).toThrow(
        'Tool already registered: duplicate'
      );
    });
  });

  describe('get', () => {
    it('should retrieve registered tool', () => {
      const schema = z.object({ value: z.number() });
      const handler = async (args: { value: number }) => args.value * 2;
      
      registry.register({
        metadata: {
          name: 'calculator',
          version: '1.0.0',
          category: 'system',
          securityLevel: 'safe',
          description: 'Calculator',
        },
        schema,
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'number' } },
        },
        handler,
      });

      const tool = registry.get('calculator');
      expect(tool).toBeDefined();
      expect(tool?.metadata.name).toBe('calculator');
      expect(tool?.handler).toBe(handler);
    });

    it('should return undefined for non-existent tool', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered tool', () => {
      const schema = z.object({});
      
      registry.register({
        metadata: {
          name: 'exists',
          version: '1.0.0',
          category: 'connectivity',
          securityLevel: 'safe',
          description: 'Exists',
        },
        schema,
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({}),
      });

      expect(registry.has('exists')).toBe(true);
    });

    it('should return false for non-existent tool', () => {
      expect(registry.has('does_not_exist')).toBe(false);
    });
  });

  describe('getToolNames', () => {
    it('should return all tool names', () => {
      const schema = z.object({});
      const createTool = (name: string) => ({
        metadata: {
          name,
          version: '1.0.0',
          category: 'connectivity' as const,
          securityLevel: 'safe' as const,
          description: name,
        },
        schema,
        inputSchema: { type: 'object' as const, properties: {} },
        handler: async () => ({}),
      });

      registry.register(createTool('tool1'));
      registry.register(createTool('tool2'));
      registry.register(createTool('tool3'));

      const names = registry.getToolNames();
      expect(names).toHaveLength(3);
      expect(names).toEqual(expect.arrayContaining(['tool1', 'tool2', 'tool3']));
    });

    it('should return empty array when no tools registered', () => {
      expect(registry.getToolNames()).toEqual([]);
    });
  });

  describe('getAllTools', () => {
    it('should return all tools in MCP format', () => {
      const schema = z.object({ arg: z.string() });
      
      registry.register({
        metadata: {
          name: 'example',
          version: '1.0.0',
          category: 'connectivity',
          securityLevel: 'safe',
          description: 'Example tool',
        },
        schema,
        inputSchema: {
          type: 'object',
          properties: { arg: { type: 'string' } },
          required: ['arg'],
        },
        handler: async () => ({}),
      });

      const tools = registry.getAllTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        name: 'example',
        description: 'Example tool',
        inputSchema: {
          type: 'object',
          properties: { arg: { type: 'string' } },
          required: ['arg'],
        },
      });
    });
  });

  describe('getByCategory', () => {
    it('should filter tools by category', () => {
      const schema = z.object({});
      const createTool = (name: string, category: 'connectivity' | 'editor' | 'project' | 'system') => ({
        metadata: {
          name,
          version: '1.0.0',
          category,
          securityLevel: 'safe' as const,
          description: name,
        },
        schema,
        inputSchema: { type: 'object' as const, properties: {} },
        handler: async () => ({}),
      });

      registry.register(createTool('tool1', 'connectivity'));
      registry.register(createTool('tool2', 'editor'));
      registry.register(createTool('tool3', 'connectivity'));

      const connectivityTools = registry.getByCategory('connectivity');
      expect(connectivityTools).toHaveLength(2);
      expect(connectivityTools.map(t => t.metadata.name)).toEqual(
        expect.arrayContaining(['tool1', 'tool3'])
      );
    });
  });

  describe('getBySecurityLevel', () => {
    it('should filter tools by security level', () => {
      const schema = z.object({});
      const createTool = (name: string, securityLevel: 'safe' | 'requires-review' | 'privileged') => ({
        metadata: {
          name,
          version: '1.0.0',
          category: 'connectivity' as const,
          securityLevel,
          description: name,
        },
        schema,
        inputSchema: { type: 'object' as const, properties: {} },
        handler: async () => ({}),
      });

      registry.register(createTool('safe1', 'safe'));
      registry.register(createTool('privileged1', 'privileged'));
      registry.register(createTool('safe2', 'safe'));

      const safeTools = registry.getBySecurityLevel('safe');
      expect(safeTools).toHaveLength(2);
      expect(safeTools.map(t => t.metadata.name)).toEqual(
        expect.arrayContaining(['safe1', 'safe2'])
      );
    });
  });
});
