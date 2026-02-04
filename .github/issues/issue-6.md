## Problem Description

Implement write operations for GDScript creation and modification with syntax validation and template system. These tools enable AI assistants to generate and modify Godot scripts with proper formatting, validation, and code quality checks.

**Why this matters:**
- Enables AI-driven script generation and refactoring
- Ensures generated code follows GDScript best practices
- Provides reusable templates for common patterns
- Validates syntax before writing to prevent errors

## Acceptance Criteria

- [ ] `create_script` tool generates valid GDScript files
- [ ] `modify_script` tool edits scripts without breaking syntax
- [ ] GDScript syntax validation catches errors before writing
- [ ] Template system works for common script patterns
- [ ] Code formatting preserved during modifications
- [ ] All generated scripts loadable in Godot editor without errors
- [ ] Documentation comments properly generated
- [ ] Template variables correctly substituted

## Technical Requirements

### Write Tools Implementation

#### 1. `create_script`
**Parameters:**
- `script_path` - Target path for new script (relative to project)
- `script_type` - Template type (node, resource, singleton, tool)
- `class_name` - Optional class name declaration
- `extends` - Parent class to extend
- `template_vars` - Variables for template substitution
- `functions` - Array of function definitions to include
- `signals` - Signal declarations
- `exports` - Export variable definitions

**Functionality:**
- Validate script path doesn't exist (or force flag)
- Create directory structure if needed
- Load and process template
- Substitute template variables
- Generate class structure with proper ordering:
  1. class_name, extends, docstring
  2. Signal declarations
  3. Enum definitions
  4. Constants
  5. @export variables
  6. Public variables
  7. Private variables (_prefix)
  8. @onready variables
  9. Lifecycle methods (_init, _ready, _process, etc.)
  10. Public methods
  11. Private methods
- Apply code formatting (GDScript conventions)
- Validate syntax before writing
- Add documentation comments
- Return script path and line count

**Example:**
```typescript
{
  script_path: "scripts/player/Player.gd",
  script_type: "node",
  class_name: "Player",
  extends: "CharacterBody2D",
  signals: ["health_changed", "died"],
  exports: [
    { name: "speed", type: "float", default: 300.0 },
    { name: "jump_force", type: "float", default: -600.0 }
  ],
  functions: [
    {
      name: "_physics_process",
      params: ["delta: float"],
      body: "# Movement logic here"
    }
  ]
}
```

#### 2. `modify_script`
**Parameters:**
- `script_path` - Path to script to modify
- `operations` - Array of modification operations
- `preserve_formatting` - Boolean (default: true)
- `validate_syntax` - Boolean (default: true)

**Operations Supported:**
- `add_function` - Add new function definition
- `modify_function` - Change function body or signature
- `remove_function` - Delete function
- `add_variable` - Add class variable
- `modify_variable` - Change variable value or type
- `add_signal` - Declare new signal
- `add_import` - Add preload or load statement
- `modify_comment` - Update documentation

**Functionality:**
- Parse existing script into AST (Abstract Syntax Tree)
- Apply operations while maintaining structure
- Preserve code formatting and comments
- Re-order elements to match GDScript conventions
- Validate syntax after modifications
- Create backup before writing (reuse system from #5)
- Write modified script
- Log all changes

### GDScript Syntax Validation

**Validation Strategy:**
- Parse script with GDScript parser (use Godot CLI if available)
- Fallback to regex-based validation for basic checks
- AST analysis for structural validation

**Validation Checks:**
1. **Syntax Validation**
   - Valid indentation (tabs, not spaces)
   - Proper statement terminators
   - Balanced parentheses, brackets, braces
   - String literal formatting
   - Comment syntax

2. **Structural Validation**
   - Valid extends clause
   - Function definition syntax
   - Variable declaration format
   - Signal declaration format
   - Proper use of keywords

3. **Type Validation**
   - Static typing correctness (if used)
   - Type hint syntax
   - Valid type names (built-in and custom)

4. **Best Practices** (warnings, not errors)
   - Function length (<30 lines recommended)
   - Variable naming conventions
   - Missing type hints
   - Unused variables
   - Complex expressions
   - Missing documentation

**Validation Output:**
- Pass/Fail status
- List of syntax errors with line numbers
- List of warnings
- Suggested fixes for common issues

### Template System

**Built-in Templates:**

1. **Node Script** (`node`)
   - extends Node/Node2D/Node3D/Control
   - Lifecycle methods stub (_ready, _process)
   - Input handling template
   - Signal connections

2. **Resource Script** (`resource`)
   - extends Resource
   - Property definitions with @export
   - Serialization considerations
   - Documentation template

3. **Singleton/Autoload** (`singleton`)
   - Global state management pattern
   - Signal-based event system
   - Configuration management
   - Save/load functionality

4. **Tool Script** (`tool`)
   - @tool annotation
   - Editor plugin scaffolding
   - Custom inspectors
   - Scene processing

5. **State Machine** (`state_machine`)
   - State pattern implementation
   - State transition logic
   - Signal-driven states
   - Debug utilities

**Template Format:**
- Handlebars-style syntax: `{{variable_name}}`
- Conditional blocks: `{{#if condition}}...{{/if}}`
- Loops: `{{#each items}}...{{/each}}`
- Helper functions for formatting
- Default values for optional variables

**Template Customization:**
- User-defined template directory
- Override built-in templates
- Template inheritance
- Partial templates for reusable blocks

## Test Requirements

### Unit Tests
- [ ] Script generation with each template type
- [ ] Syntax validation with valid/invalid scripts
- [ ] Template variable substitution
- [ ] Code formatter preserves structure
- [ ] Operation parser for modify_script

### Integration Tests
- [ ] Create script → validate → load in Godot
- [ ] Modify script → validate → verify changes
- [ ] Template system with complex variables
- [ ] Syntax validation catches intentional errors
- [ ] Multiple sequential modifications

### Godot Integration Tests
- [ ] Generated scripts loadable in Godot editor
- [ ] Scripts attachable to nodes
- [ ] No errors in Godot output console
- [ ] Type hints recognized correctly
- [ ] Signals connectable in editor

### Manual Tests
- [ ] Create each template type via MCP
- [ ] Modify existing script (add function)
- [ ] Test syntax validation with broken code
- [ ] Verify code formatting in editor
- [ ] Test complex template with many variables

## Documentation Requirements

- [ ] Tool documentation with comprehensive examples
- [ ] Template system reference
- [ ] GDScript validation rules
- [ ] Best practices guide for AI code generation
- [ ] Custom template creation guide
- [ ] Example workflows (script generation, refactoring)
- [ ] Troubleshooting syntax errors

## Estimated Effort

**Story Points:** 13

**Breakdown:**
- Script creation tool: 3 points
- Script modification tool: 4 points
- Syntax validation: 3 points
- Template system: 2 points
- Testing and documentation: 1 point

**Dependencies:**
- Blocked by: #1 (Foundation), #2 (Editor Control), #3 (Read Tools), #4 (Node Operations), #5 (Scene Operations)
- Blocks: None

**Timeline:** Sprint 6 (1 week)

**Technical Considerations:**
- Consider using Tree-sitter for robust parsing
- Integration with GDScript language server for validation
- Leverage Godot CLI for authoritative syntax checking
- Template engine selection (Handlebars, Mustache, or custom)
