/**
 * Unit tests for Editor Control Tools
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorControlTools } from '../../src/tools/editor-control.js';
import type { GodotClient } from '../../src/bridge/index.js';

describe('EditorControlTools', () => {
  let editorTools: EditorControlTools;
  let mockGodotClient: GodotClient;

  beforeEach(() => {
    // Create mock Godot client
    mockGodotClient = {
      sendRequest: vi.fn(),
    } as unknown as GodotClient;

    editorTools = new EditorControlTools(mockGodotClient);
  });

  describe('launchEditor', () => {
    it('should launch editor with project path', async () => {
      const mockResponse = { success: true, processId: 12345 };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      const result = await editorTools.launchEditor({
        projectPath: '/path/to/project',
      });

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('launch_editor', {
        project_path: '/path/to/project',
        editor_path: undefined,
        additional_args: [],
      });
      expect(result).toEqual(mockResponse);
    });

    it('should launch editor with optional parameters', async () => {
      const mockResponse = { success: true, processId: 12345 };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      const result = await editorTools.launchEditor({
        projectPath: '/path/to/project',
        editorPath: '/usr/bin/godot',
        additionalArgs: ['--verbose', '--debug'],
      });

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('launch_editor', {
        project_path: '/path/to/project',
        editor_path: '/usr/bin/godot',
        additional_args: ['--verbose', '--debug'],
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle launch errors', async () => {
      vi.mocked(mockGodotClient.sendRequest).mockRejectedValue(
        new Error('Editor not found')
      );

      await expect(
        editorTools.launchEditor({
          projectPath: '/path/to/project',
        })
      ).rejects.toThrow('Editor not found');
    });

    it('should validate input schema', async () => {
      await expect(
        editorTools.launchEditor({
          projectPath: 123 as any, // Invalid type
        })
      ).rejects.toThrow();
    });
  });

  describe('runProject', () => {
    it('should run project with default debug mode', async () => {
      const mockResponse = { success: true, processId: 54321 };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      const result = await editorTools.runProject({
        projectPath: '/path/to/project',
      });

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('run_project', {
        project_path: '/path/to/project',
        scene: undefined,
        debug: true,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should run project with specific scene', async () => {
      const mockResponse = { success: true, processId: 54321 };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      const result = await editorTools.runProject({
        projectPath: '/path/to/project',
        scene: 'res://scenes/main.tscn',
        debug: false,
      });

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('run_project', {
        project_path: '/path/to/project',
        scene: 'res://scenes/main.tscn',
        debug: false,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle run errors', async () => {
      vi.mocked(mockGodotClient.sendRequest).mockRejectedValue(
        new Error('Project not found')
      );

      await expect(
        editorTools.runProject({
          projectPath: '/path/to/project',
        })
      ).rejects.toThrow('Project not found');
    });
  });

  describe('stopExecution', () => {
    it('should stop execution gracefully', async () => {
      const mockResponse = { success: true, killed: true };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      const result = await editorTools.stopExecution({
        processId: 12345,
      });

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('stop_execution', {
        process_id: 12345,
        force: false,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should force stop execution', async () => {
      const mockResponse = { success: true, killed: true, forced: true };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      const result = await editorTools.stopExecution({
        processId: 12345,
        force: true,
      });

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('stop_execution', {
        process_id: 12345,
        force: true,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle stop errors', async () => {
      vi.mocked(mockGodotClient.sendRequest).mockRejectedValue(
        new Error('Process not found')
      );

      await expect(
        editorTools.stopExecution({
          processId: 99999,
        })
      ).rejects.toThrow('Process not found');
    });
  });

  describe('getVersion', () => {
    it('should get default Godot version', async () => {
      const mockResponse = { version: '4.6.0.stable', major: 4, minor: 6, patch: 0 };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      const result = await editorTools.getVersion({});

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('get_godot_version', {
        editor_path: undefined,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should get version from specific editor path', async () => {
      const mockResponse = { version: '4.5.0.stable', major: 4, minor: 5, patch: 0 };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      const result = await editorTools.getVersion({
        editorPath: '/usr/bin/godot4.5',
      });

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('get_godot_version', {
        editor_path: '/usr/bin/godot4.5',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle version check errors', async () => {
      vi.mocked(mockGodotClient.sendRequest).mockRejectedValue(
        new Error('Godot not found')
      );

      await expect(editorTools.getVersion({})).rejects.toThrow('Godot not found');
    });
  });

  describe('listProjects', () => {
    it('should list projects in specified paths', async () => {
      const mockResponse = {
        projects: [
          { path: '/path/to/project1', name: 'Project 1' },
          { path: '/path/to/project2', name: 'Project 2' },
        ],
      };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      const result = await editorTools.listProjects({
        searchPaths: ['/home/user/godot'],
      });

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('list_projects', {
        search_paths: ['/home/user/godot'],
        recursive: false,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should list projects recursively', async () => {
      const mockResponse = {
        projects: [
          { path: '/path/to/project1', name: 'Project 1' },
          { path: '/path/to/sub/project2', name: 'Project 2' },
        ],
      };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      const result = await editorTools.listProjects({
        searchPaths: ['/home/user/godot'],
        recursive: true,
      });

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('list_projects', {
        search_paths: ['/home/user/godot'],
        recursive: true,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle multiple search paths', async () => {
      const mockResponse = { projects: [] };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      await editorTools.listProjects({
        searchPaths: ['/home/user/godot', '/home/user/projects'],
      });

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('list_projects', {
        search_paths: ['/home/user/godot', '/home/user/projects'],
        recursive: false,
      });
    });

    it('should validate search paths required', async () => {
      await expect(
        editorTools.listProjects({
          searchPaths: undefined as any,
        })
      ).rejects.toThrow();
    });
  });

  describe('analyzeProject', () => {
    it('should analyze project structure', async () => {
      const mockResponse = {
        name: 'My Project',
        godotVersion: '4.6',
        scenes: 15,
        scripts: 42,
        resources: 103,
      };
      vi.mocked(mockGodotClient.sendRequest).mockResolvedValue(mockResponse);

      const result = await editorTools.analyzeProject({
        projectPath: '/path/to/project',
      });

      expect(mockGodotClient.sendRequest).toHaveBeenCalledWith('analyze_project', {
        project_path: '/path/to/project',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle analysis errors', async () => {
      vi.mocked(mockGodotClient.sendRequest).mockRejectedValue(
        new Error('Invalid project')
      );

      await expect(
        editorTools.analyzeProject({
          projectPath: '/invalid/path',
        })
      ).rejects.toThrow('Invalid project');
    });

    it('should validate project path required', async () => {
      await expect(
        editorTools.analyzeProject({
          projectPath: undefined as any,
        })
      ).rejects.toThrow();
    });
  });
});
