# Real-World Examples

Practical AI-assisted Godot development workflows using the MCP Server.

---

## Example 1: AI-Assisted Scene Creation

### Scenario

You're building a 2D platformer and need to create multiple level scenes with consistent structure.

### Workflow

**1. Initial Request**

> "Create a platformer level scene called Level2 with a TileMap for platforms, a Player spawn point, collectible coins, and an exit door. Use the same structure as Level1."

**AI Actions**:

```
1. read_scene("scenes/Level1.tscn")
   → Analyze structure and patterns
   
2. create_scene("scenes/Level2.tscn", {
     nodes: [
       {
         name: "Level2",
         type: "Node2D",
         children: [
           {name: "TileMap", type: "TileMap", ...},
           {name: "PlayerSpawn", type: "Marker2D", position: {x: 100, y: 400}},
           {name: "Coins", type: "Node2D", children: [...]},
           {name: "ExitDoor", type: "Area2D", ...}
         ]
       }
     ]
   })
```

**Result**:

```
✅ Created scenes/Level2.tscn with:

• TileMap (tileset: res://tilesets/platformer.tres)
• PlayerSpawn (Marker2D at x:100, y:400)
• Coins container (5 Coin instances)
• ExitDoor (Area2D with collision detection)

The scene follows the same structure as Level1. 
Would you like me to:
1. Add enemies?
2. Create a background parallax layer?
3. Set up level boundaries?
```

**2. Iterative Refinement**

> "Add 3 enemy spawn points and a parallax background"

**AI Actions**:

```
modify_scene("scenes/Level2.tscn", {
  operations: [
    {
      type: "add_node",
      parent: "Level2",
      node: {
        name: "EnemySpawns",
        type: "Node2D",
        children: [
          {name: "Spawn1", type: "Marker2D", position: {x: 300, y: 400}},
          {name: "Spawn2", type: "Marker2D", position: {x: 600, y: 300}},
          {name: "Spawn3", type: "Marker2D", position: {x: 900, y: 400}}
        ]
      }
    },
    {
      type: "add_node",
      parent: "Level2",
      node: {
        name: "ParallaxBackground",
        type: "ParallaxBackground",
        children: [
          {name: "Sky", type: "ParallaxLayer", ...},
          {name: "Mountains", type: "ParallaxLayer", ...}
        ]
      }
    }
  ]
})
```

**Time Saved**: 10-15 minutes of manual scene setup

---

## Example 2: Code Refactoring & Optimization

### Scenario

Your `Player.gd` script has grown to 300+ lines. You want to extract movement logic into a reusable component.

### Workflow

**1. Analysis Request**

> "Analyze Player.gd and suggest how to extract movement logic into a reusable component"

**AI Actions**:

```
1. read_script("scripts/Player.gd")
   → Parse structure, identify movement code
   
2. AI Analysis:
   "Your Player.gd has movement logic in lines 45-120 that could 
   be extracted into a MovementComponent. This includes:
   
   • Input handling (_process)
   • Velocity calculations
   • Collision detection
   • Animation state changes
   
   Benefits:
   - Reusable for enemies and NPCs
   - Easier to test
   - Follows composition pattern
   
   Suggested structure:
   
   Player.gd (simplified)
   ├── MovementComponent (handles physics)
   ├── HealthComponent (existing)
   └── InputComponent (new - handle input)"
```

**2. Implementation Request**

> "Create the MovementComponent script and update Player.gd to use it"

**AI Actions**:

```
1. create_script("scripts/components/MovementComponent.gd", {
     content: `
class_name MovementComponent
extends Node

@export var speed: float = 300.0
@export var jump_force: float = -600.0
@export var gravity: float = 980.0

var velocity: Vector2 = Vector2.ZERO
var _body: CharacterBody2D

func _ready() -> void:
    _body = get_parent() as CharacterBody2D
    assert(_body != null, "MovementComponent must be child of CharacterBody2D")

