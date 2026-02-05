# Contributing to Godot MCP Bridge

## Code Style Guidelines

### GDScript Standards

**Naming Conventions**:
- Classes: `PascalCase` with `class_name` declaration
- Functions: `snake_case`
- Private functions: `_prefix_with_underscore`
- Constants: `UPPER_SNAKE_CASE`
- Variables: `snake_case`
- Private variables: `_prefix_with_underscore`

**Type Hints**:
Always use explicit type hints:

```gdscript
# Good
var count: int = 0
var items: Array[String] = []
func calculate(value: float) -> float:

# Bad
var count = 0
var items = []
func calculate(value):
```

**Documentation Comments**:
Use `##` for documentation (auto-extracted by Godot):

```gdscript
## Brief description of class/function
##
## WHY: Explain the reason this exists, not just what it does
##
## Longer description if needed.
## Can span multiple lines.
##
## Examples:
##   var result = method(param1, param2)
```

**Error Handling**:
Return structured dictionaries:

```gdscript
# Good
func operation() -> Dictionary:
    if invalid:
        return {"success": false, "error": "descriptive message"}
    return {"success": true, "result": data}

# Bad
func operation():
    if invalid:
        return null  # Unclear what went wrong
    return data
```

### File Organization

**Handler Structure**:

```gdscript
extends RefCounted
class_name HandlerName

## Class documentation
##
## WHY: Explain responsibility and architectural role

# Constants
const CONSTANT_NAME := value

# Preloads
const DependencyScript := preload("res://path/to/dependency.gd")

# Private variables
var _logger: MCPLogger
var _config: Dictionary

# Public methods
func public_method() -> ReturnType:
    pass

# Private methods
func _private_helper() -> void:
    pass

# Error helpers
func _error(message: String) -> Dictionary:
    return {"success": false, "error": message}
```

## Adding New Features

### 1. Adding a New Handler

