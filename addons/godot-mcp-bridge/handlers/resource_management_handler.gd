extends RefCounted

## ResourceManagementHandler - Manages asset imports and resources
##
## WHY: Godot's import system runs in the editor. AI tools need to
## trigger imports, modify settings, or analyze resource metadata.

const MCPLoggerScript := preload("res://addons/godot-mcp-bridge/core/logger.gd")

var _logger: MCPLogger
var _editor_interface: EditorInterface
var _filesystem: EditorFileSystem


func _init(logger: MCPLogger, editor_interface: EditorInterface) -> void:
	_logger = logger
	_editor_interface = editor_interface
	if _editor_interface:
		_filesystem = _editor_interface.get_resource_filesystem()


## Import or reimport an asset file
##
## WHY: After modifying asset files externally or changing import settings,
## AI tools need to trigger Godot's import system to update resources.
##
## Parameters:
##   asset_path: Path to asset file (res:// or absolute)
##   force: If true, force reimport even if unchanged
##
## Returns: Dictionary with import status
func import_asset(asset_path: String, force: bool = false) -> Dictionary:
	if asset_path.is_empty():
		return _error("asset_path is required")
	
	if not _filesystem:
		return _error("Editor filesystem not available")
	
	var res_path = _normalize_path(asset_path)
	
	if not FileAccess.file_exists(res_path):
		return _error("Asset file not found: " + res_path)
	
	if force:
		_filesystem.reimport_files([res_path])
	else:
		_filesystem.scan()
	
	_logger.info("Triggered asset import", {
		"asset_path": res_path,
		"force": force
	})
	
	return {
		"success": true,
		"asset_path": res_path,
		"force": force,
		"message": "Import triggered (async - may take time)"
	}


## Get import settings for an asset
##
## WHY: Understanding how assets are imported helps AI tools
## suggest optimizations or detect configuration issues.
##
## Parameters:
##   asset_path: Path to asset file
##
## Returns: Dictionary with import settings
func get_import_settings(asset_path: String) -> Dictionary:
	if asset_path.is_empty():
		return _error("asset_path is required")
	
	var res_path = _normalize_path(asset_path)
	
	if not FileAccess.file_exists(res_path):
		return _error("Asset file not found: " + res_path)
	
	# Check for .import file
	var import_path = res_path + ".import"
	
	if not FileAccess.file_exists(import_path):
		return {
			"success": true,
			"asset_path": res_path,
			"has_import_file": false,
			"message": "Asset has no import file"
		}
	
	# Parse .import file
	var config = ConfigFile.new()
	var err = config.load(import_path)
	
	if err != OK:
		return _error("Failed to load import file: " + error_string(err))
	
	# Extract settings
	var settings = {}
	
	for section in config.get_sections():
		settings[section] = {}
		for key in config.get_section_keys(section):
			settings[section][key] = config.get_value(section, key)
	
	return {
		"success": true,
		"asset_path": res_path,
		"has_import_file": true,
		"settings": settings
	}


## Set import settings for an asset
##
## WHY: AI tools can optimize import settings based on asset usage,
## like lowering texture quality for background elements.
##
## Parameters:
##   asset_path: Path to asset file
##   settings: Dictionary of import settings
##
## Returns: Dictionary with success status
func set_import_settings(asset_path: String, settings: Dictionary) -> Dictionary:
	if asset_path.is_empty():
		return _error("asset_path is required")
	
	if settings.is_empty():
		return _error("settings dictionary is required")
	
	var res_path = _normalize_path(asset_path)
	
	if not FileAccess.file_exists(res_path):
		return _error("Asset file not found: " + res_path)
	
	var import_path = res_path + ".import"
	
	# Load existing or create new import file
	var config = ConfigFile.new()
	if FileAccess.file_exists(import_path):
		config.load(import_path)
	
	# Update settings
	for section in settings.keys():
		if settings[section] is Dictionary:
			for key in settings[section].keys():
				config.set_value(section, key, settings[section][key])
	
	# Save import file
	var err = config.save(import_path)
	
	if err != OK:
		return _error("Failed to save import file: " + error_string(err))
	
	# Trigger reimport
	if _filesystem:
		_filesystem.reimport_files([res_path])
	
	_logger.info("Updated import settings", {"asset_path": res_path})
	
	return {
		"success": true,
		"asset_path": res_path,
		"message": "Import settings updated, reimport triggered"
	}


