extends RefCounted
class_name HTTPResponseBuilder

## HTTPResponseBuilder - Builds HTTP response strings
##
## WHY: Separates HTTP response building from business logic.
## Ensures consistent response format and headers.


## Build a JSON HTTP response
##
## WHY: Most API responses are JSON. This centralizes response
## building with proper headers and consistent structure.
func build_json_response(status_code: int, data: Dictionary) -> String:
	var json := JSON.stringify(data)
	var status_text := _get_status_text(status_code)
	
	var response := "HTTP/1.1 %d %s\r\n" % [status_code, status_text]
	response += "Content-Type: application/json\r\n"
	response += "Content-Length: %d\r\n" % json.length()
	response += "Connection: close\r\n"
	
	# WHY: CORS header allows web clients to access the API
	# from different origins (important for web-based tools)
	response += "Access-Control-Allow-Origin: *\r\n"
	response += "\r\n"
	response += json
	
	return response


## Build an error HTTP response
##
## WHY: Error responses should be consistent and include
## helpful status codes and messages.
func build_error_response(status_code: int, message: String) -> String:
	var status_text := _get_status_text(status_code)
	
	var response := "HTTP/1.1 %d %s\r\n" % [status_code, status_text]
	response += "Content-Type: text/plain\r\n"
	response += "Content-Length: %d\r\n" % message.length()
	response += "Connection: close\r\n"
	response += "\r\n"
	response += message
	
	return response


## Get HTTP status text for status code
##
## WHY: HTTP spec requires textual description after status code.
## Centralizing this ensures correctness and consistency.
func _get_status_text(code: int) -> String:
	match code:
		200: return "OK"
		401: return "Unauthorized"
		400: return "Bad Request"
		413: return "Payload Too Large"
		404: return "Not Found"
		405: return "Method Not Allowed"
		500: return "Internal Server Error"
		503: return "Service Unavailable"
		_: return "Unknown"
