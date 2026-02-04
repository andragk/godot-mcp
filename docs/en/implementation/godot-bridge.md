---
title: Building the Godot Bridge
description: Step-by-step implementation of the GDScript HTTP server, JSON-RPC router, and file operation handlers
outline: [2, 3]
---

# Building the Godot Bridge

This guide shows how to implement the Godot Bridge plugin that exposes Godot Engine capabilities via HTTP JSON-RPC.

## Plugin Structure

```
addons/godot-mcp/
├── plugin.cfg              # Plugin manifest
├── plugin.gd               # Main plugin script (EditorPlugin)
├── http_server.gd          # HTTPServer wrapper
├── rpc_router.gd           # JSON-RPC method router
├── scene_manager.gd        # Scene operations
├── script_manager.gd       # Script operations
├── project_manager.gd      # Project queries
└── godot_error.gd          # Error handling
```

## Step 1: Plugin Manifest

Create `addons/godot-mcp/plugin.cfg`:

```ini
[plugin]
name="Godot MCP Bridge"
description="HTTP server exposing Godot capabilities to MCP clients"
author="Your Name"
version="1.0.0"
script="plugin.gd"
```

## Step 2: Main Plugin Script

Create `addons/godot-mcp/plugin.gd`:

```gdscript
@tool
extends EditorPlugin

var http_server: Node

func _enter_tree():
	# Load and instantiate HTTP server
	var HttpServerScript = load("res://addons/godot-mcp/http_server.gd")
	http_server = HttpServerScript.new()
	add_child(http_server)
	
	print("[MCP] Plugin enabled")

func _exit_tree():
	if http_server:
		http_server.queue_free()
	print("[MCP] Plugin disabled")
```

## Step 3: HTTP Server

Create `addons/godot-mcp/http_server.gd`:

```gdscript
extends Node

var server: TCPServer
var port: int = 7777
var connections: Array[StreamPeerTCP] = []
var max_connections: int = 5

func _ready():
	server = TCPServer.new()
	var err = server.listen(port, "127.0.0.1")
	if err != OK:
		push_error("[MCP] Failed to start HTTP server on port %d: %s" % [port, error_string(err)])
		return
	
	print("[MCP] HTTP server listening on http://127.0.0.1:%d" % port)

func _process(_delta):
	# Accept new connections
	if server.is_connection_available():
		var peer = server.take_connection()
		if connections.size() < max_connections:
			connections.append(peer)
		else:
			peer.disconnect_from_host()
	
	# Process active connections
	for i in range(connections.size() - 1, -1, -1):
		var peer = connections[i]
		
		if peer.get_status() == StreamPeerTCP.STATUS_NONE or peer.get_status() == StreamPeerTCP.STATUS_ERROR:
			connections.remove_at(i)
			continue
		
		if peer.get_available_bytes() > 0:
			handle_request(peer)

func handle_request(peer: StreamPeerTCP):
	# Read HTTP request
	var request_text = ""
	while peer.get_available_bytes() > 0:
		request_text += peer.get_string(peer.get_available_bytes())
	
	# Parse HTTP request
	var lines = request_text.split("\r\n")
	if lines.size() == 0:
		return
	
	var request_line = lines[0]
	var parts = request_line.split(" ")
	if parts.size() < 2:
		send_response(peer, 400, "Bad Request", "text/plain", "Invalid request")
		return
	
	var method = parts[0]
	var path = parts[1]
	
	# Find body (after empty line)
	var body = ""
	var body_start = false
	for line in lines:
		if body_start:
			body += line
		elif line == "":
			body_start = true
	
	# Route request
	if method == "POST" and path == "/rpc":
		handle_rpc(peer, body)
	elif method == "GET" and path == "/health":
		handle_health(peer)
	elif method == "GET" and path == "/metrics":
		handle_metrics(peer)
	else:
		send_response(peer, 404, "Not Found", "text/plain", "Endpoint not found")

func handle_rpc(peer: StreamPeerTCP, body: String):
	var json = JSON.parse_string(body)
	
	if json == null:
		send_json_rpc_error(peer, null, -32700, "Parse error")
		return
	
	if not json is Dictionary or not json.has("method"):
		send_json_rpc_error(peer, json.get("id"), -32600, "Invalid Request")
		return
	
	var method = json["method"]
	var params = json.get("params", {})
	var id = json.get("id")
	
	# Route to handler
	var result = RPCRouter.handle(method, params)
	
	# Handle errors
	if result is GodotError:
		send_json_rpc_error(peer, id, result.code, result.message, result.data)
		return
	
	# Success response
	send_json_rpc_success(peer, id, result)

func handle_health(peer: StreamPeerTCP):
	var response = {
		"status": "ok",
		"uptime_ms": Time.get_ticks_msec(),
		"godot_version": Engine.get_version_info()["string"]
	}
	send_response(peer, 200, "OK", "application/json", JSON.stringify(response))

func handle_metrics(peer: StreamPeerTCP):
	var response = {
		"connections": connections.size(),
		"max_connections": max_connections,
		"uptime_ms": Time.get_ticks_msec()
	}
	send_response(peer, 200, "OK", "application/json", JSON.stringify(response))

func send_json_rpc_success(peer: StreamPeerTCP, id, result):
	var payload = {
		"jsonrpc": "2.0",
		"result": result,
		"id": id
	}
	send_response(peer, 200, "OK", "application/json", JSON.stringify(payload))

func send_json_rpc_error(peer: StreamPeerTCP, id, code: int, message: String, data = null):
	var payload = {
		"jsonrpc": "2.0",
		"error": {
			"code": code,
			"message": message,
			"data": data
		},
		"id": id
	}
	send_response(peer, 200, "OK", "application/json", JSON.stringify(payload))

func send_response(peer: StreamPeerTCP, status_code: int, status_text: String, content_type: String, body: String):
	var response = "HTTP/1.1 %d %s\r\n" % [status_code, status_text]
	response += "Content-Type: %s\r\n" % content_type
	response += "Content-Length: %d\r\n" % body.length()
	response += "Connection: keep-alive\r\n"
	response += "\r\n"
	response += body
	
	peer.put_data(response.to_utf8_buffer())
```

