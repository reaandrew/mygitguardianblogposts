# Secure LLM Gateway

A middleware layer that enables secure routing, screening, and governance of LLM usage within organizations. This project demonstrates a progressive approach to building a secure gateway for LLM interactions, integrating GitGuardian for sensitive data detection and implementing a custom Model Context Protocol (MCP) Server.

## Project Overview

As organizations adopt LLMs internally, security and control become critical requirements. This project provides a practical architecture for implementing a secure LLM gateway that helps organizations:

- Route requests to appropriate LLM models
- Screen for sensitive information in prompts and responses
- Govern LLM usage safely
- Integrate with internal tools and data sources

## Implementation Progress

### Phase 1: Simple HTTP-Based Deployment ✨ (In Progress)
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
- [ ] Create initial API documentation

### Phase 2: GitGuardian Integration
- [ ] Set up GitGuardian API integration
- [ ] Implement prompt screening using GitGuardian Secrets Detection
- [ ] Add response screening functionality
- [ ] Create sensitive data redaction system
- [ ] Implement match location handling from GitGuardian API
- [ ] Add logging for security events
- [ ] Create monitoring for screening results

### Phase 3: Chunking & Truncation System
- [ ] Implement input chunking logic
- [ ] Add output chunking system
- [ ] Handle GitGuardian API limits (1MB)
- [ ] Create chunk reassembly logic
- [ ] Add validation for chunked content
- [ ] Implement error handling for chunking operations
- [ ] Add performance monitoring for chunked operations

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

## Architecture

The gateway is built using:
- AWS Lambda for serverless compute
- API Gateway v2 for HTTP API endpoints
- AWS Bedrock for LLM integration
- Jest and aws-sdk-client-mock for testing

[Detailed architecture diagram coming soon]

## Security Considerations

Current security features:
- Input validation for all requests
- Proper error handling and sanitization
- AWS IAM role-based access control
- Model validation and restrictions

[More security details coming soon]

## Contributing

[Coming Soon]

## License

[Coming Soon] 