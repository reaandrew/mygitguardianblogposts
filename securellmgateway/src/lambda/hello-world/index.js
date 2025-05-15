// Supported models configuration
const SUPPORTED_MODELS = {
    'anthropic.claude-3-sonnet-20240229-v1:0': true
};

/**
 * Validates a message object
 * @param {Object} message - The message to validate
 * @returns {Object|null} Error object if invalid, null if valid
 */
function validateMessage(message) {
    if (!message.role || !message.content) {
        return {
            message: "Each message must have 'role' and 'content' fields",
            type: "invalid_request_error",
            param: "messages",
            code: "invalid_message_format"
        };
    }

    if (typeof message.content !== 'string') {
        return {
            message: "Message content must be a string",
            type: "invalid_request_error",
            param: "messages.content",
            code: "invalid_content_type"
        };
    }

    return null;
}

/**
 * Processes a chat completion request
 * @param {Object} requestBody - The parsed request body
 * @returns {Object} Response object with status code and body
 */
async function processChatCompletion(requestBody) {
    // Validate required fields
    if (!requestBody.model || !Array.isArray(requestBody.messages) || requestBody.messages.length === 0) {
        return {
            statusCode: 400,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: {
                    message: "Missing required fields: model and messages array",
                    type: "invalid_request_error",
                    param: null,
                    code: null
                }
            })
        };
    }

    // Validate model
    if (!SUPPORTED_MODELS[requestBody.model]) {
        return {
            statusCode: 400,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: {
                    message: `Model ${requestBody.model} is not supported. Currently supported models: ${Object.keys(SUPPORTED_MODELS).join(', ')}`,
                    type: "invalid_request_error",
                    param: "model",
                    code: "model_not_supported"
                }
            })
        };
    }

    // Validate each message in the array
    for (const message of requestBody.messages) {
        const messageError = validateMessage(message);
        if (messageError) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ error: messageError })
            };
        }
    }

    // Mock response format matching OpenAI's chat completions API
    const response = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: requestBody.model,
        choices: [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: "This is a mock response from the Secure LLM Gateway. Your request was received successfully."
                },
                finish_reason: "stop"
            }
        ],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        }
    };

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(response)
    };
}

/**
 * Lambda handler function
 */
exports.handler = async (event) => {
    try {
        // Parse the incoming request body
        const body = JSON.parse(event.body || '{}');
        
        // Process the request
        return await processChatCompletion(body);
    } catch (error) {
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: {
                    message: "An error occurred while processing your request",
                    type: "internal_server_error",
                    param: null,
                    code: null
                }
            })
        };
    }
}; 