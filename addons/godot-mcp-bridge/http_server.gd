extends Node

## HTTP Server for Godot MCP Bridge
##
## WHY: Coordinates TCP server management and delegates HTTP/JSON-RPC
## handling to specialized classes following Single Responsibility Principle.
##
## ARCHITECTURE: This class only handles:
## - TCP server lifecycle (start/stop)
## - Client connection management  
## - Delegating requests to specialized handlers
##
## All other responsibilities are delegated to:
## - MCPLogger: Logging
## - HTTPRequestParser: HTTP parsing
## - HTTPResponseBuilder: HTTP response building
## - JSONRPCHandler: JSON-RPC protocol handling
## - EditorControlHandler: Editor control operations
## - ProjectDiscoveryHandler: Project discovery and analysis

const PORT := 7777
const VERSION := "0.1.0"

## Core components
var server: TCPServer
var clients: Array[StreamPeerTCP] = []
var start_time: int

## Specialized handlers (following SRP)
var logger: MCPLogger
var request_parser: HTTPRequestParser
var response_builder: HTTPResponseBuilder
var jsonrpc_handler: JSONRPCHandler
var editor_handler: EditorControlHandler
var project_handler: ProjectDiscoveryHandler


func _ready() -> void:
	start_time = Time.get_ticks_msec()
	
	# WHY: Initialize all specialized handlers first
	# Dependency injection pattern makes testing easier
	_initialize_handlers()
	
	# WHY: Start TCP server on configured port
	server = TCPServer.new()
	var err := server.listen(PORT)
	
	if err != OK:
		logger.error("Failed to start server", {
			"port": PORT,
			"error": error_string(err)
		})
		return
	
	logger.info("HTTP server started", {"port": PORT})
	set_process(true)


## Initialize all handler classes
##
## WHY: Separates initialization logic from _ready() for clarity.
## Makes dependency injection explicit and testable.
func _initialize_handlers() -> void:
	logger = MCPLogger.new()
	request_parser = HTTPRequestParser.new()
	response_builder = HTTPResponseBuilder.new()
	jsonrpc_handler = JSONRPCHandler.new()
	editor_handler = EditorControlHandler.new(logger)
	project_handler = ProjectDiscoveryHandler.new(logger)


func _process(_delta: float) -> void:
	# Accept new client connections
	# WHY: TCP servers need to actively accept incoming connections
	if server.is_connection_available():
		var client := server.take_connection()
		clients.append(client)
		logger.debug("New client connected")
	
	# Process existing clients
	# WHY: Process clients in reverse order to safely remove disconnected ones
	var i := 0
	while i < clients.size():
		var client := clients[i]
		
		if client.get_status() == StreamPeerTCP.STATUS_CONNECTED:
			# WHY: Only process if data is available to avoid blocking
			if client.get_available_bytes() > 0:
				_handle_client_request(client)
			i += 1
		else:
			# Client disconnected - remove from list
			# WHY: Remove disconnected clients to prevent memory leaks
			clients.remove_at(i)
			logger.debug("Client disconnected")


## Handle incoming client request
##
## WHY: Coordinates request processing by delegating to specialized handlers.
## This method orchestrates the request/response cycle.
func _handle_client_request(client: StreamPeerTCP) -> void:
	# Read request data
	var request_string := client.get_utf8_string(client.get_available_bytes())
	
	# Parse HTTP request using specialized parser
	# WHY: Parsing is complex - delegating to HTTPRequestParser follows SRP
	var parsed_request := request_parser.parse(request_string)
	
	if not parsed_request.is_valid:
		logger.warn("Invalid HTTP request", {"error": parsed_request.error_message})
		_send_response(client, response_builder.build_error_response(400, "Bad Request"))
		return
	
	# Route request to appropriate handler
	# WHY: Routing logic centralized here for easy overview
	_route_request(client, parsed_request)


## Route HTTP request to appropriate handler
##
## WHY: Centralizes routing logic - easy to see all available endpoints
## and add new ones without modifying handler classes.
func _route_request(client: StreamPeerTCP, request: HTTPRequestParser.ParsedRequest) -> void:
	match request.path:
		"/health":
			if request.method == "GET":
				_handle_health(client)
			else:
				_send_error(client, 405, "Method Not Allowed")
		
		"/version":
			if request.method == "GET":
				_handle_version(client)
			else:
				_send_error(client, 405, "Method Not Allowed")
		
		"/rpc":
			if request.method == "POST":
				_handle_rpc(client, request.body)
			else:
				_send_error(client, 405, "Method Not Allowed")
		
		_:
			_send_error(client, 404, "Not Found")


