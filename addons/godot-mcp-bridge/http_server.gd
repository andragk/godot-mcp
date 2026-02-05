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

## WHY: Preload handler scripts to ensure type availability
## (class_name alone may not be immediately recognized by Godot)
const MCPLoggerScript := preload("res://addons/godot-mcp-bridge/core/logger.gd")
const HTTPRequestParserScript := preload("res://addons/godot-mcp-bridge/protocol/http_request_parser.gd")
const HTTPResponseBuilderScript := preload("res://addons/godot-mcp-bridge/protocol/http_response_builder.gd")
const JSONRPCHandlerScript := preload("res://addons/godot-mcp-bridge/protocol/jsonrpc_handler.gd")
const EditorControlHandlerScript := preload("res://addons/godot-mcp-bridge/handlers/editor_control_handler.gd")
const ProjectDiscoveryHandlerScript := preload("res://addons/godot-mcp-bridge/handlers/project_discovery_handler.gd")
const SceneManagementHandlerScript := preload("res://addons/godot-mcp-bridge/handlers/scene_management_handler.gd")
const ScriptExecutionHandlerScript := preload("res://addons/godot-mcp-bridge/handlers/script_execution_handler.gd")
const NodeInspectionHandlerScript := preload("res://addons/godot-mcp-bridge/handlers/node_inspection_handler.gd")
const ResourceManagementHandlerScript := preload("res://addons/godot-mcp-bridge/handlers/resource_management_handler.gd")
const BuildExportHandlerScript := preload("res://addons/godot-mcp-bridge/handlers/build_export_handler.gd")
const TestingHandlerScript := preload("res://addons/godot-mcp-bridge/handlers/testing_handler.gd")
const PluginManagementHandlerScript := preload("res://addons/godot-mcp-bridge/handlers/plugin_management_handler.gd")

const PORT := 7777
const VERSION := "0.2.0"

## Core components
var server: TCPServer
var clients: Array[StreamPeerTCP] = []
var start_time: int

## Specialized handlers (following SRP)
var logger
var request_parser
var response_builder
var jsonrpc_handler

