extends RefCounted
class_name TestingHandler

## TestingHandler - Runs tests and profiling operations
##
## WHY: Enables automated testing workflows and performance analysis
## through AI-assisted test generation and execution.


var _logger: MCPLogger
var _editor_interface: EditorInterface


func _init(logger: MCPLogger, editor_interface: EditorInterface) -> void:
	_logger = logger
	_editor_interface = editor_interface


## Run GDScript tests using a test framework
##
## WHY: Automate test execution for CI/CD or AI-driven test-and-fix workflows.
##
## Parameters:
##   test_path: Path to test file or directory
##   framework: Test framework to use ("gut", "gdUnit4", or "custom")
##
## Returns: Dictionary with test results
func run_tests(test_path: String, framework: String = "gut") -> Dictionary:
	if test_path.is_empty():
		return _error("test_path is required")
	
	var res_path = _normalize_path(test_path)
	
	if not FileAccess.file_exists(res_path) and not DirAccess.dir_exists_absolute(res_path):
		return _error("Test path not found: " + res_path)
	
	_logger.info("Running tests", {
		"path": res_path,
		"framework": framework
	})
	
	# Note: Actual test execution depends on the test framework being installed
	# and accessible. This is a placeholder for framework integration.
	
	match framework:
		"gut":
			return _run_gut_tests(res_path)
		"gdUnit4":
			return _run_gdunit4_tests(res_path)
		"custom":
			return _run_custom_tests(res_path)
		_:
			return _error("Unknown test framework: " + framework)


## Run a specific scene for testing
##
## WHY: Test individual scenes interactively or in headless mode
## for visual regression testing or behavior validation.
##
## Parameters:
##   scene_path: Path to scene file
##   duration: How long to run (seconds, 0 for indefinite)
##   headless: Run without rendering
##
## Returns: Dictionary with test session info
func run_scene_test(scene_path: String, duration: float = 0.0, headless: bool = false) -> Dictionary:
	if scene_path.is_empty():
		return _error("scene_path is required")
	
	var res_path = _normalize_path(scene_path)
	
	if not FileAccess.file_exists(res_path):
		return _error("Scene not found: " + res_path)
	
	_logger.info("Running scene test", {
		"scene": res_path,
		"duration": duration,
		"headless": headless
	})
	
	# Note: Godot 4.x doesn't provide direct API to run scenes in test mode from GDScript
	# Would need to use EditorInterface.play_custom_scene() but can't control duration/headless
	
	if not _editor_interface:
		return _error("Editor interface not available")
	
	_editor_interface.play_custom_scene(res_path)
	
	return {
		"success": true,
		"scene_path": res_path,
		"duration": duration,
		"headless": headless,
		"message": "Scene test started (manual stop required)"
	}


## Get test results from last test run
##
## WHY: Retrieve test execution results for analysis or reporting.
##
## Returns: Dictionary with test results
func get_test_results() -> Dictionary:
	# Note: This would need to parse test framework output files
	# Different frameworks store results differently
	
	var result_files = [
		"res://.gut/test_results.json",
		"res://test_results.xml",
		"res://reports/test_results.json"
	]
	
	for result_file in result_files:
		if FileAccess.file_exists(result_file):
			return _parse_test_results(result_file)
	
	return {
		"success": true,
		"has_results": false,
		"message": "No test results found"
	}


## Profile scene performance
##
## WHY: Identify performance bottlenecks, measure frame times,
## or analyze resource usage for optimization.
##
## Parameters:
##   scene_path: Path to scene to profile
##   duration: How long to profile (seconds)
##   metrics: Array of metrics to collect ["fps", "memory", "draw_calls"]
##
## Returns: Dictionary with profiling data
func profile_scene(scene_path: String, duration: float = 5.0, metrics: Array = ["fps"]) -> Dictionary:
	if scene_path.is_empty():
		return _error("scene_path is required")
	
	var res_path = _normalize_path(scene_path)
	
	if not FileAccess.file_exists(res_path):
		return _error("Scene not found: " + res_path)
	
	_logger.info("Profiling scene", {
		"scene": res_path,
		"duration": duration,
		"metrics": metrics
	})
	
	# Note: Godot 4.x doesn't expose profiler API to GDScript
	# Would need C++ plugin or external profiling tools
	
	return {
		"success": false,
		"error": "Scene profiling requires Godot Profiler API (not exposed to GDScript)",
		"scene_path": res_path,
		"note": "Use Godot Editor's built-in profiler or external tools"
	}


## Run GUT (Godot Unit Test) framework tests
##
## WHY: GUT is a popular GDScript testing framework
func _run_gut_tests(test_path: String) -> Dictionary:
	# Check if GUT is installed
	if not FileAccess.file_exists("res://addons/gut/gut.gd"):
		return _error("GUT framework not installed (addons/gut/ not found)")
	
	# GUT tests typically run through a GUT scene
	# This is a simplified placeholder
	
	return {
		"success": false,
		"error": "GUT integration requires running GUT scene directly",
		"test_path": test_path,
		"note": "Use 'gut_cmdln.gd' script for headless GUT execution"
	}


## Run gdUnit4 framework tests
##
## WHY: gdUnit4 is another popular test framework for Godot
func _run_gdunit4_tests(test_path: String) -> Dictionary:
	# Check if gdUnit4 is installed
	if not FileAccess.file_exists("res://addons/gdUnit4/plugin.cfg"):
		return _error("gdUnit4 framework not installed (addons/gdUnit4/ not found)")
	
	return {
		"success": false,
		"error": "gdUnit4 integration requires test runner",
		"test_path": test_path,
		"note": "Use gdUnit4 command-line runner for automation"
	}


## Run custom test implementation
##
## WHY: Projects may have custom testing infrastructure
func _run_custom_tests(test_path: String) -> Dictionary:
	# Look for test runner script
	var runner_path = "res://test_runner.gd"
	
	if not FileAccess.file_exists(runner_path):
		return _error("Custom test runner not found: " + runner_path)
	
	var script = load(runner_path)
	if not script:
		return _error("Failed to load test runner")
	
	var runner = script.new()
	
	if not runner.has_method("run"):
		return _error("Test runner must have 'run(test_path: String)' method")
	
	var result = runner.run(test_path)
	
	return {
		"success": true,
		"test_path": test_path,
		"result": result,
		"framework": "custom"
	}


## Parse test results from file
##
## WHY: Extract structured test data from framework output
func _parse_test_results(result_file: String) -> Dictionary:
	if result_file.ends_with(".json"):
		var file = FileAccess.open(result_file, FileAccess.READ)
		if not file:
			return _error("Failed to open results file")
		
		var json_string = file.get_as_text()
		file.close()
		
		var json = JSON.new()
		var parse_result = json.parse(json_string)
		
		if parse_result != OK:
			return _error("Failed to parse JSON results")
		
		return {
			"success": true,
			"has_results": true,
			"results": json.data,
			"source_file": result_file
		}
	
	# XML or other formats would need different parsing
	return _error("Unsupported result file format: " + result_file)


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
