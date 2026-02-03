---
applyTo: "docs/**/*.md"
description: Documentation quality standards for improve-project pipeline VitePress output
---

# Improve Project Documentation Standards

## Scope
These instructions apply to all VitePress documentation generated in `docs/en/` and `docs/de/` directories.

## Quality Standards

### Completeness
- NO placeholders or "TODO" markers in generated documentation
- NO shallow explanations or hand-waving ("this will be implemented later")
- ALL sections must be fully populated with concrete information
- Every API endpoint must include complete request/response schemas
- Every feature must include at least one complete usage example
- Implementation guides must cover edge cases, not just happy paths

### Current vs Improved State
- Clearly separate documentation of current behavior from planned improvements
- Use consistent markers for planned improvements:
  - "**Planned Enhancement:**" for proposed changes
  - "**Current Behavior:**" when contrasting with improvements
  - "**After Improvement:**" when describing future state
- Ensure readers can understand the project both as-is and as-planned

### Technical Depth
- Architecture diagrams must be described in detail (C4 model preferred)
- Data flows must include data formats and transformations
- Component responsibilities must be explicit and specific
- Security architecture must document authentication, authorization, and data protection
- Error handling must document all error codes and recovery procedures

### Audience Appropriateness
- **User Documentation**: Assume technical competence but not system knowledge
- **Technical Documentation**: Assume senior engineer or architect audience
- **API Documentation**: Follow OpenAPI 3.0 specification patterns
- **Implementation Guide**: Assume experienced developer needing project-specific context

### Bilingual Consistency
- German documentation must be complete translation, not summary
- Technical terms must be consistently translated or kept in English with German explanation
- Code examples must be identical across languages (only comments translated)
- Structure and navigation must mirror across EN and DE

## Content Organization

### User Documentation (`docs/{lang}/user/`)
```
overview.md          # Purpose, value proposition, target users
getting-started.md   # Prerequisites, installation, first steps
concepts/            # Core concepts with diagrams and examples
examples/            # Real-world usage scenarios
faq.md              # Common questions with detailed answers
best-practices.md   # Recommended patterns and anti-patterns
```

### Technical Documentation (`docs/{lang}/technical/`)
```
architecture/
  overview.md              # High-level architecture (C4 context, container)
  system-design.md         # Detailed component design (C4 component)
  data-architecture.md     # Data models, flows, storage
  security.md              # Security architecture and controls
components/                # Per-component documentation
  {component-name}.md      # Responsibilities, interfaces, dependencies
diagrams.md                # Textual diagram descriptions
```

### API Documentation (`docs/{lang}/api/`)
```
overview.md           # API design philosophy, conventions
authentication.md     # Auth methods, token handling, security
endpoints/            # Per-endpoint documentation
  {endpoint-name}.md  # Method, path, params, request/response, errors
errors.md            # Error codes, messages, recovery strategies
versioning.md        # Versioning strategy, deprecation policy
rate-limiting.md     # Throttling, quotas, retry strategies
webhooks.md          # Event notifications (if applicable)
```

### Implementation Guide (`docs/{lang}/implementation/`)
```
overview.md                # Implementation strategy
environment-setup.md       # Dev environment configuration
tooling.md                # Required tools, IDEs, utilities
configuration.md          # Configuration management
guide/
  phase-1-foundation.md   # Foundation implementation steps
  phase-2-core.md         # Core features implementation
  phase-3-integration.md  # Integration implementation
  phase-4-advanced.md     # Advanced features
edge-cases.md             # Handling special scenarios
testing.md                # Testing strategy, coverage, automation
deployment.md             # Deployment strategies, CI/CD
monitoring.md             # Observability, logging, alerting
maintenance.md            # Ongoing maintenance and support
future-extensions.md      # Planned enhancements, roadmap
```

## VitePress Specific

### Frontmatter
- Include appropriate frontmatter in all documentation files
- Use `title`, `description`, `editLink`, `outline` fields
- Example:
```yaml
---
title: Getting Started
description: Quick start guide for setting up and running the project
outline: deep
---
```

### Navigation
- Use proper heading hierarchy (# → ## → ### → ####)
- Keep heading depth appropriate for VitePress sidebar (max 3 levels recommended)
- Use descriptive headings that work standalone in navigation

### Code Blocks
- Always specify language for syntax highlighting
- Include comments for complex or non-obvious code
- Use descriptive filenames in code block info strings
- Example: ` ```typescript:src/api/users.ts `

### Links
- Use relative links for internal documentation references
- Use absolute links for external resources
- Ensure all links are valid before finalizing documentation
- Include link text that describes the destination

### Custom Containers
Use VitePress custom containers appropriately:
- `::: tip` for best practices and helpful hints
- `::: warning` for important caveats or gotchas
- `::: danger` for critical security or data loss warnings
- `::: info` for additional context or background
- `::: details` for collapsible content

## Anti-Patterns

### DO NOT
- Copy-paste placeholder text like "This section describes..."
- Use vague language like "various options" or "multiple approaches"
- Reference non-existent files or code without noting they are planned
- Mix improvement proposals with current state without clear distinction
- Assume reader knowledge that isn't documented earlier
- Use "TODO", "TBD", "Coming soon", or similar markers in final output
- Create empty sections or stub pages
- Document features that don't exist without marking as planned

### DO
- Provide concrete, specific information in every section
- Include actual code examples from the project or realistic examples
- Document actual file paths, function names, and data structures
- Use tables for comparing options or listing parameters
- Include diagrams as detailed text descriptions
- Cross-reference related documentation sections
- Provide complete examples that readers can execute or adapt
- Distinguish clearly between current implementation and planned improvements

## Validation Checklist

Before marking documentation complete, verify:
- [ ] No placeholder text or TODOs remain
- [ ] All code examples are complete and commented
- [ ] All API endpoints have complete schemas
- [ ] All sections are fully populated
- [ ] Current vs improved state is clearly distinguished
- [ ] Bilingual consistency is maintained
- [ ] All headings are descriptive and appropriate
- [ ] All links are valid
- [ ] VitePress builds without errors or warnings for both languages
- [ ] Navigation structure matches across EN and DE
