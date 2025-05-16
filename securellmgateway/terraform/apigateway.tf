resource "aws_lambda_function_url" "main" {
  function_name      = aws_lambda_function.hello_world.function_name
  authorization_type = "NONE"
  cors {
    allow_origins = ["*"]
    allow_methods = ["POST"]
    allow_headers = ["*"]
  }
}

output "function_url" {
  description = "Lambda Function URL"
  value       = aws_lambda_function_url.main.function_url
} 