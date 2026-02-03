# Copilot Instructions

## GitHub CLI Usage

Use GitHub CLI (gh) for all GitHub interactions (repos, issues, PRs, workflows, releases).

## Branch Naming

Format: `<type>/<ticket-id>-<short-description>` (lowercase, hyphens only)
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Critical production fixes
- `release/*` - Release preparation
- `docs/*` - Documentation only
- `test/*` - Test improvements
- `refactor/*` - Code restructuring
- `chore/*` - Maintenance tasks

## Commit Messages

Format: `<type>(<scope>): <subject>` (imperative, ≤50 chars, capitalized, no period)

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Body (optional): Wrap at 72 chars, explain WHY/WHAT

Footer: `BREAKING CHANGE:`, `Closes #123`, `Co-authored-by:`

Keep commits atomic, focused, and passing tests.

## Labels & Issues

**PR Status**: `draft`, `ready`, `in-review`, `changes-requested`, `approved`, `blocked`
**Types**: `feature`, `bugfix`, `hotfix`, `docs`, `refactor`, `test`, `performance`, `security`
**Priority**: `critical`, `high`, `medium`, `low`
**Size**: `xs` (<10), `s` (10-50), `m` (50-200), `l` (200-500), `xl` (>500 lines)
**Impact**: `breaking-change`, `needs-migration`, `dependencies`, `backwards-compatible`

**Issue Titles**: Specific, imperative (bugs) or present tense (features), ≤80 chars
**Issue Labels**: `bug`, `feature`, `enhancement`, `docs`, `question`, `help-wanted`, `good-first-issue`
**Issue Content**: Description, steps to reproduce, expected/actual behavior, environment, screenshots, acceptance criteria

## Code Review & Merge

**Review**: Within 24h, constructive, verify tests/security, cite specifics
**PR Size**: <400 lines, focused, clear description, self-reviewed
**Comments**: "Request Changes" (blocking), "Comment" (non-blocking), "Approve" (ready)

**Merge Checklist**: ✅ CI passing ✅ Approved ✅ Conversations resolved ✅ Up to date ✅ Tests added ✅ Docs updated
**Methods**: Squash (features), Merge Commit (releases), Rebase (clean history)
**Post-Merge**: Delete branch, close issues, update boards, notify stakeholders

## Releases & Documentation

**SemVer**: `MAJOR.MINOR.PATCH` (breaking.feature.fix)
**Pre-release**: `alpha` (unstable), `beta` (testing), `rc` (final)
**Process**: Branch → version bump → CHANGELOG → tests → PR → tag → deploy
**Changelog**: Sections: Added, Changed, Deprecated, Removed, Fixed, Security

**Comments**: Explain WHY, not WHAT; document complex logic; use TODO/FIXME with tickets
**README**: Description, install, usage, config, contributing, license
**API Docs**: All public APIs, examples, errors, versioned

## Testing & Security

**Coverage**: ≥80% overall, 100% critical paths, all public APIs, regression tests for bugs
**Test Types**: Unit (functions), Integration (components), E2E (workflows), Performance (benchmarks)
**Naming**: `test_<function>_<scenario>_<expected_result>`

**Never Commit**: Secrets, keys, tokens, credentials, PII, internal URLs
**Security Review**: Auth, encryption, APIs, file I/O, SQL, user input
**Dependencies**: Weekly advisories, monthly updates, pin versions, use lock files, CI/CD scanning

## TypeScript Standards

**Type Safety**: `strict: true`, never `any` (use `unknown`), `interface` for objects, `type` for unions, `readonly` for immutability
**Naming**: Interfaces/Types (PascalCase, no `I` prefix), functions (camelCase), constants (UPPER_SNAKE_CASE), private (`#prefix`)
**Organization**: One class/interface per file, group imports (external/internal/types), barrel exports cautiously, <300 lines/file
**Patterns**: Discriminated unions, mapped/conditional types, function overloads, template literals, `satisfies` operator, `as const`
**Async**: Always `await` or handle, `Promise.all()` for parallel, timeouts, explicit `Promise<T>` returns
**Docs**: JSDoc for public APIs, `@throws`, `@deprecated`, usage examples
**Anti-patterns**: ❌ `!`, ❌ `as Type`, ❌ `@ts-ignore` without reason, ❌ `Function` type, ❌ `?.` as suppression

## Node.js Standards

