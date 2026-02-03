---
applyTo: "**/*.{agent,prompt,instructions}.md"
description: Best practices for creating GitHub Copilot configuration files
---

# Copilot Configuration Files Best Practices

## File Types & Purpose

### Agent Files (`.agent.md`)
Define autonomous capabilities, workflow execution, and operational parameters.

### Prompt Files (`.prompt.md`)
Describe user intent, context, constraints, and desired outcomes for specific tasks.

### Instruction Files (`.instructions.md`)
Establish global rules, coding standards, and constraints applicable across the codebase.

## Frontmatter Metadata

### Required Format
- Use YAML frontmatter enclosed in `---` delimiters
- Place at the very beginning of the file
- Include relevant metadata for file type
- **ALWAYS follow the exact frontmatter structure shown in the examples below**

### Agent File Frontmatter
```yaml
---
name: implementation-pipeline
description: Implements features, writes tests, and iterates on reviews
tools: ['read', 'search', 'edit', 'agent', 'execute', 'todo', 'web']
```

### Instruction File Frontmatter
```yaml
---
applyTo: "src/components/**/*.{ts,tsx}"
---
```

### Prompt File Frontmatter
```yaml
---
agent: commit-helper (optional, only if needed)
description: Analyze and commit changes with conventional commit messages
---
```

## Content Guidelines

### Agent Files
- **Define Role**: Clear statement of agent's primary responsibility
- **List Capabilities**: Specific tasks the agent can perform
- **Specify Workflow**: Step-by-step execution approach
- **Declare Tools**: Required tools and resources
- **Set Boundaries**: Explicit limitations and constraints
- **Provide Examples**: Demonstrate common interaction patterns

### Prompt Files
- **State Intent**: What user wants to accomplish
- **Provide Context**: Relevant background information
- **Define Constraints**: Requirements and limitations
- **Specify Format**: Expected input/output structure
- **Reference Agent**: Optional agent to handle execution
- **Keep Concise**: Focus only on task-specific information

### Instruction Files
- **Global Rules Only**: Apply across entire scope, not task-specific
- **Objective Criteria**: Rules must be verifiable and enforceable
- **Clear Examples**: Show correct and incorrect patterns
- **Categorize**: Group related rules logically
- **Prioritize**: Order by importance and frequency
- **Avoid Redundancy**: No overlap with agent or prompt files

## Separation of Concerns

### Agent vs Prompt vs Instructions
- **Agents**: Define HOW work is executed (capabilities, workflow, autonomy)
- **Prompts**: Define WHAT user wants (intent, context, outcomes)
- **Instructions**: Define RULES for code quality (standards, patterns, constraints)

### Anti-Patterns to Avoid
- ❌ Task-specific logic in instruction files
- ❌ Workflow steps in prompt files
- ❌ Global rules in agent files
- ❌ Capability definitions in prompt files
- ❌ User intent in instruction files
- ❌ Duplicated content across file types

## File Structure

### Recommended Organization
```
.github/
├── agents/           # Agent definition files
├── prompts/          # Task-specific prompts
└── instructions/     # Global coding standards
```

### Naming Conventions
- Use kebab-case: `feature-implementation.agent.md`
- Be descriptive: `react-component.instructions.md`
- Indicate type: `.agent.md`, `.prompt.md`, `.instructions.md`
- Avoid generic names: Use `commit-helper.agent.md` not `helper.agent.md`

## Metadata Best Practices

### Scope Definition
- `applyTo`: Use glob patterns for file matching
- Be specific: `src/api/**/*.ts` not `**/*.ts`
- Test patterns to ensure correct matching

### Tool Specification
- List only essential tools for agents
- Use standard tool names: `read`, `edit`, `search`, `agent`, `execute`, `web`, `todo`
- Order by frequency of use

### Agent Invocation
- Invoke agents using `@agent-name` syntax in conversations
- Reference agent by its `name` field from frontmatter
- Example: `@workflow-architect` to invoke workflow-architect agent
- Agent files can delegate to other agents using this syntax

## Content Quality

### Clarity
- Use explicit, unambiguous language
- Avoid jargon unless project-specific
- Define technical terms when necessary
- Use examples to illustrate complex concepts

### Conciseness
- Eliminate redundant information
- Use bullet points for lists
- Keep sentences short and direct
- Remove unnecessary qualifiers

### Maintainability
- Structure for easy updates
- Use consistent formatting
- Document rationale for non-obvious rules
- Review and update regularly

## Maximum Length

- **Agents**: 150 lines maximum
- **Prompts**: 100 lines maximum
- **Instructions**: 200 lines maximum for comprehensive standards
- Prioritize essential content within limits
- Split large instruction files by domain if needed

## Validation Checklist

### Before Committing
- ✅ Frontmatter is valid YAML
- ✅ Content matches file type purpose
- ✅ No overlap with other configuration files
- ✅ Rules are global and enforceable (instructions only)
- ✅ Examples are accurate and helpful
- ✅ Metadata fields are complete and correct
- ✅ File length within specified limits
- ✅ Language is clear and unambiguous
