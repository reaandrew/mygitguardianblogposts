terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  # You may want to configure a backend here for state management
  backend "local" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project = "secure-llm-gateway"
      Environment = var.environment
    }
  }
} 