**Structure**: `src/` → config, controllers, services, models, middleware, routes, utils, types, index.ts
**Environment**: `dotenv`, never commit `.env`, validate at startup, typed config objects, access via config module
**Errors**: Centralized middleware, error hierarchy, structured logging (Winston/Pino), never expose internals, graceful shutdown
**Async**: async/await, `Promise.allSettled()`, timeouts, AbortController, global rejection handling, exponential backoff
**Performance**: Streams for large files, compression, HTTP/2, connection pooling, caching (Redis), worker threads for CPU tasks
**Security**: Helmet.js, rate limiting, input validation/sanitization, parameterized queries, strict CORS, CSRF protection, `npm audit`
**Logging**: Correlation IDs, appropriate levels, never log secrets, log rotation, JSON format (prod)
**Testing**: Jest/Vitest, mock dependencies, supertest for APIs, test factories, separate test DB, `NODE_ENV=test`
**Anti-patterns**: ❌ Sync I/O in handlers, ❌ blocking event loop, ❌ callbacks, ❌ mutating req/res, ❌ `process.exit()` without cleanup

## MCP SDK Standards

**Architecture**: Tool versioning, typed schemas (Zod), logical modules, per-tool error handling, verb-noun names, clear docs
**Tools**: Single-purpose, explicit contracts, JSON Schema validation, meaningful errors, structured results, execution metadata
**Resources**: Lifecycle management, URI RFC standards, subscription support, pagination, caching, metadata (MIME, size, timestamps)
**Prompts**: Clear schemas, typed variables, defaults, version templates, validate arguments
**Transport**: stdio (CLI), SSE (web), lifecycle handling, heartbeat/keepalive, graceful shutdown
**Security**: Validate requests, rate limiting, sanitize outputs, hide system paths, auth when needed, audit invocations
**Testing**: Unit test tools, mock dependencies, test errors, validate schemas, integration with client, monitor timing
**Anti-patterns**: ❌ Side effects without indication, ❌ raw errors to clients, ❌ stateful without session, ❌ no timeouts, ❌ missing validation

## Godot 4.6 Standards

**Structure**: scenes/, scripts/, resources/, assets/ (textures/models/audio/fonts), addons/, autoload/
**Scenes**: Max 4-5 levels deep, use inheritance, separate UI/gameplay, PascalCase names, use groups, split complex scenes
**Nodes**: PascalCase, descriptive (`JumpSoundPlayer` not `AudioStreamPlayer`), match script class names, suffixes (Manager/Controller/System)
**Signals**: Prefer over calls, past tense (`health_changed`), connect in `_ready()`, document params, `subject_action_verb` format
**Resources**: Preload always-needed, load() for optional, custom Resource classes, ResourceUID for cross-scene, cache, free unused
**Performance**: Object pooling, collision layers/masks, VisibleOnScreenNotifier, MultiMesh, optimize shaders, profile, low-precision types
**Physics**: Layers/masks, Area2D/3D for triggers, `_physics_process()` for fixed timestep, avoid moving kinematic in `_process()`
**Input**: Input Maps not hardcoded keys, `event.is_action_pressed()` in `_input()`, `Input.is_action_pressed()` in `_process()`, buffer inputs
**Exports**: `@export` for tweakable values, defaults, `@export_range()`, `@export_enum()`, `@export_group()`, `@export_file()`
**Anti-patterns**: ❌ `get_node()` every frame, ❌ creating nodes in loops, ❌ deep hierarchies, ❌ `yield` (use `await`), ❌ hardcoded values

## GDScript Standards

**Naming**: Classes (PascalCase), functions (snake_case), variables (snake_case), constants (UPPER_SNAKE_CASE), signals (snake_case, past tense), private (_prefix)

**Structure Order**: class_name, extends, docs, signals, enums, constants, @export vars, public vars, private vars, @onready vars, lifecycle (_init/_ready/_process/_physics_process), public methods, private methods

**Types**: Always static type (`var name: Type = value` or `:=`), annotate functions, typed arrays (`Array[Item]`), avoid `Variant`
**Functions**: <30 lines, verb-based, return early, defaults, ≤4-5 params, document complex logic
**Control**: Guard clauses, `match` over if-elif, avoid else after return, ternary for simple, max 3 nesting levels
**Errors**: Validate inputs, `assert()` for invariants, return null/errors for expected failures, `push_error()` for unexpected
**Performance**: `@onready` for refs, cache results, avoid string concat in loops, object pooling, built-ins over custom, `is` not `typeof()`
**Modern 4.6**: `await` not `yield`, lambdas (`array.map(func(x): return x * 2)`), null coalescing (`??`), annotations, static functions
**Anti-patterns**: ❌ `setget` (use properties), ❌ `yield`, ❌ untyped vars, ❌ long functions, ❌ global state without encapsulation

## GDExtension Standards

