variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "eu-west-2"
}

variable "environment" {
  description = "Environment name (e.g., dev, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "secure-llm-gateway"
}

variable "gitguardian_ssm_key_path" {
  description = "SSM Parameter Store path for GitGuardian API key"
  type        = string
  default     = "/ara/gitguardian/apikey/scan"
} 