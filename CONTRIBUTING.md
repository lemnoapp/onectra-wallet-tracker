# Contributing to ONECTRA Wallet Bot

Thank you for your interest in contributing to the ONECTRA Wallet Bot! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Process](#contributing-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Issue Reporting](#issue-reporting)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to creating a welcoming and inclusive environment. Please be respectful and professional in all interactions.

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- NPM package manager
- Git
- A Telegram bot token for testing
- Basic understanding of JavaScript/Node.js
- Familiarity with Telegram Bot API

### Development Setup

1. **Fork the repository**:
   ```bash
   git clone https://github.com/your-username/onectra-wallet-bot.git
   cd onectra-wallet-bot
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create a test bot**:
   - Message @BotFather on Telegram
   - Create a new bot for testing
   - Get your bot token

4. **Configure for development**:
   - Update the `BOT_TOKEN` in `bot.js` with your test token
   - Never commit real tokens to the repository

5. **Run the bot**:
   ```bash
   npm start
   ```

## Contributing Process

### 1. Choose an Issue
- Browse existing [issues](https://github.com/onectra/wallet-bot/issues)
- Look for issues labeled `good first issue` for beginners
- Comment on the issue to let others know you're working on it

### 2. Create a Branch
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 3. Make Changes
- Write clean, documented code
- Follow the existing code style
- Test your changes thoroughly

### 4. Commit Changes
```bash
git add .
git commit -m "Add descriptive commit message"
```

Use conventional commit messages:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `style:` for code style changes
- `refactor:` for code refactoring
- `test:` for adding tests

### 5. Push and Create PR
```bash
git push origin your-branch-name
```
Then create a Pull Request on GitHub.

## Coding Standards

### JavaScript Style Guide

- **ES6+**: Use modern JavaScript features
- **Const/Let**: Prefer `const` and `let` over `var`
- **Arrow Functions**: Use arrow functions for short callbacks
- **Template Literals**: Use template literals for string interpolation
- **Async/Await**: Prefer async/await over promises where possible

### Code Organization

```javascript
// File structure example
const dependencies = require('module'); // External dependencies first
const localModules = require('./local'); // Local modules second

class ClassName {
    constructor() {
        // Initialize properties
    }
    
    // Public methods first
    publicMethod() {
        // Implementation
    }
    
    // Private methods last (prefixed with _)
    _privateMethod() {
        // Implementation
    }
}
```

### Error Handling

```javascript
// Always use try-catch for async operations
try {
    const result = await someAsyncOperation();
    return result;
} catch (error) {
    console.error('Operation failed:', error);
    // Handle error appropriately
}
```

### Comments and Documentation

```javascript
/**
 * Brief description of the function
 * @param {string} parameter - Description of parameter
 * @returns {Promise<Object>} Description of return value
 */
async function exampleFunction(parameter) {
    // Implementation comments when necessary
    return result;
}
```

## Testing Guidelines

### Manual Testing

Before submitting a PR, test the following scenarios:

1. **Basic Commands**:
   - `/start` command works
   - `/help` displays correctly
   - `/status` shows accurate information

2. **Wallet Operations**:
   - Can track valid wallet addresses
   - Rejects invalid addresses
   - Can untrack wallets
   - List shows correct wallets

3. **Error Handling**:
   - Bot handles invalid input gracefully
   - Network errors don't crash the bot
   - Rate limiting works correctly

4. **Advanced Features**:
   - Settings panel functions correctly
   - Button interactions work
   - Message cleanup operates properly

### Test Documentation

When adding new features, include:
- Description of test scenarios
- Expected behavior
- Edge cases to consider

## Documentation

### Code Documentation

- Add JSDoc comments for all functions
- Explain complex logic with inline comments
- Update README.md for new features
- Document configuration changes

### User Documentation

- Update help messages for new commands
- Add examples for new features
- Include troubleshooting information
- Update the main README.md

## Issue Reporting

### Bug Reports

Include the following information:

```markdown
**Bug Description**
Brief description of the bug

**Steps to Reproduce**
1. Step one
2. Step two
3. Step three

**Expected Behavior**
What should happen

**Actual Behavior**
What actually happens

**Environment**
- Node.js version:
- Operating System:
- Bot version/commit:

**Additional Context**
Any other relevant information
```

### Feature Requests

```markdown
**Feature Description**
Brief description of the requested feature

**Use Case**
Why is this feature needed?

**Proposed Implementation**
How could this be implemented?

**Alternatives**
Any alternative solutions considered
```

## Pull Request Process

### Before Submitting

1. **Test Thoroughly**: Ensure your changes work as expected
2. **Update Documentation**: Update relevant documentation
3. **Follow Code Style**: Ensure code follows project standards
4. **No Merge Conflicts**: Rebase on latest main branch if needed

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Manual testing completed
- [ ] All existing functionality verified
- [ ] New functionality tested

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No sensitive information included
```

### Review Process

1. **Automatic Checks**: Ensure all checks pass
2. **Code Review**: Address reviewer feedback
3. **Testing**: Verify functionality works
4. **Approval**: Get approval from maintainer
5. **Merge**: Squash and merge when approved

## Development Tips

### Debugging

- Use `console.log` with clear prefixes for debugging
- Check bot logs for WebSocket connection issues
- Test with a dedicated development bot
- Use Node.js debugger for complex issues

### Performance Considerations

- Monitor memory usage with many tracked wallets
- Implement proper error handling for API failures
- Consider rate limiting for heavy operations
- Optimize WebSocket connection management

### Security Best Practices

- Never commit bot tokens or API keys
- Validate all user input
- Implement proper rate limiting
- Use secure coding practices

## Getting Help

If you need help:

1. Check existing documentation and issues
2. Ask questions in issue comments
3. Create a new issue for complex questions
4. Be specific about your problem and environment

## Recognition

Contributors will be acknowledged in:
- README.md contributors section
- Release notes for significant contributions
- GitHub contributor graphs

Thank you for contributing to ONECTRA Wallet Bot!