func apply_movement(direction: float, jump: bool, delta: float) -> void:
    # Horizontal movement
    velocity.x = direction * speed
    
    # Gravity
    if not _body.is_on_floor():
        velocity.y += gravity * delta
    
    # Jump
    if jump and _body.is_on_floor():
        velocity.y = jump_force
    
    # Apply to body
    _body.velocity = velocity
    _body.move_and_slide()
    velocity = _body.velocity

func get_velocity() -> Vector2:
    return velocity
`
   })

2. modify_script("scripts/Player.gd", {
     changes: [
       {
         type: "replace",
         start_line: 45,
         end_line: 120,
         new_content: `
# Movement is now handled by MovementComponent
@onready var movement: MovementComponent = $MovementComponent

func _physics_process(delta: float) -> void:
    var direction := Input.get_axis("move_left", "move_right")
    var jump := Input.is_action_just_pressed("jump")
    
    movement.apply_movement(direction, jump, delta)
    
    # Update animation based on movement
    _update_animation()
`
       }
     ]
   })

3. modify_scene("scenes/characters/Player.tscn", {
     operations: [
       {
         type: "add_node",
         parent: "Player",
         node: {
           name: "MovementComponent",
           type: "Node",
           script: "res://scripts/components/MovementComponent.gd",
           properties: {
             speed: 300.0,
             jump_force: -600.0
           }
         }
       }
     ]
   })
```

**Result**:

```
✅ Refactoring complete!

Created:
• scripts/components/MovementComponent.gd (85 lines)

Modified:
• scripts/Player.gd (reduced from 320 to 180 lines)
• scenes/characters/Player.tscn (added MovementComponent node)

Benefits:
• 44% code reduction in Player.gd
• Movement logic now reusable
• Easier to test in isolation
• Can be used for enemies/NPCs

Next steps:
• Add unit tests for MovementComponent
• Create EnemyMovement variant with AI behavior
• Extract InputComponent for remapping support
```

**Time Saved**: 30-45 minutes of manual refactoring

---

## Example 3: Debugging Collision Issues

### Scenario

Players report that coins aren't being collected in some levels. You need to find misconfigured collision layers.

### Workflow

**Request**

> "Find all Area2D nodes in my project and check if their collision layers match the expected configuration: Player on layer 1, Collectibles on layer 4"

**AI Actions**:

```
1. get_project_structure()
   → Get list of all scenes
   
2. For each scene:
   search_nodes({
     scene_path: "scenes/...",
     node_type: "Area2D"
   })
   
3. For each Area2D:
   get_node_properties({
     scene_path: "...",
     node_path: "...",
     properties: ["collision_layer", "collision_mask"]
   })
   
4. Analyze and report misconfigurations
```

**AI Report**:

```
🔍 Collision Layer Analysis Complete

✅ Correctly Configured (12 nodes):
• scenes/Level1.tscn → Coins/Coin1 (layer: 4, mask: 1)
• scenes/Level1.tscn → Coins/Coin2 (layer: 4, mask: 1)
• ...

❌ Issues Found (3 nodes):

1. scenes/Level3.tscn → Coins/Coin5
   Problem: collision_layer = 1 (should be 4)
   Fix: Set collision_layer to 4

2. scenes/Level4.tscn → Coins/Coin1
   Problem: collision_mask = 0 (should be 1)
   Fix: Set collision_mask to 1

3. scenes/bonus/SecretArea.tscn → ExitDoor
   Problem: collision_layer = 3 (should be 4)
   Fix: Set collision_layer to 4

Would you like me to fix these automatically?
```

**Follow-up Request**

> "Yes, fix all collision issues"

**AI Actions**:

```
For each issue:
  modify_scene({
    scene_path: "...",
    operations: [{
      type: "update_property",
      node_path: "...",
      property: "collision_layer",
      value: 4
    }]
  })
```

**Result**:

```
✅ Fixed 3 collision layer issues:

Modified scenes:
• scenes/Level3.tscn (Coin5: layer 1→4)
• scenes/Level4.tscn (Coin1: mask 0→1)
• scenes/bonus/SecretArea.tscn (ExitDoor: layer 3→4)

All Area2D nodes now match expected configuration.
Test in-game to verify coin collection works.
```

