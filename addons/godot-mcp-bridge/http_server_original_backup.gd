extends Node

## HTTP Server for Godot MCP Bridge
## Implements JSON-RPC 2.0 protocol over HTTP

const PORT := 7777
const VERSION := "0.1.0"

enum LogLevel {
	DEBUG,
	INFO,
	WARN,
	ERROR
}

var server: TCPServer
var clients: Array[StreamPeerTCP] = []
var start_time: int

func _ready() -> void:
	start_time = Time.get_ticks_msec()
	server = TCPServer.new()
	
	var err := server.listen(PORT)
	if err != OK:
		log_message(LogLevel.ERROR, "Failed to start server on port %d: %s" % [PORT, error_string(err)])
		return
	
	log_message(LogLevel.INFO, "HTTP server started on port %d" % PORT)
	set_process(true)

func _process(_delta: float) -> void:
	# Accept new connections
	if server.is_connection_available():
		var client := server.take_connection()
		clients.append(client)
		log_message(LogLevel.DEBUG, "New client connected")
	
	# Process existing clients
	var i := 0
	while i < clients.size():
		var client := clients[i]
		
		if client.get_status() == StreamPeerTCP.STATUS_CONNECTED:
			if client.get_available_bytes() > 0:
				_handle_client_request(client)
			i += 1
		else:
			# Client disconnected
			clients.remove_at(i)
			log_message(LogLevel.DEBUG, "Client disconnected")

func _handle_client_request(client: StreamPeerTCP) -> void:
	var request := client.get_utf8_string(client.get_available_bytes())
	
	# Parse HTTP request
	var lines := request.split("\r\n")
	if lines.is_empty():
		return
	
	var request_line := lines[0].split(" ")
	if request_line.size() < 2:
		_send_error_response(client, 400, "Bad Request")
		return
	
	var method := request_line[0]
	var path := request_line[1]
	
	# Route the request
	match path:
		"/health":
			if method == "GET":
				_handle_health(client)
			else:
				_send_error_response(client, 405, "Method Not Allowed")
		
		"/version":
			if method == "GET":
				_handle_version(client)
			else:
				_send_error_response(client, 405, "Method Not Allowed")
		
		"/rpc":
			if method == "POST":
				_handle_rpc(client, request)
			else:
				_send_error_response(client, 405, "Method Not Allowed")
		
		_:
			_send_error_response(client, 404, "Not Found")

func _handle_health(client: StreamPeerTCP) -> void:
	var uptime := (Time.get_ticks_msec() - start_time) / 1000
	var response := {
		"status": "healthy",
		"port": PORT,
		"uptime": uptime,
		"version": VERSION
	}
	_send_json_response(client, 200, response)

func _handle_version(client: StreamPeerTCP) -> void:
	var response := {
		"version": VERSION,
		"godot_version": Engine.get_version_info().string
	}
	_send_json_response(client, 200, response)

func _handle_rpc(client: StreamPeerTCP, request: String) -> void:
	# Extract JSON body from HTTP request
	var body_start := request.find("\r\n\r\n")
	if body_start == -1:
		_send_error_response(client, 400, "Bad Request: No body")
		return
	
	var body := request.substr(body_start + 4)
	
	# Parse JSON-RPC request
	var json := JSON.new()
	var parse_error := json.parse(body)
	
	if parse_error != OK:
		var error_response := _create_jsonrpc_error(-32700, "Parse error", null)
		_send_json_response(client, 200, error_response)
		return
	
	var rpc_request: Variant = json.data
	
	# Validate JSON-RPC 2.0 structure
	if not _is_valid_jsonrpc_request(rpc_request):
		var error_response := _create_jsonrpc_error(-32600, "Invalid Request", null)
		_send_json_response(client, 200, error_response)
		return
	
	# Process the RPC method
	var response := _process_rpc_method(rpc_request)
	_send_json_response(client, 200, response)

func _is_valid_jsonrpc_request(request: Variant) -> bool:
	if typeof(request) != TYPE_DICTIONARY:
		return false
	
	var req := request as Dictionary
	
	if not req.has("jsonrpc") or req.jsonrpc != "2.0":
		return false
	
	if not req.has("method") or typeof(req.method) != TYPE_STRING:
		return false
	
	if not req.has("id"):
		return false
	
	return true

