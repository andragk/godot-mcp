extends RefCounted
class_name PluginManagementHandler

## PluginManagementHandler - Manages Godot editor plugins
##
## WHY: Enables programmatic plugin management for automated workflows,
## plugin development, or dynamic editor configuration.


var _logger: MCPLogger
var _editor_interface: EditorInterface


func _init(logger: MCPLogger, editor_interface: EditorInterface) -> void:
	_logger = logger
	_editor_interface = editor_interface


## Get list of all installed plugins
##
## WHY: Discovery - find available plugins without manually checking
## the addons/ directory.
##
## Returns: Dictionary with array of plugin info
func list_plugins() -> Dictionary:
	var plugins: Array[Dictionary] = []
	
	var addons_path = "res://addons"
	
	if not DirAccess.dir_exists_absolute(addons_path):
		return {
			"success": true,
			"plugins": [],
			"count": 0,
			"message": "No addons directory found"
		}
	
	var dir = DirAccess.open(addons_path)
	if not dir:
		return _error("Failed to open addons directory")
	
	dir.list_dir_begin()
	var plugin_name = dir.get_next()
	
	while plugin_name != "":
		if dir.current_is_dir() and plugin_name != "." and plugin_name != "..":
			var plugin_info = _get_plugin_info(plugin_name)
			if plugin_info:
				plugins.append(plugin_info)
		
		plugin_name = dir.get_next()
	
	dir.list_dir_end()
	
	return {
		"success": true,
		"plugins": plugins,
		"count": plugins.size()
	}


## Get detailed information about a specific plugin
##
## WHY: Inspect plugin metadata, version, dependencies, etc.
##
## Parameters:
##   plugin_name: Name of plugin directory in addons/
##
## Returns: Dictionary with plugin details
func get_plugin_info(plugin_name: String) -> Dictionary:
	if plugin_name.is_empty():
		return _error("plugin_name is required")
	
	var plugin_info = _get_plugin_info(plugin_name)
	
	if not plugin_info:
		return _error("Plugin not found or invalid: " + plugin_name)
	
	return {
		"success": true,
		"plugin": plugin_info
	}


## Enable a plugin
##
## WHY: Programmatically activate plugins for testing or automated setup.
##
## Parameters:
##   plugin_name: Name of plugin directory in addons/
##
## Returns: Dictionary with success status
func enable_plugin(plugin_name: String) -> Dictionary:
	if plugin_name.is_empty():
		return _error("plugin_name is required")
	
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var plugin_path = "res://addons/%s/plugin.cfg" % plugin_name
	
	if not FileAccess.file_exists(plugin_path):
		return _error("Plugin not found: " + plugin_name)
	
	# Enable the plugin
	_editor_interface.set_plugin_enabled(plugin_name, true)
	
	_logger.info("Enabled plugin", {"plugin": plugin_name})
	
	return {
		"success": true,
		"plugin_name": plugin_name,
		"message": "Plugin enabled successfully"
	}


## Disable a plugin
##
## WHY: Deactivate plugins for testing, conflict resolution, or cleanup.
##
## Parameters:
##   plugin_name: Name of plugin directory in addons/
##
## Returns: Dictionary with success status
func disable_plugin(plugin_name: String) -> Dictionary:
	if plugin_name.is_empty():
		return _error("plugin_name is required")
	
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var plugin_path = "res://addons/%s/plugin.cfg" % plugin_name
	
	if not FileAccess.file_exists(plugin_path):
		return _error("Plugin not found: " + plugin_name)
	
	# Disable the plugin
	_editor_interface.set_plugin_enabled(plugin_name, false)
	
	_logger.info("Disabled plugin", {"plugin": plugin_name})
	
	return {
		"success": true,
		"plugin_name": plugin_name,
		"message": "Plugin disabled successfully"
	}


## Check if a plugin is currently enabled
##
## WHY: Query plugin state before performing operations that depend on it.
##
## Parameters:
##   plugin_name: Name of plugin directory in addons/
##
## Returns: Dictionary with enabled status
func is_plugin_enabled(plugin_name: String) -> Dictionary:
	if plugin_name.is_empty():
		return _error("plugin_name is required")
	
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var plugin_path = "res://addons/%s/plugin.cfg" % plugin_name
	
	if not FileAccess.file_exists(plugin_path):
		return _error("Plugin not found: " + plugin_name)
	
	var is_enabled = _editor_interface.is_plugin_enabled(plugin_name)
	
	return {
		"success": true,
		"plugin_name": plugin_name,
		"is_enabled": is_enabled
	}


