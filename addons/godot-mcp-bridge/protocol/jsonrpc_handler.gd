extends RefCounted

## JSONRPCHandler - Handles JSON-RPC 2.0 protocol operations
##
## WHY: JSON-RPC has specific structure and error codes.
## Centralizing this ensures compliance with the specification.

## JSON-RPC 2.0 error codes (as per spec)
const PARSE_ERROR := -32700
const INVALID_REQUEST := -32600
const METHOD_NOT_FOUND := -32601
const INVALID_PARAMS := -32602
const INTERNAL_ERROR := -32603


## Validate a JSON-RPC 2.0 request structure
##
## WHY: JSON-RPC 2.0 has strict requirements (jsonrpc field, method, id).
## Validating early prevents processing invalid requests.
func is_valid_request(request: Variant) -> bool:
	# WHY: JSON-RPC requests must be Dictionary objects
	if typeof(request) != TYPE_DICTIONARY:
		return false
	
	var req := request as Dictionary
	
	# WHY: "jsonrpc": "2.0" field is required by JSON-RPC 2.0 spec
	if not req.has("jsonrpc") or req.jsonrpc != "2.0":
		return false
	
	# WHY: "method" field must be a string naming the RPC method
	if not req.has("method") or typeof(req.method) != TYPE_STRING:
		return false
	
	# WHY: "id" field is required for request/response correlation
	# (notifications don't require id, but we require them for our use case)
	if not req.has("id"):
		return false
	
	return true


## Create a JSON-RPC success response
##
## WHY: Responses must follow JSON-RPC 2.0 format with
## jsonrpc version, id, and result fields.
func create_response(id: Variant, result: Variant) -> Dictionary:
	return {
		"jsonrpc": "2.0",
		"id": id,
		"result": result
	}


## Create a JSON-RPC error response
##
## WHY: Error responses have specific structure with error
## object containing code and message.
func create_error(code: int, message: String, id: Variant) -> Dictionary:
	return {
		"jsonrpc": "2.0",
		"id": id,
		"error": {
			"code": code,
			"message": message
		}
	}


## Parse JSON string into Variant
##
## WHY: Centralizes JSON parsing with error handling.
## Returns null if parsing fails.
func parse_json(json_string: String) -> Variant:
	var json := JSON.new()
	var error := json.parse(json_string)
	
	if error != OK:
		return null
	
	return json.data
