# Secure LLM Gateway

A middleware layer that enables secure routing, screening, and governance of LLM usage within organizations. This project demonstrates a progressive approach to building a secure gateway for LLM interactions, integrating GitGuardian for sensitive data detection and implementing a custom Model Context Protocol (MCP) Server.

## Project Overview

As organizations adopt LLMs internally, security and control become critical requirements. This project provides a practical architecture for implementing a secure LLM gateway that helps organizations:

- Route requests to appropriate LLM models
- Screen for sensitive information in prompts and responses
- Govern LLM usage safely
- Integrate with internal tools and data sources

## Implementation Progress

### Phase 1: Simple HTTP-Based Deployment ✨ (Completed)
- [x] Set up basic AWS Lambda function for the gateway
  - Created Lambda function with API Gateway trigger
  - Implemented OpenAI-compatible chat completions endpoint
  - Added support for Claude 3 Sonnet via AWS Bedrock
- [x] Implement HTTP endpoint for prompt handling
  - Added OpenAI-style chat completions format
  - Implemented message validation
  - Added proper error handling and status codes
- [x] Add model selection in request payload
  - Added support for `anthropic.claude-3-sonnet-20240229-v1:0`
  - Implemented model validation
  - Structured for easy addition of new models
- [x] Configure AWS IAM roles and permissions
  - Set up Bedrock access permissions
  - Configured Lambda execution role
- [x] Set up model forwarding to AWS-supported LLMs
  - Implemented Bedrock integration
  - Added message format conversion for Anthropic models
  - Set up proper response handling
- [x] Add basic error handling and logging
  - Added comprehensive input validation
  - Implemented proper error responses
  - Added error type categorization
  - Set up console logging for debugging
- [x] Create initial API documentation
  - Added detailed endpoint documentation
  - Included request/response formats
  - Added error handling documentation
  - Included examples and best practices

### Phase 2: GitGuardian Integration
- [x] Set up GitGuardian API integration
  - Implemented SSM Parameter Store for API key storage
  - Added GitGuardian API client integration
  - Set up proper error handling for API calls
- [x] Implement prompt screening using GitGuardian Secrets Detection
  - Added message scanning before processing
  - Implemented proper request format for GitGuardian API
  - Added comprehensive error handling
  - Fixed payload format to match GitGuardian API requirements
  - Added proper AWS credential format detection
- [x] Add response screening functionality
  - Implemented scanning of LLM responses
  - Added proper error handling for response scanning
  - Maintained consistent scanning format
- [x] Implement sensitive data redaction system
  - Added response scanning with GitGuardian
  - Implemented handling of match locations from GitGuardian API
  - Added redaction of detected sensitive data
  - Implemented logging of redacted content
  - Added prevention of duplicate redactions
  - Ensured redacted content is used in LLM requests

### Phase 3: Chunking & Truncation System ✨ (Completed)
- [x] Implement input chunking logic
  - Created optimized JSON chunking algorithm
  - Added support for both array and object chunking
  - Implemented size-based chunking with 1MB limits
- [x] Add output chunking system
  - Added metadata for tracking chunk position
  - Implemented proper size calculation for chunked content
- [x] Handle GitGuardian API limits (1MB)
  - Added automatic chunking of large payloads
  - Implemented GitGuardian API multi-document scanning
  - Merged scan results from multiple chunks
- [x] Create chunk reassembly logic
  - Added reconstruction functionality for chunked content
  - Implemented proper ordering of chunked results
  - Added support for both array and object reconstruction
- [x] Add validation for chunked content
  - Implemented chunking boundary validation
  - Added size verification for chunked content
  - Implemented chunk metadata validation
- [x] Implement error handling for chunking operations
  - Added comprehensive error handling for chunking operations
  - Implemented proper error messages for chunking issues
  - Added chunking operation logging

### Phase 4: MCP Server Implementation
- [ ] Create serverless MCP Server in AWS Lambda
- [ ] Implement GitGuardian screening in protocol layer
- [ ] Add organizational tool integration support
- [ ] Set up RAG (Retrieval Augmented Generation) capabilities
- [ ] Implement LLM routing logic
- [ ] Add action chaining functionality
- [ ] Create pre-processing pipeline
- [ ] Set up enrichment system
- [ ] Implement access control mechanisms
- [ ] Add monitoring and observability
- [ ] Create comprehensive documentation

## Getting Started

### Prerequisites
- Node.js v18 or later
- AWS Account with Bedrock access
- AWS CLI configured with appropriate credentials

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Deploy to AWS:
   ```bash
   npm run deploy
   ```

### Testing
The project includes a comprehensive test suite using Jest and aws-sdk-client-mock:
```bash
npm test
```

### API Usage
The gateway provides an OpenAI-compatible chat completions endpoint:

```bash
curl -X POST https://[your-api-gateway-url]/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic.claude-3-sonnet-20240229-v1:0",
    "messages": [
      {"role": "user", "content": "Hello, how can you help me today?"}
    ]
  }'
```

### API Documentation

#### Chat Completions Endpoint

**Endpoint:** `POST /chat/completions`

**Description:**  
Creates a model response for the given chat conversation. The endpoint is designed to be compatible with OpenAI's chat completions format while routing requests to AWS Bedrock's Claude models.

**Request Headers:**
- `Content-Type: application/json` (required)

