---
title: Godot Bridge implementieren
description: Schritt-für-Schritt-Anleitung zur Implementierung des GDScript HTTP Servers und JSON-RPC Handlers
outline: [2, 3]
---

# Godot Bridge implementieren

Diese Anleitung führt durch die Implementierung der Godot Bridge-Komponente - des GDScript HTTP Servers, der JSON-RPC-Anfragen verarbeitet und Zugriff auf Godot Engine-Interna bietet.

## Projektstruktur

```
addons/mcp_bridge/
├── plugin.cfg                 # Godot Plugin-Konfiguration
├── mcp_bridge.gd             # Haupt-Plugin-Einstiegspunkt
├── http_server.gd            # HTTP-Server-Implementation
├── rpc_handler.gd            # JSON-RPC Request-Handler
├── handlers/
│   ├── scene_handler.gd      # Scene-Operationen
│   ├── script_handler.gd     # Script-Lese-Operationen
│   └── project_handler.gd    # Projektstruktur-Queries
└── utils/
    ├── scene_parser.gd       # .tscn Parser
    └── response_builder.gd   # JSON-Antwort-Builder
```

## Schritt 1: Plugin-Konfiguration

### Plugin-Manifest

`addons/mcp_bridge/plugin.cfg` erstellen:

```ini
[plugin]
name="MCP Bridge"
description="HTTP Server für Model Context Protocol Integration"
author="Ihr Name"
version="1.0.0"
script="mcp_bridge.gd"
```

### Haupt-Plugin-Skript

`addons/mcp_bridge/mcp_bridge.gd` erstellen:

```gdscript
@tool
extends EditorPlugin

const HttpServer = preload("res://addons/mcp_bridge/http_server.gd")

var server: HttpServer

func _enter_tree() -> void:
	server = HttpServer.new()
	add_child(server)
	
	if server.start(7777):
		print("MCP Bridge Server gestartet auf Port 7777")
	else:
		push_error("MCP Bridge Server konnte nicht gestartet werden")

func _exit_tree() -> void:
	if server:
		server.stop()
		remove_child(server)
		server.queue_free()
```

## Schritt 2: HTTP Server-Implementierung

### HTTP Server

`addons/mcp_bridge/http_server.gd` erstellen:

```gdscript
extends Node
class_name HttpServer

const RpcHandler = preload("res://addons/mcp_bridge/rpc_handler.gd")

var tcp_server: TCPServer
var connections: Array[StreamPeerTCP] = []
var rpc_handler: RpcHandler
var port: int = 7777
var is_running: bool = false

func _ready() -> void:
	tcp_server = TCPServer.new()
	rpc_handler = RpcHandler.new()
	add_child(rpc_handler)

func start(listen_port: int = 7777) -> bool:
	port = listen_port
	var err = tcp_server.listen(port, "127.0.0.1")
	
	if err != OK:
		push_error("Port %d konnte nicht gebunden werden: %s" % [port, error_string(err)])
		return false
	
	is_running = true
	set_process(true)
	return true

func stop() -> void:
	is_running = false
	set_process(false)
	
	for connection in connections:
		connection.disconnect_from_host()
	connections.clear()
	
	tcp_server.stop()

func _process(_delta: float) -> void:
	if not is_running:
		return
	
	# Neue Verbindungen akzeptieren
	if tcp_server.is_connection_available():
		var connection = tcp_server.take_connection()
		connections.append(connection)
	
	# Bestehende Verbindungen verarbeiten
	var i = 0
	while i < connections.size():
		var connection = connections[i]
		
		if connection.get_status() != StreamPeerTCP.STATUS_CONNECTED:
			connections.remove_at(i)
			continue
		
		if connection.get_available_bytes() > 0:
			_handle_request(connection)
		
		i += 1

func _handle_request(connection: StreamPeerTCP) -> void:
	var request_data = connection.get_utf8_string(connection.get_available_bytes())
	
	# HTTP-Request parsen
	var lines = request_data.split("\r\n")
	if lines.size() < 1:
		_send_response(connection, 400, "Bad Request")
		return
	
	var request_line = lines[0].split(" ")
	if request_line.size() < 3:
		_send_response(connection, 400, "Bad Request")
		return
	
	var method = request_line[0]
	var path = request_line[1]
	
	# Body extrahieren
	var body_start = request_data.find("\r\n\r\n")
	var body = ""
	if body_start != -1:
		body = request_data.substr(body_start + 4)
	
	# Request routen
	match path:
		"/health":
			_handle_health(connection, method)
		"/rpc":
			_handle_rpc(connection, method, body)
		_:
			_send_response(connection, 404, "Not Found")

func _handle_health(connection: StreamPeerTCP, method: String) -> void:
	if method != "GET":
		_send_response(connection, 405, "Method Not Allowed")
		return
	
	_send_json_response(connection, 200, {"status": "healthy", "version": "1.0.0"})

func _handle_rpc(connection: StreamPeerTCP, method: String, body: String) -> void:
	if method != "POST":
		_send_response(connection, 405, "Method Not Allowed")
		return
	
	# JSON-RPC-Request verarbeiten
	var json = JSON.new()
	var parse_result = json.parse(body)
	
	if parse_result != OK:
		var error_response = {
			"jsonrpc": "2.0",
			"error": {"code": -32700, "message": "Parse error"},
			"id": null
		}
		_send_json_response(connection, 200, error_response)
		return
	
	var request = json.data
	
	# JSON-RPC-Request validieren
	if not request.has("jsonrpc") or request.jsonrpc != "2.0":
		var error_response = {
			"jsonrpc": "2.0",
			"error": {"code": -32600, "message": "Invalid Request"},
			"id": request.get("id")
		}
		_send_json_response(connection, 200, error_response)
		return
	
	# Handler delegieren
	var response = await rpc_handler.handle(request)
	_send_json_response(connection, 200, response)

func _send_response(connection: StreamPeerTCP, status_code: int, body: String) -> void:
	var status_text = _get_status_text(status_code)
	var response = "HTTP/1.1 %d %s\r\n" % [status_code, status_text]
	response += "Content-Type: text/plain\r\n"
	response += "Content-Length: %d\r\n" % body.length()
	response += "Connection: close\r\n"
	response += "\r\n"
	response += body
	
	connection.put_data(response.to_utf8_buffer())
	connection.disconnect_from_host()

func _send_json_response(connection: StreamPeerTCP, status_code: int, data: Dictionary) -> void:
	var json_body = JSON.stringify(data)
	var status_text = _get_status_text(status_code)
	
	var response = "HTTP/1.1 %d %s\r\n" % [status_code, status_text]
	response += "Content-Type: application/json\r\n"
	response += "Content-Length: %d\r\n" % json_body.length()
	response += "Access-Control-Allow-Origin: *\r\n"
	response += "Connection: close\r\n"
	response += "\r\n"
	response += json_body
	
	connection.put_data(response.to_utf8_buffer())
	connection.disconnect_from_host()

func _get_status_text(code: int) -> String:
	match code:
		200: return "OK"
		400: return "Bad Request"
		404: return "Not Found"
		405: return "Method Not Allowed"
		500: return "Internal Server Error"
		_: return "Unknown"
```

## Schritt 3: JSON-RPC Handler

### RPC Handler

`addons/mcp_bridge/rpc_handler.gd` erstellen:

```gdscript
extends Node
class_name RpcHandler

const SceneHandler = preload("res://addons/mcp_bridge/handlers/scene_handler.gd")
const ScriptHandler = preload("res://addons/mcp_bridge/handlers/script_handler.gd")
const ProjectHandler = preload("res://addons/mcp_bridge/handlers/project_handler.gd")

var scene_handler: SceneHandler
var script_handler: ScriptHandler
var project_handler: ProjectHandler

func _ready() -> void:
	scene_handler = SceneHandler.new()
	script_handler = ScriptHandler.new()
	project_handler = ProjectHandler.new()
	
	add_child(scene_handler)
	add_child(script_handler)
	add_child(project_handler)

func handle(request: Dictionary) -> Dictionary:
	var method = request.get("method", "")
	var params = request.get("params", {})
	var id = request.get("id")
	
	# Methoden-Namespaces routen
	var parts = method.split(".", false, 1)
	if parts.size() != 2:
		return _error_response(-32601, "Method not found", id)
	
	var namespace = parts[0]
	var action = parts[1]
	
	var result
	match namespace:
		"scene":
			result = await _handle_scene(action, params)
		"script":
			result = await _handle_script(action, params)
		"project":
			result = await _handle_project(action, params)
		_:
			return _error_response(-32601, "Unknown namespace: %s" % namespace, id)
	
	if result is Dictionary and result.has("_error"):
		return _error_response(result._error.code, result._error.message, id)
	
	return _success_response(result, id)

func _handle_scene(action: String, params: Dictionary) -> Variant:
	match action:
		"list":
			return scene_handler.list_scenes(params)
		"read":
			return await scene_handler.read_scene(params)
		"create":
			return scene_handler.create_scene(params)
		_:
			return {"_error": {"code": -32601, "message": "Unknown scene action"}}

func _handle_script(action: String, params: Dictionary) -> Variant:
	match action:
		"list":
			return script_handler.list_scripts(params)
		"read":
			return script_handler.read_script(params)
		_:
			return {"_error": {"code": -32601, "message": "Unknown script action"}}

func _handle_project(action: String, params: Dictionary) -> Variant:
	match action:
		"structure":
			return project_handler.get_structure(params)
		"search_nodes":
			return project_handler.search_nodes(params)
		_:
			return {"_error": {"code": -32601, "message": "Unknown project action"}}

func _success_response(result: Variant, id: Variant) -> Dictionary:
	return {
		"jsonrpc": "2.0",
		"result": result,
		"id": id
	}

func _error_response(code: int, message: String, id: Variant) -> Dictionary:
	return {
		"jsonrpc": "2.0",
		"error": {"code": code, "message": message},
		"id": id
	}
```

