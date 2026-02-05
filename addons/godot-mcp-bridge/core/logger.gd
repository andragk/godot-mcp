extends RefCounted

## MCPLogger - Centralized logging for Godot MCP Bridge
##
## WHY: Provides consistent, timestamped logging with configurable levels
## across all bridge components. Simplifies debugging and monitoring.

enum LogLevel {
	DEBUG,   ## Detailed diagnostic information
	INFO,    ## General informational messages
	WARN,    ## Warning messages for potential issues
	ERROR    ## Error messages for failures
}

## Current minimum log level - messages below this are suppressed
var min_level: LogLevel = LogLevel.INFO


## Log a message with the specified level
##
## WHY: Centralizes all logging to ensure consistent format and
## allows runtime filtering by log level.
func log_message(level: LogLevel, message: String, context: Dictionary = {}) -> void:
	if level < min_level:
		return
	
	var level_str := _get_level_string(level)
	var timestamp := Time.get_datetime_string_from_system()
	
	var formatted_message := "[%s] [%s] %s" % [timestamp, level_str, message]
	
	# Add context if provided
	# WHY: Context provides additional debugging information without
	# cluttering the main message
	if not context.is_empty():
		formatted_message += " | Context: %s" % JSON.stringify(context)
	
	print(formatted_message)


## Log a debug message (only visible when min_level is DEBUG)
func debug(message: String, context: Dictionary = {}) -> void:
	log_message(LogLevel.DEBUG, message, context)


## Log an informational message
func info(message: String, context: Dictionary = {}) -> void:
	log_message(LogLevel.INFO, message, context)


## Log a warning message
func warn(message: String, context: Dictionary = {}) -> void:
	log_message(LogLevel.WARN, message, context)


## Log an error message
func error(message: String, context: Dictionary = {}) -> void:
	log_message(LogLevel.ERROR, message, context)


## Set the minimum log level
##
## WHY: Allows runtime adjustment of verbosity without code changes.
## Use DEBUG during development, INFO in production.
func set_min_level(level: LogLevel) -> void:
	min_level = level


func _get_level_string(level: LogLevel) -> String:
	match level:
		LogLevel.DEBUG: return "DEBUG"
		LogLevel.INFO: return "INFO"
		LogLevel.WARN: return "WARN"
		LogLevel.ERROR: return "ERROR"
		_: return "UNKNOWN"
