extends RefCounted
class_name SceneManagementHandler

## SceneManagementHandler - Manages open scenes in Godot Editor
##
## WHY: Scene management operations require the EditorInterface API
## which is only available when running inside Godot Editor.

var _logger: MCPLogger
var _editor_interface: EditorInterface


func _init(logger: MCPLogger, editor_interface: EditorInterface) -> void:
	_logger = logger
	_editor_interface = editor_interface


## Get the currently open scene in the editor
##
## WHY: AI tools need to know which scene is being edited to provide
## contextual assistance and modifications.
##
## Returns: Dictionary with scene_path (String) or error
func get_current_scene() -> Dictionary:
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var edited_scene = _editor_interface.get_edited_scene_root()
	
	if not edited_scene:
		return {
			"success": true,
			"scene_path": null,
			"has_scene_open": false
		}
	
	var scene_path = edited_scene.scene_file_path
	
	_logger.info("Got current scene", {"scene_path": scene_path})
	
	return {
		"success": true,
		"scene_path": scene_path,
		"has_scene_open": true,
		"root_node_name": edited_scene.name,
		"root_node_type": edited_scene.get_class()
	}


## Load a scene file in the Godot editor
##
## WHY: Opening scenes programmatically enables AI-assisted workflows
## like "open the scene containing this node" or "switch to scene X".
##
## Parameters:
##   scene_path: Path to .tscn file (res:// or absolute)
##
## Returns: Dictionary with success status
func load_scene_in_editor(scene_path: String) -> Dictionary:
	if scene_path.is_empty():
		return _error("scene_path is required")
	
	if not _editor_interface:
		return _error("Editor interface not available")
	
	# Convert absolute path to res:// if needed
	var res_path = _normalize_path(scene_path)
	
	if not FileAccess.file_exists(res_path):
		return _error("Scene file not found: " + res_path)
	
	# Open the scene (returns void)
	_editor_interface.open_scene_from_path(res_path)
	
	_logger.info("Opened scene in editor", {"scene_path": res_path})
	
	return {
		"success": true,
		"scene_path": res_path,
		"message": "Scene opened successfully"
	}


## Save the currently open scene
##
## WHY: After making modifications via AI tools, the scene needs to be
## saved. This enables automated workflows without manual user intervention.
##
## Returns: Dictionary with success status
func save_current_scene() -> Dictionary:
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var edited_scene = _editor_interface.get_edited_scene_root()
	
	if not edited_scene:
		return _error("No scene currently open")
	
	var scene_path = edited_scene.scene_file_path
	
	if scene_path.is_empty():
		return _error("Current scene has no file path (unsaved scene)")
	
	# Save the scene
	var result = _editor_interface.save_scene()
	
	if result != OK:
		return _error("Failed to save scene: " + error_string(result))
	
	_logger.info("Saved current scene", {"scene_path": scene_path})
	
	return {
		"success": true,
		"scene_path": scene_path,
		"message": "Scene saved successfully"
	}


## Close the currently open scene
##
## WHY: Managing editor state, cleaning up after operations, or
## preparing to open another scene.
##
## Returns: Dictionary with success status
func close_scene() -> Dictionary:
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var edited_scene = _editor_interface.get_edited_scene_root()
	
	if not edited_scene:
		return {
			"success": true,
			"message": "No scene open to close"
		}
	
	var scene_path = edited_scene.scene_file_path
	
	# NOTE: Godot 4.x doesn't have direct close_scene API
	# Workaround: Open empty scene
	_editor_interface.open_scene_from_path("")
	
	_logger.info("Closed scene", {"scene_path": scene_path})
	
	return {
		"success": true,
		"previous_scene": scene_path,
		"message": "Scene closed"
	}


## Reload the current scene from disk
##
## WHY: Discard unsaved changes and reload original scene state.
## Useful for testing or resetting after operations.
##
## Returns: Dictionary with success status
func reload_current_scene() -> Dictionary:
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var edited_scene = _editor_interface.get_edited_scene_root()
	
	if not edited_scene:
		return _error("No scene currently open")
	
	var scene_path = edited_scene.scene_file_path
	
	if scene_path.is_empty():
		return _error("Current scene has no file path")
	
	# Reload by closing and reopening (returns void)
	_editor_interface.reload_scene_from_path(scene_path)
	
	_logger.info("Reloaded scene", {"scene_path": scene_path})
	
	return {
		"success": true,
		"scene_path": scene_path,
		"message": "Scene reloaded successfully"
	}


## Get list of all open scenes (tabs)
##
## WHY: Editor can have multiple scenes open in tabs. AI tools
## may need to know all open scenes to provide better context.
##
## Returns: Dictionary with array of scene paths
func get_open_scenes() -> Dictionary:
	if not _editor_interface:
		return _error("Editor interface not available")
	
	# Note: Godot 4.x EditorInterface doesn't expose open tabs directly
	# We can only get the currently edited scene
	var edited_scene = _editor_interface.get_edited_scene_root()
	
	var open_scenes: Array[String] = []
	
	if edited_scene and not edited_scene.scene_file_path.is_empty():
		open_scenes.append(edited_scene.scene_file_path)
	
	return {
		"success": true,
		"open_scenes": open_scenes,
		"count": open_scenes.size(),
		"note": "Godot 4.x API limitation: only current scene available"
	}


## Normalize path to res:// format
##
## WHY: Godot editor APIs expect res:// paths, but external tools
## may provide absolute file system paths.
func _normalize_path(path: String) -> String:
	if path.begins_with("res://"):
		return path
	
	# Try to convert absolute path to res:// path
	var project_path = ProjectSettings.globalize_path("res://")
	
	if path.begins_with(project_path):
		var relative = path.replace(project_path, "")
		return "res://" + relative
	
	# Assume it's already a relative path
	if not path.begins_with("/"):
		return "res://" + path
	
	return path


func _error(message: String) -> Dictionary:
	return {
		"success": false,
		"error": message
	}
