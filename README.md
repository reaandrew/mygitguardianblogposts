# Secure LLM Gateway & MCP Server

This repository contains a set of serverless AWS solutions for secure and governed access to Large Language Models with GitGuardian integration for secrets detection and redaction.

## Project Overview

The repository consists of three main components:

1. **Secure LLM Gateway** - An OpenAI-compatible proxy that adds a security layer to LLM interactions
2. **Stateless MCP Server** - A Model Context Protocol server that enables secure file fetching for LLMs
3. **Secure LLM Libraries** - Shared utilities for GitGuardian scanning and JSON chunking

All components feature GitGuardian integration to detect and redact sensitive information in both incoming prompts and outgoing responses.

## Components

### 1. Secure LLM Gateway

This solution provides an OpenAI-compatible API Gateway that:

- Proxies requests to AWS Bedrock (primarily Claude models)
- Scans incoming prompts for sensitive information using GitGuardian
- Screens outgoing model responses for secrets and redacts them
- Handles large payloads with smart JSON chunking
- Provides Lambda authorization for access control

#### Key Features

- OpenAI-compatible API endpoints (`/chat/completions`)
- GitGuardian integration for secrets detection
- JSON chunking for payloads exceeding GitGuardian's 1MB limit
- IAM roles restricted to Bedrock-only permissions
- CloudWatch logging and observability
- Lambda authorizer for custom authentication

### 2. Stateless MCP Server 

** Taken from [https://github.com/aws-samples/sample-serverless-mcp-servers](https://github.com/aws-samples/sample-serverless-mcp-servers) **

This is an implementation of the Model Context Protocol (MCP) server that:

- Enables secure file fetching for LLMs
- Scans all file contents using GitGuardian before delivery to models
- Operates as a stateless service using Lambda
- Integrates with the same GitGuardian pipeline as the Gateway

#### Key Features

- MCP-compatible file fetch functionality
- GitGuardian scanning for all fetched files
- Secure parameter storage for API keys
- Terraform-based infrastructure

### 3. Secure LLM Libraries

Shared utilities that include:

- GitGuardian wrapper for efficient scanning and redaction
- JSON chunking utilities for handling large content
- Testing helpers and utilities

## Prerequisites

- AWS Account with appropriate permissions
- GitGuardian API key
- Terraform installed (v1.0+)
- Node.js (v16+)
- AWS CLI configured

## Environment Setup

1. Set up environment variables:

```bash
# Required for deployment
export AWS_REGION=us-east-1  # Or your preferred region
export GITGUARDIAN_API_KEY=your-api-key

# Required for testing
export SECURE_LLM_GATEWAY_URL=https://your-api-gateway-url
export MCP_SERVER_URL=https://your-mcp-server-url
```

## Deployment

### 1. Deploy Secure LLM Libraries

```bash
cd secure-llm-libs
npm install
npm test  # Verify functionality
```

### 2. Deploy Secure LLM Gateway

```bash
cd securellmgateway

# Initialize and apply Terraform
cd terraform
terraform init
terraform apply

# Record the output URL
export SECURE_LLM_GATEWAY_URL=$(terraform output -raw api_gateway_url)
cd ..

# Test the deployment
bash scripts/invoke-securellmgateway-lambda.sh
```

### 3. Deploy MCP Server

```bash
cd stateless-mcp-on-lambda

# Initialize and apply Terraform
cd terraform
terraform init
terraform apply

# Record the output URL
export MCP_SERVER_URL=$(terraform output -raw apigateway_url)
cd ..
```

## Testing the Solutions

### Testing the Secure LLM Gateway

You can test the gateway using the provided script:

```bash
cd securellmgateway
bash scripts/invoke-securellmgateway-lambda.sh
```

Or using curl directly:

```bash
curl -X POST "${SECURE_LLM_GATEWAY_URL}/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-token" \
  -d '{
    "model": "anthropic.claude-3-sonnet-20240229-v1:0",
    "messages": [
      {
        "role": "user",
        "content": "What is the capital of France?"
      }
    ]
  }'
```

### Testing the MCP Server

```bash
cd stateless-mcp-on-lambda/src/js/mcpclient
node index.js
```

## Security Features

Both the Secure LLM Gateway and MCP Server include:

- GitGuardian scanning of all content
- Automatic redaction of sensitive information
- Input validation
- Secure parameter storage using AWS SSM
- CloudWatch logging for security auditing

## Architecture Diagrams

The repository includes detailed architecture diagrams in the `images/` directory:

- [Phase 1: Basic OpenAI-compatible proxy](images/secure-llm-gateway-Phase-1.drawio.png)
- [Phase 2: GitGuardian integration](images/secure-llm-gateway-Phase-2.drawio.png)
- [Phase 3: Smart chunking](images/secure-llm-gateway-Phase-3.drawio.png)
- [Phase 3.1: Lambda authorizer](images/secure-llm-gateway-Phase-3.1.drawio.png)
- [Phase 4: MCP Server](images/secure-llm-gateway-Phase-4.drawio.png)

## Testing and Development

### Running Tests

```bash
# Test GitGuardian wrapper
cd secure-llm-libs
npx jest src/gitguardian/gitguardian-wrapper.test.js

# Test Secure LLM Gateway
cd securellmgateway
npx jest src/lambda/securellmgateway/index.test.js
```

### Chunker CLI

The project includes a CLI tool for chunking and reconstructing large JSON files:

```bash
# Split a large JSON file into chunks
node secure-llm-libs/src/chunker/cli.js split input.json --outDir ./chunks

# Reconstruct chunks back into a single JSON file
node secure-llm-libs/src/chunker/cli.js reconstruct output.json chunks/chunk0.json chunks/chunk1.json
```

## Additional Resources

For more details on the project's development and architecture, see [the full blog post](secure-llm-gateway-and-mcp-server.md).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.