func _process_rpc_method(request: Dictionary) -> Dictionary:
	var method := request.method as String
	var id: Variant = request.id
	var params: Variant = request.get("params")
	
	log_message(LogLevel.DEBUG, "Processing RPC method: %s" % method)
	
	# Handle different RPC methods
	match method:
		"ping":
			return _create_jsonrpc_response(id, {"status": "pong"})
		
		"get_engine_info":
			var info := {
				"version": Engine.get_version_info(),
				"fps": Engine.get_frames_per_second(),
				"time_scale": Engine.time_scale
			}
			return _create_jsonrpc_response(id, info)
		
		"get_project_settings":
			if params and typeof(params) == TYPE_DICTIONARY:
				var setting_name: String = params.get("name", "")
				if setting_name:
					var value := ProjectSettings.get_setting(setting_name)
					return _create_jsonrpc_response(id, {"value": value})
			return _create_jsonrpc_error(-32602, "Invalid params", id)
		
		"launch_editor":
			return _handle_launch_editor(id, params)
		
		"run_project":
			return _handle_run_project(id, params)
		
		"stop_execution":
			return _handle_stop_execution(id, params)
		
		"get_godot_version":
			return _handle_get_godot_version(id, params)
		
		"list_projects":
			return _handle_list_projects(id, params)
		
		"analyze_project":
			return _handle_analyze_project(id, params)
		
		_:
			return _create_jsonrpc_error(-32601, "Method not found: %s" % method, id)

## Editor Control Tool Handlers

func _handle_launch_editor(id: Variant, params: Variant) -> Dictionary:
	if not params or typeof(params) != TYPE_DICTIONARY:
		return _create_jsonrpc_error(-32602, "Invalid params", id)
	
	var project_path: String = params.get("project_path", "")
	var editor_path: String = params.get("editor_path", "")
	var additional_args: Array = params.get("additional_args", [])
	
	if project_path.is_empty():
		return _create_jsonrpc_error(-32602, "project_path is required", id)
	
	# Detect Godot executable
	if editor_path.is_empty():
		editor_path = _detect_godot_executable()
	
	if editor_path.is_empty():
		return _create_jsonrpc_error(-32000, "Godot executable not found", id)
	
	# Build command arguments
	var args: PackedStringArray = PackedStringArray(["--path", project_path])
	for arg in additional_args:
		args.append(str(arg))
	
	# Launch the editor process
	var pid := OS.create_process(editor_path, args)
	
	if pid == -1:
		return _create_jsonrpc_error(-32000, "Failed to launch editor", id)
	
	log_message(LogLevel.INFO, "Launched Godot editor with PID: %d" % pid)
	
	return _create_jsonrpc_response(id, {
		"success": true,
		"processId": pid,
		"editorPath": editor_path,
		"projectPath": project_path
	})

func _handle_run_project(id: Variant, params: Variant) -> Dictionary:
	if not params or typeof(params) != TYPE_DICTIONARY:
		return _create_jsonrpc_error(-32602, "Invalid params", id)
	
	var project_path: String = params.get("project_path", "")
	var scene: String = params.get("scene", "")
	var debug: bool = params.get("debug", true)
	
	if project_path.is_empty():
		return _create_jsonrpc_error(-32602, "project_path is required", id)
	
	var editor_path := _detect_godot_executable()
	if editor_path.is_empty():
		return _create_jsonrpc_error(-32000, "Godot executable not found", id)
	
	# Build command arguments
	var args: PackedStringArray = PackedStringArray(["--path", project_path])
	
	if debug:
		args.append("--debug")
	
	if not scene.is_empty():
		args.append(scene)
	
	# Launch the project
	var pid := OS.create_process(editor_path, args)
	
	if pid == -1:
		return _create_jsonrpc_error(-32000, "Failed to run project", id)
	
	log_message(LogLevel.INFO, "Started Godot project with PID: %d" % pid)
	
	return _create_jsonrpc_response(id, {
		"success": true,
		"processId": pid,
		"projectPath": project_path,
		"debug": debug,
		"scene": scene
	})

