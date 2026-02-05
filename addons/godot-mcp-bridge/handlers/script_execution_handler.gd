extends RefCounted
class_name ScriptExecutionHandler

## ScriptExecutionHandler - Executes GDScript code in editor context
##
## WHY: Allows AI tools to run GDScript code directly in the editor
## for automation, testing, and interactive development workflows.

var _logger: MCPLogger
var _editor_interface: EditorInterface


func _init(logger: MCPLogger, editor_interface: EditorInterface) -> void:
	_logger = logger
	_editor_interface = editor_interface


## Execute GDScript code in the editor context
##
## WHY: Enables powerful automation like "add 10 enemies to the scene"
## or "calculate total memory usage of all textures".
##
## SECURITY: This is inherently dangerous and should only be used
## in trusted local development environments.
##
## Parameters:
##   code: GDScript code string to execute
##   context: Optional dictionary of variables to inject
##
## Returns: Dictionary with execution result or error
func run_gdscript(code: String, context: Dictionary = {}) -> Dictionary:
	if code.is_empty():
		return _error("code parameter is required")
	
	_logger.warn("Executing GDScript code", {
		"code_length": code.length(),
		"has_context": not context.is_empty()
	})
	
	# Create a GDScript instance
	var script = GDScript.new()
	script.source_code = _wrap_code(code, context)
	
	# Compile the script
	var compile_result = script.reload()
	
	if compile_result != OK:
		return _error("Script compilation failed: " + error_string(compile_result))
	
	# Create instance and execute
	var script_instance = script.new()
	
	if not script_instance.has_method("_execute"):
		return _error("Script does not have _execute method")
	
	# Execute and capture result
	var result = script_instance._execute()
	
	_logger.info("GDScript executed successfully")
	
	return {
		"success": true,
		"result": _serialize_result(result),
		"result_type": typeof(result)
	}


## Evaluate a GDScript expression and return the result
##
## WHY: Simpler than run_gdscript for single-line expressions like
## "Engine.get_version_info()" or "ProjectSettings.get_setting('...')".
##
## Parameters:
##   expression: GDScript expression string
##
## Returns: Dictionary with evaluation result
func evaluate_expression(expression: String) -> Dictionary:
	if expression.is_empty():
		return _error("expression parameter is required")
	
	_logger.debug("Evaluating expression", {"expression": expression})
	
	var expr = Expression.new()
	var parse_error = expr.parse(expression)
	
	if parse_error != OK:
		return _error("Expression parse error: " + expr.get_error_text())
	
	var result = expr.execute()
	
	if expr.has_execute_failed():
		return _error("Expression execution failed: " + expr.get_error_text())
	
	return {
		"success": true,
		"result": _serialize_result(result),
		"result_type": typeof(result),
		"expression": expression
	}


## Get editor settings value
##
## WHY: AI tools may need to check editor configuration like
## text editor settings, build settings, or feature flags.
##
## Parameters:
##   setting_path: Setting path like "interface/editor/display_scale"
##
## Returns: Dictionary with setting value
func get_editor_settings(setting_path: String) -> Dictionary:
	if setting_path.is_empty():
		return _error("setting_path is required")
	
	var editor_settings = EditorInterface.get_editor_settings()
	
	if not editor_settings:
		return _error("Editor settings not available")
	
	if not editor_settings.has_setting(setting_path):
		return _error("Setting not found: " + setting_path)
	
	var value = editor_settings.get_setting(setting_path)
	
	return {
		"success": true,
		"setting_path": setting_path,
		"value": _serialize_result(value),
		"value_type": typeof(value)
	}


