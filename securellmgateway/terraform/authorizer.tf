# Create zip file for the authorizer Lambda
data "archive_file" "authorizer_lambda_zip" {
  type        = "zip"
  source_file = "${path.root}/../src/lambda/authorizer/index.js"
  output_path = "${path.module}/authorizer-lambda.zip"
}

# Create the authorizer Lambda function
resource "aws_lambda_function" "authorizer" {
  filename         = data.archive_file.authorizer_lambda_zip.output_path
  function_name    = "${var.project_name}-authorizer"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.authorizer_lambda_zip.output_base64sha256
  runtime          = "nodejs18.x"
  timeout          = 10

  environment {
    variables = {
      ENVIRONMENT = var.environment
    }
  }
}

# Create the API Gateway authorizer
resource "aws_apigatewayv2_authorizer" "lambda_authorizer" {
  api_id           = aws_apigatewayv2_api.securellmgateway.id
  authorizer_type  = "REQUEST"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.project_name}-authorizer"
  authorizer_uri   = aws_lambda_function.authorizer.invoke_arn
  authorizer_payload_format_version = "2.0"
  enable_simple_responses = true
}

# Update the route to use the authorizer
resource "aws_apigatewayv2_route" "chat_completions" {
  api_id             = aws_apigatewayv2_api.securellmgateway.id
  route_key          = "POST /chat/completions"
  target             = "integrations/${aws_apigatewayv2_integration.securellmgateway.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.lambda_authorizer.id
  authorization_type = "CUSTOM"
}

# Permission for API Gateway to invoke the authorizer Lambda
resource "aws_lambda_permission" "api_gateway_authorizer" {
  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.securellmgateway.execution_arn}/*/*"
}