func _handle_stop_execution(id: Variant, params: Variant) -> Dictionary:
	if not params or typeof(params) != TYPE_DICTIONARY:
		return _create_jsonrpc_error(-32602, "Invalid params", id)
	
	var process_id: int = params.get("process_id", -1)
	var force: bool = params.get("force", false)
	
	if process_id == -1:
		return _create_jsonrpc_error(-32602, "process_id is required", id)
	
	# Note: GDScript doesn't have direct process kill functionality
	# This would need OS-specific implementation or external tool
	log_message(LogLevel.WARN, "Process termination not fully supported in GDScript")
	
	return _create_jsonrpc_response(id, {
		"success": false,
		"message": "Process termination requires OS-specific implementation",
		"processId": process_id
	})

func _handle_get_godot_version(id: Variant, _params: Variant) -> Dictionary:
	var version_info := Engine.get_version_info()
	
	return _create_jsonrpc_response(id, {
		"version": "%d.%d.%d" % [version_info.major, version_info.minor, version_info.patch],
		"versionString": version_info.string,
		"status": version_info.status,
		"build": version_info.build,
		"hash": version_info.hash,
		"year": version_info.year
	})

func _handle_list_projects(id: Variant, params: Variant) -> Dictionary:
	if not params or typeof(params) != TYPE_DICTIONARY:
		return _create_jsonrpc_error(-32602, "Invalid params", id)
	
	var search_paths: Array = params.get("search_paths", [])
	var recursive: bool = params.get("recursive", false)
	
	if search_paths.is_empty():
		return _create_jsonrpc_error(-32602, "search_paths is required", id)
	
	var projects: Array = []
	
	for search_path in search_paths:
		var path := str(search_path)
		projects.append_array(_find_projects_in_directory(path, recursive))
	
	return _create_jsonrpc_response(id, {"projects": projects})

func _handle_analyze_project(id: Variant, params: Variant) -> Dictionary:
	if not params or typeof(params) != TYPE_DICTIONARY:
		return _create_jsonrpc_error(-32602, "Invalid params", id)
	
	var project_path: String = params.get("project_path", "")
	
	if project_path.is_empty():
		return _create_jsonrpc_error(-32602, "project_path is required", id)
	
	# Check if project.godot exists
	var project_file := project_path.path_join("project.godot")
	if not FileAccess.file_exists(project_file):
		return _create_jsonrpc_error(-32000, "project.godot not found", id)
	
	# Analyze project structure
	var analysis := _analyze_project_structure(project_path)
	
	return _create_jsonrpc_response(id, analysis)

## Helper Functions

func _detect_godot_executable() -> String:
	# Try common Godot executable locations
	var possible_paths: Array = []
	
	if OS.get_name() == "Windows":
		possible_paths = [
			"C:/Program Files/Godot/Godot.exe",
			"C:/Program Files (x86)/Godot/Godot.exe",
			"C:/Godot/Godot.exe",
			OS.get_executable_path()
		]
	elif OS.get_name() == "macOS":
		possible_paths = [
			"/Applications/Godot.app/Contents/MacOS/Godot",
			OS.get_executable_path()
		]
	else:  # Linux
		possible_paths = [
			"/usr/local/bin/godot",
			"/usr/bin/godot",
			"/opt/godot/godot",
			OS.get_executable_path()
		]
	
	for path in possible_paths:
		if FileAccess.file_exists(path):
			return path
	
	return ""

func _find_projects_in_directory(dir_path: String, recursive: bool, depth: int = 0) -> Array:
	var projects: Array = []
	var max_depth := 3
	
	if depth > max_depth:
		return projects
	
	var dir := DirAccess.open(dir_path)
	if not dir:
		return projects
	
	dir.list_dir_begin()
	var file_name := dir.get_next()
	
	while file_name != "":
		if file_name == "." or file_name == "..":
			file_name = dir.get_next()
			continue
		
		var full_path := dir_path.path_join(file_name)
		
		if dir.current_is_dir():
			if recursive:
				projects.append_array(_find_projects_in_directory(full_path, recursive, depth + 1))
		elif file_name == "project.godot":
			var project_name := _get_project_name(full_path)
			projects.append({
				"path": dir_path,
				"name": project_name
			})
		
		file_name = dir.get_next()
	
	dir.list_dir_end()
	return projects