## Reload a plugin (disable then enable)
##
## WHY: Apply plugin code changes without restarting the editor.
## Essential for plugin development workflows.
##
## Parameters:
##   plugin_name: Name of plugin directory in addons/
##
## Returns: Dictionary with success status
func reload_plugin(plugin_name: String) -> Dictionary:
	if plugin_name.is_empty():
		return _error("plugin_name is required")
	
	if not _editor_interface:
		return _error("Editor interface not available")
	
	var plugin_path = "res://addons/%s/plugin.cfg" % plugin_name
	
	if not FileAccess.file_exists(plugin_path):
		return _error("Plugin not found: " + plugin_name)
	
	# Disable then enable
	_editor_interface.set_plugin_enabled(plugin_name, false)
	await Engine.get_main_loop().process_frame  # Wait one frame
	_editor_interface.set_plugin_enabled(plugin_name, true)
	
	_logger.info("Reloaded plugin", {"plugin": plugin_name})
	
	return {
		"success": true,
		"plugin_name": plugin_name,
		"message": "Plugin reloaded successfully"
	}


## Install a plugin from a directory
##
## WHY: Automate plugin installation from git clones, downloads, or
## template repositories.
##
## Parameters:
##   source_path: Path to plugin directory to install
##   plugin_name: Optional name (defaults to source directory name)
##
## Returns: Dictionary with success status
func install_plugin(source_path: String, plugin_name: String = "") -> Dictionary:
	if source_path.is_empty():
		return _error("source_path is required")
	
	if not DirAccess.dir_exists_absolute(source_path):
		return _error("Source directory not found: " + source_path)
	
	# Determine plugin name
	if plugin_name.is_empty():
		plugin_name = source_path.get_file()
	
	var dest_path = "res://addons/" + plugin_name
	
	# Check if already exists
	if DirAccess.dir_exists_absolute(dest_path):
		return _error("Plugin already exists: " + plugin_name)
	
	# Copy directory
	var result = _copy_directory(source_path, dest_path)
	
	if not result:
		return _error("Failed to copy plugin directory")
	
	_logger.info("Installed plugin", {
		"plugin": plugin_name,
		"source": source_path
	})
	
	return {
		"success": true,
		"plugin_name": plugin_name,
		"install_path": dest_path,
		"message": "Plugin installed (restart editor or enable manually)"
	}


## Get plugin information from plugin.cfg
##
## WHY: Parse plugin metadata from configuration file
func _get_plugin_info(plugin_name: String) -> Dictionary:
	var plugin_cfg_path = "res://addons/%s/plugin.cfg" % plugin_name
	
	if not FileAccess.file_exists(plugin_cfg_path):
		return {}
	
	var config = ConfigFile.new()
	var err = config.load(plugin_cfg_path)
	
	if err != OK:
		return {}
	
	var is_enabled = false
	if _editor_interface:
		is_enabled = _editor_interface.is_plugin_enabled(plugin_name)
	
	return {
		"name": plugin_name,
		"display_name": config.get_value("plugin", "name", plugin_name),
		"description": config.get_value("plugin", "description", ""),
		"author": config.get_value("plugin", "author", ""),
		"version": config.get_value("plugin", "version", ""),
		"script": config.get_value("plugin", "script", ""),
		"is_enabled": is_enabled,
		"path": "res://addons/" + plugin_name
	}


## Recursively copy directory
##
## WHY: Plugin installation requires copying entire directory trees
func _copy_directory(source: String, dest: String) -> bool:
	var source_dir = DirAccess.open(source)
	if not source_dir:
		return false
	
	# Create destination directory
	DirAccess.make_dir_recursive_absolute(dest)
	
	source_dir.list_dir_begin()
	var file_name = source_dir.get_next()
	
	while file_name != "":
		if file_name == "." or file_name == "..":
			file_name = source_dir.get_next()
			continue
		
		var source_path = source + "/" + file_name
		var dest_path = dest + "/" + file_name
		
		if source_dir.current_is_dir():
			if not _copy_directory(source_path, dest_path):
				return false
		else:
			if DirAccess.copy_absolute(source_path, dest_path) != OK:
				return false
		
		file_name = source_dir.get_next()
	
	source_dir.list_dir_end()
	return true


func _error(message: String) -> Dictionary:
	return {
		"success": false,
		"error": message
	}
