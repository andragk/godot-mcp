Your task IS to GENERATE a reusable, production-grade
implementation-pipeline

══════════════════════════════════════════════════════════════
PIPELINE PURPOSE
══════════════════════════════════════════════════════════════

The generated pipeline must:

- Take a PRIMARY INPUT as its single source of truth
- Optionally accept additional user-provided inputs, such as:
  - Goals, priorities, or desired outcomes
  - Constraints (time, budget, technology, compliance)
  - Non-functional requirements
  - Explicit assumptions, risks, or known issues
- Parse and validate the primary input
- Determine the input type:
  - Implementation guide
  - Single task
  - GitHub issue
- Determine scope, target repository, and success criteria
- Process and evaluate all inputs according to the pipeline’s intent
- Correlate findings across all provided inputs
- Derive structured, traceable results aligned with the pipeline’s purpose
- Produce well-structured, versionable, high-quality output artifacts
- Be resumable, agent-driven, and orchestrator-based

You are designing the PIPELINE ITSELF, not executing it.

══════════════════════════════════════════════════════════════
PIPELINE CAPABILITIES
══════════════════════════════════════════════════════════════

The pipeline must orchestrate the complete lifecycle from user input
to a fully integrated, tested, and documented integration branch by
coordinating specialized agents and orchestrators.

The generated pipeline MUST be capable of performing the following
end-to-end workflow:

INPUT & ANALYSIS
- Parse and validate input
- Determine type (task / guide / issue)
- Identify scope, target repository, and success criteria
- Perform preliminary analysis:
  - Assess complexity
  - Assess risk
  - Assess security impact
  - Decide single issue vs. split into multiple issues

GITHUB ISSUE MANAGEMENT
- Search for existing GitHub issues and related work:
  - Use title matching and standardized labels
  - Detect duplicates or superseded work
  - Link, comment on, update, or supersede issues as appropriate
- Create or update GitHub issues:
  - Clear problem description
  - Explicit acceptance criteria
  - Test requirements
  - Documentation requirements
- Define dependencies and ordering:
  - Explicit blocking / blocked-by relationships
  - Deterministic execution order
- Apply standardized labels:
  - Component
  - Type
  - Priority
  - Size
  - Phase
  - Docs-required
  - Security-review

IMPLEMENTATION PLANNING & EXECUTION
- Plan implementation:
  - Technical approach
  - Test strategy
  - Documentation impact
  - MCP server usage if required
- Delegate and orchestrate the per-issue implementation cycle:
  - Write code
  - Write tests
  - Review changes
  - Perform security review
  - Fix issues until all checks are green
  - Repeat deterministically per issue

INTEGRATION & TESTING
- Create an integration branch
- Merge feature branches in dependency order
- Run integration tests
- Debug and resolve integration issues

QUALITY ASSURANCE & DOCUMENTATION
- Create a comprehensive manual testing checklist:
  - Step-by-step validation
  - Clear explanations
  - Acceptance criteria
- Fully integrate documentation using VitePress:
  - Update the existing docs/ directory holistically
  - Review and adjust:
    - Structure
    - Navigation
    - Sidebar
    - Frontmatter
    - Internal links
    - Index files
    - Configuration
  - Verify consistency across the entire documentation set
  - Run a full documentation build
  - Ensure the build completes successfully without errors

FINALIZATION
- Perform final validation:
  - Code quality
  - Automated tests
  - Documentation
  - Security requirements


══════════════════════════════════════════════════════════════
QUALITY BAR
══════════════════════════════════════════════════════════════

- Production-ready
- Enterprise-grade
- Extremely detailed
- Clear, structured, and consistent
- Best-practice compliant


══════════════════════════════════════════════════════════════
AGENTS & ORCHESTRATORS
══════════════════════════════════════════════════════════════

The pipeline MUST be designed to use THE ALREADY EXISTING agents
and orchestrators located in:

.github/agents

- Orchestrators and agents MAY be arbitrarily nested
- The pipeline must be agent-first and orchestrator-driven
- Each agent must have a clearly defined responsibility, inputs, outputs,
  idempotency guarantees, and failure behavior

══════════════════════════════════════════════════════════════
PROGRESS TRACKING & RESUMABILITY
══════════════════════════════════════════════════════════════

The pipeline MUST define a progress tracking mechanism using:

.github/progress/implementation-pipeline_progress.json

The pipeline definition MUST specify:
- File schema (JSON)
- Update rules
- Stage checkpoints
- Resume logic after interruption
- Idempotency guarantees
- Safe recovery from partial execution

══════════════════════════════════════════════════════════════
DELIVERABLES OF THIS TASK
══════════════════════════════════════════════════════════════

You MUST OUTPUT:

1. A complete conceptual definition of the implementation-pipeline
2. A recommended directory and file structure
3. A stage-by-stage execution plan
4. Agent and orchestrator role specifications
5. Progress file schema (JSON)
6. Clear instructions on how the pipeline is executed by an AI orchestrator

Do NOT:
- Alter the primary input without explicit justification
- Introduce unrelated outputs
- Generate fictional data or artifacts
- Assume a specific domain unless explicitly provided

══════════════════════════════════════════════════════════════
QUALITY BAR
══════════════════════════════════════════════════════════════

The pipeline must be:
- Enterprise-grade
- Scalable
- Deterministic where possible
- Agent-first
- Resume-safe
- Purpose-driven
- Suitable for long-running AI executions