See **Extension Guide** in [ARCHITECTURE.md](ARCHITECTURE.md#extension-guide).

**Checklist**:
- [ ] Create handler in `handlers/` directory
- [ ] Add comprehensive documentation comments
- [ ] Implement error handling for all edge cases
- [ ] Add preload to `http_server.gd`
- [ ] Initialize in `_initialize_handlers()`
- [ ] Add routing in `_route_rpc_method()`
- [ ] Update [README.md](README.md) operation list
- [ ] Create TypeScript client method (main MCP server)
- [ ] Register MCP tool (main MCP server)
- [ ] Write unit tests (future)
- [ ] Test manually with `curl` or MCP client

### 2. Modifying Protocol Layer

**When to modify**:
- Adding new HTTP methods (POST, GET, PUT, DELETE)
- Supporting additional content types
- Implementing WebSocket transport
- Adding authentication middleware

**Where to modify**:
- `protocol/http_request_parser.gd` - Request parsing
- `protocol/http_response_builder.gd` - Response building
- `protocol/jsonrpc_handler.gd` - JSON-RPC protocol

**Important**: Protocol changes should NOT require handler modifications.

### 3. Improving Infrastructure

**Logging enhancements** (`core/logger.gd`):
- Add log shipping to external systems
- Implement log rotation
- Add structured logging (JSON format)
- Support log filtering by component

**Server improvements** (`http_server.gd`):
- Add metrics collection
- Implement request middleware pipeline
- Add connection pooling
- Support graceful shutdown

## Testing

### Manual Testing Workflow

**1. Test Server Startup**:
```bash
# Open Godot project with plugin enabled
# Check Output console for: "HTTP server started on port 7777"
```

**2. Test Basic Connectivity**:
```bash
curl -X POST http://localhost:7777/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}'

# Expected: {"jsonrpc":"2.0","id":1,"result":{"pong":"pong"}}
```

**3. Test Each Handler**:
```bash
# Editor Control
curl -X POST http://localhost:7777/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"get_godot_version","params":{}}'

# Project Discovery
curl -X POST http://localhost:7777/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"list_projects","params":{"searchPaths":["/path/to/search"]}}'
```

**4. Test Error Cases**:
```bash
# Invalid JSON-RPC (missing jsonrpc field)
curl -X POST http://localhost:7777/rpc \
  -H "Content-Type: application/json" \
  -d '{"id":1,"method":"ping"}'

# Method not found
curl -X POST http://localhost:7777/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"nonexistent","params":{}}'

# Invalid parameters
curl -X POST http://localhost:7777/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"launch_editor","params":{}}'
```

### Unit Testing (Future)

**GDScript Test Framework**: Use GUT (Godot Unit Test) or gdUnit4

**Example test structure**:
```gdscript
# tests/handlers/test_editor_control_handler.gd
extends GutTest

var handler: EditorControlHandler
var mock_logger: MockLogger

func before_each():
    mock_logger = MockLogger.new()
    handler = EditorControlHandler.new(mock_logger)

func test_launch_editor_success():
    var result = handler.launch_editor("/valid/path")
    assert_eq(result.success, true)
    assert_has(result, "processId")

func test_launch_editor_empty_path():
    var result = handler.launch_editor("")
    assert_eq(result.success, false)
    assert_eq(result.error, "project_path is required")

func after_each():
    handler = null
    mock_logger = null
```

**Coverage Goals**:
- Core classes: 100% (logger, parsers, builders)
- Handlers: 90%+ (all paths including errors)
- http_server.gd: 80%+ (coordination logic)

## Documentation

### Code Documentation

**Every public method must have**:
1. Brief description of what it does
2. WHY comment explaining architectural purpose
3. Parameter documentation (if any)
4. Return value documentation
5. Example usage (for complex methods)

**Example**:
```gdscript
## Launch Godot editor for a specific project
##
## WHY: Creates a new Godot editor process with the specified project.
## Used by AI tools to open projects for development.
##
## Parameters:
##   project_path: Absolute path to Godot project directory
##   editor_path: Optional Godot executable path (auto-detected if empty)
##   additional_args: Optional command-line arguments
##
## Returns:
##   Dictionary with success, processId, editorPath, projectPath
##   Or error dictionary with success=false and error message
##
## Example:
##   var result = handler.launch_editor("/home/user/project")
##   if result.success:
##       print("Editor launched with PID: ", result.processId)
func launch_editor(project_path: String, editor_path: String = "", additional_args: Array = []) -> Dictionary:
```

### Architecture Documentation

Keep [ARCHITECTURE.md](ARCHITECTURE.md) updated:
- Design principles remain stable
- Request flow diagram when protocol changes
- Extension guide when adding patterns
- Performance section when optimizing

### README Updates

Keep [README.md](README.md) updated:
- Operation list when adding handlers
- File structure when reorganizing
- Testing section when adding tests
- Future improvements when planning features

## Pull Request Process

### Before Submitting

1. **Code Quality**:
   - [ ] Follows GDScript standards
   - [ ] All functions have documentation
   - [ ] No commented-out code (use git for history)
   - [ ] Variable names are descriptive

2. **Testing**:
   - [ ] Manually tested all changes
   - [ ] No regressions in existing features
   - [ ] Error cases handled gracefully

3. **Documentation**:
   - [ ] Code comments added/updated
   - [ ] README.md updated if needed
   - [ ] ARCHITECTURE.md updated if needed

### PR Description Template

```markdown
## Summary
Brief description of what this PR does

## Changes
- Specific change 1
- Specific change 2
- Specific change 3

## Testing
How this was tested:
1. Step 1
2. Step 2
3. Expected result

## Documentation
- [ ] Code documented
- [ ] README.md updated
- [ ] ARCHITECTURE.md updated (if applicable)

## Related Issues
Closes #123
Relates to #456
```

### Review Process

**What reviewers check**:
1. Code follows standards
2. Documentation is clear and helpful
3. Error handling is comprehensive
4. Changes don't break existing functionality
5. Performance implications considered

## Common Pitfalls

### 1. Forgetting to Update Preloads

When moving files:
```gdscript
# Remember to update ALL preload paths!
const HandlerScript := preload("res://addons/godot-mcp-bridge/handlers/new_location.gd")
```

### 2. Not Validating Input Parameters

```gdscript
# Bad
func operation(path: String):
    var file = FileAccess.open(path, FileAccess.READ)  # Crashes if path empty!

# Good
func operation(path: String) -> Dictionary:
    if path.is_empty():
        return _error("path is required")
    
    if not FileAccess.file_exists(path):
        return _error("file not found: " + path)
    
    var file = FileAccess.open(path, FileAccess.READ)
```

### 3. Mixing Responsibilities

```gdscript
# Bad - Handler doing HTTP parsing
func handle_request(raw_http: String):
    var lines = raw_http.split("\r\n")
    var method = lines[0].split(" ")[0]  # HTTP parsing in handler!
    # ... business logic ...

# Good - Handler receives parsed data
func handle_request(params: Dictionary):
    # ... business logic only ...
```

### 4. Not Using Structured Returns

```gdscript
# Bad - Unclear success/failure
func operation():
    if error:
        return null
    return result  # What if result is null?

# Good - Always clear
func operation() -> Dictionary:
    if error:
        return {"success": false, "error": "message"}
    return {"success": true, "result": result}
```

## Questions?

- Read [ARCHITECTURE.md](ARCHITECTURE.md) for design rationale
- Read [README.md](README.md) for feature overview
- Check existing handlers for implementation patterns
- Open an issue for clarification

## License

This project follows the same license as the main godot-mcp repository.