## Health check endpoint
##
## WHY: Standard health endpoint for monitoring and load balancers
func _handle_health(client: StreamPeerTCP) -> void:
	var uptime := (Time.get_ticks_msec() - start_time) / 1000
	
	var response_data := {
		"status": "healthy",
		"port": PORT,
		"uptime": uptime,
		"version": VERSION
	}
	
	_send_json(client, 200, response_data)


## Version information endpoint
##
## WHY: Clients need to know server and Godot versions for compatibility
func _handle_version(client: StreamPeerTCP) -> void:
	var response_data := {
		"version": VERSION,
		"godot_version": Engine.get_version_info().string
	}
	
	_send_json(client, 200, response_data)


## JSON-RPC endpoint handler
##
## WHY: Delegates JSON-RPC processing to specialized handler and router
func _handle_rpc(client: StreamPeerTCP, body: String) -> void:
	# Parse JSON body
	# WHY: JSON parsing delegated to JSONRPCHandler for consistency
	var rpc_request: Variant = jsonrpc_handler.parse_json(body)
	
	if rpc_request == null:
		var error_response := jsonrpc_handler.create_error(
			jsonrpc_handler.PARSE_ERROR,
			"Parse error",
			null
		)
		_send_json(client, 200, error_response)
		return
	
	# Validate JSON-RPC structure
	# WHY: Validation delegated to JSONRPCHandler which knows the spec
	if not jsonrpc_handler.is_valid_request(rpc_request):
		var error_response := jsonrpc_handler.create_error(
			jsonrpc_handler.INVALID_REQUEST,
			"Invalid Request",
			null
		)
		_send_json(client, 200, error_response)
		return
	
	# Process the RPC method
	# WHY: Method routing done in this class to keep routing centralized
	var response := _route_rpc_method(rpc_request)
	_send_json(client, 200, response)


## Route JSON-RPC method to appropriate handler
##
## WHY: Centralizes RPC method routing - easy to see all available
## methods and add new ones.
func _route_rpc_method(request: Dictionary) -> Dictionary:
	var method := request.method as String
	var id: Variant = request.id
	var params: Variant = request.get("params")
	
	logger.debug("Processing RPC method", {"method": method})
	
	# WHY: Match statement provides clear routing map
	# Each method delegates to appropriate specialized handler
	match method:
		# Simple ping/pong for connectivity testing
		"ping":
			return jsonrpc_handler.create_response(id, {"status": "pong"})
		
		# Engine information queries
		"get_engine_info":
			var info := {
				"version": Engine.get_version_info(),
				"fps": Engine.get_frames_per_second(),
				"time_scale": Engine.time_scale
			}
			return jsonrpc_handler.create_response(id, info)
		
		# Project settings query
		"get_project_settings":
			return _handle_get_project_settings(id, params)
		
		# Editor control methods - delegated to EditorControlHandler
		"launch_editor":
			return _handle_launch_editor(id, params)
		
		"run_project":
			return _handle_run_project(id, params)
		
		"stop_execution":
			return _handle_stop_execution(id, params)
		
		"get_godot_version":
			return _handle_get_godot_version(id, params)
		
		# Project discovery methods - delegated to ProjectDiscoveryHandler
		"list_projects":
			return _handle_list_projects(id, params)
		
		"analyze_project":
			return _handle_analyze_project(id, params)
		
		_:
			return jsonrpc_handler.create_error(
				jsonrpc_handler.METHOD_NOT_FOUND,
				"Method not found: %s" % method,
				id
			)


## Handle get_project_settings RPC method
func _handle_get_project_settings(id: Variant, params: Variant) -> Dictionary:
	if params and typeof(params) == TYPE_DICTIONARY:
		var setting_name: String = params.get("name", "")
		if setting_name:
			var value := ProjectSettings.get_setting(setting_name)
			return jsonrpc_handler.create_response(id, {"value": value})
	
	return jsonrpc_handler.create_error(
		jsonrpc_handler.INVALID_PARAMS,
		"Invalid params",
		id
	)


## Handle launch_editor RPC method
## WHY: Delegates to EditorControlHandler after extracting parameters
func _handle_launch_editor(id: Variant, params: Variant) -> Dictionary:
	if not params or typeof(params) != TYPE_DICTIONARY:
		return jsonrpc_handler.create_error(jsonrpc_handler.INVALID_PARAMS, "Invalid params", id)
	
	var project_path: String = params.get("project_path", "")
	var editor_path: String = params.get("editor_path", "")
	var additional_args: Array = params.get("additional_args", [])
	
	var result := editor_handler.launch_editor(project_path, editor_path, additional_args)
	
	if result.has("error"):
		return jsonrpc_handler.create_error(jsonrpc_handler.INTERNAL_ERROR, result.error, id)
	
	return jsonrpc_handler.create_response(id, result)


