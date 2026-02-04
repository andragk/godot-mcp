# Godot 4.6 MCP Server - Testing Strategy

**Document Version**: 1.0.0  
**Date**: February 4, 2026  
**Status**: QA Blueprint  
**Target Coverage**: >80% overall, 100% critical paths  
**Target Reliability**: 99.9% uptime, <0.1% failure rate

---

## Executive Summary

This document defines a comprehensive, production-ready testing strategy for the Godot 4.6 MCP Server—a Node.js + GDScript system bridging MCP clients to Godot Engine via HTTP. The strategy balances thorough validation with maintainability, ensuring high reliability while keeping test execution under 5 minutes.

**Testing Philosophy**:
- **Risk-Based**: Prioritize critical paths (tool invocations, file I/O, HTTP communication)
- **Fast Feedback**: Unit tests run in <30s, full suite in <5min
- **Shift-Left**: Catch issues early with comprehensive unit coverage (80% of test effort)
- **Production Parity**: Integration/E2E tests use realistic scenarios and data
- **Automated Quality Gates**: No merge without passing tests + coverage thresholds

**Key Metrics**:
- **Overall Coverage**: ≥80% line coverage, ≥90% branch coverage for critical modules
- **Test Distribution**: 80% Unit, 15% Integration, 5% E2E (inverted pyramid)
- **Performance**: All read operations <50ms p99, write operations <200ms p99
- **Reliability**: <0.1% flaky test rate, automatic retry for network-dependent tests
- **Security**: 100% coverage of validation logic, boundary conditions, and injection vectors

---

## 1. Test Pyramid Architecture

### 1.1 Layer Distribution

```
                    ┌────────────────┐
                    │   E2E Tests    │  5% (50 tests)
                    │   Full Flows   │  Runtime: 2min
                    └────────────────┘
                  ┌──────────────────────┐
                  │  Integration Tests   │  15% (150 tests)
                  │  Component Contracts │  Runtime: 1.5min
                  └──────────────────────┘
            ┌──────────────────────────────────┐
            │         Unit Tests                │  80% (800 tests)
            │  Pure Functions + Isolated Logic  │  Runtime: 30s
            └──────────────────────────────────┘
```

**Rationale**: 
- **Unit tests (80%)**: Fast, isolated, no I/O. Test business logic, validation, data transformations.
- **Integration tests (15%)**: Verify contracts between components (Node.js ↔ Godot, HTTP client ↔ server).
- **E2E tests (5%)**: Critical user flows (VS Code → MCP → Godot → file modification). Slow but high value.

### 1.2 Test Categorization

| Category | Scope | Tools | Speed | Coverage Target |
|----------|-------|-------|-------|-----------------|
| **Unit** | Single function/class | Vitest, GUT | <1ms/test | ≥80% overall |
| **Integration** | Multi-component | Vitest + Test Godot instance | <500ms/test | 100% API contracts |
| **E2E** | Full system | Playwright + MCP client | 2-5s/test | Critical paths only |
| **Performance** | Latency/throughput | Artillery, k6 | 30-60s | p50/p95/p99 benchmarks |
| **Security** | Vulnerability scanning | Custom fuzzers, OWASP tools | 1-2min | 100% attack vectors |

---

## 2. Unit Testing Strategy (80% of Effort)

### 2.1 Node.js Components (Vitest)

**Test Scope**: Pure logic, validation, HTTP client, tool handlers (without actual HTTP calls).

#### 2.1.1 Tool Validation Layer

**File**: `tests/unit/tools/validation.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateToolInput } from '@/tools/validation';
import { ToolSchemas } from '@/tools/schemas';

describe('Tool Input Validation', () => {
  describe('read_scene', () => {
    it('should accept valid relative path', () => {
      const result = validateToolInput('read_scene', {
        path: 'scenes/main_menu.tscn'
      });
      expect(result.valid).toBe(true);
    });

    it('should reject absolute paths', () => {
      const result = validateToolInput('read_scene', {
        path: '/etc/passwd'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('absolute paths not allowed');
    });

    it('should reject path traversal attempts', () => {
      const result = validateToolInput('read_scene', {
        path: '../../../etc/passwd'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('path traversal');
    });

    it('should reject non-.tscn extensions', () => {
      const result = validateToolInput('read_scene', {
        path: 'scenes/main.gd'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be .tscn');
    });

    it('should handle missing required fields', () => {
      const result = validateToolInput('read_scene', {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('path is required');
    });
  });

  describe('modify_script', () => {
    it('should validate line range boundaries', () => {
      const result = validateToolInput('modify_script', {
        path: 'scripts/player.gd',
        start_line: 10,
        end_line: 5  // Invalid: end before start
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('end_line must be >= start_line');
    });

    it('should reject negative line numbers', () => {
      const result = validateToolInput('modify_script', {
        path: 'scripts/player.gd',
        start_line: -1,
        end_line: 10
      });
      expect(result.valid).toBe(false);
    });
  });
});
```

**Coverage Target**: 100% of validation logic (critical security boundary).

#### 2.1.2 HTTP Client Layer

**File**: `tests/unit/http/client.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GodotHttpClient } from '@/http/client';
import { HttpError, TimeoutError } from '@/errors';

// Mock fetch globally
global.fetch = vi.fn();

describe('GodotHttpClient', () => {
  let client: GodotHttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GodotHttpClient('http://localhost:7777');
  });

  describe('request', () => {
    it('should make POST request with JSON-RPC format', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: '1',
          result: { success: true }
        })
      });

      const result = await client.request('read_file', {
        path: 'test.gd'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:7777/rpc',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"method":"read_file"')
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('should handle network timeout', async () => {
      (global.fetch as any).mockImplementationOnce(
        () => new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 100)
        )
      );

      await expect(
        client.request('read_file', { path: 'test.gd' }, { timeout: 50 })
      ).rejects.toThrow(TimeoutError);
    });

    it('should retry on transient failures', async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: '1', result: {} })
        });

      const result = await client.request('read_file', { path: 'test.gd' });
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result).toBeDefined();
    });

    it('should parse JSON-RPC error responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: '1',
          error: {
            code: -32602,
            message: 'Invalid params',
            data: { field: 'path' }
          }
        })
      });

      await expect(
        client.request('read_file', { path: '' })
      ).rejects.toThrow(HttpError);
    });
  });

  describe('health check', () => {
    it('should return true when Godot responds', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' })
      });

      const healthy = await client.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false on connection failure', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const healthy = await client.healthCheck();
      expect(healthy).toBe(false);
    });
  });
});
```

