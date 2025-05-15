const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { mockClient } = require('aws-sdk-client-mock');
const { handler } = require('./index');

describe('Lambda Handler', () => {
    const bedrockMock = mockClient(BedrockRuntimeClient);

    beforeEach(() => {
        bedrockMock.reset();
        // Setup default mock response
        bedrockMock.on(InvokeModelCommand).resolves({
            body: new TextEncoder().encode(JSON.stringify({
                content: [{ text: "Hello! I'm Claude." }]
            }))
        });
    });

    afterEach(() => {
        bedrockMock.restore();
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