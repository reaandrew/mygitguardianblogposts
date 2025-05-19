# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The "Secure LLM Gateway" is a middleware layer that provides secure routing, screening, and governance of LLM usage within organizations. It's built as an AWS Lambda function that acts as a gateway between users and large language models (LLMs), with a focus on security features like sensitive data detection and redaction.

## Development Commands

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Run a specific test file
npx jest src/lambda/securellmgateway/index.test.js

# Run GitGuardian wrapper tests
npx jest src/lambda/securellmgateway/gitguardian/gitguardian-wrapper.test.js
```

### Testing the Lambda Locally

```bash
# Invoke the Lambda with a test payload (requires SECURE_LLM_GATEWAY_URL environment variable)
bash securellmgateway/scripts/invoke-securellmgateway-lambda.sh
```

### Chunker CLI

The project includes a CLI tool for chunking and reconstructing large JSON files:

```bash
# Split a large JSON file into chunks
node securellmgateway/src/lambda/securellmgateway/chunker/cli.js split input.json --outDir ./chunks

# Reconstruct chunks back into a single JSON file
node securellmgateway/src/lambda/securellmgateway/chunker/cli.js reconstruct output.json chunks/chunk0.json chunks/chunk1.json
```

## Architecture

### Main Components

1. **Lambda Handler** (`src/lambda/securellmgateway/index.js`):
   - Entry point for the AWS Lambda function
   - Handles HTTP requests in OpenAI-compatible chat completions format
   - Coordinates input validation, GitGuardian screening, and model invocation
   - Formats responses in OpenAI-compatible structure

2. **GitGuardian Integration** (`src/lambda/securellmgateway/gitguardian/gitguardian-wrapper.js`):
   - Provides interfaces for scanning content using GitGuardian's API
   - Handles redaction of sensitive information in both prompts and LLM responses
   - Includes utilities for managing API limits and chunking large content

3. **Chunker Module** (`src/lambda/securellmgateway/chunker/index.js`):
   - Splits large JSON files into manageable chunks (< 1MB)
   - Provides functionality to reconstruct chunked files
   - Includes a CLI tool for file operations

### Request Flow

1. Incoming request is validated for proper format and required fields
2. Messages are scanned with GitGuardian to detect sensitive information
3. Detected sensitive data is redacted from messages
4. Request is converted to the format expected by AWS Bedrock
5. AWS Bedrock processes the request and generates a response
6. Response is scanned for sensitive information and redacted if necessary
7. Final response is formatted in OpenAI-compatible structure and returned

### Security Features

- Input validation for all requests
- GitGuardian scanning of both prompts and LLM responses
- Automatic redaction of sensitive information
- CloudWatch integration for security event logging and metrics
- Secure parameter storage for API keys using AWS SSM Parameter Store

## Key Files

- `/securellmgateway/src/lambda/securellmgateway/index.js`: Main Lambda handler
- `/securellmgateway/src/lambda/securellmgateway/gitguardian/gitguardian-wrapper.js`: GitGuardian integration
- `/securellmgateway/src/lambda/securellmgateway/chunker/index.js`: JSON chunking utilities
- `/securellmgateway/src/lambda/securellmgateway/chunker/cli.js`: CLI for chunking operations
- `/securellmgateway/terraform/lambda.tf`: Terraform configuration for AWS Lambda

## Development Guidelines

1. **Testing**: Always include tests for new functionality, following the pattern in existing test files
2. **Error Handling**: Use the existing error response helpers for consistent error formatting
3. **Security**: New functionality should maintain or enhance the security model:
   - Scan all user input for sensitive information
   - Scan all model responses before returning to users
   - Log security events appropriately
   - Use SSM Parameter Store for secrets
4. **AWS Integration**: Follow established patterns for AWS service integration