**Coverage Target**: 100% of HTTP client (critical failure point).

#### 2.1.3 Tool Handler Logic

**File**: `tests/unit/tools/handlers.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ReadSceneTool } from '@/tools/read-scene';
import { ModifyScriptTool } from '@/tools/modify-script';

describe('ReadSceneTool', () => {
  it('should format scene data for MCP response', async () => {
    const mockClient = {
      request: vi.fn().mockResolvedValue({
        nodes: [{ name: 'Player', type: 'CharacterBody2D' }],
        connections: []
      })
    };

    const tool = new ReadSceneTool(mockClient as any);
    const result = await tool.execute({ path: 'scenes/player.tscn' });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('CharacterBody2D');
    expect(result.isError).toBe(false);
  });

  it('should handle Godot errors gracefully', async () => {
    const mockClient = {
      request: vi.fn().mockRejectedValue(new Error('File not found'))
    };

    const tool = new ReadSceneTool(mockClient as any);
    const result = await tool.execute({ path: 'missing.tscn' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('File not found');
  });
});

describe('ModifyScriptTool', () => {
  it('should construct proper modification request', async () => {
    const mockClient = {
      request: vi.fn().mockResolvedValue({ success: true })
    };

    const tool = new ModifyScriptTool(mockClient as any);
    await tool.execute({
      path: 'scripts/player.gd',
      start_line: 10,
      end_line: 15,
      new_content: 'func jump():\n\tvelocity.y = -400'
    });

    expect(mockClient.request).toHaveBeenCalledWith(
      'modify_script',
      expect.objectContaining({
        path: 'scripts/player.gd',
        start_line: 10,
        end_line: 15
      })
    );
  });
});
```

### 2.2 GDScript Components (GUT Framework)

**Test Scope**: Godot bridge HTTP server, file operations, scene/script parsing.

#### 2.2.1 HTTP Server Request Handling

**File**: `tests/unit/test_http_server.gd`

```gdscript
extends GutTest

var server: MCPBridgeServer
var mock_request: Dictionary

func before_each():
	server = MCPBridgeServer.new()
	mock_request = {
		"jsonrpc": "2.0",
		"id": "test-001",
		"method": "read_file",
		"params": { "path": "scripts/player.gd" }
	}

func test_valid_json_rpc_request():
	var response = server.handle_request(JSON.stringify(mock_request))
	var parsed = JSON.parse_string(response)
	
	assert_eq(parsed["jsonrpc"], "2.0", "Should return JSON-RPC 2.0")
	assert_eq(parsed["id"], "test-001", "Should echo request ID")
	assert_has(parsed, "result", "Should have result field")

func test_invalid_json():
	var response = server.handle_request("not valid json{")
	var parsed = JSON.parse_string(response)
	
	assert_has(parsed, "error", "Should return error for invalid JSON")
	assert_eq(parsed["error"]["code"], -32700, "Should use Parse Error code")

func test_missing_method():
	mock_request.erase("method")
	var response = server.handle_request(JSON.stringify(mock_request))
	var parsed = JSON.parse_string(response)
	
	assert_eq(parsed["error"]["code"], -32600, "Should return Invalid Request")

func test_unknown_method():
	mock_request["method"] = "nonexistent_method"
	var response = server.handle_request(JSON.stringify(mock_request))
	var parsed = JSON.parse_string(response)
	
	assert_eq(parsed["error"]["code"], -32601, "Should return Method Not Found")

func test_path_traversal_protection():
	mock_request["params"]["path"] = "../../../etc/passwd"
	var response = server.handle_request(JSON.stringify(mock_request))
	var parsed = JSON.parse_string(response)
	
	assert_has(parsed, "error", "Should reject path traversal")
	assert_true(parsed["error"]["message"].contains("path traversal"), 
	            "Error should mention path traversal")
```

#### 2.2.2 File Operations

**File**: `tests/unit/test_file_operations.gd`

