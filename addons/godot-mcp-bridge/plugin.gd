@tool
extends EditorPlugin

## Godot MCP Bridge Plugin
## Enables Model Context Protocol integration via HTTP server

var http_server: Node

func _enter_tree() -> void:
	# Load and instantiate the HTTP server
	var HTTPServerScript := preload("res://addons/godot-mcp-bridge/http_server.gd")
	http_server = Node.new()
	http_server.set_script(HTTPServerScript)
	http_server.name = "MCPBridgeServer"
	
	# Add to the editor scene tree
	add_child(http_server)
	
	print("[MCP Bridge] Plugin enabled")

func _exit_tree() -> void:
	# Clean up the HTTP server
	if http_server:
		remove_child(http_server)
		http_server.queue_free()
	
	print("[MCP Bridge] Plugin disabled")
