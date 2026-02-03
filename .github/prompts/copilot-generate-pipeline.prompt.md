---
agent: copilot-pipeline-generator
description: Generate complete GitHub Copilot pipelines from workflow descriptions
---

# Generate Copilot Pipeline

## Intent
Transform a workflow description into a complete, production-ready GitHub Copilot pipeline that starts with a prompt file referencing a workflow orchestrator agent. The orchestrator coordinates specialized agents to execute the workflow.

## Pipeline Structure
Every pipeline consists of:
1. **Prompt File** (`.prompt.md`) - Defines user intent and context, references the workflow orchestrator agent
2. **Workflow Orchestrator Agent** (`.agent.md`) - Coordinates workflow execution by delegating to specialized agents
3. **Supporting Instruction Files** (`.instructions.md`) - Optional domain-specific rules if needed

## Workflow Orchestrator Design
The workflow orchestrator agent must:
- Delegate tasks to existing specialized agents from `.github/agents/` directory
- Can also delegate to other existing workflow orchestrators for complex sub-workflows from `.github/agents/`
- Coordinate workflow phases and agent handoffs
- Make autonomous decisions about sequencing and parallel execution
- Handle error conditions and escalations
- Never perform specialized work directly - always delegate

## Input Format
Provide workflow description in any of these formats:
- Natural language description of the desired workflow
- Structured task breakdown with stages and dependencies
- Reference to similar workflows or patterns
- Existing workflow diagrams or documentation

## Expected Outcomes
- Prompt file that references the workflow orchestrator agent
- Workflow orchestrator agent that delegates to existing specialized agents or other workflow orchestrators
- Clear separation: prompt (user intent) → orchestrator (workflow coordination) → specialized agents/orchestrators (task execution)
- Proper agent references using `@agent-name` syntax throughout
- Complete frontmatter metadata for all files

## Constraints
- Pipeline MUST start with a prompt file
- Prompt file MUST reference a workflow orchestrator agent
- Workflow orchestrator MUST delegate to existing agents or orchestrators in `.github/agents/` directory
- Orchestrators can compose other orchestrators for complex multi-workflow scenarios
- All files must follow GitHub Copilot configuration standards
- Maintain strict separation between prompts (intent), agents (workflow), and instructions (rules)
- Use consistent naming conventions: `workflow-name-orchestrator.agent.md`, `workflow-name.prompt.md`
- All agent references must use `@agent-name` syntax

## Context
Apply best practices from `.github/instructions/copilot-files.instructions.md` for proper file structure and role separation. Review existing orchestrator agents for delegation patterns and workflow coordination examples.