```gdscript
extends GutTest

var file_ops: FileOperations
var test_dir: String

func before_each():
	file_ops = FileOperations.new()
	test_dir = "user://test_temp/"
	DirAccess.make_dir_absolute(test_dir)

func after_each():
	# Clean up test files
	var dir = DirAccess.open(test_dir)
	if dir:
		dir.list_dir_begin()
		var file_name = dir.get_next()
		while file_name != "":
			dir.remove(test_dir + file_name)
			file_name = dir.get_next()
		dir.list_dir_end()
		DirAccess.remove_absolute(test_dir)

func test_read_existing_file():
	var test_file = test_dir + "test.gd"
	var file = FileAccess.open(test_file, FileAccess.WRITE)
	file.store_string("extends Node\n\nfunc _ready():\n\tpass")
	file.close()
	
	var content = file_ops.read_file(test_file)
	assert_true(content.begins_with("extends Node"), "Should read file content")
	assert_true(content.contains("func _ready()"), "Should contain all lines")

func test_read_nonexistent_file():
	var result = file_ops.read_file(test_dir + "missing.gd")
	assert_null(result, "Should return null for missing file")

func test_write_new_file():
	var test_file = test_dir + "new.gd"
	var content = "extends Node2D\n\nvar speed = 100"
	
	var success = file_ops.write_file(test_file, content)
	assert_true(success, "Should successfully write file")
	
	var file = FileAccess.open(test_file, FileAccess.READ)
	var read_content = file.get_as_text()
	file.close()
	
	assert_eq(read_content, content, "Written content should match")

func test_modify_file_line_range():
	var test_file = test_dir + "modify.gd"
	var file = FileAccess.open(test_file, FileAccess.WRITE)
	file.store_string("line 1\nline 2\nline 3\nline 4\nline 5")
	file.close()
	
	var success = file_ops.modify_file_lines(test_file, 2, 3, "new line 2\nnew line 3")
	assert_true(success, "Should successfully modify lines")
	
	var content = FileAccess.get_file_as_string(test_file)
	assert_true(content.contains("new line 2"), "Should contain modified content")
	assert_true(content.contains("line 1"), "Should preserve line 1")
	assert_true(content.contains("line 4"), "Should preserve line 4")

func test_list_directory():
	# Create test files
	FileAccess.open(test_dir + "file1.gd", FileAccess.WRITE).close()
	FileAccess.open(test_dir + "file2.tscn", FileAccess.WRITE).close()
	DirAccess.make_dir_absolute(test_dir + "subdir")
	
	var entries = file_ops.list_directory(test_dir)
	assert_eq(entries.size(), 3, "Should list all entries")
	assert_has(entries, "file1.gd", "Should include .gd file")
	assert_has(entries, "file2.tscn", "Should include .tscn file")
	assert_has(entries, "subdir", "Should include subdirectory")
```

#### 2.2.3 Scene Parsing

**File**: `tests/unit/test_scene_parser.gd`

```gdscript
extends GutTest

var parser: SceneParser

func before_each():
	parser = SceneParser.new()

func test_parse_simple_scene():
	var scene_content = """
[gd_scene load_steps=2 format=3]

[node name="Player" type="CharacterBody2D"]
script = ExtResource("1_abc123")

[node name="Sprite2D" type="Sprite2D" parent="."]
texture = ExtResource("2_def456")
"""
	
	var parsed = parser.parse_scene(scene_content)
	assert_eq(parsed["nodes"].size(), 2, "Should parse 2 nodes")
	assert_eq(parsed["nodes"][0]["name"], "Player", "Should extract node name")
	assert_eq(parsed["nodes"][0]["type"], "CharacterBody2D", "Should extract node type")

func test_parse_node_hierarchy():
	var scene_content = """
[node name="Level" type="Node2D"]

[node name="Player" type="CharacterBody2D" parent="."]

[node name="Camera" type="Camera2D" parent="Player"]
"""
	
	var parsed = parser.parse_scene(scene_content)
	var player_node = parsed["nodes"].filter(func(n): return n["name"] == "Player")[0]
	var camera_node = parsed["nodes"].filter(func(n): return n["name"] == "Camera")[0]
	
	assert_eq(player_node["parent"], ".", "Player should be child of root")
	assert_eq(camera_node["parent"], "Player", "Camera should be child of Player")

func test_parse_signal_connections():
	var scene_content = """
[node name="Button" type="Button"]

[connection signal="pressed" from="Button" to="." method="_on_button_pressed"]
"""
	
	var parsed = parser.parse_scene(scene_content)
	assert_eq(parsed["connections"].size(), 1, "Should parse 1 connection")
	assert_eq(parsed["connections"][0]["signal"], "pressed")
	assert_eq(parsed["connections"][0]["from"], "Button")
	assert_eq(parsed["connections"][0]["method"], "_on_button_pressed")
```

**Coverage Target**: ≥80% overall, 100% for security-critical functions (path validation, file I/O).

---

## 3. Integration Testing Strategy (15% of Effort)

### 3.1 Node.js ↔ Godot Communication

**Test Scope**: HTTP transport layer, JSON-RPC protocol adherence, error propagation.

#### 3.1.1 HTTP Communication Contract

**File**: `tests/integration/http-bridge.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { GodotHttpClient } from '@/http/client';
import { waitForServer } from './helpers';

describe('HTTP Bridge Integration', () => {
  let godotProcess: ChildProcess;
  let client: GodotHttpClient;

  beforeAll(async () => {
    // Start test Godot instance in headless mode
    godotProcess = spawn('godot', [
      '--headless',
      '--path', './tests/fixtures/test-project',
      '--script', 'res://addons/mcp-bridge/bridge_server.gd'
    ]);

    // Wait for HTTP server to be ready
    await waitForServer('http://localhost:7777', { timeout: 10000 });
    client = new GodotHttpClient('http://localhost:7777');
  }, 15000);

  afterAll(() => {
    godotProcess?.kill();
  });

  describe('read_file operation', () => {
    it('should read existing GDScript file', async () => {
      const result = await client.request('read_file', {
        path: 'scripts/test_player.gd'
      });

      expect(result.content).toContain('extends CharacterBody2D');
      expect(result.line_count).toBeGreaterThan(0);
    });

    it('should return error for missing file', async () => {
      await expect(
        client.request('read_file', { path: 'missing.gd' })
      ).rejects.toThrow('File not found');
    });

    it('should reject path traversal', async () => {
      await expect(
        client.request('read_file', { path: '../../outside.gd' })
      ).rejects.toThrow(/path traversal|invalid path/i);
    });
  });

  describe('read_scene operation', () => {
    it('should parse .tscn file structure', async () => {
      const result = await client.request('read_scene', {
        path: 'scenes/test_level.tscn'
      });

      expect(result.nodes).toBeInstanceOf(Array);
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.nodes[0]).toHaveProperty('name');
      expect(result.nodes[0]).toHaveProperty('type');
    });

    it('should include signal connections', async () => {
      const result = await client.request('read_scene', {
        path: 'scenes/ui_test.tscn'
      });

      expect(result.connections).toBeInstanceOf(Array);
      if (result.connections.length > 0) {
        expect(result.connections[0]).toHaveProperty('signal');
        expect(result.connections[0]).toHaveProperty('from');
        expect(result.connections[0]).toHaveProperty('to');
      }
    });
  });

  describe('modify_script operation', () => {
    it('should modify file and return success', async () => {
      // First, read original content
      const original = await client.request('read_file', {
        path: 'scripts/test_player.gd'
      });

      // Modify a line
      const result = await client.request('modify_script', {
        path: 'scripts/test_player.gd',
        start_line: 3,
        end_line: 3,
        new_content: '# Modified by integration test'
      });

      expect(result.success).toBe(true);

      // Verify modification
      const modified = await client.request('read_file', {
        path: 'scripts/test_player.gd'
      });
      expect(modified.content).toContain('Modified by integration test');

      // Restore original
      await client.request('write_file', {
        path: 'scripts/test_player.gd',
        content: original.content
      });
    });
  });

  describe('error handling', () => {
    it('should return structured errors', async () => {
      try {
        await client.request('read_file', { path: '' });
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBeDefined();
        expect(error.message).toBeDefined();
        expect(error.data).toBeDefined();
      }
    });

    it('should handle malformed requests gracefully', async () => {
      try {
        await client.request('read_file', { invalid_param: 'test' } as any);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe(-32602); // Invalid params
      }
    });
  });

  describe('performance', () => {
    it('should respond to read operations within 50ms p99', async () => {
      const latencies: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await client.request('read_file', { path: 'scripts/test_player.gd' });
        latencies.push(performance.now() - start);
      }

      latencies.sort((a, b) => a - b);
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      expect(p99).toBeLessThan(50);
    });
  });
});
```

