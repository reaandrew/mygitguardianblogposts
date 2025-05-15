const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const https = require('https');

// Initialize the clients
const bedrockClient = new BedrockRuntimeClient();
const ssmClient = new SSMClient();

// Supported models configuration
const SUPPORTED_MODELS = {
    'anthropic.claude-3-sonnet-20240229-v1:0': {
        provider: 'anthropic',
        bedrockName: 'anthropic.claude-3-sonnet-20240229-v1:0'
    }
};

/**
 * Fetches the GitGuardian API key from SSM Parameter Store
 * @returns {Promise<string>} The API key
 */
async function getGitGuardianApiKey() {
    const command = new GetParameterCommand({
        Name: '/ara/gitguardian/apikey/scan',
        WithDecryption: true
    });

    const response = await ssmClient.send(command);
    return response.Parameter.Value;
}

/**
 * Scans text for secrets using GitGuardian API
 * @param {string} content - The text to scan
 * @returns {Promise<Object>} The scan results
 */
async function scanWithGitGuardian(content) {
    const apiKey = await getGitGuardianApiKey();
    
    return new Promise((resolve, reject) => {
        const requestData = JSON.stringify({
            document: content,
            document_type: "text"
        });

        const options = {
            hostname: 'api.gitguardian.com',
            path: '/v1/scan',
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const scanResult = JSON.parse(data);
                    resolve(scanResult);
                } catch (error) {
                    reject(new Error('Failed to parse GitGuardian response'));
                }
            });
        });

        req.on('error', (error) => reject(error));
        req.write(requestData);
        req.end();
    });
}

/**
 * Converts OpenAI chat format to Anthropic format
 * @param {Array} messages - Array of message objects
 * @returns {string} - Formatted prompt for Anthropic
 */
function convertToAnthropicFormat(messages) {
    let prompt = '';
    
    for (const message of messages) {
        switch (message.role) {
            case 'system':
                prompt += `\n\nHuman: ${message.content}\n\nAssistant: I understand. I will act according to those instructions.`;
                break;
            case 'user':
                prompt += `\n\nHuman: ${message.content}`;
                break;
            case 'assistant':
                prompt += `\n\nAssistant: ${message.content}`;
                break;
            default:
                prompt += `\n\nHuman: ${message.content}`;
        }
    }

    // Add final assistant prompt marker for the response
    prompt += '\n\nAssistant: ';
    return prompt.trim();
}

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

    try {
        // Scan each message for secrets
        for (const message of requestBody.messages) {
            try {
                const scanResult = await scanWithGitGuardian(message.content);
                console.log('GitGuardian scan result for message:', {
                    role: message.role,
                    scanResult
                });
            } catch (error) {
                console.error('GitGuardian scanning error:', error);
                // Continue processing even if scanning fails
            }
        }

        // Convert messages to Anthropic format
        const prompt = convertToAnthropicFormat(requestBody.messages);

        // Prepare Bedrock request
        const bedrockRequest = {
            modelId: SUPPORTED_MODELS[requestBody.model].bedrockName,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: requestBody.max_tokens || 2048,
                temperature: requestBody.temperature || 0.7,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            })
        };

        // Call Bedrock
        const command = new InvokeModelCommand(bedrockRequest);
        const bedrockResponse = await bedrockClient.send(command);

        // Parse Bedrock response
        const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));

        // Convert to OpenAI format
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
                        content: responseBody.content[0].text
                    },
                    finish_reason: "stop"
                }
            ],
            usage: {
                prompt_tokens: 0, // Bedrock doesn't provide token counts
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
        console.error('Bedrock API Error:', error);
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: {
                    message: "An error occurred while calling the model API",
                    type: "internal_server_error",
                    param: null,
                    code: error.name || null
                }
            })
        };
    }
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