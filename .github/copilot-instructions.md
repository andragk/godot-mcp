# Copilot Instructions

## GitHub CLI Usage

You may and should use the GitHub CLI (gh) whenever it's helpful. Assume gh is available and preferred for interacting with GitHub (repos, issues, PRs, workflows, releases, etc.).

## Branch Naming Conventions

### Standard Branch Types
- `main` - Production-ready code, protected branch
- `develop` - Integration branch for features (if using GitFlow)
- `feature/*` - New features or enhancements
- `bugfix/*` - Bug fixes for upcoming releases
- `hotfix/*` - Urgent fixes for production issues
- `release/*` - Release preparation branches
- `docs/*` - Documentation-only changes
- `test/*` - Testing improvements or additions
- `refactor/*` - Code refactoring without behavior changes
- `chore/*` - Maintenance tasks, dependency updates

### Naming Format
```
<type>/<ticket-id>-<short-description>
```

### Examples
- `feature/PROJ-123-user-authentication`
- `bugfix/PROJ-456-fix-login-timeout`
- `hotfix/PROJ-789-critical-security-patch`
- `docs/PROJ-101-update-api-documentation`
- `refactor/PROJ-202-optimize-database-queries`

### Rules
- Use lowercase and hyphens, no spaces or underscores
- Keep descriptions concise (3-5 words maximum)
- Include ticket/issue ID when available
- Delete branches after merging

## Commit Message Standards

### Conventional Commits Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Commit Types
- `feat` - New feature for users
- `fix` - Bug fix for users
- `docs` - Documentation changes
- `style` - Code formatting, no logic changes
- `refactor` - Code restructuring, no behavior change
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `build` - Build system or external dependencies
- `ci` - CI/CD configuration changes
- `chore` - Maintenance tasks
- `revert` - Revert previous commit

### Subject Line Rules
- Use imperative mood: "add" not "added" or "adds"
- No period at the end
- Capitalize first letter
- Maximum 50 characters
- Describe WHAT changed, not HOW

### Body Guidelines
- Wrap at 72 characters
- Explain WHY and WHAT, not HOW
- Separate from subject with blank line
- Use bullet points for multiple changes
- Reference issues and PRs

### Footer Guidelines
- Breaking changes: `BREAKING CHANGE: description`
- Issue references: `Closes #123`, `Fixes #456`, `Relates to #789`
- Co-authors: `Co-authored-by: Name <email>`

### Examples
```
feat(auth): Add OAuth2 authentication support

Implement OAuth2 flow for third-party authentication.
Supports Google, GitHub, and Microsoft providers.

- Add OAuth2 client configuration
- Implement callback handlers
- Add user session management

Closes #234
```

```
fix(api): Prevent race condition in user creation

Multiple simultaneous requests could create duplicate users.
Added database constraint and request deduplication.

Fixes #567
```

```
docs: Update API authentication guide

BREAKING CHANGE: API v1 authentication is deprecated.
All clients must migrate to v2 by 2026-06-01.
```

### Commit Size
- Keep commits atomic and focused
- One logical change per commit
- Split large changes into multiple commits
- Each commit should build and pass tests

## Pull Request Labels

### Status Labels
- `status: draft` - Work in progress, not ready for review
- `status: ready` - Ready for review
- `status: in-review` - Currently under review
- `status: changes-requested` - Reviewer requested changes
- `status: approved` - Approved, ready to merge
- `status: blocked` - Blocked by external dependency

### Type Labels
- `type: feature` - New feature implementation
- `type: bugfix` - Bug fix
- `type: hotfix` - Critical production fix
- `type: documentation` - Documentation updates
- `type: refactor` - Code refactoring
- `type: test` - Test additions or improvements
- `type: performance` - Performance optimization
- `type: security` - Security-related changes

### Priority Labels
- `priority: critical` - Must be addressed immediately
- `priority: high` - Important, schedule soon
- `priority: medium` - Normal priority
- `priority: low` - Nice to have

### Size Labels
- `size: xs` - < 10 lines changed
- `size: s` - 10-50 lines changed
- `size: m` - 50-200 lines changed
- `size: l` - 200-500 lines changed
- `size: xl` - > 500 lines changed

### Impact Labels
- `breaking-change` - Contains breaking changes
- `needs-migration` - Requires data or code migration
- `dependencies` - Updates dependencies
- `backwards-compatible` - Fully backwards compatible

## Issue Management

### Issue Titles
- Be specific and descriptive
- Use imperative mood for bugs: "Fix login timeout"
- Use present tense for features: "Add user profile page"
- Include component/area prefix when relevant
- Maximum 80 characters