**Structure**: src/ (register_types, classes/), include/, gdextension/ (SConstruct), demo/
**Classes**: Inherit Godot base, register in register_types.cpp, `GDCLASS()` macro, `_bind_methods()`, `ClassDB::bind_method()`, `ClassDB::add_property()`
**Naming**: Classes (PascalCase, project-prefixed), methods (snake_case), private (_prefix), constants (UPPER_SNAKE_CASE), enums (PascalCase)
**Memory**: Reference counting, inherit `RefCounted`, proper constructors/destructors, `memnew()`/`memdelete()`, no raw pointers, RAII
**Performance**: Minimize virtual calls, inline hot paths, stack > heap, cache refs, `TypedArray<T>`, custom pools, profile, optimize loops
**Threading**: Main thread default, mutexes for shared state, atomics, document safety, `call_deferred()` from workers
**Errors**: `ERR_FAIL_COND()`, `ERR_PRINT()`, validate params, return defaults on error, `CRASH_COND()` sparingly
**Variant**: Validate types, prefer typed methods, `Variant::get_type()`, handle null
**Build**: SCons cross-platform, debug/release configs, optimize release, debug symbols (dev), document requirements
**Testing**: Unit tests, GDScript integration tests, validate memory (no leaks), test errors, profile, test all platforms
**Anti-patterns**: ❌ STL for Godot objects, ❌ raw pointers, ❌ APIs from non-main threads, ❌ ignore refcounting, ❌ `static_cast` not `cast_to<>()`

## Tailwind CSS Standards

**Config**: Customize `tailwind.config.js` (colors, spacing, breakpoints), `content` array, JIT mode, purge options, plugins for custom utilities
**Class Order**: layout → spacing → sizing → typography → colors → effects (use `prettier-plugin-tailwindcss`)
**Naming**: Semantic component names, prefix custom utilities, kebab-case for custom CSS, `@layer components/utilities`
**Responsive**: Mobile-first (base then `sm:`/`md:`/etc), consistent breakpoints, test all sizes, container queries
**Components**: Extract repeated patterns, `@apply` sparingly, prefer composition, dedicated CSS file, document variants
**States**: hover:/focus:/active:, focus-visible, group-*, peer-*, disabled:
**Dark Mode**: Configure strategy (class/media), `dark:` variant, define colors in theme, test both modes, CSS variables for complex
**Performance**: Purge unused (prod), minimize custom CSS, safelist dynamic classes, lazy load non-critical, analyze bundle, CSS layers
**Accessibility**: WCAG AA contrast, semantic HTML, focus indicators (ring/outline), don't rely on color alone, sr-only, test screen readers
**Typography**: Define scale in config, consistent sizes, appropriate line heights, meaningful weights, responsive type, sufficient contrast
**Layout**: Consistent spacing scale, `gap` over margin for flex/grid, negative margins sparingly, max-w-* for readability
**Anti-patterns**: ❌ Overusing `@apply`, ❌ utility classes in custom CSS, ❌ hardcoded values, ❌ ignoring responsive, ❌ not testing dark mode

## Alpine.js Standards

**Structure**: `<div x-data="componentName()" x-init="init()">`
**State**: `x-data` functions, minimal focused state, `$store` for global, computed as methods, avoid deep nesting, `Alpine.reactive()` for complex
**Naming**: Properties (camelCase: `isOpen`), methods (camelCase, verb-based: `toggleMenu`), handlers (handle/on prefix), stores (camelCase)
**Directives**: `x-data` (init), `x-show` (CSS toggle), `x-if` (DOM add/remove), `x-for` (lists with `:key`), `x-model` (two-way), `x-bind` (`:` attrs), `x-on` (`@` events)
**Component Organization**: State, lifecycle (init), computed (getters), methods, async methods
**Store Pattern**: Register in `alpine:init`, methods for mutations
**Magic Properties**: `$el` (element), `$refs` (refs), `$store` (global), `$watch` (reactivity), `$dispatch` (events), `$nextTick` (after DOM), `$root` (root)
**Plugins**: Register in `alpine:init`, reusable directives, extend magics, document thoroughly
**Performance**: `x-show` (frequent toggle), `x-if` (conditional render), virtual scroll (long lists), debounce expensive ops, `x-cloak` (FOUC), `x-ignore` (static)
**Forms**: `x-model` with modifiers, validation, feedback, loading states, `x-model.debounce` (search), error patterns
**Accessibility**: Keyboard nav, ARIA with `x-bind`, focus management, semantic HTML, screen reader feedback, focus trapping (modals)
**Testing**: Init, state changes, handlers, store interactions, progressive enhancement (no JS), E2E for critical flows
**Tailwind Integration**: `x-bind:class` for dynamic, `x-transition`, combine utilities, `x-show` with display, JIT for dynamic values
**Anti-patterns**: ❌ Complex logic (extract services), ❌ direct DOM manipulation, ❌ ignoring a11y, ❌ no `x-cloak`, ❌ mixing jQuery, ❌ business logic in templates
