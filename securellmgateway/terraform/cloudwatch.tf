resource "aws_cloudwatch_log_metric_filter" "security_events" {
  name           = "${var.project_name}-security-events"
  pattern        = "{ $.security_event = * }"
  log_group_name = "/aws/lambda/${aws_lambda_function.hello_world.function_name}"

  metric_transformation {
    name          = "SecurityEvents"
    namespace     = "SecureLLMGateway"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "security_events" {
  alarm_name          = "${var.project_name}-security-events"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "SecurityEvents"
  namespace           = "SecureLLMGateway"
  period             = "60"
  statistic          = "Sum"
  threshold          = "0"
  alarm_description  = "This alarm triggers when sensitive data is detected in LLM interactions"
  treat_missing_data = "notBreaching"
  alarm_actions      = []
  ok_actions         = []
  insufficient_data_actions = []

  dimensions = {
    FunctionName = aws_lambda_function.hello_world.function_name
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
} 