### Issue Labels
- `bug` - Something isn't working
- `feature` - New feature or enhancement
- `enhancement` - Improvement to existing feature
- `documentation` - Documentation improvements
- `question` - General questions
- `help-wanted` - Open for community contributions
- `good-first-issue` - Good for newcomers
- `duplicate` - Duplicate of existing issue
- `invalid` - Not a valid issue
- `wontfix` - Will not be addressed

### Issue Templates
Issues should include:
- **Description**: Clear explanation of the issue or feature
- **Steps to Reproduce**: For bugs, exact steps to reproduce
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Environment**: OS, browser, version numbers
- **Screenshots**: Visual evidence when applicable
- **Acceptance Criteria**: For features, definition of done

### Issue Assignment
- Assign to yourself when starting work
- Add to relevant project or milestone
- Link to related PRs using keywords
- Update status labels as work progresses
- Close with reference to fixing PR

## Code Review Guidelines

### Reviewer Responsibilities
- Review within 24 hours of request
- Provide constructive, specific feedback
- Verify tests exist and pass
- Check for security vulnerabilities
- Ensure code follows project standards
- Approve only when confident in quality

### Author Responsibilities
- Keep PRs small and focused (< 400 lines)
- Write clear PR description with context
- Self-review before requesting review
- Respond to feedback promptly
- Update PR based on feedback
- Resolve all conversations before merge

### Review Comments
- Use "Request Changes" for blocking issues
- Use "Comment" for non-blocking suggestions
- Use "Approve" only when ready to merge
- Be specific: cite line numbers and examples
- Explain the "why" behind suggestions

## Merge Requirements

### Before Merging
- ✅ All CI checks pass
- ✅ At least one approval (or per team policy)
- ✅ All conversations resolved
- ✅ Branch up to date with base branch
- ✅ No merge conflicts
- ✅ Documentation updated
- ✅ Tests added for new features
- ✅ Breaking changes documented

### Merge Methods
- **Squash and Merge**: Preferred for feature branches, creates clean history
- **Merge Commit**: Use for release branches to preserve history
- **Rebase and Merge**: Use when commit history is clean and meaningful

### After Merging
- Delete the source branch
- Close related issues with keywords
- Update project boards
- Notify stakeholders if breaking changes
- Tag release if applicable

## Release Management

### Version Numbers
Follow Semantic Versioning (SemVer): `MAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes, backwards compatible

### Pre-release Tags
- `alpha` - Early development, unstable
- `beta` - Feature complete, testing phase
- `rc` - Release candidate, final testing

### Release Process
1. Create release branch: `release/v1.2.0`
2. Update version numbers
3. Update CHANGELOG.md
4. Run full test suite
5. Create release PR to main
6. Tag release after merge: `v1.2.0`
7. Create GitHub release with notes
8. Deploy to production

### Changelog Format
```markdown
## [1.2.0] - 2026-02-01

### Added
- User authentication with OAuth2
- Export functionality for reports

### Changed
- Improved performance of search queries
- Updated dependencies to latest versions

### Deprecated
- API v1 endpoints (removal in v2.0.0)

### Removed
- Legacy user import system

### Fixed
- Race condition in user creation
- Memory leak in background workers

### Security
- Updated crypto library to patch CVE-2026-1234
```

## Documentation Standards

### Code Comments
- Explain WHY, not WHAT (code should be self-explanatory)
- Document complex algorithms and business logic
- Add TODO/FIXME/HACK comments with ticket references
- Keep comments up to date with code changes

### README Requirements
- Project description and purpose
- Installation instructions
- Usage examples
- Configuration options
- Contributing guidelines
- License information

### API Documentation
- Document all public APIs
- Include request/response examples
- Document error codes and messages
- Keep in sync with implementation
- Version documentation with API

## Testing Standards

### Coverage Requirements
- Minimum 80% code coverage
- 100% coverage for critical paths
- All public APIs have tests
- All bug fixes include regression tests

### Test Types
- **Unit Tests**: Test individual functions/methods
- **Integration Tests**: Test component interactions
- **E2E Tests**: Test complete user workflows
- **Performance Tests**: Verify performance benchmarks

### Test Naming
```
test_<function>_<scenario>_<expected_result>
```

Example: `test_user_login_with_invalid_password_returns_error`

## Security Practices

### Never Commit
- API keys, tokens, passwords
- Private keys or certificates
- Database credentials
- Personal identifiable information (PII)
- Internal URLs or IP addresses

### Security Review Required For
- Authentication/authorization changes
- Data encryption/decryption
- External API integrations
- File upload/download functionality
- SQL query construction
- User input processing

### Dependency Management
- Review security advisories weekly
- Update dependencies monthly
- Pin production dependencies
- Use lock files (package-lock.json, requirements.txt)
- Scan for vulnerabilities in CI/CD
