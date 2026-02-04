/**
 * Scene Validator Tests
 */
import { describe, it, expect } from 'vitest';
import { SceneValidator } from '../../src/utils/scene-validator.js';

describe('SceneValidator', () => {
  const validator = new SceneValidator();

  describe('Syntax Validation', () => {
    it('should validate correct scene header', () => {
      const content = '[gd_scene load_steps=1 format=3]\n[node name="Root" type="Node"]';
      const result = validator.validate(content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error on missing gd_scene header', () => {
      const content = '[node name="Root" type="Node"]';
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'syntax',
          severity: 'error',
          message: expect.stringContaining('gd_scene')
        })
      );
    });

    it('should warn on incorrect format version', () => {
      const content = '[gd_scene load_steps=1 format=2]\n[node name="Root" type="Node"]';
      const result = validator.validate(content);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'syntax',
          severity: 'warning',
          message: expect.stringContaining('format version')
        })
      );
    });

    it('should error on invalid section headers', () => {
      const content = '[gd_scene load_steps=1 format=3]\n[invalid_section]\n[node name="Root" type="Node"]';
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'syntax',
          message: expect.stringContaining('Invalid section header')
        })
      );
    });

    it('should error on unmatched quotes', () => {
      const content = '[gd_scene load_steps=1 format=3]\n[node name="Root type="Node"]';
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'syntax',
          message: expect.stringContaining('quote')
        })
      );
    });

    it('should error on unmatched brackets', () => {
      const content = '[gd_scene load_steps=1 format=3]\nscript_data = [[1, 2, 3]\n[node name="Root" type="Node"]';
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'syntax',
          message: expect.stringContaining('bracket')
        })
      );
    });

    it('should handle escaped quotes correctly', () => {
      const content = '[gd_scene load_steps=1 format=3]\n[node name="Root" type="Node"]\ntext = "He said \\"hello\\""';
      const result = validator.validate(content);
      // Should not error on properly escaped quotes
      const quoteErrors = result.errors.filter(e => e.message.includes('quote'));
      expect(quoteErrors).toHaveLength(0);
    });
  });

  describe('Structure Validation', () => {
    it('should validate scene with single root node', () => {
      const content = '[gd_scene load_steps=1 format=3]\n[node name="Root" type="Node"]';
      const result = validator.validate(content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate scene with proper hierarchy', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
[node name="Child" type="Node" parent="."]
[node name="GrandChild" type="Node" parent="Child"]`;
      const result = validator.validate(content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error on multiple root nodes', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root1" type="Node"]
[node name="Root2" type="Node"]`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'structure',
          message: expect.stringContaining('Multiple root nodes')
        })
      );
    });

    it('should error on missing root node', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Child" type="Node" parent="NonExistent"]`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'structure',
          message: expect.stringContaining('No root node')
        })
      );
    });

    it('should error on duplicate node paths', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
[node name="Child" type="Node" parent="."]
[node name="Child" type="Node" parent="."]`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'structure',
          message: expect.stringContaining('Duplicate node path')
        })
      );
    });

    it('should error on undefined parent reference', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
[node name="Child" type="Node" parent="NonExistent"]`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'structure',
          message: expect.stringContaining('Parent node not found')
        })
      );
    });

    it('should warn on deeply nested hierarchies', () => {
      const deepHierarchy = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
[node name="L1" type="Node" parent="."]
[node name="L2" type="Node" parent="L1"]
[node name="L3" type="Node" parent="L1/L2"]
[node name="L4" type="Node" parent="L1/L2/L3"]
[node name="L5" type="Node" parent="L1/L2/L3/L4"]
[node name="L6" type="Node" parent="L1/L2/L3/L4/L5"]
[node name="L7" type="Node" parent="L1/L2/L3/L4/L5/L6"]
[node name="L8" type="Node" parent="L1/L2/L3/L4/L5/L6/L7"]
[node name="L9" type="Node" parent="L1/L2/L3/L4/L5/L6/L7/L8"]
[node name="L10" type="Node" parent="L1/L2/L3/L4/L5/L6/L7/L8/L9"]
[node name="L11" type="Node" parent="L1/L2/L3/L4/L5/L6/L7/L8/L9/L10"]`;
      const result = validator.validate(deepHierarchy);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'structure',
          message: expect.stringContaining('Deeply nested')
        })
      );
    });
  });

  describe('Property Validation', () => {
    it('should validate correct Vector2', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
position = Vector2(10, 20)`;
      const result = validator.validate(content);
      expect(result.valid).toBe(true);
      const vectorErrors = result.errors.filter(e => e.message.includes('Vector'));
      expect(vectorErrors).toHaveLength(0);
    });

    it('should validate correct Vector3', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
position = Vector3(10, 20, 30)`;
      const result = validator.validate(content);
      expect(result.valid).toBe(true);
      const vectorErrors = result.errors.filter(e => e.message.includes('Vector'));
      expect(vectorErrors).toHaveLength(0);
    });

    it('should error on invalid Vector2 component count', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
position = Vector2(10)`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'property',
          message: expect.stringContaining('Vector2')
        })
      );
    });

    it('should error on invalid Vector3 component count', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
position = Vector3(10, 20)`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'property',
          message: expect.stringContaining('Vector3')
        })
      );
    });

    it('should error on non-numeric vector values', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
position = Vector2(abc, 20)`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'property',
          message: expect.stringContaining('Non-numeric')
        })
      );
    });

    it('should validate correct Color', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
color = Color(1, 0.5, 0)`;
      const result = validator.validate(content);
      expect(result.valid).toBe(true);
      const colorErrors = result.errors.filter(e => e.message.includes('Color'));
      expect(colorErrors).toHaveLength(0);
    });

    it('should validate Color with alpha', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
color = Color(1, 0.5, 0, 0.8)`;
      const result = validator.validate(content);
      expect(result.valid).toBe(true);
      const colorErrors = result.errors.filter(e => e.message.includes('Color'));
      expect(colorErrors).toHaveLength(0);
    });

    it('should error on invalid Color component count', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
color = Color(1, 0.5)`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'property',
          message: expect.stringContaining('Color')
        })
      );
    });

    it('should warn on Color values out of range', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
color = Color(2, 0.5, -1)`;
      const result = validator.validate(content);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'property',
          message: expect.stringContaining('out of range')
        })
      );
    });

    it('should validate resource paths', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
script = "res://scripts/player.gd"`;
      const result = validator.validate(content);
      const pathErrors = result.errors.filter(e => e.message.includes('Resource path'));
      expect(pathErrors).toHaveLength(0);
    });

    it('should warn on resource paths with ..', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
script = "res://../scripts/player.gd"`;
      const result = validator.validate(content);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'property',
          message: expect.stringContaining('..')
        })
      );
    });

    it('should warn on unusual file extensions', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
data = "res://data/file.xyz"`;
      const result = validator.validate(content);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'property',
          message: expect.stringContaining('Unusual file extension')
        })
      );
    });

    it('should warn on non-standard boolean format', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
visible = True`;
      const result = validator.validate(content);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'property',
          message: expect.stringContaining('boolean')
        })
      );
    });
  });

  describe('Reference Validation', () => {
    it('should validate correct ext_resource references', () => {
      const content = `[gd_scene load_steps=2 format=3]
[ext_resource id="1" type="Script" path="res://player.gd"]
[node name="Root" type="Node"]
script = ExtResource("1")`;
      const result = validator.validate(content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate correct sub_resource references', () => {
      const content = `[gd_scene load_steps=2 format=3]
[sub_resource id="1" type="BoxShape3D"]
[node name="Root" type="Node"]
shape = SubResource("1")`;
      const result = validator.validate(content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error on duplicate ext_resource IDs', () => {
      const content = `[gd_scene load_steps=3 format=3]
[ext_resource id="1" type="Script" path="res://a.gd"]
[ext_resource id="1" type="Script" path="res://b.gd"]
[node name="Root" type="Node"]`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'reference',
          message: expect.stringContaining('Duplicate ext_resource')
        })
      );
    });

    it('should error on duplicate sub_resource IDs', () => {
      const content = `[gd_scene load_steps=3 format=3]
[sub_resource id="1" type="BoxShape3D"]
[sub_resource id="1" type="SphereShape3D"]
[node name="Root" type="Node"]`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'reference',
          message: expect.stringContaining('Duplicate sub_resource')
        })
      );
    });

    it('should error on undefined ext_resource reference', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
script = ExtResource("999")`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'reference',
          message: expect.stringContaining('undefined ext_resource')
        })
      );
    });

    it('should error on undefined sub_resource reference', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
shape = SubResource("999")`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'reference',
          message: expect.stringContaining('undefined sub_resource')
        })
      );
    });

    it('should warn on unused ext_resource', () => {
      const content = `[gd_scene load_steps=2 format=3]
[ext_resource id="1" type="Script" path="res://unused.gd"]
[node name="Root" type="Node"]`;
      const result = validator.validate(content);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'reference',
          message: expect.stringContaining('Unused ext_resource')
        })
      );
    });

    it('should warn on unused sub_resource', () => {
      const content = `[gd_scene load_steps=2 format=3]
[sub_resource id="1" type="BoxShape3D"]
[node name="Root" type="Node"]`;
      const result = validator.validate(content);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'reference',
          message: expect.stringContaining('Unused sub_resource')
        })
      );
    });

    it('should validate signal connections', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
[node name="Button" type="Button" parent="."]
[connection signal="pressed" from="Button" to="." callable="_on_button_pressed"]`;
      const result = validator.validate(content);
      const connectionErrors = result.errors.filter(e => e.message.includes('connection'));
      expect(connectionErrors).toHaveLength(0);
    });

    it('should error on incomplete connection', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
[connection signal="" from="Button" to="."]`;
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'reference',
          message: expect.stringContaining('Incomplete connection')
        })
      );
    });
  });

  describe('Complex Scenes', () => {
    it('should validate a complete valid scene', () => {
      const content = `[gd_scene load_steps=3 format=3]

[ext_resource id="1" type="Script" path="res://player.gd"]
[sub_resource id="2" type="BoxShape3D"]

[node name="Player" type="CharacterBody3D"]
script = ExtResource("1")
position = Vector3(0, 1, 0)

[node name="CollisionShape3D" type="CollisionShape3D" parent="."]
shape = SubResource("2")

[node name="Sprite3D" type="Sprite3D" parent="."]
modulate = Color(1, 1, 1, 1)

[connection signal="body_entered" from="." to="." callable="_on_body_entered"]`;
      
      const result = validator.validate(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accumulate multiple errors', () => {
      const content = `[gd_scene load_steps=1 format=3]
[node name="Root" type="Node"]
[node name="Root2" type="Node"]
position = Vector2(10)
color = Color(1, 2)
script = ExtResource("999")`;
      
      const result = validator.validate(content);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(3);
    });
  });
});
