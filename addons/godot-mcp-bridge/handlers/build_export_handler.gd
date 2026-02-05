extends RefCounted


## BuildExportHandler - Handles project builds and exports
##
## WHY: Automating builds and exports enables CI/CD workflows and
## allows AI tools to test cross-platform compatibility.

const MCPLoggerScript := preload("res://addons/godot-mcp-bridge/core/logger.gd")

var _logger: MCPLogger
var _editor_interface: EditorInterface


func _init(logger: MCPLogger, editor_interface: EditorInterface) -> void:
	_logger = logger
	_editor_interface = editor_interface


## Export project using a preset
##
## WHY: Automate export process for testing, deployment, or CI/CD pipelines.
##
## Parameters:
##   preset_name: Name of export preset (e.g., "Windows Desktop", "Linux/X11")
##   output_path: Where to save the exported project
##   debug: Export in debug mode (default: false)
##
## Returns: Dictionary with export status
func export_project(preset_name: String, output_path: String, debug: bool = false) -> Dictionary:
	if preset_name.is_empty():
		return _error("preset_name is required")
	
	if output_path.is_empty():
		return _error("output_path is required")
	
	_logger.info("Exporting project", {
		"preset": preset_name,
		"output": output_path,
		"debug": debug
	})
	
	# Note: Godot 4.x doesn't expose EditorExportPlugin API to GDScript
	# This would require the EditorExportPlatform API which is C++ only
	
	return _error("Project export requires Editor Export API (C++ only in Godot 4.x)")


## Get list of configured export presets
##
## WHY: Discover available export targets without manually checking
## project settings or export_presets.cfg file.
##
## Returns: Dictionary with array of preset names
func get_export_presets() -> Dictionary:
	# Parse export_presets.cfg
	var config_path = "res://export_presets.cfg"
	
	if not FileAccess.file_exists(config_path):
		return {
			"success": true,
			"presets": [],
			"count": 0,
			"message": "No export presets configured"
		}
	
	var config = ConfigFile.new()
	var err = config.load(config_path)
	
	if err != OK:
		return _error("Failed to load export_presets.cfg: " + error_string(err))
	
	var presets: Array[Dictionary] = []
	var preset_sections = []
	
	# Find all preset sections
	for section in config.get_sections():
		if section.begins_with("preset."):
			preset_sections.append(section)
	
	# Extract preset info
	for section in preset_sections:
		var preset = {
			"name": config.get_value(section, "name", "Unknown"),
			"platform": config.get_value(section, "platform", "Unknown"),
			"runnable": config.get_value(section, "runnable", false),
			"dedicated_server": config.get_value(section, "dedicated_server", false)
		}
		presets.append(preset)
	
	return {
		"success": true,
		"presets": presets,
		"count": presets.size()
	}


## Create a new export preset
##
## WHY: Set up export configurations programmatically, useful for
## automated project setup or template generation.
##
## Parameters:
##   preset_name: Name for the new preset
##   platform: Platform identifier (e.g., "Windows Desktop", "Linux/X11")
##   settings: Dictionary of export settings
##
## Returns: Dictionary with success status
func create_export_preset(preset_name: String, platform: String, settings: Dictionary = {}) -> Dictionary:
	if preset_name.is_empty():
		return _error("preset_name is required")
	
	if platform.is_empty():
		return _error("platform is required")
	
	var config_path = "res://export_presets.cfg"
	var config = ConfigFile.new()
	
	# Load existing if present
	if FileAccess.file_exists(config_path):
		config.load(config_path)
	
	# Find next preset index
	var preset_index = 0
	for section in config.get_sections():
		if section.begins_with("preset."):
			preset_index += 1
	
	var section_name = "preset.%d" % preset_index
	
	# Set basic preset info
	config.set_value(section_name, "name", preset_name)
	config.set_value(section_name, "platform", platform)
	config.set_value(section_name, "runnable", settings.get("runnable", true))
	config.set_value(section_name, "dedicated_server", settings.get("dedicated_server", false))
	config.set_value(section_name, "custom_features", settings.get("custom_features", ""))
	config.set_value(section_name, "export_filter", settings.get("export_filter", "all_resources"))
	
	# Set additional settings
	for key in settings.keys():
		if key not in ["runnable", "dedicated_server", "custom_features", "export_filter"]:
			config.set_value(section_name, key, settings[key])
	
	# Save config
	var err = config.save(config_path)
	
	if err != OK:
		return _error("Failed to save export preset: " + error_string(err))
	
	_logger.info("Created export preset", {
		"name": preset_name,
		"platform": platform
	})
	
	return {
		"success": true,
		"preset_name": preset_name,
		"platform": platform,
		"preset_index": preset_index,
		"message": "Export preset created successfully"
	}


## Run a custom build script
##
## WHY: Projects may have custom build steps (asset processing,
## code generation) that should run as part of the build process.
##
## Parameters:
##   script_path: Path to GDScript file to execute
##   arguments: Dictionary of arguments to pass to script
##
## Returns: Dictionary with execution result
func run_custom_build_script(script_path: String, arguments: Dictionary = {}) -> Dictionary:
	if script_path.is_empty():
		return _error("script_path is required")
	
	var res_path = _normalize_path(script_path)
	
	if not FileAccess.file_exists(res_path):
		return _error("Build script not found: " + res_path)
	
	# Load and execute script
	var script = load(res_path)
	
	if not script:
		return _error("Failed to load build script")
	
	var script_instance = script.new()
	
	# Check for expected method
	if not script_instance.has_method("run_build"):
		return _error("Build script must have 'run_build(args: Dictionary)' method")
	
	_logger.info("Running custom build script", {
		"script": res_path,
		"args": arguments
	})
	
	var result = script_instance.run_build(arguments)
	
	return {
		"success": true,
		"script_path": res_path,
		"result": result,
		"message": "Build script executed"
	}


## Get project build information
##
## WHY: Understand build configuration, version numbers, or detect
## if project is properly configured for builds.
##
## Returns: Dictionary with build info
func get_build_info() -> Dictionary:
	var info = {
		"project_name": ProjectSettings.get_setting("application/config/name"),
		"project_version": ProjectSettings.get_setting("application/config/version", "1.0.0"),
		"godot_version": Engine.get_version_info(),
		"export_presets_exist": FileAccess.file_exists("res://export_presets.cfg"),
		"main_scene": ProjectSettings.get_setting("application/run/main_scene"),
		"project_features": ProjectSettings.get_setting("application/config/features", [])
	}
	
	return {
		"success": true,
		"info": info
	}


## Normalize path to res:// format
func _normalize_path(path: String) -> String:
	if path.begins_with("res://"):
		return path
	
	var project_path = ProjectSettings.globalize_path("res://")
	
	if path.begins_with(project_path):
		var relative = path.replace(project_path, "")
		return "res://" + relative
	
	if not path.begins_with("/"):
		return "res://" + path
	
	return path


func _error(message: String) -> Dictionary:
	return {
		"success": false,
		"error": message
	}
