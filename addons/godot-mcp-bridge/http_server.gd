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
		
		_:
			return _create_jsonrpc_error(-32601, "Method not found: %s" % method, id)

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
	
	client.put_data(response.to_utf8_buffer())
	client.disconnect_from_host()

func _send_error_response(client: StreamPeerTCP, status_code: int, message: String) -> void:
	var status_text := _get_status_text(status_code)
	
	var response := "HTTP/1.1 %d %s\r\n" % [status_code, status_text]
	response += "Content-Type: text/plain\r\n"
	response += "Content-Length: %d\r\n" % message.length()
	response += "Connection: close\r\n"
	response += "\r\n"
	response += message
	
	client.put_data(response.to_utf8_buffer())
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
