# Methodology

Shot O'Clock is the product. This file is about the process.

---

## The Approach

Building with AI assistance is not the same as building well with AI assistance. The difference is structure. A capable AI agent given a vague prompt will produce something — it just won't produce something coherent, maintainable, or aligned with a real product vision over time.

The approach here was to build the structure first: a complete product plan, locked architecture decisions, phase-by-phase scope boundaries, and standing instructions that governed every session. The AI implemented within that structure. Every product decision, architecture call, and scope judgment was made outside the build sessions and handed in with full context. The AI never steered — it executed.

The result is a codebase where every major decision has a rationale, every phase has a clear boundary, and the build could theoretically be handed to a different AI agent or model and produce the same result. The structure was the work. The code was the output.

---

## Starting With a Plan

Before any development started, before a single line of code was written, the product and idea went through a 10-step planning process:

1. Define the goal
2. Write user stories
3. Define data models
4. Nail the MVP scope
5. Prototype the screens
6. Map the future of the product
7. Drill into the components
8. Pick the stack
9. Define the development process
10. Define the post-MVP roadmap

This produced a locked planning blueprint covering the product identity, data model, architecture rules, MVP scope, and post-MVP roadmap before implementation started. Every decision made after that point was logged with its rationale — nothing changed arbitrarily.

---

## The Phase System

The MVP was broken into 13 phases (0–12, with two sub-phases: 10B and 11B). Each phase had a defined scope, explicit acceptance criteria, a list of what it was not building, and a done-when checklist.

No phase started until the previous one was device-verified. No feature crept in without being assigned to a phase. This kept the build linear, reviewable, and recoverable.

---

## The Document Stack

A set of documents governed the build — some committed to the repo, others kept local by design.

**Committed:**

- `CLAUDE.md` — standing instructions the AI agent reads at the start of every session. Defines architecture guardrails, code standards, commit conventions, and what the agent cannot do without explicit approval.
- `timeline.md` — a running narrative of what each phase built and why, written as history rather than status.

**Local-only (gitignored intentionally):**

- `plan.md` — the living phase plan with scope, acceptance criteria, and done-when checklists. Kept local because it's a working document, not a deliverable.
- `decisions.md` — every architectural and product decision, numbered sequentially (D001 onward), with rationale. Kept local to allow honest, evolving documentation without repo noise.
- `build-log.md` — a plain-English narrative of what was built phase by phase, written for someone coming back to the project cold. Not a commit log — a genuine account of what changed and why.
- `CLAUDE.local.md` — session-specific behavior rules that supplement `CLAUDE.md`. Covers things like stop points, summary format, when to ask before acting, and how the build log and timeline are maintained.
- `docs/specs/` — source-of-truth specs for the state machine, game rules, RPC contracts, RLS policies, schema, and enums. If the code and a spec disagreed, the spec won.

The local files were not hidden — they were kept off the repo because working documents create noise in version history. The discipline of maintaining them was the point.

---

## Ground Rules

A few rules were non-negotiable throughout the build:

- The AI never wrote SQL migrations without showing the full diff first for approval
- The AI never resolved a genuine product decision or design ambiguity on its own — it stopped and asked
- Every session started with a scope confirmation before any code was written
- The AI worked in named chunks, stopped at meaningful points, and summarized what changed in plain terms before moving on
- Phase wraps were a formal checklist — plan updated, timeline committed, decisions logged, build-log entry drafted and approved, PR description generated

These rules existed because coherence erodes over time without them — decisions accumulate, context fades across sessions, and the build drifts from its own architecture. The rules kept that from happening.

These were not guardrails against incompetence. They were guardrails against drift — the gradual way a build loses coherence when decisions accumulate without documentation and context erodes across sessions.

---

## Steering the Ship

The common failure mode for AI-assisted development is the developer becoming a passenger. The AI proposes, the developer approves, and over time the developer loses the thread of what's in the codebase and why.

The structure here inverted that. Product decisions, architecture calls, and scope judgments were made by the developer first — outside of build sessions — and handed to the AI with full context. When something unexpected came up mid-build, it surfaced to the developer for a decision before work continued.

The AI handled the implementation. The planning, the architecture, the product judgment, and the scope control stayed with the developer throughout.