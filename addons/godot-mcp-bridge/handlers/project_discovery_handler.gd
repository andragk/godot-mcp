extends RefCounted
class_name ProjectDiscoveryHandler

## ProjectDiscoveryHandler - Discovers and analyzes Godot projects
##
## WHY: Project discovery is a distinct responsibility separate
## from HTTP/RPC handling. Makes the code testable.


var _logger: MCPLogger
const MAX_SEARCH_DEPTH := 3  ## WHY: Prevent infinite recursion in deep directory trees


func _init(logger: MCPLogger) -> void:
	_logger = logger


## List Godot projects in specified directories
##
## WHY: Allows tools to discover all projects on a system
## without manual configuration.
func list_projects(search_paths: Array, recursive: bool = false) -> Dictionary:
	if search_paths.is_empty():
		return _error("search_paths is required")
	
	var projects: Array = []
	
	for search_path in search_paths:
		var path := str(search_path)
		projects.append_array(_find_projects_in_directory(path, recursive, 0))
	
	_logger.info("Listed projects", {
		"search_paths": search_paths,
		"project_count": projects.size()
	})
	
	return {"projects": projects}


## Analyze a specific Godot project
##
## WHY: Provides project metadata (file counts, version, name)
## useful for AI tools to understand project structure.
func analyze_project(project_path: String) -> Dictionary:
	if project_path.is_empty():
		return _error("project_path is required")
	
	# WHY: Verify project.godot exists before analyzing
	var project_file := project_path.path_join("project.godot")
	if not FileAccess.file_exists(project_file):
		return _error("project.godot not found")
	
	var analysis := _analyze_project_structure(project_path)
	
	_logger.debug("Analyzed project", {
		"project_path": project_path,
		"scenes": analysis.get("scenes", 0)
	})
	
	return analysis


## Recursively find all Godot projects in a directory
##
## WHY: Projects can be nested or scattered across directories.
## Recursive search finds them all up to a safe depth limit.
func _find_projects_in_directory(dir_path: String, recursive: bool, depth: int) -> Array:
	var projects: Array = []
	
	# WHY: Prevent stack overflow from extremely deep directory trees
	if depth > MAX_SEARCH_DEPTH:
		_logger.warn("Max search depth exceeded", {"path": dir_path})
		return projects
	
	var dir := DirAccess.open(dir_path)
	if not dir:
		_logger.warn("Failed to open directory", {"path": dir_path})
		return projects
	
	dir.list_dir_begin()
	var file_name := dir.get_next()
	
	while file_name != "":
		# WHY: Skip . and .. to avoid infinite loops
		if file_name == "." or file_name == "..":
			file_name = dir.get_next()
			continue
		
		var full_path := dir_path.path_join(file_name)
		
		if dir.current_is_dir():
			# WHY: Recursively search subdirectories if requested
			if recursive:
				projects.append_array(_find_projects_in_directory(full_path, recursive, depth + 1))
		elif file_name == "project.godot":
			# WHY: project.godot file marks a Godot project directory
			var project_name := _get_project_name(full_path)
			projects.append({
				"path": dir_path,
				"name": project_name
			})
		
		file_name = dir.get_next()
	
	dir.list_dir_end()
	return projects


## Extract project name from project.godot file
##
## WHY: Project name is stored in config file, not directory name.
## This gets the official project name.
func _get_project_name(project_file_path: String) -> String:
	var config := ConfigFile.new()
	var err := config.load(project_file_path)
	
	if err != OK:
		_logger.warn("Failed to load project config", {"path": project_file_path})
		return "Unknown"
	
	# WHY: application/config/name is the standard key for project name
	return config.get_value("application", "config/name", "Unnamed Project")


## Analyze project structure and count files
##
## WHY: Provides quick overview of project size and composition
## without loading all files into memory.
func _analyze_project_structure(project_path: String) -> Dictionary:
	var scenes := _count_files_by_extension(project_path, ".tscn")
	var scripts := _count_files_by_extension(project_path, ".gd")
	var resources := _count_files_by_extension(project_path, ".tres")
	var assets := _count_assets(project_path)
	var total_size := _calculate_total_size(project_path)
	var total_files := _count_all_files(project_path)
	var plugins := _collect_plugins(project_path)
	
	var project_file := project_path.path_join("project.godot")
	var config := ConfigFile.new()
	config.load(project_file)
	
	var project_name := config.get_value("application", "config/name", "Unknown")
	var godot_version := config.get_value("application", "config/features", PackedStringArray())
	var main_scene := config.get_value("application", "run/main_scene", "")

	var warnings: Array[String] = []
	if main_scene != "":
		if not FileAccess.file_exists(main_scene):
			warnings.append("Main scene not found: %s" % main_scene)
	else:
		warnings.append("Main scene not configured (application/run/main_scene)")
	
	return {
		"name": project_name,
		"godotVersion": str(godot_version),
		"scenes": scenes,
		"scripts": scripts,
		"resources": resources,
		"assets": assets,
		"totalSizeBytes": total_size,
		"totalFiles": total_files,
		"plugins": plugins,
		"mainScene": main_scene,
		"warnings": warnings,
		"path": project_path
	}


