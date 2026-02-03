---
agent: implementation-pipeline-orchestrator
description: Execute end-to-end implementation from input to integrated, tested, documented code
---

# Implementation Pipeline

## Intent

Execute a complete implementation workflow from primary input (implementation guide, single task, or GitHub issue) through to a fully integrated, tested, and documented solution in an integration branch.

## Input

### Primary Input (Required)
One of the following:
- **Implementation Guide**: Structured document with implementation steps, requirements, and specifications
- **Single Task**: Concise task description with clear acceptance criteria
- **GitHub Issue**: Issue URL or number with problem description and requirements

### Additional Inputs (Optional)
- **Goals & Priorities**: Desired outcomes, success metrics, prioritization guidance
- **Constraints**: Time, budget, technology stack, compliance requirements
- **Non-Functional Requirements**: Performance, security, scalability, accessibility
- **Assumptions & Risks**: Known issues, dependencies, mitigation strategies

## Pipeline Capabilities

The pipeline orchestrates the complete lifecycle:

1. **Input Analysis**: Parse, validate, determine type, assess complexity/risk/security
2. **GitHub Issue Management**: Search, create, update, label, define dependencies
3. **Implementation Planning**: Technical approach, test strategy, documentation impact
4. **Execution**: Per-issue implementation cycle (code → tests → review → security → fixes)
5. **Integration**: Create integration branch, merge in dependency order, run integration tests
6. **Documentation**: VitePress documentation update with full build validation
7. **Quality Assurance**: Manual testing checklist, final validation
8. **Finalization**: Code quality, test, documentation, security validation

## Expected Outcomes

- **Integration Branch**: Fully integrated code ready for production
- **GitHub Issues**: Created/updated with proper labels, dependencies, status
- **Test Coverage**: Comprehensive unit, integration, and manual test validation
- **Documentation**: Complete VitePress documentation with successful build
- **Quality Report**: Final validation report with all checks passing
- **Progress Tracking**: Complete `.github/progress/implementation-pipeline_progress.json`

## Constraints

- Pipeline must be resumable at any stage checkpoint
- All changes must pass security review for security-impacting code
- Documentation must build successfully with zero errors
- Integration tests must pass before finalization
- Manual testing checklist must be generated for user validation
- GitHub issues must follow standardized labeling and dependency structure

## Progress Tracking

Progress is tracked in `.github/progress/implementation-pipeline_progress.json` with:
- Stage completion status
- Current checkpoint
- Failed attempts and resolutions
- Agent execution history
- Resume instructions

## Execution Model

This prompt invokes **@implementation-pipeline-orchestrator** which:
- Delegates to specialized agents and orchestrators
- Maintains workflow coherence across stages
- Handles error recovery and resumability
- Escalates blocking issues to user
- Provides progress updates at each stage
