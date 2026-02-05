extends RefCounted
class_name EditorControlHandler

## EditorControlHandler - Handles Godot editor control operations
##
## WHY: Editor control (launching, running projects) is a distinct
## responsibility separate from HTTP/RPC handling.


var _logger: MCPLogger


func _init(logger: MCPLogger) -> void:
	_logger = logger


## Launch Godot editor for a specific project
##
## WHY: Creates a new Godot editor process with the specified project.
## Used by AI tools to open projects for development.
func launch_editor(project_path: String, editor_path: String = "", additional_args: Array = []) -> Dictionary:
	if project_path.is_empty():
		return _error("project_path is required")
	
	# WHY: Auto-detect Godot executable if not provided
	# Makes the API more convenient to use
	if editor_path.is_empty():
		editor_path = _detect_godot_executable()
	
	if editor_path.is_empty():
		return _error("Godot executable not found")
	
	# Build command arguments
	# WHY: --editor ensures the editor opens instead of running the game
	# WHY: --path tells Godot which project to open
	var args: PackedStringArray = PackedStringArray(["--editor", "--path", project_path])
	for arg in additional_args:
		args.append(str(arg))
	
	# Launch the editor process
	# WHY: OS.create_process creates a new process without blocking
	var pid := OS.create_process(editor_path, args)
	
	if pid == -1:
		return _error("Failed to launch editor")
	
	_logger.info("Launched Godot editor", {
		"pid": pid,
		"project_path": project_path
	})
	
	return {
		"success": true,
		"processId": pid,
		"editorPath": editor_path,
		"projectPath": project_path
	}


## Run a Godot project
##
## WHY: Launches a project in play mode, optionally with a specific scene.
## Used by AI tools to test projects.
func run_project(project_path: String, scene: String = "", debug: bool = true) -> Dictionary:
	if project_path.is_empty():
		return _error("project_path is required")
	
	var editor_path := _detect_godot_executable()
	if editor_path.is_empty():
		return _error("Godot executable not found")
	
	# Build command arguments
	var args: PackedStringArray = PackedStringArray(["--path", project_path])
	
	# WHY: --debug enables debugging features (breakpoints, profiling)
	if debug:
		args.append("--debug")
	
	# WHY: Scene argument launches specific scene instead of main scene
	if not scene.is_empty():
		args.append(scene)
	
	# Launch the project
	var pid := OS.create_process(editor_path, args)
	
	if pid == -1:
		return _error("Failed to run project")
	
	_logger.info("Started Godot project", {
		"pid": pid,
		"project_path": project_path,
		"debug": debug
	})
	
	return {
		"success": true,
		"processId": pid,
		"projectPath": project_path,
		"debug": debug,
		"scene": scene
	}


## Stop a running Godot process
##
## WHY: Allows graceful or forceful termination of processes.
## Note: GDScript lacks direct process kill APIs, needs OS-specific implementation.
func stop_execution(process_id: int, force: bool = false) -> Dictionary:
	if process_id == -1:
		return _error("process_id is required")

	var termination := _terminate_process(process_id, force)
	if not termination.get("success", false):
		_logger.warn("Failed to terminate process", {
			"process_id": process_id,
			"force": force,
			"exit_code": termination.get("exit_code"),
			"output": termination.get("output")
		})
		return {
			"success": false,
			"message": termination.get("message", "Failed to terminate process"),
			"processId": process_id,
			"exitCode": termination.get("exit_code"),
			"output": termination.get("output")
		}

	_logger.info("Terminated process", {
		"process_id": process_id,
		"force": force,
		"exit_code": termination.get("exit_code")
	})

	return {
		"success": true,
		"processId": process_id,
		"exitCode": termination.get("exit_code"),
		"output": termination.get("output")
	}


## Get Godot engine version information
##
## WHY: Clients need to know which Godot version they're communicating with
## for compatibility checking.
func get_godot_version() -> Dictionary:
	var version_info := Engine.get_version_info()
	var major := int(version_info.get("major", 0))
	var minor := int(version_info.get("minor", 0))
	var patch := int(version_info.get("patch", 0))
	
	return {
		"version": "%d.%d.%d" % [major, minor, patch],
		"versionString": str(version_info.get("string", "")),
		"status": str(version_info.get("status", "")),
		"build": str(version_info.get("build", "")),
		"hash": str(version_info.get("hash", "")),
		"year": int(version_info.get("year", 0))
	}


## Detect Godot executable location
##
## WHY: Godot can be installed in various locations depending on OS.
## Auto-detection makes the API more user-friendly.
func _detect_godot_executable() -> String:
	var possible_paths: Array = []
	
	# WHY: Different operating systems have different install locations
	if OS.get_name() == "Windows":
		possible_paths = [
			"C:/Program Files/Godot/Godot.exe",
			"C:/Program Files (x86)/Godot/Godot.exe",
			"C:/Godot/Godot.exe",
			OS.get_executable_path()  # Current running Godot executable
		]
	elif OS.get_name() == "macOS":
		possible_paths = [
			"/Applications/Godot.app/Contents/MacOS/Godot",
			OS.get_executable_path()
		]
	else:  # Linux
		possible_paths = [
			"/usr/local/bin/godot",
			"/usr/bin/godot",
			"/opt/godot/godot",
			OS.get_executable_path()
		]
	
	for path in possible_paths:
		if FileAccess.file_exists(path):
			return path
	
	return ""


## Terminate a process with OS-specific commands
##
## WHY: Godot doesn't expose direct kill APIs across platforms.
## Use system tools with predictable exit codes.
func _terminate_process(process_id: int, force: bool) -> Dictionary:
	var os_name := OS.get_name()
	var output: Array = []
	var exit_code := -1
	var args: PackedStringArray = PackedStringArray()
	var command := ""

	if os_name == "Windows":
		command = "taskkill"
		args.append("/PID")
		args.append(str(process_id))
		args.append("/T")
		if force:
			args.append("/F")
	elif os_name == "macOS" or os_name == "Linux" or os_name == "FreeBSD":
		command = "kill"
		args.append("-9" if force else "-15")
		args.append(str(process_id))
	else:
		return {
			"success": false,
			"message": "Unsupported OS for process termination",
			"exit_code": exit_code,
			"output": output
		}

	# WHY: OS.execute returns exit code and fills output when blocking
	exit_code = OS.execute(command, args, output, true)
	var success = exit_code == 0
	return {
		"success": success,
		"message": "Process terminated" if success else "Process termination failed",
		"exit_code": exit_code,
		"output": output
	}


func _error(message: String) -> Dictionary:
	return {
		"success": false,
		"error": message
	}
