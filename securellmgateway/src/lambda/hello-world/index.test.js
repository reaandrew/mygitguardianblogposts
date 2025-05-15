const { handler } = require('./index');

describe('Lambda Handler', () => {
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

    describe('Successful Requests', () => {
        test('should accept valid request with single message', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.model).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
            expect(body.choices).toHaveLength(1);
            expect(body.choices[0].message.role).toBe('assistant');
            expect(typeof body.choices[0].message.content).toBe('string');
        });

        test('should accept valid request with multiple messages', async () => {
            const event = {
                body: JSON.stringify({
                    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant.' },
                        { role: 'user', content: 'Hello' }
                    ]
                })
            };
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.model).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
            expect(body.choices).toHaveLength(1);
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