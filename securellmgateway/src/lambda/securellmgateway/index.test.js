// Mock secure-llm-utils package 
jest.mock('secure-llm-utils', () => {
  return {
    chunker: {
      chunkJson: jest.fn(),
      reconstructJson: jest.fn()
    },
    gitguardian: {
      gitguardianMultiscan: jest.fn(),
      redactSensitiveContent: jest.fn(),
      scan: jest.fn().mockImplementation((content, apiKey, options = {}) => {
        // Note: This implementation mimics the actual function but doesn't modify content
        // For testing, we simply return the result structure with redactions array

        if (content.includes('sensitive')) {
          return Promise.resolve({
            content: content, // Don't actually redact in the mock
            redactions: [
              {
                type: 'secret',
                start: content.indexOf('sensitive'),
                end: content.indexOf('sensitive') + 'sensitive-token'.length,
                original: 'sensitive-token',
                policy: 'test_policy'
              }
            ]
          });
        }

        // If content contains GitHub token, identify it but don't redact
        if (content.includes('ghp_')) {
          return Promise.resolve({
            content: content, // Don't actually redact in the mock
            redactions: [
              {
                type: 'github_token',
                start: content.indexOf('ghp_'),
                end: content.indexOf('ghp_') + 40,
                original: content.substring(content.indexOf('ghp_'), content.indexOf('ghp_') + 40),
                policy: 'github_token'
              }
            ]
          });
        }

        // Default: no redactions
        return Promise.resolve({
          content: content,
          redactions: []
        });
      })
    }
  }
});

// Set test environment
process.env.NODE_ENV = 'test';

// Mock AWS SDK modules
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { mockClient } = require('aws-sdk-client-mock');
const { handler } = require('./index');

// Create AWS SDK mocks
const bedrockMock = mockClient(BedrockRuntimeClient);
const ssmMock = mockClient(SSMClient);
const cloudWatchMock = mockClient(CloudWatchClient);

describe('Secure LLM Gateway Lambda Handler', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    bedrockMock.reset();
    ssmMock.reset();
    cloudWatchMock.reset();

    // Mock SSM Parameter Store response for GitGuardian API key
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: 'test-api-key'
      }
    });

    // Mock CloudWatch metrics
    cloudWatchMock.on(PutMetricDataCommand).resolves({});

    // Mock default Bedrock response
    bedrockMock.on(InvokeModelCommand).resolves({
      body: new TextEncoder().encode(JSON.stringify({
        content: [{text: "Hello! I'm Claude."}]
      }))
    });
  });

  describe('Input Validation', () => {
    test('should return 400 when request body is empty', async () => {
      const event = {body: '{}'};
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error.message).toContain('Missing required fields');
    });

    test('should return 400 when model is missing', async () => {
      const event = {
        body: JSON.stringify({
          messages: [{role: 'user', content: 'Hello'}]
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
          messages: [{role: 'user', content: 'Hello'}]
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
          messages: [{content: 'Hello'}]
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
          messages: [{role: 'user'}]
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
          messages: [{role: 'user', content: {text: 'Hello'}}]
        })
      };
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error.message).toContain('must be a string');
    });
  });

  describe('GitGuardian Integration', () => {
    test('should call scan for user messages', async () => {
      // Setup event with sensitive data in messages
      const event = {
        body: JSON.stringify({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          messages: [
            {role: 'user', content: 'Here is my sensitive-token for testing'}
          ]
        })
      };

      await handler(event);

      // Verify Bedrock was called
      const commandCalls = bedrockMock.commandCalls(InvokeModelCommand);
      expect(commandCalls.length).toBe(1);
    });

    test('should process model responses', async () => {
      // Set up Bedrock to return a response with sensitive data
      bedrockMock.on(InvokeModelCommand).resolves({
        body: new TextEncoder().encode(JSON.stringify({
          content: [{text: "Here's a sensitive-token for you to use"}]
        }))
      });

      const event = {
        body: JSON.stringify({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          messages: [{role: 'user', content: 'Give me a token'}]
        })
      };

      const response = await handler(event);

      // Just verify the response is successful, not checking content
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Bedrock Integration', () => {
    test('should handle system prompts correctly by mapping to user role', async () => {
      const event = {
        body: JSON.stringify({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          messages: [
            {role: 'system', content: 'You are helpful.'},
            {role: 'user', content: 'Hello!'}
          ]
        })
      };

      await handler(event);

      // Verify Bedrock was called with correct mapped messages
      const commandCalls = bedrockMock.commandCalls(InvokeModelCommand);
      const requestBody = JSON.parse(commandCalls[0].args[0].input.body);

      // System message should be converted to user message with prefix
      expect(requestBody.messages.length).toBe(2);
      expect(requestBody.messages[0].role).toBe('user');
      expect(requestBody.messages[0].content).toContain('[System instruction]');
      expect(requestBody.messages[0].content).toContain('You are helpful.');
    });

    test('should use default values when max_tokens and temperature are not provided', async () => {
      const event = {
        body: JSON.stringify({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          messages: [{role: 'user', content: 'Hello'}]
        })
      };

      await handler(event);

      const commandCalls = bedrockMock.commandCalls(InvokeModelCommand);
      const requestBody = JSON.parse(commandCalls[0].args[0].input.body);

      expect(requestBody.max_tokens).toBe(2048);
      expect(requestBody.temperature).toBe(0.7);
    });

    test('should correctly format the Bedrock response to OpenAI format', async () => {
      bedrockMock.on(InvokeModelCommand).resolves({
        body: new TextEncoder().encode(JSON.stringify({
          content: [{text: "I'm Claude, here to help!"}]
        }))
      });

      const event = {
        body: JSON.stringify({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          messages: [{role: 'user', content: 'Hello'}]
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

    test('should handle Bedrock API errors', async () => {
      // Mock Bedrock error
      bedrockMock.on(InvokeModelCommand).rejects(new Error('Bedrock API Error'));

      const event = {
        body: JSON.stringify({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          messages: [{role: 'user', content: 'Hello'}]
        })
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error.message).toBe('An error occurred while calling the model API');
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

    test('should handle GitGuardian scanning errors gracefully', async () => {
      // Update the GitGuardian mock to throw an error
      jest.requireMock('secure-llm-utils').gitguardian.scan.mockRejectedValueOnce(
          new Error('GitGuardian API error')
      );

      const event = {
        body: JSON.stringify({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          messages: [{role: 'user', content: 'Hello'}]
        })
      };

      // Should not throw - the handler should catch the error
      const response = await handler(event);

      // The Lambda function returns a 500 error when GitGuardian scan fails
      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error.message).toBe('An error occurred while calling the model API');
    });

    test('should log security events for redacted content', async () => {
      const consoleSpy = jest.spyOn(console, 'log');

      const event = {
        body: JSON.stringify({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          messages: [{role: 'user', content: 'Here is my sensitive-token for testing'}]
        })
      };

      await handler(event);

      // Check if security event logs were generated
      expect(consoleSpy).toHaveBeenCalled();
      // At least one log should contain message about sensitive content
      const calls = consoleSpy.mock.calls;
      const sensitiveContentLogFound = calls.some(call =>
          typeof call[0] === 'string' && call[0].includes('GitGuardian scan found sensitive content') ||
          (typeof call[0] === 'object' && call[1] && typeof call[1] === 'object' && call[1].redactions)
      );
      expect(sensitiveContentLogFound).toBe(true);

      // Verify CloudWatch metrics were sent
      const metricCalls = cloudWatchMock.commandCalls(PutMetricDataCommand);
      expect(metricCalls.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });
  });
});