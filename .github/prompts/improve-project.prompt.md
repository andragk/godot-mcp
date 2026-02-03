---
agent: improve-project-orchestrator
description: Analyze existing project and generate comprehensive improvement plan with bilingual VitePress documentation
---

# Improve Project

## Intent
Analyze an existing project, identify improvement opportunities, and generate a comprehensive, production-ready bilingual VitePress documentation set that includes current state analysis, planned enhancements, and detailed implementation guides.

## Input Format
Provide the following information:

### Required
- **Project Path**: Absolute path to the project root directory

### Optional
- **Improvement Goals**: Specific areas to focus on (e.g., performance, security, maintainability)
- **Constraints**: Budget, time, technology, compliance requirements
- **Non-Functional Requirements**: Performance targets, scalability needs, security standards
- **Known Pain Points**: Explicit issues or areas needing attention
- **Priority Focus**: Ranked priorities for improvements

## Expected Outcomes
- **Project Analysis Report**: Comprehensive understanding of current implementation
- **Improvement Plan**: Concrete, justified enhancements grounded in existing system
- **Bilingual VitePress Documentation** (`docs/en/`, `docs/de/`) containing:
  - User documentation (overview, getting started, concepts, examples, FAQs, best practices)
  - Technical documentation (architecture current/improved, system design, data flows, components)
  - Complete API documentation (endpoints, schemas, auth, errors, versioning)
  - Hyper-detailed implementation guide (setup, tooling, config, testing, deployment, maintenance)
- **Progress Tracking**: Resumable execution with checkpoint system

## Context
This workflow leverages **@improve-project-orchestrator** to coordinate specialized agents for:
1. Deep project analysis (reverse-engineering architecture from implementation)
2. Improvement opportunity identification (performance, security, architecture, code quality)
3. Enhancement prioritization and planning
4. World-class bilingual VitePress documentation generation

All improvements must be:
- Grounded in actual project implementation
- Justified by analysis findings
- Prioritized by business value and feasibility
- Preserving original system intent

## Quality Standards
Documentation must be:
- Enterprise-grade and production-ready
- Suitable for senior engineers, architects, and decision makers
- Extremely detailed with no placeholders
- Clear separation between current state and planned improvements
- Bilingual with full EN/DE parity

## Constraints
- Must work with existing project structure
- Cannot assume specific domain without evidence
- Must justify all improvement recommendations
- Documentation must reflect actual implementation
