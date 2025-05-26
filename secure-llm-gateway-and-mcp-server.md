
### Building a Secure LLM Gateway (and an MCP Server) with GitGuardian & AWS Lambda
*How I wrapped large-language-model power in a safety blanket of secrets-detection, chunking, and serverless scale.*

As organisations begin to adopt LLMs internally, **security and control become non-negotiable**. This post is a **proof of concept** that shows just how **straightforward it is to integrate GitGuardian’s Secrets Detection API** into an LLM workflow. We’ll start with a simple HTTP-based API and, through progressive enhancements, arrive at a gateway that routes, screens, and governs every request—culminating in deep GitGuardian integration and a custom MCP server.

Large-language models are now woven into everything from customer-support chatbots to internal knowledge bases. But letting users send raw prompts to a model—and letting the model’s raw output flow straight back—creates a glaring security gap. Users can accidentally paste an API key; a model can confidently hallucinate secrets that look real; and suddenly sensitive data is sitting in a log file or, worse, in a third-party SaaS.

To plug that gap, I built a **Secure LLM Gateway** backed by GitGuardian’s secrets-detection engine and running entirely on AWS Lambda. Over four iterative phases, the project matured from a simple proxy to a full serverless platform that also serves files through a Model Context Protocol (MCP) server — ensuring the payloads of each file are scanned.

![secure-llm-gateway-Phase-3.1.drawio.png](images/secure-llm-gateway-Phase-3.1.drawio.png)

---

## Phase&nbsp;1 – A Minimal, OpenAI-Compatible Proxy

I began with the leanest possible Lambda function fronted by API Gateway. It exposed `/v1/chat/completions`, validated incoming JSON, mapped it to AWS Bedrock (Claude 3 Sonnet in my first tests), and streamed the response back. By mirroring OpenAI’s request/response structure, any client library that already “spoke” OpenAI worked unchanged—only the base URL needed updating. Even at this early stage, IAM roles were locked down to Bedrock-only permissions and robust error handling protected the gateway from malformed payloads.

![secure-llm-gateway-Phase-1-flow.drawio.png](images/secure-llm-gateway-Phase-1-flow.drawio.png)

---

## Phase&nbsp;2 – Dropping GitGuardian into the Request Path