### 3.2 Tool Invocation End-to-End

**File**: `tests/integration/tool-invocation.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPServer } from '@/server';
import { TestMCPClient } from './helpers/test-client';

describe('Tool Invocation Flow', () => {
  let server: MCPServer;
  let client: TestMCPClient;

  beforeAll(async () => {
    server = new MCPServer({ port: 7777 });
    await server.start();
    
    client = new TestMCPClient();
    await client.connect(server.getStdioTransport());
  });

  afterAll(async () => {
    await client.disconnect();
    await server.stop();
  });

  it('should execute read_scene tool successfully', async () => {
    const response = await client.callTool('read_scene', {
      path: 'scenes/test_level.tscn'
    });

    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe('text');
    expect(response.isError).toBe(false);

    const data = JSON.parse(response.content[0].text);
    expect(data.nodes).toBeInstanceOf(Array);
  });

  it('should validate tool input and return error', async () => {
    const response = await client.callTool('read_scene', {
      path: '../../etc/passwd'  // Path traversal attempt
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/invalid path|path traversal/i);
  });

  it('should handle Godot unavailability gracefully', async () => {
    // Stop Godot server temporarily
    await server.stopGodotBridge();

    const response = await client.callTool('read_scene', {
      path: 'scenes/test_level.tscn'
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/godot.*unavailable|connection refused/i);

    // Restart Godot server
    await server.startGodotBridge();
  });
});
```

**Coverage Target**: 100% of API contracts, all error scenarios.

---

## 4. End-to-End Testing Strategy (5% of Effort)

### 4.1 Critical User Flows

**Test Scope**: VS Code → MCP Server → Godot → File System workflows.

#### 4.1.1 Scene Inspection Workflow

**File**: `tests/e2e/scene-inspection.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { VSCodeMCPClient } from './helpers/vscode-client';

test.describe('Scene Inspection Workflow', () => {
  let client: VSCodeMCPClient;

  test.beforeAll(async () => {
    client = new VSCodeMCPClient();
    await client.initialize();
  });

  test('should inspect scene and navigate to node', async ({ page }) => {
    // Step 1: Open VS Code with MCP extension
    await page.goto('http://localhost:8080'); // Sidecar UI

    // Step 2: Invoke read_scene via MCP client
    const sceneData = await client.invokeToolViaUI(page, 'read_scene', {
      path: 'scenes/main_menu.tscn'
    });

    // Step 3: Verify scene data is displayed
    await expect(page.locator('.tool-result')).toContainText('MainMenu');
    await expect(page.locator('.node-list')).toContainText('Button');

    // Step 4: Click on node to view properties
    await page.locator('text="Button"').click();
    await expect(page.locator('.node-properties')).toContainText('text');
  });

  test('should modify script and verify change', async ({ page }) => {
    // Step 1: Read current script
    const original = await client.invokeTool('read_script', {
      path: 'scripts/player_controller.gd'
    });

    // Step 2: Modify script
    await client.invokeTool('modify_script', {
      path: 'scripts/player_controller.gd',
      start_line: 10,
      end_line: 10,
      new_content: '\t# E2E test modification'
    });

    // Step 3: Read modified script
    const modified = await client.invokeTool('read_script', {
      path: 'scripts/player_controller.gd'
    });

    // Step 4: Verify modification
    expect(modified.content).toContain('E2E test modification');
    expect(modified.content).not.toEqual(original.content);

    // Step 5: Restore original
    await client.invokeTool('write_file', {
      path: 'scripts/player_controller.gd',
      content: original.content
    });
  });
});
```

#### 4.1.2 Project Navigation Workflow