**Time Saved**: 15-20 minutes of manual inspection across multiple scenes

---

## Example 4: Batch Scene Updates

### Scenario

You've redesigned your player health system. Now you need to update the Player scene across all 15 levels to use the new HealthComponent.

### Workflow

**Request**

> "Find all scenes that instantiate Player.tscn and update them to use the new health system script"

**AI Actions**:

```
1. get_project_structure()
   → List all .tscn files
   
2. For each scene:
   read_scene("scenes/...")
   → Check if it contains Player instance
   
3. For scenes with Player:
   modify_scene({
     operations: [{
       type: "update_property",
       node_path: "Player/HealthComponent",
       property: "script",
       value: "res://scripts/components/HealthComponentV2.gd"
     }, {
       type: "add_property",
       node_path: "Player/HealthComponent",
       property: "regen_rate",
       value: 5.0
     }]
   })
```

**Result**:

```
✅ Updated 15 scenes:

• scenes/Level1.tscn → Player health system updated
• scenes/Level2.tscn → Player health system updated
• scenes/Level3.tscn → Player health system updated
...
• scenes/Level15.tscn → Player health system updated

All Player instances now use:
• HealthComponentV2.gd (new script)
• regen_rate: 5.0 (new property)

Backward compatibility maintained for saves/replays.
```

**Time Saved**: 20-30 minutes of repetitive scene editing

---

## Example 5: Documentation Generation

### Scenario

You need to document all public signals and functions in your core game systems.

### Workflow

**Request**

> "Generate documentation for all scripts in the scripts/systems/ directory"

**AI Actions**:

```
1. list_scripts({
     directory: "scripts/systems/"
   })
   
2. For each script:
   read_script("scripts/systems/...")
   → Extract structure (signals, functions, exports)
   
3. Generate markdown documentation
```

**AI Output**:

````markdown
# Game Systems Documentation

## GameManager (scripts/systems/GameManager.gd)

**Extends**: Node

### Signals

- `game_started()` - Emitted when a new game begins
- `game_over(score: int)` - Emitted when the game ends
- `level_changed(level_index: int)` - Emitted on level transition

### Public Properties

- `current_level: int` - The active level index (default: 0)
- `max_lives: int` - Maximum player lives (default: 3, exported)

### Public Methods

#### start_game() → void
Initializes a new game session and loads the first level.

#### load_level(level_index: int) → void
Loads the specified level. Emits `level_changed` signal.

**Parameters**:
- `level_index`: Zero-based level index

**Throws**: `ERR_FILE_NOT_FOUND` if level doesn't exist

#### save_progress() → Error
Persists current game state to disk.

**Returns**: `OK` on success, error code otherwise

---

## ScoreManager (scripts/systems/ScoreManager.gd)

**Extends**: Node

### Signals

- `score_changed(new_score: int)` - Emitted when score updates
- `high_score_beaten(new_high: int)` - Emitted on new high score

...
````

**Time Saved**: 1-2 hours of manual documentation writing

---

## Example 6: Test Scene Generation

### Scenario

You need isolated test scenes for each character to verify animations and hitboxes.

### Workflow

**Request**

> "Create test scenes for all characters in scenes/characters/ with a neutral background, camera, and boundary markers"

**AI Actions**:

```
1. list_scenes({
     directory: "scenes/characters/"
   })
   → Find Player.tscn, Enemy.tscn, Boss.tscn
   
2. For each character:
   create_scene("tests/characters/{name}Test.tscn", {
     nodes: [
       {
         name: "TestScene",
         type: "Node2D",
         children: [
           {
             name: "Background",
             type: "ColorRect",
             properties: {color: "#808080", ...}
           },
           {
             name: "Camera2D",
             type: "Camera2D",
             properties: {enabled: true, zoom: Vector2(2, 2)}
           },
           {
             name: "{CharacterName}",
             type: "PackedScene",
             instance: "res://scenes/characters/{name}.tscn",
             properties: {position: Vector2(640, 360)}
           },
           {
             name: "BoundaryMarkers",
             type: "Node2D",
             children: [...]
           }
         ]
       }
     ]
   })
```

