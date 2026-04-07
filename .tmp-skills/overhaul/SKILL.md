---
name: overhaul
description: Perform targeted frontend or backend overhauls that replace an existing code section with a materially different implementation while preserving the required outcome. Use when the user wants a rewrite, rebuild, redesign, or re-architecture for a bounded area of code, component tree, page, route, service, module, workflow, or API handler and expects the same goal to be achieved through a clearly new look or approach.
---

# Overhaul

Replace a defined code section with a fresh implementation, not a polish pass. Preserve required behavior, interfaces, and business goals unless the user explicitly approves breaking changes.

## Working Model

Treat every overhaul as two jobs:

1. Lock the contract.
2. Rebuild the internals and presentation so the result is recognizably new.

Do not do line-by-line cleanup, shallow renaming, or style-only edits. If the new version follows the same file structure, same control flow, same component breakdown, same queries, same markup skeleton, and same naming, it is not an overhaul.

## Step 1: Bound the Target

Write down the target before editing:

- exact files, routes, components, modules, or handlers in scope
- user-visible or system-visible goal
- interfaces that must remain stable
- dependencies and side effects
- constraints that cannot change: auth, data shape, persistence, accessibility, SEO, analytics, performance floors, and repo conventions

If scope is fuzzy, infer the smallest complete slice that can be rebuilt end-to-end and state the assumption.

## Step 2: Extract Non-Negotiables

Separate invariants from implementation details.

Keep:

- outcome
- required API contracts
- data correctness
- security expectations
- required tests or observable behavior
- integration points with surrounding code

Feel free to replace:

- architecture
- control flow
- component decomposition
- file layout
- naming
- state model
- styling strategy within repo norms
- rendering structure
- query strategy
- helper boundaries
- error handling shape

When a literal "zero similarity" goal conflicts with framework syntax, shared types, required interfaces, or domain language, maximize structural divergence and call out the unavoidable overlap.

## Step 3: Choose a New Direction

Pick a new implementation thesis before writing code.

Frontend direction examples:

- swap a card-grid layout for an editorial, split-screen, stacked, or single-canvas composition
- replace prop-drilled state with local state islands, reducer flow, or server-driven boundaries
- collapse many tiny presentational components into a few strong layout primitives, or do the opposite
- change the visual language, spacing system, typographic hierarchy, motion, and information architecture

Backend direction examples:

- replace nested service orchestration with a pipeline
- move validation and transformation boundaries
- replace shared mutable flow with pure data transforms
- split a large handler into command/query modules, or consolidate over-fragmented layers into a direct path
- redesign caching, batching, query composition, or error propagation

Make the new direction intentionally unlike the old one in at least five dimensions.

## Step 4: Rebuild, Do Not Refactor

Delete or replace old logic rather than preserving it by inertia. Avoid copy-editing existing code into a new shape.

During implementation:

- preserve behavior from the contract, not the old structure
- use fresh names when possible
- prefer new file boundaries over reusing old ones blindly
- rewrite markup, styles, data flow, and helper layering from first principles
- keep compatibility shims only when they protect required callers
- remove obsolete code paths instead of leaving mirrored legacy branches

## Frontend Overhauls

For UI work, change both the surface and the internals.

Minimum expectations:

- visibly new hierarchy and composition
- materially different component structure
- fresh styling decisions that fit the product or brief
- responsive behavior checked on desktop and mobile
- accessibility preserved or improved

Do not settle for recoloring an existing layout. If a screenshot of the new page could be mistaken for the old page, push further.

## Backend Overhauls

For backend work, change the execution model, not just helper names.

Minimum expectations:

- materially different request or job flow
- clearer ownership of validation, transformation, and side effects
- reduced incidental complexity or tighter separation of concerns
- preserved external contracts unless approved otherwise
- tests or verification that prove the same business goal is still met

Do not preserve old layering just because it already exists. If the same bugs or complexity traps remain, keep redesigning.

## Resemblance Audit

Before finishing, compare the old and new versions across these dimensions:

- file or module boundaries
- naming
- control flow
- data flow
- markup or response construction
- styling or query strategy
- state management
- error handling
- helper extraction

If the new version matches the old in most dimensions, it is still a refactor. Rework it until the implementation feels newly authored.

## Validation

Always validate both sameness of outcome and newness of approach.

Use the strongest realistic checks available:

- existing tests
- new focused tests for preserved behavior
- typecheck
- lint
- targeted UI or API verification
- before-and-after behavior comparison at the boundary

Report:

- what stayed invariant
- what changed structurally
- any approved or unavoidable deviations
- assumptions made to keep the overhaul moving

## Response Pattern

When using this skill, structure the work like this:

1. Define scope and invariants.
2. State the new implementation thesis.
3. Rebuild the target section.
4. Run validation.
5. Summarize preserved behavior and major structural differences.
