@tool
extends EditorPlugin

## Godot MCP Bridge Plugin
##
## WHY: Enables Model Context Protocol (MCP) integration with Godot editor.
## Provides HTTP/JSON-RPC server for external tools and AI assistants to
## interact with Godot projects programmatically.
##
## WHAT IT DOES:
## - Starts HTTP server on port 7777 when plugin is enabled
## - Provides API for editor control (launch, run projects)
## - Provides API for project discovery and analysis
## - Enables AI-driven development workflows
##
## ARCHITECTURE:
## The HTTP server runs in the editor scene tree and processes requests
## from external clients via JSON-RPC 2.0 protocol.

var http_server: Node

func _enter_tree() -> void:
	# WHY: Plugin lifecycle - _enter_tree() is called when plugin is enabled
	# This is the correct place to initialize plugin resources
	
	# Load and instantiate the HTTP server
	# WHY: preload() loads the script at compile time for reliability
	var HTTPServerScript := preload("res://addons/godot-mcp-bridge/http_server.gd")
	http_server = HTTPServerScript.new()
	http_server.name = "MCPBridgeServer"
	
	# Add to the editor scene tree
	# WHY: Server needs to be in scene tree to receive _ready() and _process() calls
	add_child(http_server)
	
	print("[MCP Bridge] Plugin enabled - HTTP server starting on port 7777")

func _exit_tree() -> void:
	# Clean up the HTTP server
	if http_server:
		remove_child(http_server)
		http_server.queue_free()
	
	print("[MCP Bridge] Plugin disabled")