func _get_project_name(project_file_path: String) -> String:
	var config := ConfigFile.new()
	var err := config.load(project_file_path)
	
	if err != OK:
		return "Unknown"
	
	return config.get_value("application", "config/name", "Unnamed Project")

func _analyze_project_structure(project_path: String) -> Dictionary:
	var scenes := _count_files_by_extension(project_path, ".tscn")
	var scripts := _count_files_by_extension(project_path, ".gd")
	var resources := _count_files_by_extension(project_path, ".tres")
	
	var project_file := project_path.path_join("project.godot")
	var config := ConfigFile.new()
	config.load(project_file)
	
	var project_name := config.get_value("application", "config/name", "Unknown")
	var godot_version := config.get_value("application", "config/features", PackedStringArray())
	
	return {
		"name": project_name,
		"godotVersion": str(godot_version),
		"scenes": scenes,
		"scripts": scripts,
		"resources": resources,
		"path": project_path
	}

func _count_files_by_extension(dir_path: String, extension: String) -> int:
	var count := 0
	var dir := DirAccess.open(dir_path)
	
	if not dir:
		return count
	
	dir.list_dir_begin()
	var file_name := dir.get_next()
	
	while file_name != "":
		if file_name == "." or file_name == "..":
			file_name = dir.get_next()
			continue
		
		var full_path := dir_path.path_join(file_name)
		
		if dir.current_is_dir():
			count += _count_files_by_extension(full_path, extension)
		elif file_name.ends_with(extension):
			count += 1
		
		file_name = dir.get_next()
	
	dir.list_dir_end()
	return count

func _create_jsonrpc_response(id: Variant, result: Variant) -> Dictionary:
	return {
		"jsonrpc": "2.0",
		"id": id,
		"result": result
	}

func _create_jsonrpc_error(code: int, message: String, id: Variant) -> Dictionary:
	return {
		"jsonrpc": "2.0",
		"id": id,
		"error": {
			"code": code,
			"message": message
		}
	}

func _send_json_response(client: StreamPeerTCP, status_code: int, data: Dictionary) -> void:
	var json := JSON.stringify(data)
	var status_text := _get_status_text(status_code)
	
	var response := "HTTP/1.1 %d %s\r\n" % [status_code, status_text]
	response += "Content-Type: application/json\r\n"
	response += "Content-Length: %d\r\n" % json.length()
	response += "Connection: close\r\n"
	response += "Access-Control-Allow-Origin: *\r\n"
	response += "\r\n"
	response += json
	
	var buffer := response.to_utf8_buffer()
	client.put_data(buffer)
	client.disconnect_from_host()

func _send_error_response(client: StreamPeerTCP, status_code: int, message: String) -> void:
	var status_text := _get_status_text(status_code)
	
	var response := "HTTP/1.1 %d %s\r\n" % [status_code, status_text]
	response += "Content-Type: text/plain\r\n"
	response += "Content-Length: %d\r\n" % message.length()
	response += "Connection: close\r\n"
	response += "\r\n"
	response += message
	
	var buffer := response.to_utf8_buffer()
	client.put_data(buffer)
	client.disconnect_from_host()

func _get_status_text(code: int) -> String:
	match code:
		200: return "OK"
		400: return "Bad Request"
		404: return "Not Found"
		405: return "Method Not Allowed"
		500: return "Internal Server Error"
		503: return "Service Unavailable"
		_: return "Unknown"

func log_message(level: LogLevel, message: String) -> void:
	var level_str := ""
	match level:
		LogLevel.DEBUG: level_str = "DEBUG"
		LogLevel.INFO: level_str = "INFO"
		LogLevel.WARN: level_str = "WARN"
		LogLevel.ERROR: level_str = "ERROR"
	
	var timestamp := Time.get_datetime_string_from_system()
	print("[%s] [%s] %s" % [timestamp, level_str, message])

func _exit_tree() -> void:
	# Clean up server and clients
	for client in clients:
		client.disconnect_from_host()
	
	clients.clear()
	
	if server:
		server.stop()
	
	log_message(LogLevel.INFO, "HTTP server stopped")