## Step 4: RPC Router

Create `addons/godot-mcp/rpc_router.gd`:

```gdscript
class_name RPCRouter

static var handlers = {}

static func _static_init():
	# Register all handlers
	handlers["scene.list"] = SceneManager.list_scenes
	handlers["scene.read"] = SceneManager.read_scene
	handlers["scene.create"] = SceneManager.create_scene
	handlers["script.list"] = ScriptManager.list_scripts
	handlers["script.read"] = ScriptManager.read_script
	handlers["project.structure"] = ProjectManager.get_structure
	handlers["project.search_nodes"] = ProjectManager.search_nodes

static func handle(method: String, params: Dictionary):
	if not handlers.has(method):
		return GodotError.new(-32601, "Method not found: %s" % method)
	
	var handler = handlers[method]
	return handler.call(params)
```

## Step 5: Scene Manager

Create `addons/godot-mcp/scene_manager.gd`:

```gdscript
class_name SceneManager

static func list_scenes(params: Dictionary) -> Variant:
	var directory = params.get("directory", "")
	var recursive = params.get("recursive", true)
	var include_metadata = params.get("include_metadata", false)
	
	var scenes = []
	_scan_directory("res://" + directory, scenes, recursive, include_metadata)
	
	return {
		"scenes": scenes,
		"total_count": scenes.size()
	}

static func _scan_directory(path: String, scenes: Array, recursive: bool, include_metadata: bool):
	var dir = DirAccess.open(path)
	if dir == null:
		return
	
	dir.list_dir_begin()
	var file_name = dir.get_next()
	
	while file_name != "":
		var full_path = path + "/" + file_name
		
		if dir.current_is_dir():
			if recursive and file_name != "." and file_name != ".." and file_name != ".godot":
				_scan_directory(full_path, scenes, recursive, include_metadata)
		elif file_name.ends_with(".tscn"):
			var scene_info = {
				"path": full_path.replace("res://", ""),
				"name": file_name.get_basename()
			}
			
			if include_metadata:
				scene_info["metadata"] = _get_file_metadata(full_path)
			
			scenes.append(scene_info)
		
		file_name = dir.get_next()
	
	dir.list_dir_end()

static func _get_file_metadata(path: String) -> Dictionary:
	return {
		"file_size": FileAccess.get_file_as_bytes(path).size(),
		"modified_time": Time.get_datetime_string_from_unix_time(FileAccess.get_modified_time(path))
	}

static func read_scene(params: Dictionary) -> Variant:
	var path = params.get("path", "")
	
	if not path.ends_with(".tscn"):
		return GodotError.new(-32602, "Invalid path: must be .tscn file")
	
	var full_path = "res://" + path
	if not FileAccess.file_exists(full_path):
		return GodotError.new(404, "File not found", {"path": path})
	
	var file = FileAccess.open(full_path, FileAccess.READ)
	if file == null:
		return GodotError.new(500, "Failed to open file")
	
	var content = file.get_as_text()
	file.close()
	
	var scene_data = _parse_tscn(content)
	scene_data["path"] = path
	scene_data["metadata"] = _get_file_metadata(full_path)
	
	return scene_data

static func _parse_tscn(content: String) -> Dictionary:
	var lines = content.split("\n")
	var nodes = []
	var current_node = null
	var connections = []
	
	for line in lines:
		# Parse node headers
		if line.begins_with("[node"):
			if current_node != null:
				nodes.append(current_node)
			
			current_node = {"properties": {}, "children": []}
			
			# Extract name
			var name_regex = RegEx.new()
			name_regex.compile('name="([^"]+)"')
			var name_match = name_regex.search(line)
			if name_match:
				current_node["name"] = name_match.get_string(1)
			
			# Extract type
			var type_regex = RegEx.new()
			type_regex.compile('type="([^"]+)"')
			var type_match = type_regex.search(line)
			if type_match:
				current_node["type"] = type_match.get_string(1)
			
			# Extract parent
			var parent_regex = RegEx.new()
			parent_regex.compile('parent="([^"]+)"')
			var parent_match = parent_regex.search(line)
			current_node["parent"] = parent_match.get_string(1) if parent_match else null
		
		# Parse properties
		elif current_node != null and line.contains("="):
			var parts = line.split("=", false, 1)
			if parts.size() == 2:
				var key = parts[0].strip_edges()
				var value = parts[1].strip_edges()
				current_node["properties"][key] = value
	
	if current_node != null:
		nodes.append(current_node)
	
	return {
		"root_node": nodes[0] if nodes.size() > 0 else null,
		"connections": connections
	}

static func create_scene(params: Dictionary) -> Variant:
	var path = params.get("path", "")
	var root_node = params.get("root_node", {})
	var overwrite = params.get("overwrite", false)
	
	var full_path = "res://" + path
	
	if FileAccess.file_exists(full_path) and not overwrite:
		return GodotError.new(409, "File already exists")
	
	var content = _generate_tscn(root_node)
	
	var file = FileAccess.open(full_path, FileAccess.WRITE)
	if file == null:
		return GodotError.new(500, "Failed to create file")
	
	file.store_string(content)
	file.close()
	
	return {
		"path": path,
		"created": true,
		"message": "Scene created successfully"
	}

static func _generate_tscn(root_node: Dictionary) -> String:
	var content = "[gd_scene load_steps=1 format=3]\n\n"
	
	content += "[node name=\"%s\" type=\"%s\"]\n" % [root_node.get("name", "Root"), root_node.get("type", "Node")]
	
	if root_node.has("properties"):
		for key in root_node["properties"]:
			content += "%s = %s\n" % [key, root_node["properties"][key]]
	
	# Add children recursively
	if root_node.has("children"):
		for child in root_node["children"]:
			content += "\n" + _generate_node(child, root_node["name"])
	
	return content

static func _generate_node(node: Dictionary, parent: String) -> String:
	var content = "[node name=\"%s\" type=\"%s\" parent=\"%s\"]\n" % [
		node.get("name", "Node"),
		node.get("type", "Node"),
		parent
	]
	
	if node.has("properties"):
		for key in node["properties"]:
			content += "%s = %s\n" % [key, node["properties"][key]]
	
	return content
```

