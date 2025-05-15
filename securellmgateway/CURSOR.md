# Cursor Assistant Behavior Patterns

## Areas for Improvement

### Infrastructure Awareness
- Always check Terraform configurations when making API-related changes
- Consider the full infrastructure impact of changes
- Keep track of resource naming conventions
- Review all infrastructure components affected by changes

### Project Context
- Maintain awareness of project architecture decisions
- Remember key design patterns (e.g., OpenAI-compatible API)
- Consider cross-component impacts
- Track project-wide naming conventions

### Code Quality
- Avoid premature optimization
- Keep code simple and clear
- Document architectural decisions
- Follow consistent patterns

### Testing
- Ensure tests reflect actual behavior
- Consider edge cases
- Maintain test coverage
- Keep tests focused and clear

### Documentation
- Keep documentation in sync with code
- Document architectural decisions
- Update README with progress
- Maintain clear API documentation

## Best Practices

### When Making Changes
1. Check infrastructure code first
2. Review related components
3. Consider testing impact
4. Update documentation
5. Follow project conventions

### When Adding Features
1. Review existing architecture
2. Check infrastructure requirements
3. Plan testing strategy
4. Update documentation
5. Consider security implications

### When Fixing Bugs
1. Understand the full context
2. Check related components
3. Add/update tests
4. Document the fix
5. Consider similar issues

## Project-Specific Guidelines

### API Design
- Follow OpenAI-compatible format
- Use consistent endpoint naming
- Maintain proper error handling
- Document all endpoints

### Infrastructure
- Use consistent resource naming
- Follow AWS best practices
- Document infrastructure decisions
- Keep Terraform code clean

### Security
- Implement proper input validation
- Follow security best practices
- Document security measures
- Consider all attack vectors
- Ensure sensitive data is properly redacted
- Log security events appropriately

### Prompt Engineering
- Be explicit about desired output format
- Include examples in system prompts
- Structure prompts for clear input/output separation
- Consider security implications of example data
- Ensure redacted content is properly handled

### GitGuardian Integration
- Follow proper API payload format
- Handle all types of sensitive data
- Implement proper redaction logic
- Log all security events
- Prevent duplicate redactions
- Ensure redacted content is used in LLM requests 