**Result**:

```
✅ Created 3 test scenes:

• tests/characters/PlayerTest.tscn
  - Player instance at center screen
  - Camera zoomed to 2x
  - Boundary markers at edges
  - Neutral gray background

• tests/characters/EnemyTest.tscn
  - Enemy instance at center screen
  - Same test environment

• tests/characters/BossTest.tscn
  - Boss instance at center screen
  - Same test environment

Use these scenes to verify:
- Animation playback
- Hitbox visualization
- Movement boundaries
- Physics behavior

Open in Godot editor and run each scene independently.
```

**Time Saved**: 15-20 minutes of manual test scene setup

---

## Example 7: Asset Migration

### Scenario

You're switching from individual sprite files to a sprite atlas. Need to update all Sprite2D nodes.

### Workflow

**Request**

> "Find all Sprite2D nodes using individual texture files and list them. I'm migrating to an atlas."

**AI Actions**:

```
1. get_project_structure()
   
2. For each scene:
   search_nodes({
     node_type: "Sprite2D"
   })
   
3. For each Sprite2D:
   get_node_properties({
     properties: ["texture"]
   })
   
4. Filter nodes with .png textures (not atlas)
```

**AI Report**:

```
📊 Sprite2D Texture Audit

Found 47 Sprite2D nodes using individual textures:

Characters (18):
• scenes/characters/Player.tscn → Player/Sprite2D (player_idle.png)
• scenes/characters/Enemy.tscn → Enemy/Sprite2D (enemy_walk.png)
...

Items (12):
• scenes/items/Coin.tscn → Coin/Sprite2D (coin.png)
• scenes/items/Heart.tscn → Heart/Sprite2D (heart.png)
...

UI (17):
• scenes/ui/Button.tscn → Button/Icon (icon_start.png)
...

Total textures to migrate: 47
Estimated atlas reduction: 15MB → 2MB

Would you like me to:
1. Generate the atlas region mapping?
2. Update scenes once atlas is ready?
3. Create a migration script?
```

**Follow-up** (after creating atlas):

> "Atlas is ready at res://assets/game_atlas.png. Update all scenes to use AtlasTexture with these regions: [provide JSON mapping]"

**AI applies batch update across all 47 nodes**

**Time Saved**: 45-60 minutes of tedious manual texture reassignment

---

## Best Practices from Examples

### 1. Start Broad, Then Narrow

✅ "List all scenes" → "Read Level1" → "Modify Level2"  
❌ "Modify Level2" immediately (AI lacks context)

### 2. Leverage AI Analysis

✅ "Analyze Player.gd and suggest improvements"  
✅ "Find collision issues across all scenes"  
❌ "Make Player.gd better" (too vague)

### 3. Iterate Incrementally

✅ Create scene → Test → Add enemies → Test → Add background  
❌ "Create a complete level with everything" (hard to debug)

### 4. Use Batch Operations Wisely

✅ "Update health component in all levels" (consistent change)  
⚠️ "Make all levels more fun" (subjective, requires human judgment)

### 5. Verify AI Output

Always test AI-generated scenes and scripts in Godot before committing:

```bash
# Quick verification workflow
1. AI creates/modifies files
2. Open scene in Godot editor
3. Check for errors in Output panel
4. Run scene with F6
5. Approve or request changes
```

---

## Next Steps

- [Review API Reference](./api/tools.md) - Understand all available tools
- [Learn Best Practices](./best-practices.md) - Optimize your workflows
- [Read FAQ](./faq.md) - Common questions and solutions

---

::: tip Workflow Optimization
Combine multiple tools in one request:

> "List all scenes, read Player.tscn, and check if any other scenes instantiate it"

The AI will automatically sequence the tools efficiently.
:::

::: warning Data Loss Prevention
Always commit your project to git before AI modifications:

```bash
git add .
git commit -m "Before AI refactoring"
```

If something goes wrong, the MCP server creates backups in `.godot/mcp-backups/`, but git provides full history.
:::
