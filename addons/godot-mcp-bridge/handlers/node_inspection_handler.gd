extends RefCounted
class_name NodeInspectionHandler

## NodeInspectionHandler - Inspects and modifies nodes in open scenes
##
## WHY: Provides programmatic access to scene tree and node properties
## without parsing .tscn files. Operations reflect live editor state.

const MCPLoggerScript := preload("res://addons/godot-mcp-bridge/core/logger.gd")

var _logger: MCPLogger
var _editor_interface: EditorInterface


func _init(logger: MCPLogger, editor_interface: EditorInterface) -> void:
	_logger = logger
	_editor_interface = editor_interface


## Get complete node tree of currently open scene
##
## WHY: AI tools need scene structure to understand context and make
## intelligent suggestions about node placement, relationships, etc.
##
## Parameters:
##   include_properties: If true, include all properties of each node
##   max_depth: Maximum tree depth to traverse (-1 for unlimited)
##
## Returns: Dictionary with hierarchical node tree
func get_node_tree(include_properties: bool = false, max_depth: int = -1) -> Dictionary:
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var edited_scene = _editor_interface.get_edited_scene_root()
	
	if not edited_scene:
		return _error("No scene currently open")
	
	var tree = _build_node_tree(edited_scene, include_properties, max_depth, 0)
	
	_logger.info("Built node tree", {
		"root": edited_scene.name,
		"include_properties": include_properties
	})
	
	return {
		"success": true,
		"tree": tree,
		"scene_path": edited_scene.scene_file_path
	}


## Inspect a specific node by path and get all its properties
##
## WHY: Detailed node inspection for AI analysis, debugging,
## or preparing to make modifications.
##
## Parameters:
##   node_path: Path to node like "Player/Sprite2D" or "."
##
## Returns: Dictionary with all node properties
func inspect_node(node_path: String) -> Dictionary:
	if node_path.is_empty():
		return _error("node_path is required")
	
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var edited_scene = _editor_interface.get_edited_scene_root()
	
	if not edited_scene:
		return _error("No scene currently open")
	
	# Resolve path
	var target_node: Node
	if node_path == "." or node_path == edited_scene.name:
		target_node = edited_scene
	else:
		target_node = edited_scene.get_node_or_null(NodePath(node_path))
	
	if not target_node:
		return _error("Node not found: " + node_path)
	
	var properties = _get_node_properties(target_node)
	
	return {
		"success": true,
		"node_path": node_path,
		"node_name": target_node.name,
		"node_type": target_node.get_class(),
		"properties": properties,
		"child_count": target_node.get_child_count(),
		"scene_file_path": target_node.scene_file_path
	}


## Modify a property of a node in the open scene
##
## WHY: Allows AI tools to adjust node properties directly in the editor
## for rapid prototyping and testing without manual property editing.
##
## Parameters:
##   node_path: Path to node
##   property_name: Property to modify
##   value: New value for the property
##
## Returns: Dictionary with success status
func modify_node_property(node_path: String, property_name: String, value: Variant) -> Dictionary:
	if node_path.is_empty():
		return _error("node_path is required")
	
	if property_name.is_empty():
		return _error("property_name is required")
	
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var edited_scene = _editor_interface.get_edited_scene_root()
	
	if not edited_scene:
		return _error("No scene currently open")
	
	# Resolve node
	var target_node: Node
	if node_path == "." or node_path == edited_scene.name:
		target_node = edited_scene
	else:
		target_node = edited_scene.get_node_or_null(NodePath(node_path))
	
	if not target_node:
		return _error("Node not found: " + node_path)
	
	# Validate property exists
	if not property_name in target_node:
		return _error("Property not found: " + property_name)
	
	# Store old value for logging
	var old_value = target_node.get(property_name)
	
	# Set new value
	target_node.set(property_name, value)
	
	_logger.info("Modified node property", {
		"node_path": node_path,
		"property": property_name,
		"old_value": str(old_value),
		"new_value": str(value)
	})
	
	return {
		"success": true,
		"node_path": node_path,
		"property_name": property_name,
		"old_value": _serialize_value(old_value),
		"new_value": _serialize_value(value),
		"message": "Property updated successfully"
	}