**File**: `tests/e2e/project-navigation.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { VSCodeMCPClient } from './helpers/vscode-client';

test.describe('Project Navigation', () => {
  let client: VSCodeMCPClient;

  test.beforeAll(async () => {
    client = new VSCodeMCPClient();
    await client.initialize();
  });

  test('should list project structure and drill down', async () => {
    // Step 1: List root directory
    const root = await client.invokeTool('list_directory', { path: '.' });
    expect(root.entries).toContain('scenes/');
    expect(root.entries).toContain('scripts/');

    // Step 2: List scenes directory
    const scenes = await client.invokeTool('list_directory', { path: 'scenes' });
    expect(scenes.entries.some((e: string) => e.endsWith('.tscn'))).toBe(true);

    // Step 3: Read a scene file
    const firstScene = scenes.entries.find((e: string) => e.endsWith('.tscn'));
    const sceneData = await client.invokeTool('read_scene', {
      path: `scenes/${firstScene}`
    });

    expect(sceneData.nodes).toBeInstanceOf(Array);
    expect(sceneData.nodes.length).toBeGreaterThan(0);
  });
});
```

**Coverage Target**: 100% of critical user journeys (5-10 flows max).

---

## 5. Performance Testing Strategy

### 5.1 Latency Benchmarks

**Tool**: k6 for HTTP load testing, custom Node.js scripts for end-to-end measurement.

#### 5.1.1 Read Operation Latency

**File**: `tests/performance/read-latency.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const readLatency = new Trend('read_file_latency');

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 VUs
    { duration: '1m', target: 10 },   // Sustain 10 VUs
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    'read_file_latency': ['p(99)<50'], // p99 must be under 50ms
    'http_req_failed': ['rate<0.01'],  // <1% failure rate
  },
};

export default function () {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: `req-${__VU}-${__ITER}`,
    method: 'read_file',
    params: { path: 'scripts/test_player.gd' },
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const response = http.post('http://localhost:7777/rpc', payload, params);

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response has result': (r) => JSON.parse(r.body).result !== undefined,
  });

  readLatency.add(response.timings.duration);
  sleep(0.1); // 100ms think time
}
```

#### 5.1.2 Write Operation Latency

**File**: `tests/performance/write-latency.js`

```javascript
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const writeLatency = new Trend('write_file_latency');

export const options = {
  vus: 5,
  duration: '1m',
  thresholds: {
    'write_file_latency': ['p(99)<200'], // p99 must be under 200ms
  },
};

export default function () {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: `req-${__VU}-${__ITER}`,
    method: 'write_file',
    params: {
      path: `scripts/temp_${__VU}_${__ITER}.gd`,
      content: 'extends Node\n\nfunc _ready():\n\tpass',
    },
  });

  const response = http.post('http://localhost:7777/rpc', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(response, {
    'write successful': (r) => JSON.parse(r.body).result?.success === true,
  });

  writeLatency.add(response.timings.duration);
}
```

### 5.2 Load Testing

**File**: `tests/performance/sustained-load.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp to 50 VUs
    { duration: '5m', target: 50 },   // Sustain 50 VUs
    { duration: '2m', target: 100 },  // Spike to 100 VUs
    { duration: '5m', target: 100 },  // Sustain 100 VUs
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<100', 'p(99)<200'],
    'http_req_failed': ['rate<0.01'],
  },
};

const operations = [
  { method: 'read_file', params: { path: 'scripts/player.gd' } },
  { method: 'read_scene', params: { path: 'scenes/level1.tscn' } },
  { method: 'list_directory', params: { path: 'scripts' } },
];

export default function () {
  const op = operations[Math.floor(Math.random() * operations.length)];
  
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: `req-${__VU}-${__ITER}`,
    ...op,
  });

  const response = http.post('http://localhost:7777/rpc', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(response, {
    'status 200': (r) => r.status === 200,
    'no error': (r) => !JSON.parse(r.body).error,
  });

  sleep(Math.random() * 2); // Random think time 0-2s
}
```

### 5.3 Memory Profiling

**File**: `tests/performance/memory-leak.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { MCPServer } from '@/server';
import { GodotHttpClient } from '@/http/client';

describe('Memory Leak Detection', () => {
  it('should not leak memory during sustained operations', async () => {
    const server = new MCPServer({ port: 7777 });
    await server.start();

    const client = new GodotHttpClient('http://localhost:7777');
    const initialMemory = process.memoryUsage().heapUsed;

    // Perform 10,000 operations
    for (let i = 0; i < 10000; i++) {
      await client.request('read_file', { path: 'scripts/test.gd' });
      
      // Force GC every 1000 iterations
      if (i % 1000 === 0 && global.gc) {
        global.gc();
      }
    }

    // Force final GC
    if (global.gc) global.gc();
    await new Promise(resolve => setTimeout(resolve, 1000));

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;

    // Memory growth should be < 50MB for 10k operations
    expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);

    await server.stop();
  }, 60000);
});
```

**Target Metrics**:
- Read operations: p50 <20ms, p95 <40ms, p99 <50ms
- Write operations: p50 <80ms, p95 <150ms, p99 <200ms
- Memory: <100MB Node.js process, <50MB growth over 1hr sustained load
- Throughput: >1000 req/s for read operations, >200 req/s for write operations

---

## 6. Security Testing Strategy

### 6.1 Path Traversal Testing

**File**: `tests/security/path-traversal.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validatePath } from '@/security/path-validator';

describe('Path Traversal Prevention', () => {
  const attackVectors = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    'scripts/../../../etc/passwd',
    'scripts/../../.ssh/id_rsa',
    'scripts/./../../../etc/passwd',
    'scripts/./../../etc/passwd',
    'scripts\\..\\..\\..\\etc\\passwd',
    'scripts%2F..%2F..%2F..%2Fetc%2Fpasswd',
    'scripts/..%252f..%252f..%252fetc%252fpasswd',
    '/etc/passwd',
    'C:\\Windows\\System32',
    '\\\\network\\share\\file.txt',
    'file:///etc/passwd',
  ];

  attackVectors.forEach((path) => {
    it(`should reject path traversal: ${path}`, () => {
      expect(() => validatePath(path)).toThrow(/invalid path|path traversal/i);
    });
  });

  const validPaths = [
    'scripts/player.gd',
    'scenes/levels/level1.tscn',
    'assets/textures/player.png',
    'addons/my_plugin/plugin.cfg',
  ];

  validPaths.forEach((path) => {
    it(`should accept valid path: ${path}`, () => {
      expect(() => validatePath(path)).not.toThrow();
    });
  });
});
```

