extends RefCounted

## HTTPRequestParser - Parses raw HTTP request strings
##
## WHY: Separates HTTP parsing logic from server management.
## Makes parsing testable and reusable.

## Parsed HTTP request data
class ParsedRequest:
	var method: String
	var path: String
	var headers: Dictionary
	var body: String
	var is_valid: bool
	var error_message: String
	
	func _init() -> void:
		method = ""
		path = ""
		headers = {}
		body = ""
		is_valid = false
		error_message = ""


## Parse a raw HTTP request string
##
## WHY: HTTP parsing is complex - extracting this into a dedicated
## function makes the code testable and easier to maintain.
##
## Returns a ParsedRequest object with parsed data or error information.
func parse(request_string: String) -> ParsedRequest:
	var result := ParsedRequest.new()
	
	if request_string.is_empty():
		result.error_message = "Empty request"
		return result
	
	# Split request into lines
	# WHY: HTTP uses CRLF line endings by spec (RFC 2616)
	var lines := request_string.split("\r\n")
	
	if lines.is_empty():
		result.error_message = "No lines in request"
		return result
	
	# Parse request line (e.g., "GET /path HTTP/1.1")
	# WHY: Request line is required by HTTP spec and contains method+path
	if not _parse_request_line(lines[0], result):
		return result
	
	# Parse headers and find body separator
	# WHY: Headers and body are separated by empty line (CRLF CRLF)
	var body_start_index := _parse_headers(lines, result)
	
	# Extract body if present
	# WHY: Body contains JSON-RPC request data for POST requests
	if body_start_index != -1:
		result.body = _extract_body(request_string, body_start_index)
	
	result.is_valid = true
	return result


## Parse the HTTP request line (first line)
func _parse_request_line(line: String, result: ParsedRequest) -> bool:
	var parts := line.split(" ")
	
	# WHY: HTTP request line must have exactly 3 parts: METHOD PATH VERSION
	if parts.size() < 2:
		result.error_message = "Invalid request line format"
		return false
	
	result.method = parts[0]
	result.path = parts[1]
	return true


## Parse HTTP headers from request lines
##
## WHY: Headers contain metadata like Content-Type, Content-Length
## needed for processing the request properly.
##
## Returns the line index where body starts, or -1 if no body
func _parse_headers(lines: PackedStringArray, result: ParsedRequest) -> int:
	var body_line_index := -1
	
	for i in range(1, lines.size()):
		var line := lines[i]
		
		# Empty line marks end of headers and start of body
		# WHY: HTTP spec requires empty line between headers and body
		if line.is_empty():
			body_line_index = i + 1
			break
		
		# Parse header "Name: Value"
		var colon_pos := line.find(":")
		if colon_pos != -1:
			var header_name := line.substr(0, colon_pos).strip_edges()
			var header_value := line.substr(colon_pos + 1).strip_edges()
			result.headers[header_name.to_lower()] = header_value
	
	return body_line_index


## Extract body from raw request string
##
## WHY: Body may contain binary data or special characters,
## so we extract from original string rather than reconstructing from lines
func _extract_body(request_string: String, body_start_line: int) -> String:
	# Find the double CRLF that separates headers from body
	var body_start := request_string.find("\r\n\r\n")
	
	if body_start == -1:
		return ""
	
	# WHY: Skip the double CRLF (4 characters: \r\n\r\n)
	return request_string.substr(body_start + 4)