## Reimport all assets matching a pattern
##
## WHY: Bulk operations like "reimport all textures in the sprites/ folder"
## for performance optimization or testing.
##
## Parameters:
##   path_pattern: Glob pattern like "res://sprites/**/*.png"
##
## Returns: Dictionary with reimport count
func reimport_assets(path_pattern: String) -> Dictionary:
	if path_pattern.is_empty():
		return _error("path_pattern is required")
	
	if not _filesystem:
		return _error("Editor filesystem not available")
	
	# Scan filesystem for matching files
	var matching_files = _find_files_matching(path_pattern)
	
	if matching_files.is_empty():
		return {
			"success": true,
			"pattern": path_pattern,
			"count": 0,
			"message": "No files matched pattern"
		}
	
	# Trigger reimport
	_filesystem.reimport_files(matching_files)
	
	_logger.info("Triggered bulk reimport", {
		"pattern": path_pattern,
		"count": matching_files.size()
	})
	
	return {
		"success": true,
		"pattern": path_pattern,
		"count": matching_files.size(),
		"files": matching_files,
		"message": "Reimport triggered for %d files" % matching_files.size()
	}


## Get resource metadata and dependencies
##
## WHY: Analyze resource usage, detect unused assets, or understand
## dependency chains for optimization.
##
## Parameters:
##   resource_path: Path to resource file
##
## Returns: Dictionary with resource metadata
func get_resource_metadata(resource_path: String) -> Dictionary:
	if resource_path.is_empty():
		return _error("resource_path is required")
	
	var res_path = _normalize_path(resource_path)
	
	if not ResourceLoader.exists(res_path):
		return _error("Resource not found: " + res_path)
	
	# Get dependencies
	var dependencies = ResourceLoader.get_dependencies(res_path)
	
	# Get resource type by loading it
	# WHY: ResourceLoader.get_resource_type() doesn't exist in Godot 4.x
	# We load the resource and check its class instead
	var resource = ResourceLoader.load(res_path, "", ResourceLoader.CACHE_MODE_REUSE)
	var resource_type = resource.get_class() if resource else "Unknown"
	
	# Check if cached
	var is_cached = ResourceLoader.has_cached(res_path)
	
	return {
		"success": true,
		"resource_path": res_path,
		"resource_type": resource_type,
		"is_cached": is_cached,
		"dependencies": dependencies,
		"dependency_count": dependencies.size()
	}


## Find files matching glob pattern
##
## WHY: Search filesystem for assets to process
func _find_files_matching(pattern: String) -> Array[String]:
	var files: Array[String] = []
	
	# Simple glob implementation
	# Extract base directory and file pattern
	var base_dir = "res://"
	var file_pattern = "*"
	
	if pattern.contains("/"):
		var parts = pattern.rsplit("/", true, 1)
		base_dir = parts[0]
		if parts.size() > 1:
			file_pattern = parts[1]
	
	_scan_directory(base_dir, file_pattern, files)
	
	return files


## Recursively scan directory for matching files
##
## WHY: Implement glob pattern matching
func _scan_directory(dir_path: String, pattern: String, files: Array[String], depth: int = 0) -> void:
	if depth > 10:  # Prevent infinite recursion
		return
	
	var dir = DirAccess.open(dir_path)
	if not dir:
		return
	
	dir.list_dir_begin()
	var file_name = dir.get_next()
	
	while file_name != "":
		if file_name == "." or file_name == "..":
			file_name = dir.get_next()
			continue
		
		var full_path = dir_path + "/" + file_name
		
		if dir.current_is_dir():
			if pattern.contains("**"):
				_scan_directory(full_path, pattern, files, depth + 1)
		else:
			if _matches_pattern(file_name, pattern):
				files.append(full_path)
		
		file_name = dir.get_next()
	
	dir.list_dir_end()


## Simple pattern matching
##
## WHY: Support basic glob patterns like *.png or texture_*
func _matches_pattern(file_name: String, pattern: String) -> bool:
	if pattern == "*" or pattern == "**":
		return true
	
	if pattern.contains("*"):
		var regex = RegEx.new()
		var regex_pattern = pattern.replace(".", "\\.").replace("*", ".*")
		regex.compile("^" + regex_pattern + "$")
		return regex.search(file_name) != null
	
	return file_name == pattern


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