### 6.2 Input Fuzzing

**File**: `tests/security/fuzzing.test.ts`

```typescript
import { describe, it } from 'vitest';
import { GodotHttpClient } from '@/http/client';
import { generateRandomString, generateMalformedJSON } from './fuzz-helpers';

describe('Input Fuzzing', () => {
  const client = new GodotHttpClient('http://localhost:7777');

  it('should handle extremely long paths gracefully', async () => {
    const longPath = 'scripts/' + 'a'.repeat(10000) + '.gd';
    
    // Should not crash, should return validation error
    await expect(
      client.request('read_file', { path: longPath })
    ).rejects.toThrow();
  });

  it('should handle malformed Unicode in paths', async () => {
    const paths = [
      'scripts/test\uFFFD.gd',  // Replacement character
      'scripts/test\u0000.gd',   // Null byte
      'scripts/test\uD800.gd',   // Unpaired surrogate
    ];

    for (const path of paths) {
      await expect(
        client.request('read_file', { path })
      ).rejects.toThrow();
    }
  });

  it('should handle extremely large payloads', async () => {
    const largeContent = 'a'.repeat(100 * 1024 * 1024); // 100MB
    
    await expect(
      client.request('write_file', {
        path: 'scripts/large.gd',
        content: largeContent
      })
    ).rejects.toThrow(/too large|size limit/i);
  });

  it('should handle malformed JSON-RPC requests', async () => {
    const malformedRequests = [
      '{"jsonrpc":"2.0","id":1}', // Missing method
      '{"method":"test"}',        // Missing jsonrpc version
      '{"jsonrpc":"1.0","method":"test","id":1}', // Wrong version
      generateMalformedJSON(),    // Random malformed JSON
    ];

    for (const request of malformedRequests) {
      // Should return error response, not crash
      const response = await fetch('http://localhost:7777/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: request
      });

      const data = await response.json();
      expect(data.error).toBeDefined();
    }
  });
});
```

### 6.3 Validation Bypass Attempts

**File**: `tests/security/validation-bypass.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateToolInput } from '@/tools/validation';

describe('Validation Bypass Prevention', () => {
  it('should reject null byte injection', () => {
    expect(() =>
      validateToolInput('read_file', { path: 'scripts/test\0.gd' })
    ).toThrow();
  });

  it('should reject CRLF injection', () => {
    expect(() =>
      validateToolInput('read_file', { path: 'scripts/test\r\n.gd' })
    ).toThrow();
  });

  it('should validate file extension strictly', () => {
    // Attempt to bypass with double extension
    expect(() =>
      validateToolInput('read_scene', { path: 'file.gd.tscn' })
    ).not.toThrow(); // This should pass

    expect(() =>
      validateToolInput('read_scene', { path: 'file.tscn.gd' })
    ).toThrow(/must be .tscn/i);
  });

  it('should reject type coercion exploits', () => {
    const maliciousInputs = [
      { path: ['array', 'instead', 'of', 'string'] },
      { path: { object: 'instead' } },
      { path: 12345 },  // Number instead of string
      { path: true },   // Boolean instead of string
      { start_line: '10' }, // String instead of number
    ];

    for (const input of maliciousInputs) {
      expect(() =>
        validateToolInput('read_file', input as any)
      ).toThrow();
    }
  });
});
```

**Coverage Target**: 100% of security-critical validation logic, all OWASP Top 10 relevant vectors.

---

## 7. Test Tooling & Infrastructure

### 7.1 Node.js Testing (Vitest)

**Configuration**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
      // Critical modules must have 100% coverage
      perFile: true,
      watermarks: {
        lines: [80, 95],
        branches: [80, 95],
        functions: [80, 95],
        statements: [80, 95],
      },
    },
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 7.2 GDScript Testing (GUT Framework)

**Setup**: Install GUT addon from Godot Asset Library.

**Configuration**: `.gutconfig.json`

```json
{
  "dirs": ["res://tests/unit/", "res://tests/integration/"],
  "include_subdirs": true,
  "ignore_dirs": [],
  "prefix": "test_",
  "suffix": ".gd",
  "log_level": 1,
  "should_exit": true,
  "should_exit_on_success": false,
  "junit_xml_file": "test-results/gut-results.xml",
  "post_run_script": "",
  "double_strategy": "partial"
}
```

**Run Command**:
```powershell
godot --headless --path . -s addons/gut/gut_cmdln.gd -gexit
```

### 7.3 Test Fixtures & Mocks

**Directory Structure**:
```
tests/
  fixtures/
    test-project/          # Minimal Godot project for integration tests
      project.godot
      scenes/
        test_level.tscn
        ui_test.tscn
      scripts/
        test_player.gd
        test_enemy.gd
      addons/
        mcp-bridge/        # MCP bridge plugin
  helpers/
    test-client.ts         # Mock MCP client for integration tests
    vscode-client.ts       # VS Code MCP client wrapper for E2E
    godot-runner.ts        # Utility to spawn Godot in headless mode
    wait-for-server.ts     # Server health check utility
  mocks/
    http-server.mock.ts    # Mock HTTP server responses
    file-system.mock.ts    # Mock file system operations
```

**Example Mock**: `tests/mocks/godot-client.mock.ts`

```typescript
import { vi } from 'vitest';
import { GodotHttpClient } from '@/http/client';

export function createMockGodotClient(overrides = {}) {
  return {
    request: vi.fn().mockResolvedValue({ success: true }),
    healthCheck: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as GodotHttpClient;
}

export const mockSceneResponse = {
  nodes: [
    { name: 'Player', type: 'CharacterBody2D', parent: '.' },
    { name: 'Sprite2D', type: 'Sprite2D', parent: 'Player' },
  ],
  connections: [
    { signal: 'body_entered', from: 'Player', to: '.', method: '_on_player_hit' },
  ],
};
```

