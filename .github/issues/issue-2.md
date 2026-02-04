## Problem Description

Implement the core Editor Control tools that enable AI assistants to manage Godot Engine installations and projects. These tools provide fundamental capabilities to discover, launch, and control Godot editor instances across Windows, macOS, and Linux platforms.

**Why this matters:**
- Foundation for all Godot automation workflows
- Enables cross-platform Godot discovery and version management
- Provides essential process lifecycle control
- Blocks: Issue #1 (Foundation & Communication Layer)

## Acceptance Criteria

- [ ] All 6 tools implemented and functional: `launch_godot_editor`, `run_godot_project`, `stop_godot_execution`, `get_godot_version`, `list_godot_projects`, `analyze_project`
- [ ] Cross-platform executable detection working on Windows, macOS, and Linux
- [ ] Process management correctly spawns, monitors, and terminates Godot processes
- [ ] Output capture streams stdout/stderr to Web UI via SSE
- [ ] Error handling for missing Godot installations
- [ ] Timeout protection for long-running operations (5min default)
- [ ] All tools validated on at least 2 platforms before merge

## Technical Requirements

### Tool Implementations

#### 1. `launch_godot_editor`
- Detect Godot executable paths (platform-specific)
- Launch editor with optional project path
- Return process ID and status
- Stream editor output logs

#### 2. `run_godot_project`
- Execute project in headless/normal mode
- Support command-line arguments
- Capture game output separately from editor logs
- Handle crashes gracefully

#### 3. `stop_godot_execution`
- Graceful shutdown (SIGTERM) with fallback to force kill
- Clean up child processes
- Verify process termination
- Report exit codes

#### 4. `get_godot_version`
- Parse `godot --version` output
- Extract version number, commit hash, and build type
- Cache results per executable path
- Handle custom builds

#### 5. `list_godot_projects`
- Scan configured project directories
- Detect `project.godot` files
- Parse project name and version
- Return project metadata (icon path, description)

#### 6. `analyze_project`
- Read `project.godot` configuration
- Count scenes, scripts, and resources
- Detect Godot version requirement
- Identify plugins and dependencies

### Cross-Platform Support
- Windows: Registry search + common paths (Program Files, Steam)
- macOS: Application bundle detection + Spotlight search
- Linux: $PATH, /usr/bin, /usr/local/bin, Flatpak, Snap

### Process Management
- Node.js `child_process` with proper signal handling
- Process pool for concurrent operations
- Resource cleanup on server shutdown
- Zombie process prevention

### Output Capture
- Line-buffered stdout/stderr streaming
- ANSI color code preservation
- Separate streams for editor vs. game output
- Maximum buffer size limits (10MB)

## Test Requirements

### Unit Tests
- [ ] Executable path detection for each platform
- [ ] Version string parsing (various formats)
- [ ] Process lifecycle (spawn, monitor, terminate)
- [ ] project.godot parsing
- [ ] Error cases (missing files, invalid paths)

### Integration Tests
- [ ] Launch real Godot editor and verify startup
- [ ] Run sample project and capture output
- [ ] Stop running processes cleanly
- [ ] List projects from test directory
- [ ] Analyze test project structure

### Platform Tests
- [ ] Windows 10/11 compatibility
- [ ] macOS (Intel and Apple Silicon)
- [ ] Linux (Ubuntu, Fedora, Arch)
- [ ] Godot 4.0, 4.1, 4.2, 4.3 version compatibility

### Manual Tests
- [ ] Launch Godot editor GUI from MCP client
- [ ] Run headless project and see output in Web UI
- [ ] Stop long-running process via tool
- [ ] Discover multiple Godot installations
- [ ] Analyze complex project with many files

## Documentation Requirements

- [ ] Tool catalog entries for all 6 tools
- [ ] JSON Schema definitions for each tool
- [ ] Platform-specific setup instructions
- [ ] Godot installation detection guide
- [ ] Process management best practices
- [ ] Example usage workflows
- [ ] Troubleshooting common issues (permissions, missing executables)

## Estimated Effort

**Story Points:** 13

**Breakdown:**
- Tool implementations: 5 points
- Cross-platform detection: 3 points
- Process management: 3 points
- Testing and documentation: 2 points

**Dependencies:**
- Blocked by: #1 (Foundation & Communication Layer)
- Blocks: #3 (Read Tools), #4 (Node Operations), #5 (Scene Operations), #6 (Script Operations)

**Timeline:** Sprint 2 (1 week)
