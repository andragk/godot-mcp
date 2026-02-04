## Problem Description

Implement write operations for scene creation and modification with automatic backup system and validation layer. These tools enable AI assistants to generate and modify Godot scenes safely, with rollback capabilities to prevent data loss.

**Why this matters:**
- Enables AI-assisted scene generation and modification
- Provides safety net through automatic backups
- Validates scene integrity before committing changes
- Foundation for advanced scene manipulation workflows

## Acceptance Criteria

- [ ] `create_scene` tool successfully creates valid .tscn files
- [ ] `modify_scene` tool edits existing scenes without corruption
- [ ] Automatic backup system creates timestamped backups before modifications
- [ ] Backups are restorable and functionally identical to originals
- [ ] Scene validation catches common errors before writing
- [ ] No data corruption in 1000+ test operations
- [ ] Backup cleanup policy prevents disk space exhaustion
- [ ] All changes logged with operation metadata

## Technical Requirements

### Write Tools Implementation

#### 1. `create_scene`
**Parameters:**
- `scene_path` - Target path for new scene (relative to project)
- `root_node_type` - Type of root node (Node2D, Node3D, Control, etc.)
- `node_structure` - Optional nested node hierarchy
- `properties` - Initial property values for nodes

**Functionality:**
- Validate scene path doesn't exist (or force flag)
- Create directory structure if needed
- Generate .tscn file with proper formatting
- Set root node with specified type
- Add child nodes from structure definition
- Apply initial properties
- Validate generated scene before writing
- Return scene path and node count

**Example:**
```typescript
{
  scene_path: "scenes/player/Player.tscn",
  root_node_type: "CharacterBody2D",
  node_structure: [
    { type: "Sprite2D", name: "Sprite" },
    { type: "CollisionShape2D", name: "Collision" }
  ],
  properties: {
    "motion_mode": 0,
    "Sprite.texture": "res://assets/player.png"
  }
}
```

#### 2. `modify_scene`
**Parameters:**
- `scene_path` - Path to scene to modify
- `operations` - Array of modification operations
- `create_backup` - Boolean (default: true)
- `validate_after` - Boolean (default: true)

**Operations Supported:**
- `add_node` - Add new node to hierarchy
- `remove_node` - Delete node by path
- `modify_property` - Change node property value
- `rename_node` - Change node name
- `reparent_node` - Move node to different parent

**Functionality:**
- Load and parse existing scene
- Create backup before modifications
- Apply operations in sequence
- Validate scene structure after each operation
- Rollback on validation failure
- Write modified scene with preserved formatting
- Log all changes with timestamps

### Automatic Backup System

**Backup Strategy:**
- Create backup before ANY modification
- Backup location: `.godot/mcp-backups/<scene-path>/<timestamp>.tscn.backup`
- Filename format: `YYYYMMDD_HHMMSS_<original-name>.tscn.backup`
- Maximum backups per file: 10 (configurable)
- Automatic cleanup of old backups (keep latest 10)
- Backup metadata file with operation details

**Backup Operations:**
- `create_backup(scene_path)` - Manual backup creation
- `restore_backup(backup_path)` - Restore from backup
- `list_backups(scene_path)` - List available backups
- `cleanup_backups(scene_path, keep_count)` - Prune old backups

**Metadata Tracked:**
- Original file path
- Backup timestamp
- Operation type (create/modify)
- User/agent identifier
- Operation parameters
- File hash (MD5) for integrity verification

### Scene Validation Layer

**Validation Checks:**
1. **Syntax Validation**
   - Valid Godot scene file format
   - Proper section headers ([node], [ext_resource], etc.)
   - Balanced quotes and brackets

2. **Structure Validation**
   - Valid node hierarchy (no orphaned nodes)
   - Root node exists
   - Node paths are unique
   - Parent references valid

3. **Property Validation**
   - Property types match node schema
   - Resource paths exist (optional, warn only)
   - Vector/Color values properly formatted
   - Enum values in valid range

4. **Reference Validation**
   - External resource IDs valid
   - Sub-resource references exist
   - Signal connections reference valid nodes

**Validation Results:**
- Pass/Fail status
- List of errors (blocking issues)
- List of warnings (non-blocking)
- Suggested fixes for common errors

## Test Requirements

### Unit Tests
- [ ] Scene file generation with various node types
- [ ] Operation parser for modify_scene
- [ ] Backup file creation and restoration
- [ ] Scene validation logic for error cases
- [ ] Backup cleanup policy

### Integration Tests
- [ ] Create scene → validate → read back
- [ ] Modify existing scene → restore backup
- [ ] Sequential modifications with multiple backups
- [ ] Validation catches intentionally corrupt scenes
- [ ] Backup cleanup after 10+ modifications

### Data Integrity Tests
- [ ] 1000 scene creations without corruption
- [ ] 1000 scene modifications without data loss
- [ ] Backup restoration produces byte-identical files
- [ ] Concurrent modifications handled safely
- [ ] File system error handling (disk full, permissions)

### Manual Tests
- [ ] Create scene via MCP and open in Godot editor
- [ ] Modify scene, trigger error, verify rollback
- [ ] Restore old backup and verify scene works
- [ ] Create complex nested scene structure
- [ ] Test validation with intentionally broken scenes

## Documentation Requirements

- [ ] Tool documentation with detailed examples
- [ ] Backup system architecture documentation
- [ ] Validation rules reference
- [ ] Best practices for scene modifications
- [ ] Recovery procedures for corruption scenarios
- [ ] Example workflows (AI scene generation)
- [ ] Troubleshooting guide

## Estimated Effort

**Story Points:** 13

**Breakdown:**
- Scene creation tool: 3 points
- Scene modification tool: 4 points
- Backup system: 3 points
- Validation layer: 2 points
- Testing and documentation: 1 point

**Dependencies:**
- Blocked by: #1 (Foundation), #2 (Editor Control), #3 (Read Tools), #4 (Node Operations)
- Blocks: None (can proceed parallel with #6)

**Timeline:** Sprint 5 (1 week)

**Risk Mitigation:**
- Comprehensive backup system prevents data loss
- Extensive testing on diverse scene types
- Validation layer catches issues before writing
- Conservative approach: fail safe rather than proceed with uncertainty