## Schritt 4: Handler-Implementierungen

### Scene Handler

`addons/mcp_bridge/handlers/scene_handler.gd` erstellen:

```gdscript
extends Node
class_name SceneHandler

const SceneParser = preload("res://addons/mcp_bridge/utils/scene_parser.gd")

func list_scenes(params: Dictionary) -> Dictionary:
	var directory = params.get("directory", "res://")
	var recursive = params.get("recursive", true)
	
	var scenes: Array[String] = []
	_scan_directory(directory, scenes, recursive)
	
	return {
		"scenes": scenes,
		"count": scenes.size()
	}

func read_scene(params: Dictionary) -> Dictionary:
	var path = params.get("path", "")
	
	if not FileAccess.file_exists(path):
		return {"_error": {"code": 404, "message": "Scene not found"}}
	
	var parser = SceneParser.new()
	var scene_data = parser.parse(path)
	
	return scene_data

func create_scene(params: Dictionary) -> Dictionary:
	var path = params.get("path", "")
	var root_type = params.get("root_type", "Node")
	
	# Neue Scene erstellen
	var scene = Node.new()
	scene.name = path.get_file().get_basename()
	
	var packed_scene = PackedScene.new()
	packed_scene.pack(scene)
	
	var err = ResourceSaver.save(packed_scene, path)
	scene.queue_free()
	
	if err != OK:
		return {"_error": {"code": 500, "message": "Failed to create scene"}}
	
	return {"success": true, "path": path}

func _scan_directory(path: String, scenes: Array[String], recursive: bool) -> void:
	var dir = DirAccess.open(path)
	if not dir:
		return
	
	dir.list_dir_begin()
	var file_name = dir.get_next()
	
	while file_name != "":
		if file_name.begins_with("."):
			file_name = dir.get_next()
			continue
		
		var full_path = path.path_join(file_name)
		
		if dir.current_is_dir():
			if recursive:
				_scan_directory(full_path, scenes, recursive)
		elif file_name.ends_with(".tscn"):
			scenes.append(full_path)
		
		file_name = dir.get_next()
	
	dir.list_dir_end()
```

## Schritt 5: Plugin aktivieren

1. Godot Editor öffnen
2. **Projekt → Projekteinstellungen → Plugins** navigieren
3. **MCP Bridge** aktivieren
4. Konsolenausgabe prüfen: "MCP Bridge Server gestartet auf Port 7777"

## Testen

### cURL verwenden

```powershell
# Health-Check
curl http://localhost:7777/health

# JSON-RPC aufrufen
curl -X POST http://localhost:7777/rpc `
  -H "Content-Type: application/json" `
  -d '{\"jsonrpc\":\"2.0\",\"method\":\"scene.list\",\"params\":{},\"id\":1}'
```

### Von Node.js testen

```typescript
import { GodotClient } from './infrastructure/godot-client';

const client = new GodotClient();
const scenes = await client.call('scene.list', {});
console.log(scenes);
```

## Fehlerbehebung

:::warning Häufige Probleme
**Port bereits in Verwendung**: Prüfen, ob ein anderer Prozess Port 7777 verwendet
```powershell
netstat -ano | findstr :7777
```

**Plugin nicht geladen**: Godot Editor neu starten und Plugin-Fehler prüfen

**Verbindung abgelehnt**: Firewall-Einstellungen für localhost:7777 prüfen
:::

## Nächste Schritte

- [Web UI implementieren](/de/implementation/web-ui) - Sidecar Dashboard erstellen
- [Tests schreiben](/de/implementation/testing) - Bridge-Komponenten testen
- [API-Referenz](/de/api/godot-bridge) - Vollständiger JSON-RPC-Methodenkatalog
