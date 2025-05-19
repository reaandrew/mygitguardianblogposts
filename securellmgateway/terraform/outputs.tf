output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.hello_world.function_name
}

# Removed in favor of API Gateway
# output "function_url" {
#   description = "Lambda Function URL (deprecated)"
#   value       = aws_lambda_function_url.main.function_url
# }

output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.hello_world.arn
}

output "api_gateway_url" {
  description = "API Gateway URL"
  value       = aws_apigatewayv2_stage.default.invoke_url
}