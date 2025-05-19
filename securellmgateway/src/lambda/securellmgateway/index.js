const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { gitguardian, chunker } = require('secure-llm-utils');
const { scan } = gitguardian;

// Error response helpers
const errorHeaders = { "Content-Type": "application/json" };

// Missing required fields error (400)
const createMissingFieldsErrorResponse = () => ({
    statusCode: 400,
    headers: errorHeaders,
    body: JSON.stringify({
        error: {
            message: "Missing required fields: model and messages array",
            type: "invalid_request_error",
            param: null,
            code: null
        }
    })
});

// Model not supported error (400)
const createUnsupportedModelErrorResponse = (model, supportedModels) => ({
    statusCode: 400,
    headers: errorHeaders,
    body: JSON.stringify({
        error: {
            message: `Model ${model} is not supported. Currently supported models: ${supportedModels.join(', ')}`,
            type: "invalid_request_error",
            param: "model",
            code: "model_not_supported"
        }
    })
});

// Message validation error (400)
const createMessageValidationErrorResponse = (messageError) => ({
    statusCode: 400,
    headers: errorHeaders,
    body: JSON.stringify({
        error: messageError
    })
});

// Server error (500)
const createServerErrorResponse = (errorName) => ({
    statusCode: 500,
    headers: errorHeaders,
    body: JSON.stringify({
        error: {
            message: "An error occurred while calling the model API",
            type: "internal_server_error",
            param: null,
            code: errorName || null
        }
    })
});

// Request parsing error (500)
const createParsingErrorResponse = () => ({
    statusCode: 500,
    headers: errorHeaders,
    body: JSON.stringify({
        error: {
            message: "An error occurred while processing your request",
            type: "internal_server_error",
            param: null,
            code: null
        }
    })
});

// Initialize the clients
const bedrockClient = new BedrockRuntimeClient();
const ssmClient = new SSMClient();
const cloudWatchClient = new CloudWatchClient();

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
 * Logs a security event to CloudWatch
 * @param {Object} event - The security event details
 */
async function logSecurityEvent(event) {
    console.log(JSON.stringify({
        security_event: true,
        ...event
    }));

    try {
        const command = new PutMetricDataCommand({
            Namespace: 'SecureLLMGateway',
            MetricData: [{
                MetricName: 'SecurityEvents',
                Value: 1,
                Unit: 'Count',
                Dimensions: [
                    {
                        Name: 'EventType',
                        Value: event.type
                    },
                    {
                        Name: 'Policy',
                        Value: event.policy || 'unknown'
                    }
                ]
            }]
        });
        await cloudWatchClient.send(command);
    } catch (error) {
        console.error('Failed to send metric data:', error);
    }
}

/**
 * Wrapper for GitGuardian scan that adds API key and logging
 * @param {string} content - The content to scan and redact
 * @param {string} filename - Optional filename for the scan
 * @returns {Promise<Object>} Object containing redacted content and redaction info
 */
async function scanAndRedactWithLogging(content, filename = "chat.txt") {
    // Get API key from SSM Parameter Store
    const apiKey = await getGitGuardianApiKey();
    
    // Scan and redact content, passing the API key as a parameter
    const result = await scan(content, apiKey, { filename });
    
    // Log security events if there are redactions
    if (result.redactions && result.redactions.length > 0) {
        // Group redactions by policy for logging
        const policyCounts = result.redactions.reduce((acc, redaction) => {
            const policy = redaction.policy || 'unknown';
            acc[policy] = (acc[policy] || 0) + 1;
            return acc;
        }, {});
        
        // Log each policy type separately
        Object.entries(policyCounts).forEach(([policy, count]) => {
            logSecurityEvent({
                type: 'sensitive_data_detected',
                policy: policy,
                matches: count,
                severity: 'medium'
            });
        });
    }
    
    return result;
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
    try {
        // Validate required fields
        if (!requestBody.model || !Array.isArray(requestBody.messages) || requestBody.messages.length === 0) {
            return createMissingFieldsErrorResponse();
        }

        // Validate model
        if (!SUPPORTED_MODELS[requestBody.model]) {
            return createUnsupportedModelErrorResponse(requestBody.model, Object.keys(SUPPORTED_MODELS));
        }

        // Validate each message in the array
        for (const message of requestBody.messages) {
            const messageError = validateMessage(message);
            if (messageError) {
                return createMessageValidationErrorResponse(messageError);
            }
        }

        // Scan and redact all messages in parallel
        const scanAndRedactPromises = requestBody.messages.map(message => 
            scanAndRedactWithLogging(message.content, `message_${message.role}.txt`)
        );
        const redactionResults = await Promise.all(scanAndRedactPromises);

        // Update messages with redacted content
        for (let i = 0; i < requestBody.messages.length; i++) {
            const { content: redactedContent, redactions } = redactionResults[i];
            
            if (redactions.length > 0) {
                console.log('GitGuardian scan found sensitive content in message:', {
                    role: requestBody.messages[i].role,
                    redactions
                });
                requestBody.messages[i].content = redactedContent;
            }
        }

        // Prepare Bedrock request
        // Map 'system' role to 'user' with a prefix, as Bedrock doesn't support 'system' role directly
        const mappedMessages = requestBody.messages.map(message => {
            if (message.role === 'system') {
                return {
                    role: 'user',
                    content: `[System instruction]: ${message.content}`
                };
            }
            return message;
        });
        
        const bedrockRequest = {
            modelId: SUPPORTED_MODELS[requestBody.model].bedrockName,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: requestBody.max_tokens || 2048,
                temperature: requestBody.temperature || 0.7,
                messages: mappedMessages
            })
        };

        // Call Bedrock
        const command = new InvokeModelCommand(bedrockRequest);
        const bedrockResponse = await bedrockClient.send(command);

        // Parse Bedrock response
        const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
        let llmResponse = responseBody.content[0].text;

        // Scan and redact LLM response
        try {
            const { content: redactedResponse, redactions } = await scanAndRedactWithLogging(llmResponse, "llm_response.txt");
            
            if (redactions.length > 0) {
                console.log('GitGuardian scan found sensitive content in LLM response:', {
                    redactions
                });
                llmResponse = redactedResponse;
            }
        } catch (error) {
            console.error('GitGuardian scanning error for LLM response:', error);
            // Continue processing even if scanning fails
        }

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
                        content: llmResponse
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
        logSecurityEvent({
            type: 'error',
            error_type: error.name,
            error_message: error.message,
            severity: 'high'
        });
        return createServerErrorResponse(error.name);
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
        return createParsingErrorResponse();
    }
}; 