## Handle run_project RPC method
## WHY: Delegates to EditorControlHandler after extracting parameters
func _handle_run_project(id: Variant, params: Variant) -> Dictionary:
	if not params or typeof(params) != TYPE_DICTIONARY:
		return jsonrpc_handler.create_error(jsonrpc_handler.INVALID_PARAMS, "Invalid params", id)
	
	var project_path: String = params.get("project_path", "")
	var scene: String = params.get("scene", "")
	var debug: bool = params.get("debug", true)
	
	var result := editor_handler.run_project(project_path, scene, debug)
	
	if result.has("error"):
		return jsonrpc_handler.create_error(jsonrpc_handler.INTERNAL_ERROR, result.error, id)
	
	return jsonrpc_handler.create_response(id, result)


## Handle stop_execution RPC method
## WHY: Delegates to EditorControlHandler after extracting parameters
func _handle_stop_execution(id: Variant, params: Variant) -> Dictionary:
	if not params or typeof(params) != TYPE_DICTIONARY:
		return jsonrpc_handler.create_error(jsonrpc_handler.INVALID_PARAMS, "Invalid params", id)
	
	var process_id: int = params.get("process_id", -1)
	var force: bool = params.get("force", false)
	
	var result := editor_handler.stop_execution(process_id, force)
	
	return jsonrpc_handler.create_response(id, result)


## Handle get_godot_version RPC method
## WHY: Delegates to EditorControlHandler
func _handle_get_godot_version(id: Variant, _params: Variant) -> Dictionary:
	var result := editor_handler.get_godot_version()
	return jsonrpc_handler.create_response(id, result)


## Handle list_projects RPC method
## WHY: Delegates to ProjectDiscoveryHandler after extracting parameters
func _handle_list_projects(id: Variant, params: Variant) -> Dictionary:
	if not params or typeof(params) != TYPE_DICTIONARY:
		return jsonrpc_handler.create_error(jsonrpc_handler.INVALID_PARAMS, "Invalid params", id)
	
	var search_paths: Array = params.get("search_paths", [])
	var recursive: bool = params.get("recursive", false)
	
	var result := project_handler.list_projects(search_paths, recursive)
	
	if result.has("error"):
		return jsonrpc_handler.create_error(jsonrpc_handler.INVALID_PARAMS, result.error, id)
	
	return jsonrpc_handler.create_response(id, result)


## Handle analyze_project RPC method
## WHY: Delegates to ProjectDiscoveryHandler after extracting parameters
func _handle_analyze_project(id: Variant, params: Variant) -> Dictionary:
	if not params or typeof(params) != TYPE_DICTIONARY:
		return jsonrpc_handler.create_error(jsonrpc_handler.INVALID_PARAMS, "Invalid params", id)
	
	var project_path: String = params.get("project_path", "")
	
	var result := project_handler.analyze_project(project_path)
	
	if result.has("error"):
		return jsonrpc_handler.create_error(jsonrpc_handler.INTERNAL_ERROR, result.error, id)
	
	return jsonrpc_handler.create_response(id, result)


## Send JSON response to client
## WHY: Delegates to HTTPResponseBuilder and sends via TCP
func _send_json(client: StreamPeerTCP, status_code: int, data: Dictionary) -> void:
	var response := response_builder.build_json_response(status_code, data)
	_send_response(client, response)


## Send error response to client
## WHY: Delegates to HTTPResponseBuilder and sends via TCP
func _send_error(client: StreamPeerTCP, status_code: int, message: String) -> void:
	var response := response_builder.build_error_response(status_code, message)
	_send_response(client, response)


## Send response string to client and disconnect
## WHY: Encapsulates TCP send operation with error handling
func _send_response(client: StreamPeerTCP, response: String) -> void:
	var buffer := response.to_utf8_buffer()
	var err := client.put_data(buffer)
	
	if err != OK:
		logger.warn("Failed to send response", {"error": error_string(err)})
	
	# WHY: Close connection after sending response (HTTP/1.1 Connection: close)
	client.disconnect_from_host()


func _exit_tree() -> void:
	# Clean up all client connections
	# WHY: Graceful shutdown - close all connections properly
	for client in clients:
		client.disconnect_from_host()
	
	clients.clear()
	
	# Stop TCP server
	if server:
		server.stop()
	
	logger.info("HTTP server stopped")
