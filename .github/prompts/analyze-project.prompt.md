---
agent: analyze-project-orchestrator
description: Analyze existing project and generate world-class bilingual VitePress documentation
---

# Analyze Project

## Intent
Analyze an existing project in its current state and generate comprehensive, production-ready bilingual VitePress documentation (EN + DE) by reverse-engineering architecture, reconstructing design decisions, and documenting actual implementation details.

## Context
This prompt initiates the analyze-project pipeline which:
- Takes an existing project as its only input
- Analyzes code, structure, and configuration in current state
- Reconstructs architecture and design decisions from implementation
- Generates enterprise-grade VitePress documentation suitable for senior engineers, architects, and end users
- Operates autonomously with resumability and progress tracking

## Input Format
Provide the project to analyze:
- **Project Path**: Absolute or workspace-relative path to the project directory
- **Optional Context**: Known constraints, tech stack, or domain information
- **Optional Scope**: Specific areas to focus on (defaults to complete analysis)

## Expected Outcomes
- Complete bilingual VitePress documentation set in `/docs` with `/en` and `/de` subdirectories
- **User Documentation**: Overview, getting started, concepts, examples, FAQs, best practices
- **Technical Documentation**: Architecture overview, system design, data flows, component responsibilities, diagrams
- **API Documentation**: All endpoints/interfaces, schemas, authentication, error handling, versioning
- **Implementation Guide**: Detailed implementation analysis, environment setup, tooling, configuration, edge cases, testing, deployment, maintenance

## Quality Standards
- Production-ready, enterprise-grade quality
- Suitable for senior engineers, architects, and technical decision makers
- Extremely detailed with no placeholders or shallow explanations
- Based on actual implementation, not assumptions
- Complete parity between English and German versions
- Clear, structured, and best-practice compliant

## Constraints
- Analyze only what exists in the project - do not add features
- Document actual implementation, not idealized design
- Do not refactor or redesign the project
- Generate no fictional or assumed functionality
- Base all documentation on evidence from code and configuration

## Execution
The **@analyze-project-orchestrator** agent will:
1. Discover project structure and inventory all components
2. Analyze code, configuration, and patterns
3. Reconstruct architecture from implementation
4. Generate complete English documentation
5. Translate to German with technical accuracy
6. Validate completeness and quality
7. Track progress for resumability at `.github/progress/analyze_project_progress.json`

## Success Criteria
- All documentation sections complete with no gaps
- Technical accuracy verified against actual implementation
- Bilingual consistency maintained
- VitePress builds successfully for both languages
- Documentation meets enterprise-grade quality bar
- Progress tracking enables resumption from any stage