## Recursively count files with specific extension
##
## WHY: File counting shows project size and helps estimate
## complexity without parsing all files.
func _count_files_by_extension(dir_path: String, extension: String) -> int:
	var count := 0
	var dir := DirAccess.open(dir_path)
	
	if not dir:
		return count
	
	dir.list_dir_begin()
	var file_name := dir.get_next()
	
	while file_name != "":
		# WHY: Skip hidden/special directories
		if file_name == "." or file_name == "..":
			file_name = dir.get_next()
			continue
		
		var full_path := dir_path.path_join(file_name)
		
		if dir.current_is_dir():
			# WHY: Recursively count in subdirectories
			count += _count_files_by_extension(full_path, extension)
		elif file_name.ends_with(extension):
			count += 1
		
		file_name = dir.get_next()
	
	dir.list_dir_end()
	return count


## Count common asset file types
func _count_assets(dir_path: String) -> int:
	var extensions = [".png", ".jpg", ".jpeg", ".webp", ".ogg", ".wav", ".mp3", ".glb", ".fbx"]
	var total := 0
	for ext in extensions:
		total += _count_files_by_extension(dir_path, ext)
	return total


## Calculate total size of files in project
func _calculate_total_size(dir_path: String) -> int:
	var total := 0
	var dir := DirAccess.open(dir_path)
	if not dir:
		return total

	dir.list_dir_begin()
	var file_name := dir.get_next()

	while file_name != "":
		if file_name == "." or file_name == "..":
			file_name = dir.get_next()
			continue

		var full_path := dir_path.path_join(file_name)
		if dir.current_is_dir():
			total += _calculate_total_size(full_path)
		else:
			var file := FileAccess.open(full_path, FileAccess.READ)
			if file:
				total += file.get_length()
				file.close()

		file_name = dir.get_next()

	dir.list_dir_end()
	return total


## Count all files in project
func _count_all_files(dir_path: String) -> int:
	var total := 0
	var dir := DirAccess.open(dir_path)
	if not dir:
		return total

	dir.list_dir_begin()
	var file_name := dir.get_next()

	while file_name != "":
		if file_name == "." or file_name == "..":
			file_name = dir.get_next()
			continue

		var full_path := dir_path.path_join(file_name)
		if dir.current_is_dir():
			total += _count_all_files(full_path)
		else:
			total += 1

		file_name = dir.get_next()

	dir.list_dir_end()
	return total


## Collect enabled plugin metadata
func _collect_plugins(project_path: String) -> Array:
	var plugins: Array = []
	var addons_path := project_path.path_join("addons")
	var addons_dir := DirAccess.open(addons_path)

	if not addons_dir:
		return plugins

	addons_dir.list_dir_begin()
	var addon_name := addons_dir.get_next()

	while addon_name != "":
		if addon_name == "." or addon_name == "..":
			addon_name = addons_dir.get_next()
			continue

		if addons_dir.current_is_dir():
			var plugin_cfg := addons_path.path_join(addon_name).path_join("plugin.cfg")
			if FileAccess.file_exists(plugin_cfg):
				var cfg := ConfigFile.new()
				var err := cfg.load(plugin_cfg)
				if err == OK:
					plugins.append({
						"name": cfg.get_value("plugin", "name", addon_name),
						"author": cfg.get_value("plugin", "author", ""),
						"version": cfg.get_value("plugin", "version", ""),
						"path": "res://addons/%s" % addon_name
					})
				else:
					plugins.append({
						"name": addon_name,
						"path": "res://addons/%s" % addon_name,
						"warning": "Failed to load plugin.cfg"
					})

		addon_name = addons_dir.get_next()

	addons_dir.list_dir_end()
	return plugins


func _error(message: String) -> Dictionary:
	return {
		"success": false,
		"error": message
	}