## Set editor settings value
##
## WHY: Allows AI tools to configure the editor automatically,
## like setting code style, themes, or build options.
##
## Parameters:
##   setting_path: Setting path to modify
##   value: New value for the setting
##
## Returns: Dictionary with success status
func set_editor_settings(setting_path: String, value: Variant) -> Dictionary:
	if setting_path.is_empty():
		return _error("setting_path is required")
	
	var editor_settings = EditorInterface.get_editor_settings()
	
	if not editor_settings:
		return _error("Editor settings not available")
	
	# Validate setting exists
	if not editor_settings.has_setting(setting_path):
		return _error("Setting not found: " + setting_path)
	
	# Set the value
	editor_settings.set_setting(setting_path, value)
	
	_logger.info("Editor setting updated", {
		"setting_path": setting_path,
		"value": str(value)
	})
	
	return {
		"success": true,
		"setting_path": setting_path,
		"value": _serialize_result(value),
		"message": "Setting updated successfully"
	}


## Get list of available editor settings
##
## WHY: Discovery - allow AI tools to explore what settings exist
## without having to know all possible paths upfront.
##
## Parameters:
##   prefix: Optional prefix filter like "interface/" or "text_editor/"
##
## Returns: Dictionary with array of setting paths
func list_editor_settings(prefix: String = "") -> Dictionary:
	var editor_settings = EditorInterface.get_editor_settings()
	
	if not editor_settings:
		return _error("Editor settings not available")
	
	# Note: Godot 4.x doesn't expose a list_settings method
	# Return common known settings
	var known_settings = _get_known_editor_settings()
	
	var filtered_settings: Array[String] = []
	
	for setting in known_settings:
		if prefix.is_empty() or setting.begins_with(prefix):
			filtered_settings.append(setting)
	
	return {
		"success": true,
		"settings": filtered_settings,
		"count": filtered_settings.size(),
		"filter": prefix,
		"note": "Limited to known settings (Godot API limitation)"
	}


## Wrap user code in executable function
##
## WHY: GDScript needs to be in a class with a callable method
func _wrap_code(code: String, context: Dictionary) -> String:
	var wrapped = "extends RefCounted\n\n"
	
	# Add context variables as properties
	for key in context.keys():
		wrapped += "var %s = %s\n" % [key, var_to_str(context[key])]
	
	wrapped += "\nfunc _execute():\n"
	
	# Indent user code
	for line in code.split("\n"):
		wrapped += "\t" + line + "\n"
	
	return wrapped


## Serialize result for JSON transport
##
## WHY: Not all GDScript types can be JSON serialized directly
func _serialize_result(value: Variant) -> Variant:
	var value_type = typeof(value)
	
	# Handle primitive types
	if value_type in [TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING]:
		return value
	
	# Handle arrays
	if value_type == TYPE_ARRAY:
		var arr: Array = []
		for item in value:
			arr.append(_serialize_result(item))
		return arr
	
	# Handle dictionaries
	if value_type == TYPE_DICTIONARY:
		var dict: Dictionary = {}
		for key in value.keys():
			dict[str(key)] = _serialize_result(value[key])
		return dict
	
	# Handle vectors
	if value is Vector2:
		return {"x": value.x, "y": value.y, "_type": "Vector2"}
	if value is Vector3:
		return {"x": value.x, "y": value.y, "z": value.z, "_type": "Vector3"}
	
	# Handle colors
	if value is Color:
		return {"r": value.r, "g": value.g, "b": value.b, "a": value.a, "_type": "Color"}
	
	# Fallback: Convert to string
	return str(value)


## Get list of known editor settings
##
## WHY: Godot doesn't expose settings list, so we maintain known paths
func _get_known_editor_settings() -> Array[String]:
	return [
		"interface/editor/display_scale",
		"interface/editor/font_size",
		"interface/theme/preset",
		"text_editor/theme/color_theme",
		"text_editor/behavior/indent_type",
		"text_editor/behavior/indent_size",
		"text_editor/behavior/auto_indent",
		"text_editor/completion/code_complete_enabled",
		"filesystem/on_save/safe_save_on_auto_save",
		"run/window_placement/rect",
		"run/output/font_size",
		"debugger/timeout",
		"export/android/android_sdk_path",
		"export/android/debug_keystore",
	]


func _error(message: String) -> Dictionary:
	return {
		"success": false,
		"error": message
	}