## Step 6: Error Handling

Create `addons/godot-mcp/godot_error.gd`:

```gdscript
class_name GodotError

var code: int
var message: String
var data: Variant

func _init(p_code: int, p_message: String, p_data: Variant = null):
	code = p_code
	message = p_message
	data = p_data
```

## Step 7: Enable Plugin

1. Open Godot Editor
2. Go to **Project → Project Settings → Plugins**
3. Enable **Godot MCP Bridge**
4. Check Output panel for "HTTP server listening on http://127.0.0.1:7777"

## Testing

### Test Health Endpoint

```powershell
curl http://localhost:7777/health
```

Expected:
```json
{"status":"ok","uptime_ms":12345,"godot_version":"4.6.0.stable"}
```

### Test RPC Endpoint

```powershell
curl -X POST http://localhost:7777/rpc `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","method":"scene.list","params":{},"id":1}'
```

Expected:
```json
{
  "jsonrpc":"2.0",
  "result": {
    "scenes": [...],
    "total_count": 5
  },
  "id":1
}
```

## Next Steps

- [Web UI Implementation](/en/implementation/web-ui) - Build the dashboard
- [Testing Guide](/en/implementation/testing) - Comprehensive testing
- [Deployment](/en/implementation/deployment) - Package the plugin

:::tip Performance Tips
- Keep `_process()` lightweight - use polling for HTTP
- Cache parsed scenes to avoid repeated file I/O
- Use `@tool` only for EditorPlugin, not for runtime scripts
- Monitor memory usage with `Performance` singleton
:::
