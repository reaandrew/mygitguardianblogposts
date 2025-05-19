/**
 * Simple Lambda authorizer that always allows requests
 * In a real environment, this would validate tokens, check permissions, etc.
 */

// API Gateway v2 authorizer response format
// https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html
exports.handler = async (event) => {
  console.log('Authorizer event:', JSON.stringify(event, null, 2));
  
  // For now, always allow the request
  return {
    isAuthorized: true,
    context: {
      // Additional context that will be passed to the target Lambda
      userId: 'demo-user',
      principalId: 'user123',
      scope: 'full-access'
    }
  };
};