## Business logic handlers
var editor_handler
var project_handler
var scene_handler
var script_handler
var node_handler
var resource_handler
var build_handler
var testing_handler
var plugin_handler


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
	logger = MCPLoggerScript.new()
	request_parser = HTTPRequestParserScript.new()
	response_builder = HTTPResponseBuilderScript.new()
	jsonrpc_handler = JSONRPCHandlerScript.new()
	
	# Get EditorInterface for handlers that need it
	var editor_interface = EditorInterface
	
	# Initialize business logic handlers
	editor_handler = EditorControlHandlerScript.new(logger)
	project_handler = ProjectDiscoveryHandlerScript.new(logger)
	scene_handler = SceneManagementHandlerScript.new(logger, editor_interface)
	script_handler = ScriptExecutionHandlerScript.new(logger, editor_interface)
	node_handler = NodeInspectionHandlerScript.new(logger, editor_interface)
	resource_handler = ResourceManagementHandlerScript.new(logger, editor_interface)
	build_handler = BuildExportHandlerScript.new(logger, editor_interface)
	testing_handler = TestingHandlerScript.new(logger, editor_interface)
	plugin_handler = PluginManagementHandlerScript.new(logger, editor_interface)


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
		
		# Editor control methods - EditorControlHandler
		"launch_editor":
			return _handle_launch_editor(id, params)
		"run_project":
			return _handle_run_project(id, params)
		"stop_execution":
			return _handle_stop_execution(id, params)
		"get_godot_version":
			return _handle_get_godot_version(id, params)
		
		# Project discovery methods - ProjectDiscoveryHandler
		"list_projects":
			return _handle_list_projects(id, params)
		"analyze_project":
			return _handle_analyze_project(id, params)
		
		# Scene management methods - SceneManagementHandler
		"get_current_scene":
			return _handle_generic(id, params, scene_handler, "get_current_scene")
		"load_scene_in_editor":
			return _handle_generic(id, params, scene_handler, "load_scene_in_editor")
		"save_current_scene":
			return _handle_generic(id, params, scene_handler, "save_current_scene")
		"close_scene":
			return _handle_generic(id, params, scene_handler, "close_scene")
		"reload_current_scene":
			return _handle_generic(id, params, scene_handler, "reload_current_scene")
		"get_open_scenes":
			return _handle_generic(id, params, scene_handler, "get_open_scenes")
		
		# Script execution methods - ScriptExecutionHandler
		"run_gdscript":
			return _handle_generic(id, params, script_handler, "run_gdscript")
		"evaluate_expression":
			return _handle_generic(id, params, script_handler, "evaluate_expression")
		"get_editor_settings":
			return _handle_generic(id, params, script_handler, "get_editor_settings")
		"set_editor_settings":
			return _handle_generic(id, params, script_handler, "set_editor_settings")
		"list_editor_settings":
			return _handle_generic(id, params, script_handler, "list_editor_settings")
		
		# Node inspection methods - NodeInspectionHandler
		"get_node_tree":
			return _handle_generic(id, params, node_handler, "get_node_tree")
		"inspect_node":
			return _handle_generic(id, params, node_handler, "inspect_node")
		"modify_node_property":
			return _handle_generic(id, params, node_handler, "modify_node_property")
		"add_node_to_scene":
			return _handle_generic(id, params, node_handler, "add_node_to_scene")
		"delete_node":
			return _handle_generic(id, params, node_handler, "delete_node")
		
		# Resource management methods - ResourceManagementHandler
		"import_asset":
			return _handle_generic(id, params, resource_handler, "import_asset")
		"get_import_settings":
			return _handle_generic(id, params, resource_handler, "get_import_settings")
		"set_import_settings":
			return _handle_generic(id, params, resource_handler, "set_import_settings")
		"reimport_assets":
			return _handle_generic(id, params, resource_handler, "reimport_assets")
		"get_resource_metadata":
			return _handle_generic(id, params, resource_handler, "get_resource_metadata")
		
		# Build & export methods - BuildExportHandler
		"export_project":
			return _handle_generic(id, params, build_handler, "export_project")
		"get_export_presets":
			return _handle_generic(id, params, build_handler, "get_export_presets")
		"create_export_preset":
			return _handle_generic(id, params, build_handler, "create_export_preset")
		"run_custom_build_script":
			return _handle_generic(id, params, build_handler, "run_custom_build_script")
		"get_build_info":
			return _handle_generic(id, params, build_handler, "get_build_info")
		
		# Testing methods - TestingHandler
		"run_tests":
			return _handle_generic(id, params, testing_handler, "run_tests")
		"run_scene_test":
			return _handle_generic(id, params, testing_handler, "run_scene_test")
		"get_test_results":
			return _handle_generic(id, params, testing_handler, "get_test_results")
		"profile_scene":
			return _handle_generic(id, params, testing_handler, "profile_scene")
		
		# Plugin management methods - PluginManagementHandler
		"list_plugins":
			return _handle_generic(id, params, plugin_handler, "list_plugins")
		"get_plugin_info":
			return _handle_generic(id, params, plugin_handler, "get_plugin_info")
		"enable_plugin":
			return _handle_generic(id, params, plugin_handler, "enable_plugin")
		"disable_plugin":
			return _handle_generic(id, params, plugin_handler, "disable_plugin")
		"is_plugin_enabled":
			return _handle_generic(id, params, plugin_handler, "is_plugin_enabled")
		"reload_plugin":
			return _handle_generic(id, params, plugin_handler, "reload_plugin")
		"install_plugin":
			return _handle_generic(id, params, plugin_handler, "install_plugin")
		
		_:
			return jsonrpc_handler.create_error(
				jsonrpc_handler.METHOD_NOT_FOUND,
				"Method not found: %s" % method,
				id
			)


