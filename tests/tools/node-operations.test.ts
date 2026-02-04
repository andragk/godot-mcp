import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  searchNodes,
  getNodeProperties,
  type NodeSearchQuery,
} from '../../src/tools/node-operations.js';

describe('Node Operations Tools', () => {
  let tempDir: string;
  let projectPath: string;

  beforeAll(async () => {
    // Create temporary test directory
    tempDir = await mkdtemp(path.join(tmpdir(), 'godot-node-ops-test-'));
    projectPath = tempDir;

    // Create project.godot
    await writeFile(
      path.join(projectPath, 'project.godot'),
      `
config_version=5

[application]
config/name="Node Operations Test"
`
    );

    // Create test scenes
    await createTestScene(projectPath, 'scenes/player.tscn', `
[gd_scene format=3]

[node name="Player" type="CharacterBody2D"]
position = Vector2(100, 200)
visible = true

[node name="Sprite2D" type="Sprite2D" parent="."]
position = Vector2(0, 0)

[node name="CollisionShape2D" type="CollisionShape2D" parent="."]

[node name="Camera2D" type="Camera2D" parent="."]
zoom = Vector2(2, 2)
`);

    await createTestScene(projectPath, 'scenes/enemy.tscn', `
[gd_scene format=3]

[node name="Enemy" type="CharacterBody2D"]
position = Vector2(300, 400)
visible = false

[node name="EnemySprite" type="Sprite2D" parent="."]

[node name="Health" type="Node" parent="."]
`);

    await createTestScene(projectPath, 'scenes/ui/menu.tscn', `
[gd_scene format=3]

[node name="Menu" type="Control"]

[node name="StartButton" type="Button" parent="."]
text = "Start Game"

[node name="QuitButton" type="Button" parent="."]
text = "Quit"

[node name="Title" type="Label" parent="."]
text = "Main Menu"
`);
  });

  afterAll(async () => {
    // Clean up temp directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('searchNodes', () => {
    it('should find all nodes when no query specified', async () => {
      const results = await searchNodes(projectPath, {});
      
      expect(results.length).toBeGreaterThan(0);
    });

    it('should search by exact node name', async () => {
      const query: NodeSearchQuery = {
        name: 'Player',
        mode: 'exact',
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.length).toBe(1);
      expect(results[0].node.name).toBe('Player');
      expect(results[0].scenePath).toContain('player.tscn');
    });

    it('should search by name prefix', async () => {
      const query: NodeSearchQuery = {
        name: 'Enemy',
        mode: 'prefix',
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.node.name === 'Enemy')).toBe(true);
      expect(results.some(r => r.node.name === 'EnemySprite')).toBe(true);
    });

    it('should search by name contains', async () => {
      const query: NodeSearchQuery = {
        name: 'button',
        mode: 'contains',
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.length).toBe(2);
      expect(results.some(r => r.node.name === 'StartButton')).toBe(true);
      expect(results.some(r => r.node.name === 'QuitButton')).toBe(true);
    });

    it('should search by name regex', async () => {
      const query: NodeSearchQuery = {
        name: '^(Start|Quit)Button$',
        mode: 'regex',
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.length).toBe(2);
    });

    it('should filter by node type', async () => {
      const query: NodeSearchQuery = {
        type: 'Sprite2D',
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.length).toBe(2);
      expect(results.every(r => r.node.type === 'Sprite2D')).toBe(true);
    });

    it('should filter by property value', async () => {
      const query: NodeSearchQuery = {
        property: {
          visible: true,
        },
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.node.name === 'Player')).toBe(true);
    });

    it('should combine multiple criteria with AND', async () => {
      const query: NodeSearchQuery = {
        type: 'CharacterBody2D',
        property: {
          visible: true,
        },
        operator: 'AND',
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.length).toBe(1);
      expect(results[0].node.name).toBe('Player');
    });

    it('should combine multiple criteria with OR', async () => {
      const query: NodeSearchQuery = {
        name: 'Player',
        type: 'Sprite2D',
        operator: 'OR',
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it('should limit results', async () => {
      const query: NodeSearchQuery = {
        limit: 2,
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should support pagination with offset', async () => {
      const allResults = await searchNodes(projectPath, {});
      
      const page1 = await searchNodes(projectPath, { limit: 3, offset: 0 });
      const page2 = await searchNodes(projectPath, { limit: 3, offset: 3 });
      
      expect(page1.length).toBeLessThanOrEqual(3);
      expect(page2.length).toBeLessThanOrEqual(3);
      
      // Pages should not overlap
      const page1Names = page1.map(r => r.node.name);
      const page2Names = page2.map(r => r.node.name);
      expect(page1Names.some(n => page2Names.includes(n))).toBe(false);
    });

    it('should search in specific scenes only', async () => {
      const query: NodeSearchQuery = {
        scenes: ['scenes/player.tscn'],
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.every(r => r.scenePath === 'scenes/player.tscn')).toBe(true);
    });

    it('should return node path within scene hierarchy', async () => {
      const query: NodeSearchQuery = {
        name: 'Sprite2D',
        mode: 'exact',
        scenes: ['scenes/player.tscn'],
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.length).toBe(1);
      expect(results[0].nodePath).toBe('Player/Sprite2D');
    });

    it('should calculate relevance scores', async () => {
      const query: NodeSearchQuery = {
        name: 'Button',
        mode: 'contains',
      };
      
      const results = await searchNodes(projectPath, query);
      
      expect(results.every(r => r.score > 0 && r.score <= 1)).toBe(true);
    });

    it('should handle invalid project path', async () => {
      await expect(
        searchNodes('/invalid/path', {})
      ).rejects.toThrow();
    });

    it('should handle empty project with no scenes', async () => {
      const emptyProject = await mkdtemp(path.join(tmpdir(), 'empty-'));
      await writeFile(
        path.join(emptyProject, 'project.godot'),
        'config_version=5'
      );
      
      const results = await searchNodes(emptyProject, {});
      
      expect(results.length).toBe(0);
      
      await rm(emptyProject, { recursive: true, force: true });
    });
  });

  describe('getNodeProperties', () => {
    it('should get properties of root node', async () => {
      const result = await getNodeProperties(
        projectPath,
        'scenes/player.tscn',
        'Player'
      );
      
      expect(result).toBeDefined();
      expect(result.nodePath).toBe('Player');
      expect(result.scenePath).toBe('scenes/player.tscn');
      expect(result.type).toBe('CharacterBody2D');
      expect(result.name).toBe('Player');
      expect(result.parent).toBeNull();
    });

    it('should get properties of child node', async () => {
      const result = await getNodeProperties(
        projectPath,
        'scenes/player.tscn',
        'Player/Sprite2D'
      );
      
      expect(result).toBeDefined();
      expect(result.nodePath).toBe('Player/Sprite2D');
      expect(result.type).toBe('Sprite2D');
      expect(result.name).toBe('Sprite2D');
      expect(result.parent).toBe('Player');
    });

    it('should include all node properties', async () => {
      const result = await getNodeProperties(
        projectPath,
        'scenes/player.tscn',
        'Player'
      );
      
      expect(result.properties).toBeDefined();
      expect(Array.isArray(result.properties)).toBe(true);
      expect(result.properties.length).toBeGreaterThan(0);
      
      // Check for position property
      const positionProp = result.properties.find(p => p.name === 'position');
      expect(positionProp).toBeDefined();
    });

    it('should categorize properties', async () => {
      const result = await getNodeProperties(
        projectPath,
        'scenes/player.tscn',
        'Player'
      );
      
      const positionProp = result.properties.find(p => p.name === 'position');
      expect(positionProp?.category).toBe('Transform');
      
      const visibleProp = result.properties.find(p => p.name === 'visible');
      if (visibleProp) {
        expect(visibleProp.category).toBe('Visual');
      }
    });

    it('should include child node paths', async () => {
      const result = await getNodeProperties(
        projectPath,
        'scenes/player.tscn',
        'Player'
      );
      
      expect(result.children).toBeDefined();
      expect(Array.isArray(result.children)).toBe(true);
      expect(result.children.length).toBeGreaterThan(0);
      expect(result.children).toContain('Player/Sprite2D');
    });

    it('should handle deeply nested nodes', async () => {
      const result = await getNodeProperties(
        projectPath,
        'scenes/ui/menu.tscn',
        'Menu/StartButton'
      );
      
      expect(result).toBeDefined();
      expect(result.parent).toBe('Menu');
    });

    it('should handle node not found', async () => {
      await expect(
        getNodeProperties(projectPath, 'scenes/player.tscn', 'NonExistent')
      ).rejects.toThrow('Node not found');
    });

    it('should handle invalid scene path', async () => {
      await expect(
        getNodeProperties(projectPath, 'invalid.tscn', 'Player')
      ).rejects.toThrow();
    });

    it('should handle invalid project path', async () => {
      await expect(
        getNodeProperties('/invalid/path', 'scenes/player.tscn', 'Player')
      ).rejects.toThrow();
    });

    it('should detect property types correctly', async () => {
      const result = await getNodeProperties(
        projectPath,
        'scenes/player.tscn',
        'Player'
      );
      
      const positionProp = result.properties.find(p => p.name === 'position');
      expect(positionProp?.type).toBe('Vector2');
    });

    it('should use cached scene data', async () => {
      // First call parses the scene
      const result1 = await getNodeProperties(
        projectPath,
        'scenes/player.tscn',
        'Player'
      );
      
      // Second call should use cache
      const result2 = await getNodeProperties(
        projectPath,
        'scenes/player.tscn',
        'Player'
      );
      
      expect(result1).toEqual(result2);
    });
  });
});

/**
 * Helper to create test scene files
 */
async function createTestScene(
  projectPath: string,
  scenePath: string,
  content: string
): Promise<void> {
  const fullPath = path.join(projectPath, scenePath);
  const dir = path.dirname(fullPath);
  
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content.trim());
}
