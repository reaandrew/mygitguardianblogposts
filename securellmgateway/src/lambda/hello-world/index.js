exports.handler = async (event) => {
    try {
        // Parse the incoming request body
        const body = JSON.parse(event.body || '{}');

        // Validate required fields
        if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
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

        // Mock response format matching OpenAI's chat completions API
        const response = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: body.model,
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