---
agent: copilot-validation-pipeline
description: Validate Copilot configuration files or complete pipelines against best practices
---

# Copilot Configuration Validator

## Intent

Validate one or more Copilot configuration files (`.agent.md`, `.prompt.md`, `.instructions.md`) to ensure compliance with best practices, proper structure, and role separation.

## Input

Path to a Copilot configuration file or directory. Pipelines are automatically detected when:
- Prompt files reference agents in frontmatter
- Directory contains multiple related Copilot files
- Files reference other configuration files

## Validation Scope

Files will be checked against rules defined in [copilot-files.instructions.md]:
- Frontmatter metadata completeness and correctness
- Role-appropriate content (agent vs prompt vs instructions separation)
- Structural compliance and clarity
- Redundancy and overlap detection
- Token efficiency and conciseness

## Expected Output

A validation report containing:
1. **Compliance Status**: Pass/fail with severity levels
2. **Issues Found**: Specific problems categorized by type
3. **Recommendations**: Actionable improvements prioritized by impact
4. **Optimized Version**: Corrected file(s) if issues detected

## Constraints

- Apply validation recursively for pipeline inputs
- Report uncertainty rather than making assumptions
- Preserve original intent while optimizing structure
- Flag critical issues separately from enhancements