### 7.4 Test Data Management

**Fixtures for Consistent Testing**:

```typescript
// tests/fixtures/scenes.ts
export const VALID_SCENE_CONTENT = `
[gd_scene load_steps=2 format=3]

[node name="TestScene" type="Node2D"]

[node name="Player" type="CharacterBody2D" parent="."]
script = ExtResource("1_abc")
`;

export const INVALID_SCENE_CONTENT = `
[gd_scene load_steps=2 format=3]
[node name="TestScene" type="Node2D"
`;  // Missing closing bracket

// tests/fixtures/scripts.ts
export const VALID_GDSCRIPT = `
extends CharacterBody2D

var speed = 300.0

func _physics_process(delta):
\tmove_and_slide()
`;

export const MALFORMED_GDSCRIPT = `
extends CharacterBody2D

func _physics_process(delta:
\t# Missing closing parenthesis
`;
```

---

## 8. CI/CD Integration

### 8.1 GitHub Actions Workflow

**File**: `.github/workflows/test.yml`

```yaml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  unit-tests:
    name: Unit Tests (Node.js)
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage/lcov.info
          flags: unit

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Godot
        run: |
          wget https://github.com/godotengine/godot/releases/download/4.6-stable/Godot_v4.6-stable_linux.x86_64.zip
          unzip Godot_v4.6-stable_linux.x86_64.zip
          chmod +x Godot_v4.6-stable_linux.x86_64
          sudo mv Godot_v4.6-stable_linux.x86_64 /usr/local/bin/godot

      - name: Install dependencies
        run: npm ci

      - name: Run integration tests
        run: npm run test:integration

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage/lcov.info
          flags: integration

  gdscript-tests:
    name: GDScript Tests (GUT)
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - name: Install Godot
        run: |
          wget https://github.com/godotengine/godot/releases/download/4.6-stable/Godot_v4.6-stable_linux.x86_64.zip
          unzip Godot_v4.6-stable_linux.x86_64.zip
          chmod +x Godot_v4.6-stable_linux.x86_64
          sudo mv Godot_v4.6-stable_linux.x86_64 /usr/local/bin/godot

      - name: Install GUT
        run: |
          mkdir -p addons
          cd addons
          git clone https://github.com/bitwes/Gut.git gut

      - name: Run GUT tests
        run: godot --headless --path . -s addons/gut/gut_cmdln.gd -gexit

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: gut-test-results
          path: test-results/gut-results.xml

  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Godot
        run: |
          wget https://github.com/godotengine/godot/releases/download/4.6-stable/Godot_v4.6-stable_linux.x86_64.zip
          unzip Godot_v4.6-stable_linux.x86_64.zip
          chmod +x Godot_v4.6-stable_linux.x86_64
          sudo mv Godot_v4.6-stable_linux.x86_64 /usr/local/bin/godot

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/

  performance-tests:
    name: Performance Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Godot
        run: |
          wget https://github.com/godotengine/godot/releases/download/4.6-stable/Godot_v4.6-stable_linux.x86_64.zip
          unzip Godot_v4.6-stable_linux.x86_64.zip
          chmod +x Godot_v4.6-stable_linux.x86_64
          sudo mv Godot_v4.6-stable_linux.x86_64 /usr/local/bin/godot

      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Start services
        run: |
          npm ci
          npm run start:test &
          godot --headless --path ./tests/fixtures/test-project &
          sleep 10

      - name: Run performance tests
        run: k6 run tests/performance/read-latency.js

      - name: Check performance thresholds
        run: |
          if [ $? -ne 0 ]; then
            echo "Performance tests failed"
            exit 1
          fi
```

### 8.2 Pre-Commit Hooks

**File**: `.husky/pre-commit`

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run unit tests (fast feedback)
npm run test:unit

# Run linting
npm run lint

# Check TypeScript types
npm run typecheck
```

**File**: `.husky/pre-push`

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run full test suite before push
npm run test:all
```

### 8.3 Coverage Reporting

**Package.json scripts**:

```json
{
  "scripts": {
    "test:unit": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test:perf": "k6 run tests/performance/*.js",
    "test:security": "vitest run tests/security/**/*.test.ts",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage && open coverage/index.html"
  }
}
```

---

## 9. Quality Gates

### 9.1 Pre-Merge Checklist

**Automated Checks** (must pass before merge):

| Check | Threshold | Blocker |
|-------|-----------|---------|
| Unit test pass rate | 100% | ✅ Yes |
| Integration test pass rate | 100% | ✅ Yes |
| Overall line coverage | ≥80% | ✅ Yes |
| Critical module coverage | 100% | ✅ Yes |
| Security tests pass | 100% | ✅ Yes |
| Linting errors | 0 | ✅ Yes |
| TypeScript errors | 0 | ✅ Yes |
| E2E critical paths | 100% | ⚠️ Warning (can override) |

**Critical Modules** (require 100% coverage):
- `src/tools/validation.ts` - Input validation
- `src/security/path-validator.ts` - Path traversal prevention
- `src/http/client.ts` - HTTP communication
- `addons/mcp-bridge/file_operations.gd` - File I/O operations

### 9.2 Pre-Release Checklist

**Manual QA** (before production release):

- [ ] All automated tests passing
- [ ] E2E smoke tests on Windows, macOS, Linux
- [ ] Performance benchmarks meet SLA (p99 <50ms reads, <200ms writes)
- [ ] Memory leak testing passes (no growth over 1hr sustained load)
- [ ] Security audit completed (OWASP Top 10 coverage)
- [ ] Load testing passes (100 concurrent users, 5min sustained)
- [ ] Documentation updated with breaking changes
- [ ] CHANGELOG.md updated with release notes
- [ ] Version numbers bumped (package.json, project.godot)
- [ ] Release notes drafted in GitHub

### 9.3 Flaky Test Management

**Policy**:
- Flaky test rate must be <0.1% (1 in 1000 runs)
- Any test failing >2 times in 100 runs is marked flaky
- Flaky tests are quarantined (moved to separate suite)
- Quarantined tests do not block CI but are tracked in dashboard
- Flaky tests must be fixed within 2 sprints or removed

**Quarantine Process**:
1. Tag test with `test.skip.flaky('test name', ...)`
2. Create GitHub issue with failure logs and reproduction steps
3. Move test to `tests/quarantine/` directory
4. Add to flaky test dashboard

**Example**:
```typescript
// tests/quarantine/flaky-http-timeout.test.ts
import { describe, it } from 'vitest';

describe.skip('Quarantined: HTTP Timeout Handling', () => {
  // Issue: #234 - Intermittent timeout failures in CI
  // Flaky rate: 3% (3 failures in 100 runs)
  // Root cause: TBD - investigating race condition in connection pool
  it.skip.flaky('should timeout after 5s', async () => {
    // Test implementation
  });
});
```

### 9.4 Test Stability Monitoring

**Dashboard Metrics** (tracked in CI):
- Pass rate by test category (unit/integration/E2E)
- Average test duration (detect performance regressions)
- Flaky test count and trend
- Coverage trend over time
- Top 10 slowest tests

**Alerting**:
- Slack notification if any critical test fails 3+ times in a row
- Email alert if coverage drops below 75%
- PagerDuty alert if E2E tests fail on `main` branch

---

## 10. Testing Workflow

### 10.1 Developer Workflow

**Local Development**:

```powershell
# 1. Run unit tests in watch mode during development
npm run test:watch

# 2. Before committing, run full unit + integration suite
npm run test:all

# 3. Check coverage
npm run coverage

# 4. Fix any failing tests before pushing
```

**Pre-Push**:
```powershell
# Automated via Husky pre-push hook
npm run test:all
npm run lint
npm run typecheck
```

### 10.2 CI/CD Workflow

**Pull Request**:
1. Trigger: PR opened/updated
2. Run: Unit tests (30s), integration tests (1.5min), E2E tests (2min)
3. Report: Coverage diff, test results, performance impact
4. Block: Merge if any tests fail or coverage decreases

**Main Branch**:
1. Trigger: Merge to `main`
2. Run: Full test suite + performance tests + security scans
3. Deploy: Staging environment if all pass
4. Monitor: Automated smoke tests in staging

**Release Branch**:
1. Trigger: Tag `v*.*.*`
2. Run: Full test suite + extended load tests
3. Manual QA: Platform-specific testing
4. Deploy: Production if manual approval

### 10.3 Test Maintenance

**Weekly**:
- Review flaky test dashboard
- Triage quarantined tests
- Update fixtures if Godot version changes

**Per Sprint**:
- Add tests for new features (TDD preferred)
- Refactor slow tests (<500ms integration, <5s E2E targets)
- Update security test vectors (new OWASP advisories)

**Per Release**:
- Audit test coverage (identify untested code paths)
- Benchmark performance (compare to previous release)
- Update test documentation

---

## 11. Success Metrics

### 11.1 Code Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Overall test coverage | ≥80% | Vitest + GUT reports |
| Critical path coverage | 100% | Manual audit |
| Defect escape rate | <5% | Production bugs / total bugs |
| Test execution time | <5min | CI pipeline duration |
| Flaky test rate | <0.1% | Automated tracking |

### 11.2 Reliability Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Tool success rate | ≥99.9% | MCP tool invocations |
| HTTP request success rate | ≥99.95% | Godot bridge responses |
| Mean time between failures | >168h (1 week) | Production monitoring |
| Mean time to recovery | <1h | Incident response time |

### 11.3 Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Read operation p99 | <50ms | k6 load tests |
| Write operation p99 | <200ms | k6 load tests |
| Throughput (read) | >1000 req/s | k6 load tests |
| Memory footprint | <100MB | Node.js process monitoring |

---

## 12. Appendix

### 12.1 Test Pyramid Justification

**Why 80% Unit Tests?**
- Unit tests are 100-1000x faster than integration/E2E tests
- Unit tests pinpoint exact failure location
- Unit tests enable TDD and refactoring confidence
- Integration/E2E tests are brittle and slow

**Why Only 5% E2E?**
- E2E tests are slow (2-5s per test)
- E2E tests are flaky (network, timing, environment)
- E2E tests are expensive to maintain
- Critical paths provide 80% of value with 20% of tests

### 12.2 Tool Recommendations

**Node.js**:
- **Vitest**: Fast, modern, Vite-native, built-in coverage
- **Playwright**: Best E2E framework (cross-browser, auto-wait, debugging)
- **k6**: Performance testing with scripting (better than JMeter)
- **Codecov**: Coverage tracking with PR comments

**Godot**:
- **GUT**: Native GDScript testing, integrated with CI
- **Godot Headless**: CI-friendly Godot execution

**CI/CD**:
- **GitHub Actions**: Native integration, free for open source
- **Husky**: Git hooks for pre-commit/pre-push checks

### 12.3 References

- [MCP Protocol Specification](https://modelcontextprotocol.io/specification/)
- [Vitest Documentation](https://vitest.dev/)
- [GUT Documentation](https://github.com/bitwes/Gut)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [Google Testing Blog - Test Pyramid](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)

---

**Document Metadata**:
- **Version**: 1.0.0
- **Last Updated**: February 4, 2026
- **Next Review**: March 4, 2026 (monthly review)
- **Owner**: @qa-engineer
- **Reviewers**: @backend-lead, @security-engineer, @devops-lead
