const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const https = require('https');

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
 * Redacts sensitive content based on GitGuardian scan results
 * @param {string} content - The content to redact
 * @param {Object} scanResult - The GitGuardian scan result
 * @returns {Object} Object containing redacted content and redaction info
 */
function redactSensitiveContent(content, scanResult) {
    if (!scanResult.policy_breaks || scanResult.policy_breaks.length === 0) {
        return {
            content,
            redactions: []
        };
    }

    let redactedContent = content;
    const redactions = [];
    const processedRanges = new Set();

    // Log security event for each policy break
    scanResult.policy_breaks.forEach(policyBreak => {
        logSecurityEvent({
            type: 'sensitive_data_detected',
            policy: policyBreak.policy,
            matches: policyBreak.matches?.length || 0,
            severity: policyBreak.severity || 'medium'
        });
    });

    // Sort matches by start position in reverse order to avoid position shifts
    const allMatches = scanResult.policy_breaks.flatMap(policyBreak => {
        // Handle different match structures
        if (policyBreak.matches) {
            return policyBreak.matches.map(match => ({
                ...match,
                type: policyBreak.type,
                start: match.index_start || match.start,
                end: (match.index_end || match.end) + 1, // Add 1 to include the last character
                policy: policyBreak.policy
            }));
        }
        return [];
    }).sort((a, b) => b.start - a.start);

    // Apply redactions
    for (const match of allMatches) {
        if (match.start === undefined || match.end === undefined) {
            continue; // Skip matches without position information
        }

        // Create a unique key for this range
        const rangeKey = `${match.start}-${match.end}`;
        if (processedRanges.has(rangeKey)) {
            continue; // Skip if we've already processed this range
        }
        processedRanges.add(rangeKey);

        const before = redactedContent.substring(0, match.start);
        const after = redactedContent.substring(match.end);
        redactedContent = before + 'REDACTED' + after;

        redactions.push({
            type: match.type,
            start: match.start,
            end: match.end,
            original: content.substring(match.start, match.end),
            policy: match.policy
        });
    }

    return {
        content: redactedContent,
        redactions
    };
}

/**
 * Scans text for secrets using GitGuardian API
 * @param {string} content - The text to scan
 * @param {string} filename - Optional filename for the scan
 * @returns {Promise<Object>} The scan results
 */
async function scanWithGitGuardian(content, filename = "chat.txt") {
    const apiKey = await getGitGuardianApiKey();
    
    return new Promise((resolve, reject) => {
        const requestData = JSON.stringify({
            filename,
            document: content            // raw text to scan (≤ 1 MB)
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
 * Extracts content from messages for GitGuardian scanning
 * @param {Array} messages - Array of message objects
 * @returns {string} - Combined content for scanning
 */
function extractContentForScanning(messages) {
    return messages.map(message => {
        // Extract just the content part, not the role or other metadata
        return message.content;
    }).join('\n\n');
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

        // Scan messages for sensitive content
        const contentToScan = extractContentForScanning(requestBody.messages);
        const scanResult = await scanWithGitGuardian(contentToScan);
        
        if (scanResult.policy_breaks && scanResult.policy_breaks.length > 0) {
            logSecurityEvent({
                type: 'prompt_scan_failure',
                policy_breaks: scanResult.policy_breaks.length,
                severity: 'high'
            });
        }

        // Scan each message's content for secrets
        for (const message of requestBody.messages) {
            try {
                const scanResult = await scanWithGitGuardian(message.content);
                const { content: redactedContent, redactions } = redactSensitiveContent(message.content, scanResult);
                
                if (redactions.length > 0) {
                    console.log('GitGuardian scan found sensitive content in message:', {
                        role: message.role,
                        scanResult,
                        redactions
                    });
                    message.content = redactedContent;
                }
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
        let llmResponse = responseBody.content[0].text;

        // Scan and redact LLM response
        try {
            const scanResult = await scanWithGitGuardian(llmResponse);
            const { content: redactedResponse, redactions } = redactSensitiveContent(llmResponse, scanResult);
            
            if (redactions.length > 0) {
                console.log('GitGuardian scan found sensitive content in LLM response:', {
                    scanResult,
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