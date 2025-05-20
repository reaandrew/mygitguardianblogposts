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