With basic forwarding stable, I introduced GitGuardian’s Secrets Detection API—starting simple. At this stage, I used the `scan` endpoint ([https://api.gitguardian.com/docs#tag/Scan-Methods/operation/content_scan](https://api.gitguardian.com/docs#tag/Scan-Methods/operation/content_scan)) to screen both incoming prompts and model responses, without any redaction logic yet. This was a light iteration on Phase 1, just enough to validate integration and confirm that secret detection could run inline without disrupting the flow. API keys were retrieved securely from SSM Parameter Store, and all logs were captured in CloudWatch for observability.

![secure-llm-gateway-Phase-2-flow.drawio.png](images/secure-llm-gateway-Phase-2-flow.drawio.png)

[View this phase on GitHub](https://github.com/secronyx/secure-llm-gateway/tree/phase-2)


---

## Phase&nbsp;3 – Beating the 1 MB Limit with Smart Chunking

Real-world prompts—and especially model outputs—could exceed GitGuardian’s 1 MB payload cap. Rather than truncate, I wrote a JSON-aware chunker that walks the incoming tree, slices arrays element-by-element or objects property-by-property, and labels each piece so it can be reassembled after scanning. At this stage, I also introduced redaction: any secrets detected by GitGuardian were replaced with the token **REDACTED** before being passed along. The gateway switched to using GitGuardian’s *multiscan* endpoint ([https://api.gitguardian.com/docs#tag/Scan-Methods/operation/multiple_scan](https://api.gitguardian.com/docs#tag/Scan-Methods/operation/multiple_scan)), batching dozens of chunks in a single call while keeping latency low.

![secure-llm-gateway-Phase-3-flow.drawio.png](images/secure-llm-gateway-Phase-3-flow.drawio.png)

---

## Phase&nbsp;3.1 – Add simple Lambda authorizer to the API Gateway

To complete the architecture and prepare for future access controls, I added a simple Lambda authorizer to the API Gateway. Right now, it unconditionally returns Allow for all requests—there’s no token validation or user lookup yet. The goal was to establish the pattern and wiring early, so upgrading to a real authentication flow later (JWTs, signed cookies, IAM checks) won’t require major changes. Even though it’s just a placeholder for now, having the authorizer in place makes it easy to plug in proper auth later without reworking the whole thing.

### Secure LLM Gateway in Action

Let's see the Secure LLM Gateway in action with a real-world example. In this test, I'll intentionally include AWS credentials in a prompt to demonstrate how GitGuardian automatically redacts sensitive information:

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
  }'
```

And here's the response from the gateway:

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

Notice how GitGuardian has automatically detected and redacted the AWS credentials in the response. The model attempted to use the credentials provided in the prompt, but our security layer replaced all instances with "REDACTED" before returning the response. This demonstrates the effectiveness of the two-way protection: GitGuardian scans both the incoming prompts (to prevent sensitive data from reaching the model) and the outgoing responses (to catch any sensitive information the model might generate).

## Phase&nbsp;4 – The MCP Server: Secure File Fetches for LLMs

![secure-llm-gateway-Phase-4.drawio.png](images/secure-llm-gateway-Phase-4.drawio.png)

The final phase stretched beyond chat completions. Many advanced agent patterns need the model to “pull” external documents. To support that, I built a second Lambda that implements the **Model Context Protocol (MCP)** using [this AWS sample serverless MCP project](https://github.com/aws-samples/sample-serverless-mcp-servers) as the base. I added an additional tool definition to the project, which requires an argument and updated the MCP client to consume this with the required argument. This is an important detail since extending the MCP interface requires awareness of both sides of the contract.

The Lambda fetches a file using a `file_key`, screens the content using the same GitGuardian scanning pipeline (including chunking), and streams a redacted version back. I reused the GitGuardian wrapper built earlier for the Secure LLM Gateway, fetching the API key securely from AWS Parameter Store. The whole setup is managed through Terraform for consistency with the rest of the stack. A synthetic data generator also includes some of the supported secret types to help with regression testing.

### MCP Client in Action

To demonstrate the GitGuardian integration with MCP, I created a test using content from GitGuardian's [AMQP credentials detection documentation](https://docs.gitguardian.com/secrets-detection/secrets-detection-engine/detectors/specifics/amqp_credentials). I converted an example AMQP URI to JSON format and used it to test the MCP client's fetch-file functionality. Here's the output from running the MCP client:

```
Calling fetch-file with: {
  "name": "fetch-file",
  "arguments": {
    "file_key": "example-document.txt"
  }
}
callTool:fetch-file response:  {
  content: [
    {
      type: 'text',
      text: '{\n' +
        `  "text": "CONNECTION_URI='REDACTEDCTEDACTED'",\n` +
        '  "host": "google.com",\n' +
        '  "port": "5434",\n' +
        '  "username": "root",\n' +
        '  "password": "REDACTED",\n' +
        '  "scheme": "amqp",\n' +
        '  "database": "thegift",\n' +
        '  "connection_uri": "REDACTEDCTEDACTED"\n' +
        '}'
    }
  ]
}
```

Notice how the GitGuardian integration has automatically identified and redacted sensitive information in the response. Both the connection URIs and the password field have been replaced with "REDACTED", ensuring that sensitive credentials are never exposed to the model or user.

---

## What Makes the Stack Tick?

**Security first, everywhere.**
GitGuardian is embedded directly into the request and response flow, helping catch secrets before they ever leave the user or hit the model. Input validation runs from the first line of code, secrets detection wraps both sides of the LLM interaction, and CloudWatch logs are structured for security-first auditing.

**Terraform-defined, serverless-deployed.**
All infrastructure is authored and automated using Terraform, making it reproducible, version-controlled, and easy to evolve. We lean on the Serverless model—API Gateway, Lambda, and Bedrock—to stay lean, low-cost, and horizontally scalable without managing infrastructure.

**A safe and scalable proxy pattern.**
By building an OpenAI-compatible proxy that talks to Bedrock under the hood, we enable secure, governed access to AWS’s LLMs without needing clients to understand the underlying platform. It’s simple for developers, safe for organisations, and scalable from the start.

---

## Where It Can Go Next

I’d like to explore richer CloudWatch dashboards that break down GitGuardian detections by type and frequency. This could help surface usage patterns and reduce the risk of sensitive data making its way into prompts or completions. I’m also considering a lightweight caching layer for frequently requested documents to improve performance. The Lambda Layer will remain purely as a convenient way to share common libraries—chunking logic, GitGuardian wrappers, and utility functions—across multiple functions without duplication.

---

## Closing Thoughts

Building this gateway underscored a simple truth: **security isn’t a feature you bolt on; it’s the thread you weave through every layer**. By pairing GitGuardian’s scanning engine with AWS’s operational convenience, the system keeps costs sane while putting a solid lock between users, models, and any secret that tries to sneak through. And because the heavy lifting sits in small, testable modules, the platform is ready to evolve alongside the ever-growing landscape of LLM use cases—without ever letting its guard down.
