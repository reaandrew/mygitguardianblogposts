const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { mockClient } = require('aws-sdk-client-mock');
const { handler } = require('./index');
const https = require('https');

// Mock https
jest.mock('https');

describe('Lambda Handler', () => {
    const bedrockMock = mockClient(BedrockRuntimeClient);
    const ssmMock = mockClient(SSMClient);

    beforeEach(() => {
        bedrockMock.reset();
        ssmMock.reset();
        jest.clearAllMocks();

        // Mock SSM to return a key
        ssmMock.on(GetParameterCommand).resolves({
            Parameter: {
                Value: 'mock-gitguardian-api-key'
            }
        });

        // Mock Bedrock
        bedrockMock.on(InvokeModelCommand).resolves({
            body: new TextEncoder().encode(JSON.stringify({
                content: [{ text: "Hello! I'm Claude." }]
            }))
        });

        // Mock GitGuardian API
        const mockResponse = {
            on: jest.fn().mockImplementation(function(event, handler) {
                if (event === 'data') {
                    handler(JSON.stringify({
                        policy_break_count: 0,
                        policies: []
                    }));
                }
                if (event === 'end') {
                    handler();
                }
                return this;
            })
        };

        const mockRequest = {
            on: jest.fn().mockImplementation((event, handler) => mockRequest),
            write: jest.fn().mockImplementation((data) => {
                const requestBody = JSON.parse(data);
                expect(requestBody).toHaveProperty('document');
                expect(requestBody).toHaveProperty('document_type', 'text');
                return mockRequest;
            }),
            end: jest.fn()
        };

        https.request.mockImplementation((options, callback) => {
            callback(mockResponse);
            return mockRequest;
        });
    });

    describe('Input Validation', () => {
        test('should return 400 when no body is provided', async () => {
            const event = {};
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            expect(JSON.parse(response.body).error.message).toContain('Missing required fields');
        });

        test('should return 400 when model is missing', async () => {
            const event = {
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            expect(JSON.parse(response.body).error.message).toContain('Missing required fields');
        });

        test('should return 400 when messages array is missing', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0'
                })
            };
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            expect(JSON.parse(response.body).error.message).toContain('Missing required fields');
        });

        test('should return 400 when messages array is empty', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: []
                })
            };
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            expect(JSON.parse(response.body).error.message).toContain('Missing required fields');
        });

        test('should return 400 when model is not supported', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            expect(JSON.parse(response.body).error.message).toContain('not supported');
            expect(JSON.parse(response.body).error.code).toBe('model_not_supported');
        });

        test('should return 400 when message is missing role', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [{ content: 'Hello' }]
                })
            };
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            expect(JSON.parse(response.body).error.message).toContain('must have \'role\' and \'content\' fields');
        });

        test('should return 400 when message is missing content', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [{ role: 'user' }]
                })
            };
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            expect(JSON.parse(response.body).error.message).toContain('must have \'role\' and \'content\' fields');
        });

        test('should return 400 when content is not a string', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [{ role: 'user', content: { text: 'Hello' } }]
                })
            };
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            expect(JSON.parse(response.body).error.message).toContain('must be a string');
        });
    });

    describe('Bedrock Integration', () => {
        test('should correctly format request to Bedrock', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [
                        { role: 'system', content: 'You are helpful.' },
                        { role: 'user', content: 'Hello!' }
                    ],
                    max_tokens: 100,
                    temperature: 0.5
                })
            };

            await handler(event);

            // Get the last call to Bedrock
            const commandCalls = bedrockMock.commandCalls(InvokeModelCommand);
            expect(commandCalls.length).toBe(1);
            const lastCall = commandCalls[0];

            // Verify Bedrock was called with correct parameters
            expect(lastCall.args[0].input).toMatchObject({
                modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
                contentType: 'application/json',
                accept: 'application/json'
            });

            // Verify request body format
            const requestBody = JSON.parse(lastCall.args[0].input.body);
            expect(requestBody).toEqual({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 100,
                temperature: 0.5,
                messages: [
                    {
                        role: "user",
                        content: expect.stringContaining("Human: You are helpful.")
                    }
                ]
            });
        });

        test('should handle Bedrock API errors', async () => {
            // Mock Bedrock error
            bedrockMock.on(InvokeModelCommand).rejects(new Error('Bedrock API Error'));

            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };

            const response = await handler(event);
            
            expect(response.statusCode).toBe(500);
            expect(JSON.parse(response.body).error.message).toBe('An error occurred while calling the model API');
        });

        test('should correctly format Bedrock response to OpenAI format', async () => {
            // Mock successful Bedrock response
            bedrockMock.on(InvokeModelCommand).resolves({
                body: new TextEncoder().encode(JSON.stringify({
                    content: [{ text: "I'm Claude, here to help!" }]
                }))
            });

            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };

            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body).toEqual(expect.objectContaining({
                object: "chat.completion",
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: "I'm Claude, here to help!"
                        },
                        finish_reason: "stop"
                    }
                ],
                usage: expect.any(Object)
            }));
        });

        test('should use default values when max_tokens and temperature are not provided', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };

            await handler(event);

            const commandCalls = bedrockMock.commandCalls(InvokeModelCommand);
            const lastCall = commandCalls[0];
            const requestBody = JSON.parse(lastCall.args[0].input.body);
            expect(requestBody.max_tokens).toBe(2048);
            expect(requestBody.temperature).toBe(0.7);
        });
    });

    describe('GitGuardian Integration', () => {
        test('should fetch GitGuardian API key from SSM', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };

            await handler(event);

            // Verify SSM was called with correct parameter
            const ssmCalls = ssmMock.commandCalls(GetParameterCommand);
            expect(ssmCalls.length).toBe(1);
            expect(ssmCalls[0].args[0].input).toEqual({
                Name: '/ara/gitguardian/apikey/scan',
                WithDecryption: true
            });
        });

        test('should scan each message with GitGuardian API', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [
                        { role: 'system', content: 'You are helpful.' },
                        { role: 'user', content: 'Hello!' }
                    ]
                })
            };

            await handler(event);

            // Verify GitGuardian API was called for each message
            expect(https.request).toHaveBeenCalledTimes(2);
            
            // Verify the request format for the first call
            const firstCallOptions = https.request.mock.calls[0][0];
            expect(firstCallOptions).toMatchObject({
                hostname: 'api.gitguardian.com',
                path: '/v1/scan',
                method: 'POST',
                headers: {
                    'Authorization': 'Token mock-gitguardian-api-key',
                    'Content-Type': 'application/json'
                }
            });
        });

        test('should continue processing even if GitGuardian scan fails', async () => {
            // Mock GitGuardian API to fail
            https.request.mockImplementation((options, callback) => {
                throw new Error('GitGuardian API Error');
            });

            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };

            const response = await handler(event);
            
            // Should still return success response
            expect(response.statusCode).toBe(200);
            expect(JSON.parse(response.body).choices[0].message.content).toBe("Hello! I'm Claude.");
        });

        test('should handle GitGuardian API non-200 responses', async () => {
            // Mock GitGuardian API to return error response
            const mockErrorResponse = {
                on: jest.fn().mockImplementation(function(event, handler) {
                    if (event === 'data') {
                        handler(JSON.stringify({
                            detail: "API Error"
                        }));
                    }
                    if (event === 'end') {
                        handler();
                    }
                    return this;
                }),
                statusCode: 400
            };

            https.request.mockImplementation((options, callback) => {
                callback(mockErrorResponse);
                return {
                    on: jest.fn(),
                    write: jest.fn(),
                    end: jest.fn()
                };
            });

            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };

            const response = await handler(event);
            
            // Should still return success response
            expect(response.statusCode).toBe(200);
        });

        test('should log when secrets are found', async () => {
            // Mock console.log
            const consoleSpy = jest.spyOn(console, 'log');

            // Mock GitGuardian API to return secrets found
            const mockSecretResponse = {
                on: jest.fn().mockImplementation(function(event, handler) {
                    if (event === 'data') {
                        handler(JSON.stringify({
                            policy_break_count: 1,
                            policies: [
                                {
                                    policy: "secrets",
                                    breaks: [
                                        {
                                            type: "AWS Key",
                                            match: "AKIA..."
                                        }
                                    ]
                                }
                            ]
                        }));
                    }
                    if (event === 'end') {
                        handler();
                    }
                    return this;
                })
            };

            https.request.mockImplementation((options, callback) => {
                callback(mockSecretResponse);
                return {
                    on: jest.fn(),
                    write: jest.fn(),
                    end: jest.fn()
                };
            });

            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [{ role: 'user', content: 'My AWS key is AKIA...' }]
                })
            };

            await handler(event);
            
            // Verify logging
            expect(consoleSpy).toHaveBeenCalledWith(
                'GitGuardian scan result for message:',
                expect.objectContaining({
                    role: 'user',
                    scanResult: expect.objectContaining({
                        policy_break_count: 1
                    })
                })
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Error Handling', () => {
        test('should return 500 when body is invalid JSON', async () => {
            const event = {
                body: 'invalid json'
            };
            const response = await handler(event);
            
            expect(response.statusCode).toBe(500);
            expect(JSON.parse(response.body).error.type).toBe('internal_server_error');
        });
    });
}); 