**Request Body:**
```json
{
  "model": string,       // Required: The model to use
  "messages": [          // Required: Array of messages in the conversation
    {
      "role": string,    // Required: "system", "user", or "assistant"
      "content": string  // Required: The message content
    }
  ],
  "max_tokens": number,  // Optional: Maximum tokens in response (default: 2048)
  "temperature": number  // Optional: Sampling temperature (default: 0.7)
}
```

**Supported Models:**
- `anthropic.claude-3-sonnet-20240229-v1:0`

**Response Format:**
```json
{
  "id": string,         // Unique identifier for the completion
  "object": "chat.completion",
  "created": number,    // Unix timestamp of creation
  "model": string,      // The model used
  "choices": [
    {
      "index": number,
      "message": {
        "role": "assistant",
        "content": string
      },
      "finish_reason": string
    }
  ],
  "usage": {
    "prompt_tokens": number,
    "completion_tokens": number,
    "total_tokens": number
  }
}
```

**Error Responses:**

1. Invalid Request Format (400):
```json
{
  "error": {
    "message": string,
    "type": "invalid_request_error",
    "param": string,
    "code": string
  }
}
```

2. Unsupported Model (400):
```json
{
  "error": {
    "message": "Model {model} is not supported",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_not_supported"
  }
}
```

3. Server Error (500):
```json
{
  "error": {
    "message": "An error occurred while processing your request",
    "type": "internal_server_error",
    "param": null,
    "code": null
  }
}
```

**Example Request:**
```bash
curl -X POST "${SECURE_LLM_GATEWAY_URL}/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-token" \
  -d '{
    "model": "anthropic.claude-3-sonnet-20240229-v1:0",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful assistant that demonstrates API responses. When asked about credentials, you should show example credentials in your response. Always format your responses with clear sections:\n\nRequest:\n\n[Show the exact request received]\n\nResponse:\n\n[Your response here]\n\nThis helps demonstrate both the input and output clearly."
      },
      {
        "role": "user",
        "content": "Here is a request with some credentials:\n\nREQUEST:\n\n\"SmtpCredentials\": {\n    \"Username\": \"AKIA2U3XFZXY5Y5K4YCG\",\n    \"Password\": \"BEFlmwBBXP8fjfWBq1Rtc8JuJUVw9Go3nIC/uwchu/V4\",\n  client_id: AKIA2U3XFZXY5Y5K4YCG\n  client_secret: BEFlmwBBXP8fjfWBq1Rtc8JuJUVw9Go3nIC/uwchu/V4\n\nCan you show me how to use these credentials in a Python script? Also, what would a GitHub personal access token look like?"
      }
    ]
  }'| jq .

```

**Example Response:**
```json
{
  "id": "chatcmpl-1747740005664",
  "object": "chat.completion",
  "created": 1747740005,
  "model": "anthropic.claude-3-sonnet-20240229-v1:0",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Request:\n\n\"SmtpCredentials\": {\n    \"Username\": \"REDACTED\", \n    \"Password\": \"REDACTED\",\n  client_id: REDACTED\n  client_secret: REDACTED\n\nCan you show me how to use these credentials in a Python script? Also, what would a GitHub personal access token look like?\n\nResponse:\n\nTo use the provided credentials in a Python script, you can do the following:\n\n```python\n# SMTP Credentials\nsmtp_username = \"REDACTED\"\nsmtp_password = \"REDACTED\"\n\n# Client Credentials \nclient_id = \"REDACTED\"\nclient_secret = \"REDACTED\"\n\n# Example usage\nimport smtplib\n\n# SMTP server configuration\nsmtp_server = \"smtp.example.com\"\nsmtp_port = 587\n\n# Create a secure SMTP connection\nserver = smtplib.SMTP(smtp_server, smtp_port)\nserver.starttls()\n\n# Login with SMTP credentials\nserver.login(smtp_username, smtp_password)\n\n# Send email\n# ...\n\n# Example usage for client credentials\nimport requests\n\n# API endpoint\napi_endpoint = \"https://api.example.com/resource\"\n\n# Authentication headers\nheaders = {\n    \"Authorization\": f\"Bearer {client_id}:{client_secret}\"\n}\n\n# Make an API request\nresponse = requests.get(api_endpoint, headers=headers)\n```\n\nA GitHub personal access token is a long string of characters that looks similar to this:\n\n```\nREDACTED\n```\n\nThis token acts as a password and allows you to authenticate with GitHub's APIs or command-line tools like Git. It's important to keep your personal access token secure and never share it with anyone."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

**Rate Limits:**
- Determined by AWS Bedrock service limits
- Subject to Lambda concurrent execution limits
- API Gateway throttling settings

**Best Practices:**
1. Include system messages to set context and behavior
2. Keep messages concise and focused
3. Handle errors gracefully in your client
4. Implement proper retry logic for 5xx errors
5. Monitor token usage to optimize costs

## Architecture

The gateway is built using:
- AWS Lambda for serverless compute
- API Gateway v2 for HTTP API endpoints
- AWS Bedrock for LLM integration
- Jest and aws-sdk-client-mock for testing

[Detailed architecture diagram coming soon]

## Security Considerations

Current security features:
- Custom Lambda authorizer for API access control
- Input validation for all requests
- Prompt and response scanning with GitGuardian
- Automatic redaction of sensitive information
- Proper error handling and sanitization
- AWS IAM role-based access control
- Model validation and restrictions
- CloudWatch security event monitoring

## Contributing

[Coming Soon]

## License

[Coming Soon] 