## Generic handler for delegating to handler methods
##
## WHY: Handlers are designed to accept params as Dictionary arguments
## and return properly formatted success/error dictionaries.
func _handle_generic(id: Variant, params: Variant, handler: Object, method_name: String) -> Dictionary:
	if not handler.has_method(method_name):
		return jsonrpc_handler.create_error(
			jsonrpc_handler.INTERNAL_ERROR,
			"Handler method not found: " + method_name,
			id
		)
	
	# Ensure params is a dictionary
	var call_params := {}
	if params and typeof(params) == TYPE_DICTIONARY:
		call_params = params
	
	# Call handler method - handlers accept individual parameters extracted from dict
	var result: Dictionary
	
	# Extract common parameters and call handler method
	# Each handler method defines its own parameter signature
	match method_name:
		# Scene management
		"load_scene_in_editor":
			result = handler.load_scene_in_editor(call_params.get("scene_path", ""))
		"get_current_scene", "save_current_scene", "close_scene", "reload_current_scene", "get_open_scenes":
			result = handler.call(method_name)
		
		# Script execution
		"run_gdscript":
			result = handler.run_gdscript(call_params.get("code", ""), call_params.get("context", {}))
		"evaluate_expression":
			result = handler.evaluate_expression(call_params.get("expression", ""))
		"get_editor_settings":
			result = handler.get_editor_settings(call_params.get("setting_path", ""))
		"set_editor_settings":
			result = handler.set_editor_settings(call_params.get("setting_path", ""), call_params.get("value"))
		"list_editor_settings":
			result = handler.list_editor_settings(call_params.get("prefix", ""))
		
		# Node inspection
		"get_node_tree":
			result = handler.get_node_tree(call_params.get("include_properties", false), call_params.get("max_depth", -1))
		"inspect_node":
			result = handler.inspect_node(call_params.get("node_path", ""))
		"modify_node_property":
			result = handler.modify_node_property(
				call_params.get("node_path", ""),
				call_params.get("property_name", ""),
				call_params.get("value")
			)
		"add_node_to_scene":
			result = handler.add_node_to_scene(
				call_params.get("parent_path", ""),
				call_params.get("node_type", ""),
				call_params.get("node_name", ""),
				call_params.get("properties", {})
			)
		"delete_node":
			result = handler.delete_node(call_params.get("node_path", ""))
		
		# Resource management
		"import_asset":
			result = handler.import_asset(call_params.get("asset_path", ""), call_params.get("force", false))
		"get_import_settings":
			result = handler.get_import_settings(call_params.get("asset_path", ""))
		"set_import_settings":
			result = handler.set_import_settings(call_params.get("asset_path", ""), call_params.get("settings", {}))
		"reimport_assets":
			result = handler.reimport_assets(call_params.get("path_pattern", ""))
		"get_resource_metadata":
			result = handler.get_resource_metadata(call_params.get("resource_path", ""))
		
		# Build & export
		"export_project":
			result = handler.export_project(
				call_params.get("preset_name", ""),
				call_params.get("output_path", ""),
				call_params.get("debug", false)
			)
		"get_export_presets", "get_build_info":
			result = handler.call(method_name)
		"create_export_preset":
			result = handler.create_export_preset(
				call_params.get("preset_name", ""),
				call_params.get("platform", ""),
				call_params.get("settings", {})
			)
		"run_custom_build_script":
			result = handler.run_custom_build_script(call_params.get("script_path", ""), call_params.get("arguments", {}))
		
		# Testing
		"run_tests":
			result = handler.run_tests(call_params.get("test_path", ""), call_params.get("framework", "gut"))
		"run_scene_test":
			result = handler.run_scene_test(
				call_params.get("scene_path", ""),
				call_params.get("duration", 0.0),
				call_params.get("headless", false)
			)
		"get_test_results":
			result = handler.get_test_results()
		"profile_scene":
			result = handler.profile_scene(
				call_params.get("scene_path", ""),
				call_params.get("duration", 5.0),
				call_params.get("metrics", ["fps"])
			)
		
		# Plugin management
		"list_plugins":
			result = handler.list_plugins()
		"get_plugin_info", "enable_plugin", "disable_plugin", "is_plugin_enabled", "reload_plugin":
			result = handler.call(method_name, call_params.get("plugin_name", ""))
		"install_plugin":
			result = handler.install_plugin(call_params.get("source_path", ""), call_params.get("plugin_name", ""))
		
		_:
			return jsonrpc_handler.create_error(
				jsonrpc_handler.INTERNAL_ERROR, 
				"Unknown method mapping: " + method_name,
				id
			)
	
	# Check if result has error (handlers return {success: false, error: "message"})
	if result.has("error") and not result.get("success", true):
		return jsonrpc_handler.create_error(jsonrpc_handler.INTERNAL_ERROR, result.error, id)
	
	return jsonrpc_handler.create_response(id, result)


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