## Add a new node to the currently open scene
##
## WHY: Enables AI-driven scene construction like "add a Camera2D"
## or "create 10 enemy spawners in a grid".
##
## Parameters:
##   parent_path: Path to parent node (or "." for root)
##   node_type: Class name like "Sprite2D", "Camera2D", "StaticBody2D"
##   node_name: Name for the new node
##   properties: Optional dictionary of initial properties
##
## Returns: Dictionary with new node path
func add_node_to_scene(parent_path: String, node_type: String, node_name: String, properties: Dictionary = {}) -> Dictionary:
	if parent_path.is_empty():
		return _error("parent_path is required")
	
	if node_type.is_empty():
		return _error("node_type is required")
	
	if node_name.is_empty():
		return _error("node_name is required")
	
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var edited_scene = _editor_interface.get_edited_scene_root()
	
	if not edited_scene:
		return _error("No scene currently open")
	
	# Resolve parent
	var parent_node: Node
	if parent_path == "." or parent_path == edited_scene.name:
		parent_node = edited_scene
	else:
		parent_node = edited_scene.get_node_or_null(NodePath(parent_path))
	
	if not parent_node:
		return _error("Parent node not found: " + parent_path)
	
	# Create new node
	var new_node = ClassDB.instantiate(node_type)
	
	if not new_node:
		return _error("Failed to instantiate node type: " + node_type)
	
	new_node.name = node_name
	
	# Set initial properties
	for prop_name in properties.keys():
		if prop_name in new_node:
			new_node.set(prop_name, properties[prop_name])
	
	# Add to parent
	parent_node.add_child(new_node)
	new_node.owner = edited_scene
	
	var new_node_path = parent_node.get_path_to(new_node)
	
	_logger.info("Added node to scene", {
		"parent": parent_path,
		"node_type": node_type,
		"node_name": node_name,
		"node_path": str(new_node_path)
	})
	
	return {
		"success": true,
		"node_path": str(new_node_path),
		"node_name": node_name,
		"node_type": node_type,
		"parent_path": parent_path,
		"message": "Node added successfully"
	}


## Delete a node from the currently open scene
##
## WHY: Remove nodes programmatically as part of AI-assisted
## scene refactoring or cleanup operations.
##
## Parameters:
##   node_path: Path to node to delete
##
## Returns: Dictionary with success status
func delete_node(node_path: String) -> Dictionary:
	if node_path.is_empty():
		return _error("node_path is required")
	
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var edited_scene = _editor_interface.get_edited_scene_root()
	
	if not edited_scene:
		return _error("No scene currently open")
	
	# Can't delete root
	if node_path == "." or node_path == edited_scene.name:
		return _error("Cannot delete scene root node")
	
	var target_node = edited_scene.get_node_or_null(NodePath(node_path))
	
	if not target_node:
		return _error("Node not found: " + node_path)
	
	var parent = target_node.get_parent()
	var node_name = target_node.name
	
	# Remove from parent and free
	parent.remove_child(target_node)
	target_node.queue_free()
	
	_logger.info("Deleted node", {
		"node_path": node_path,
		"node_name": node_name
	})
	
	return {
		"success": true,
		"node_path": node_path,
		"node_name": node_name,
		"message": "Node deleted successfully"
	}


## Build node tree recursively
##
## WHY: Creates hierarchical structure representing scene tree
func _build_node_tree(node: Node, include_properties: bool, max_depth: int, current_depth: int) -> Dictionary:
	var tree = {
		"name": node.name,
		"type": node.get_class(),
		"path": str(node.get_path()),
		"child_count": node.get_child_count()
	}
	
	if include_properties:
		tree["properties"] = _get_node_properties(node)
	
	# Check depth limit
	if max_depth >= 0 and current_depth >= max_depth:
		tree["children"] = []
		tree["depth_limited"] = true
		return tree
	
	# Add children
	var children: Array = []
	for child in node.get_children():
		children.append(_build_node_tree(child, include_properties, max_depth, current_depth + 1))
	
	tree["children"] = children
	
	return tree


## Get all properties of a node
##
## WHY: Extracts property names and values for inspection
func _get_node_properties(node: Node) -> Dictionary:
	var properties = {}
	
	var property_list = node.get_property_list()
	
	for prop in property_list:
		# Skip internal and method properties
		if prop.usage & PROPERTY_USAGE_CATEGORY or prop.usage & PROPERTY_USAGE_GROUP:
			continue
		
		if prop.usage & PROPERTY_USAGE_SCRIPT_VARIABLE or prop.usage & PROPERTY_USAGE_EDITOR:
			var prop_name = prop.name
			var value = node.get(prop_name)
			properties[prop_name] = _serialize_value(value)
	
	return properties


## Serialize value for JSON transport
##
## WHY: Convert Godot types to JSON-compatible format
func _serialize_value(value: Variant) -> Variant:
	var value_type = typeof(value)
	
	if value_type in [TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING]:
		return value
	
	if value_type == TYPE_VECTOR2:
		return {"x": value.x, "y": value.y, "_type": "Vector2"}
	
	if value_type == TYPE_VECTOR3:
		return {"x": value.x, "y": value.y, "z": value.z, "_type": "Vector3"}
	
	if value_type == TYPE_COLOR:
		return {"r": value.r, "g": value.g, "b": value.b, "a": value.a, "_type": "Color"}
	
	if value_type == TYPE_ARRAY:
		var arr: Array = []
		for item in value:
			arr.append(_serialize_value(item))
		return arr
	
	if value_type == TYPE_DICTIONARY:
		var dict: Dictionary = {}
		for key in value.keys():
			dict[str(key)] = _serialize_value(value[key])
		return dict
	
	# Fallback: string representation
	return str(value)


func _error(message: String) -> Dictionary:
	return {
		"success": false,
		"error": message
	}
