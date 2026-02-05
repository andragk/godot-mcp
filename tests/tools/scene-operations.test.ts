/**
 * Scene Operations Tools Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SceneOperationsTools } from '../../src/tools/scene-operations.js';
import { ValidationError, InternalError } from '../../src/types/errors.js';

describe('Scene Operations Tools', () => {
  let tools: SceneOperationsTools;
  let testDir: string;

  beforeEach(async () => {
    tools = new SceneOperationsTools();
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scene-ops-test-'));
    
    // Create project.godot to make it a valid Godot project
    await fs.writeFile(
      path.join(testDir, 'project.godot'),
      'config_version=5\n',
      'utf-8'
    );
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('createScene', () => {
    describe('Basic Scene Creation', () => {
      it('should create a simple scene with root node only', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'test.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node'
          }
        });

        expect(result.success).toBe(true);
        expect(result.nodeCount).toBe(1);
        expect(result.validationPassed).toBe(true);
        expect(result.scenePath).toContain('test.tscn');

        // Verify file was created
        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('[gd_scene load_steps=1 format=3]');
        expect(content).toContain('[node name="Root" type="Node"]');
      });

      it('should create scene with root node and properties', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'player.tscn',
          rootNode: {
            name: 'Player',
            type: 'CharacterBody2D',
            properties: {
              position: { type: 'Vector2', value: [100, 200] },
              visible: true,
              modulate: { type: 'Color', value: [1, 1, 1, 1] }
            }
          }
        });

        expect(result.success).toBe(true);
        expect(result.nodeCount).toBe(1);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('[node name="Player" type="CharacterBody2D"]');
        expect(content).toContain('position = Vector2(100, 200)');
        expect(content).toContain('visible = true');
        expect(content).toContain('modulate = Color(1, 1, 1, 1)');
      });

      it('should create scene with nested node hierarchy', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'hierarchy.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node',
            children: [
              {
                name: 'Child1',
                type: 'Node2D',
                properties: {
                  position: { type: 'Vector2', value: [0, 0] }
                }
              },
              {
                name: 'Child2',
                type: 'Node2D',
                children: [
                  {
                    name: 'GrandChild',
                    type: 'Sprite2D'
                  }
                ]
              }
            ]
          }
        });

        expect(result.success).toBe(true);
        expect(result.nodeCount).toBe(4); // Root + 2 children + 1 grandchild

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('[node name="Root" type="Node"]');
        expect(content).toContain('[node name="Child1" type="Node2D" parent="."]');
        expect(content).toContain('[node name="Child2" type="Node2D" parent="."]');
        expect(content).toContain('[node name="GrandChild" type="Sprite2D" parent="./Child2"]');
      });

      it('should create scene in nested directory', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'scenes/levels/level1.tscn',
          rootNode: {
            name: 'Level1',
            type: 'Node'
          }
        });

        expect(result.success).toBe(true);
        
        // Verify nested directory was created
        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('[node name="Level1" type="Node"]');
      });

      it('should support format parameter', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'old-format.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node'
          },
          format: 2
        });

        expect(result.success).toBe(true);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('[gd_scene load_steps=1 format=2]');
      });

      it('should include description as comment', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'documented.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node'
          },
          description: 'Main game scene'
        });

        expect(result.success).toBe(true);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('; Main game scene');
      });
    });

    describe('Property Value Formatting', () => {
      it('should format string properties with escaping', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'strings.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node',
            properties: {
              text: 'Hello World',
              quote: 'Say "hello"',
              backslash: 'Path\\to\\file'
            }
          }
        });

        expect(result.success).toBe(true);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('text = "Hello World"');
        expect(content).toContain('quote = "Say \\"hello\\""');
        expect(content).toContain('backslash = "Path\\\\to\\\\file"');
      });

      it('should format numeric properties', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'numbers.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node',
            properties: {
              integer: 42,
              float: 3.14159,
              negative: -100
            }
          }
        });

        expect(result.success).toBe(true);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('integer = 42');
        expect(content).toContain('float = 3.14159');
        expect(content).toContain('negative = -100');
      });

      it('should format boolean properties', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'booleans.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node',
            properties: {
              visible: true,
              disabled: false
            }
          }
        });

        expect(result.success).toBe(true);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('visible = true');
        expect(content).toContain('disabled = false');
      });

      it('should format Vector2 properties', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'vector2.tscn',
          rootNode: {
            name: 'Sprite',
            type: 'Sprite2D',
            properties: {
              position: { type: 'Vector2', value: [100, 200] },
              scale: { type: 'Vector2', value: [1.5, 2.0] }
            }
          }
        });

        expect(result.success).toBe(true);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('position = Vector2(100, 200)');
        expect(content).toContain('scale = Vector2(1.5, 2)');
      });

      it('should format Vector3 properties', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'vector3.tscn',
          rootNode: {
            name: 'Spatial',
            type: 'Node3D',
            properties: {
              position: { type: 'Vector3', value: [1, 2, 3] },
              rotation: { type: 'Vector3', value: [0, 1.57, 0] }
            }
          }
        });

        expect(result.success).toBe(true);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('position = Vector3(1, 2, 3)');
        expect(content).toContain('rotation = Vector3(0, 1.57, 0)');
      });

      it('should format Color properties', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'colors.tscn',
          rootNode: {
            name: 'ColorRect',
            type: 'ColorRect',
            properties: {
              color: { type: 'Color', value: [1, 0, 0, 1] },
              modulate: { type: 'Color', value: [0.5, 0.5, 0.5] }
            }
          }
        });

        expect(result.success).toBe(true);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('color = Color(1, 0, 0, 1)');
        expect(content).toContain('modulate = Color(0.5, 0.5, 0.5)');
      });
    });

    describe('Complex Hierarchies', () => {
      it('should create deeply nested hierarchy', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'deep.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node',
            children: [
              {
                name: 'Level1',
                type: 'Node',
                children: [
                  {
                    name: 'Level2',
                    type: 'Node',
                    children: [
                      {
                        name: 'Level3',
                        type: 'Node',
                        children: [
                          {
                            name: 'Level4',
                            type: 'Node'
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        });

        expect(result.success).toBe(true);
        expect(result.nodeCount).toBe(5);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('[node name="Level1" type="Node" parent="."]');
        expect(content).toContain('[node name="Level2" type="Node" parent="./Level1"]');
        expect(content).toContain('[node name="Level3" type="Node" parent="./Level1/Level2"]');
        expect(content).toContain('[node name="Level4" type="Node" parent="./Level1/Level2/Level3"]');
      });

      it('should create scene with multiple children at each level', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'wide.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node',
            children: [
              { name: 'Child1', type: 'Node' },
              { name: 'Child2', type: 'Node' },
              { name: 'Child3', type: 'Node' }
            ]
          }
        });

        expect(result.success).toBe(true);
        expect(result.nodeCount).toBe(4);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('[node name="Child1" type="Node" parent="."]');
        expect(content).toContain('[node name="Child2" type="Node" parent="."]');
        expect(content).toContain('[node name="Child3" type="Node" parent="."]');
      });

      it('should create realistic game scene structure', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'player.tscn',
          rootNode: {
            name: 'Player',
            type: 'CharacterBody2D',
            properties: {
              position: { type: 'Vector2', value: [0, 0] },
              motion_mode: 0
            },
            children: [
              {
                name: 'Sprite2D',
                type: 'Sprite2D',
                properties: {
                  scale: { type: 'Vector2', value: [2, 2] }
                }
              },
              {
                name: 'CollisionShape2D',
                type: 'CollisionShape2D'
              },
              {
                name: 'AnimationPlayer',
                type: 'AnimationPlayer'
              }
            ]
          }
        });

        expect(result.success).toBe(true);
        expect(result.nodeCount).toBe(4);

        const content = await fs.readFile(result.scenePath, 'utf-8');
        expect(content).toContain('[node name="Player" type="CharacterBody2D"]');
        expect(content).toContain('[node name="Sprite2D" type="Sprite2D" parent="."]');
        expect(content).toContain('[node name="CollisionShape2D" type="CollisionShape2D" parent="."]');
        expect(content).toContain('[node name="AnimationPlayer" type="AnimationPlayer" parent="."]');
      });
    });

    describe('Error Handling', () => {
      it('should reject invalid project path', async () => {
        await expect(
          tools.createScene({
            projectPath: '/invalid/nonexistent/path',
            scenePath: 'test.tscn',
            rootNode: {
              name: 'Root',
              type: 'Node'
            }
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should reject existing scene file', async () => {
        // Create a scene first
        await tools.createScene({
          projectPath: testDir,
          scenePath: 'existing.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node'
          }
        });

        // Attempt to create same scene again
        await expect(
          tools.createScene({
            projectPath: testDir,
            scenePath: 'existing.tscn',
            rootNode: {
              name: 'Root',
              type: 'Node'
            }
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should reject scene path without .tscn extension', async () => {
        await expect(
          tools.createScene({
            projectPath: testDir,
            scenePath: 'invalid.txt',
            rootNode: {
              name: 'Root',
              type: 'Node'
            }
          })
        ).rejects.toThrow();
      });

      it('should reject invalid node names', async () => {
        await expect(
          tools.createScene({
            projectPath: testDir,
            scenePath: 'invalid.tscn',
            rootNode: {
              name: '123Invalid', // Can't start with number
              type: 'Node'
            }
          })
        ).rejects.toThrow();
      });

      it('should reject node names with spaces', async () => {
        await expect(
          tools.createScene({
            projectPath: testDir,
            scenePath: 'invalid.tscn',
            rootNode: {
              name: 'Invalid Name', // No spaces allowed
              type: 'Node'
            }
          })
        ).rejects.toThrow();
      });

      it('should reject empty node type', async () => {
        await expect(
          tools.createScene({
            projectPath: testDir,
            scenePath: 'invalid.tscn',
            rootNode: {
              name: 'Root',
              type: '' // Empty type
            }
          })
        ).rejects.toThrow();
      });

      it('should reject invalid format version', async () => {
        await expect(
          tools.createScene({
            projectPath: testDir,
            scenePath: 'invalid.tscn',
            rootNode: {
              name: 'Root',
              type: 'Node'
            },
            format: 999 // Invalid format
          })
        ).rejects.toThrow();
      });
    });

    describe('Validation Integration', () => {
      it('should pass validation for well-formed scenes', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'valid.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node',
            properties: {
              position: { type: 'Vector2', value: [100, 200] }
            },
            children: [
              {
                name: 'Child',
                type: 'Node2D'
              }
            ]
          }
        });

        expect(result.success).toBe(true);
        expect(result.validationPassed).toBe(true);
        expect(result.errors).toBeUndefined();
      });

      it('should validate generated scene structure', async () => {
        const result = await tools.createScene({
          projectPath: testDir,
          scenePath: 'validated.tscn',
          rootNode: {
            name: 'Root',
            type: 'Node'
          }
        });

        // Read and manually validate the generated content
        const content = await fs.readFile(result.scenePath, 'utf-8');
        
        // Check header
        expect(content).toMatch(/^\[gd_scene load_steps=\d+ format=\d+\]/);
        
        // Check root node
        expect(content).toContain('[node name="Root" type="Node"]');
        
        // Ensure proper line endings
        expect(content).toMatch(/\n$/);
      });
    });
  });
});
