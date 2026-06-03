> **Deprecated:** No longer needed as of 2026-06-03. No longer maintained.

# PROMPT_TEMPLATES.md

> **Copy-paste templates for prompting Claude Code on Shot O'Clock.**
> Strip sections you don't need, fill in `{placeholders}`, add specifics. These templates match the 7-section prompt anatomy in `docs/AI_BUILD_PROTOCOL.md` §3.

---

## How to Use These Templates

Every template has the same shape: **Context → Task → Rules → Files → Don't touch → Acceptance criteria → Output expectations.** Templates pre-fill the sections that are predictable for a given kind of task (e.g. "adding an RPC" always involves the same rules and same kinds of files), leaving you to fill in only the task-specific bits.

`{placeholders}` are things you fill in. `[optional sections]` can be deleted if not relevant. Don't overthink it — these are starting points, not contracts.

---

## Template 1: Starting a New Build Phase

Use when kicking off one of the numbered phases in the planning blueprint (Phase 0 through Phase 12, or any post-MVP phase).

```
We are starting Phase {N}: {phase name from blueprint}.

Context:
- Current state: {what's done, what branch we're on}
- Last commit: {short hash + summary}

Task:
Set up the scaffolding for Phase {N}. Read `docs/PHASE_ACCEPTANCE_CRITERIA.md` §{N}
for the full list. For this prompt, just do the following sub-tasks:

1. {sub-task 1}
2. {sub-task 2}
3. {sub-task 3}

Stop after sub-task {N}, do not continue into the next sub-task without my confirmation.

Relevant rules:
- CLAUDE.md §{relevant sections}
- {any specs that apply}

Files involved:
- {expected paths}

Do not change:
- Any file outside the scope above
- Any existing migration
- Any locked spec in docs/specs/ unless this task explicitly requires a spec update

Acceptance criteria:
- {checklist item 1}
- {checklist item 2}
- {checklist item 3}

Output:
- Brief plan before any code
- Implementation in small commits
- One-line summary per commit
- List any open questions or surfaced issues at the end
```

---

## Template 2: Implementing an RPC

Use when adding or modifying a Postgres function exposed as a Supabase RPC.

```
Add the `{rpc_name}` RPC.

Context:
We're in Phase {N}. Previous RPC work: {brief}.

Task:
Implement the `{rpc_name}` function according to its spec.

Relevant rules:
- CLAUDE.md §2 (locked architecture), §2.2 (game logic in Postgres), §2.6 (idempotency)
- docs/specs/rpc-contracts.md §{section for this RPC}
- docs/specs/rls-rules.md §{relevant tables}
- docs/specs/game-rules.md §{relevant rules}

Files involved:
- supabase/migrations/{next_timestamp}_{rpc_name}.sql (new migration)
- docs/specs/rpc-contracts.md (update with any clarifications discovered)
- src/lib/api/{relevant_wrapper}.ts (typed client wrapper)
- src/types/api.ts (return type and error type)

Do not change:
- Any existing migration
- Any other RPC
- RLS policies on other tables
- The schema of any existing table (if a schema change is needed, stop and ask)

Acceptance criteria:
- New migration applies cleanly to a fresh local Supabase
- RPC accepts the params listed in the spec and rejects everything else
- RPC is idempotent for any retryable call
- Returns shape matches the spec
- Error codes match the spec
- Client wrapper in src/lib/api/ has typed params and return
- Manual test: I can call this RPC from the Supabase dashboard with sample params and get the expected response

Output:
- Brief plan with the SQL approach
- Migration SQL
- Client wrapper
- Commit list with one-line summaries
- Note any edge cases the spec didn't cover
```

---

## Template 3: Implementing a Screen

Use when adding or modifying one of the 13 locked MVP screens (or any post-MVP screen).

```
Implement the {screen name} screen.

Context:
Phase {N}, working on {feature}. The wireframe for this screen is in the
low-fidelity wireframes project (Figma export). Match its structure, not its
visual fidelity.

Task:
Build the {screen name} screen with the elements listed in
`docs/planning/05-prototype.md` §{screen number}.

Relevant rules:
- CLAUDE.md §2.5 (no client-owned state for protected data)
- CLAUDE.md §5.3 (file organization), §5.5 (component structure)
- docs/specs/mvp-state-machine.md §{relevant phase}
- docs/planning/05-prototype.md §{screen number}

Files involved:
- app/{route path}.tsx (route entry)
- src/features/{feature}/components/{ScreenName}.tsx (screen component)
- src/features/{feature}/hooks/use{Hook}.ts (data hook if needed)
- src/features/{feature}/api/{wrapper}.ts (RPC wrapper if needed)

Do not change:
- Any other screen
- Any shared component outside src/features/{feature}/
- Any RPC
- Any spec

Acceptance criteria:
- Route is registered and reachable
- Screen renders without errors
- Realtime data is read from Supabase, not local-mocked
- All actions go through RPCs, never direct table writes
- Loading and error states are handled with the shared UI components
- Screen passes lint and typecheck
- Manual test: I can navigate to this screen on a real device and the listed UI elements are visible

Output:
- Brief plan before code
- Implementation
- Commit list
- Screenshot or note about anything that should be visually polished later
```

---

## Template 4: Adding a Migration

Use when changing schema (new table, new column, new index, RLS policy change, enum value addition).

```
Add a migration: {brief description}.

Context:
{Why this schema change is needed}. The spec for this change is in
`docs/specs/schema.md` §{section}.

Task:
Write a new migration file that {what it does}.

Relevant rules:
- CLAUDE.md §2.3 (RLS on all user-facing tables)
- CLAUDE.md §10 (migrations require confirmation — this prompt IS the confirmation)
- CLAUDE.md §11 (do not drop or destructively alter existing migrations)
- docs/specs/schema.md §{section}
- docs/specs/rls-rules.md (if RLS is touched)

Files involved:
- supabase/migrations/{next_timestamp}_{descriptive_name}.sql (new)
- docs/specs/schema.md (update if shape changes)
- docs/specs/rls-rules.md (update if policies change)
- docs/specs/enums.md (update if enums change)

Do not change:
- Any existing migration file
- Any table not listed in this prompt

Acceptance criteria:
- Migration applies cleanly to a fresh local Supabase (idempotent against an empty db)
- Migration applies cleanly on top of the current local Supabase (idempotent forward)
- RLS is enabled on any new user-facing table
- Default RLS policies are restrictive (deny by default)
- Indexes are added for any column likely to be filtered or joined
- Migration is commented with the why
- Schema doc reflects the new state

Output:
- Brief plan with the SQL approach
- Migration SQL
- Doc updates
- Commit list
- Note any followup (e.g. data backfill needed, related RPC needs updating)
```

---

## Template 5: Fixing a Bug

Use when something doesn't work as the spec says it should.

```
Fix a bug: {one-line description}.

Context:
What I observed: {what I did, what I saw, what I expected}.
The spec says: {quote or reference the relevant rule}.

Task:
Diagnose and fix.

Relevant rules:
- CLAUDE.md §11 (do not silently catch errors)
- {any specs that describe the correct behavior}

Files involved:
- {your best guess of where the bug is — Claude Code can expand the search}

Do not change:
- Any file unrelated to the bug
- The spec, unless the spec is what's actually wrong (in which case stop and ask)

Acceptance criteria:
- Bug is reproducible with a clear set of steps before the fix
- Fix is targeted — does not touch unrelated code
- A test is added if reasonable (regression prevention)
- If the bug came from a misreading of the spec, the spec gets a clarification

Output:
- Diagnosis: what was actually wrong, in one paragraph
- Fix
- Test (if applicable)
- Commit list
```

---

## Template 6: Adding a Dependency

Use when a new npm package or Supabase extension is needed.

```
Add a dependency: {package name}.

Context:
I need {package} to {do what}. {Or: Claude Code suggested it for {task} and I'm
approving it.}

Task:
Add the dependency, configure it, and document the choice.

Relevant rules:
- CLAUDE.md §6 (dependency management — stay current)
- CLAUDE.md §10 (new dependencies require confirmation — this prompt IS that)

Pre-work:
- Run `npm view {package} version` and note the current stable
- Check changelog for major version notes
- Confirm it supports the current Expo SDK and Node LTS we're on
- List alternatives you considered

Files involved:
- package.json (add dep)
- package-lock.json (lockfile)
- {wherever the dep is wired in}

Do not change:
- Any other dependency version

Acceptance criteria:
- Package installs cleanly
- Version is the current stable (or a justified earlier version)
- App still runs after install
- Commit message explains: package, version, why, alternatives considered

Output:
- Brief: package, version, why, alternatives, any deprecation notes
- Install command
- Wiring code
- Commit list
```

---

## Template 7: Refactoring Existing Code

Use when reorganizing or cleaning up code without changing behavior.

```
Refactor: {short description}.

Context:
{What's currently messy and why it matters}.

Task:
Refactor {what} to {desired state}. **Behavior must not change.**

Relevant rules:
- CLAUDE.md §5 (code quality)
- CLAUDE.md §10 (mass-rewriting existing code requires confirmation — this prompt IS that)

Files involved:
- {explicit list}

Do not change:
- Any behavior (this is a pure refactor)
- Any file not in the list above
- Any test (tests should pass before and after with no edits)

Acceptance criteria:
- Diff shows structural changes only, not behavioral changes
- All existing tests still pass
- Lint and typecheck still clean
- Affected docs are updated if the public shape of a module changed
- Commit messages clearly mark these as `refactor:`

Output:
- Brief plan: what's being moved/renamed/restructured and why
- Refactored code
- Commit list (small commits — refactors are easy to break into pieces)
```

---

## Template 8: Updating a Spec or Doc

Use when a doc needs to change — either because something was wrong, something was missing, or behavior is intentionally changing.

```
Update doc: {doc path} §{section}.

Context:
{Why the doc needs updating: bug, missing case, design change}.

Task:
{What the new content should say}.

Relevant rules:
- CLAUDE.md §8 (documentation discipline)
- If this changes behavior, code changes follow in a separate prompt

Files involved:
- {doc path}

Do not change:
- Code (this is a doc-only change)
- Any other doc

Acceptance criteria:
- Doc reads cleanly and consistently with the rest of the spec
- Cross-references to other docs are updated if relevant
- Commit is `docs: ...` only

Output:
- Diff of the doc
- Commit
- Flag any follow-up code changes that this spec change now requires
```

---

## Template 9: Resuming After a Break

Use when starting a session after time away (a day, a week, longer).

```
Resuming work on Shot O'Clock after {time gap}.

Before I prompt the next task, please:

1. Read CLAUDE.md and AI_BUILD_PROTOCOL.md in full.
2. Check `git log --oneline -20` to see recent commits.
3. Check `git status` for any uncommitted changes.
4. Check `docs/PHASE_ACCEPTANCE_CRITERIA.md` for which phase we're in and what's ticked off.
5. Note any commits prefixed `wip:` — those are incomplete checkpoints.

Then tell me:
- Current phase and what's done / not done
- Any WIP state to be cleaned up
- Any uncommitted changes in the tree
- Your best guess at the right next task, framed as a question I can confirm or redirect

Do not start any task until I confirm direction.
```

---

## Template 10: Code Review / Sanity Check

Use when you want Claude Code to audit existing code without changing it.

```
Sanity-check the {module / feature / file} for issues.

Context:
{What you want reviewed and why}.

Task:
Read-only review. Identify potential issues. Do not write fixes yet.

Relevant rules:
- CLAUDE.md §2 (architecture), §5 (code quality), §11 (hard "do not" rules)
- {any specs that govern this code}

Files to review:
- {explicit list}

Do not change:
- Anything. This is a review, not a fix.

Output expectations:
- List of issues found, categorized as: blocker / important / nit / question
- For each issue: file:line, what's wrong, what the spec or rule says it should be
- For blockers and important issues, suggest a fix shape (but do not write the code)
- For nits, just list them
- For questions, ask them clearly

After I review your findings, I'll prompt fixes individually.
```

---

## Template 11: "Something Seems Off" — Open-Ended Debug

Use when something is wrong but you don't know what.

```
Something seems off. I'm seeing {observed behavior} when I do {steps}.

I don't have a precise theory of the bug yet. Help me narrow it down.

Task:
Investigate. Do not fix anything yet.

Steps:
1. Read relevant code paths starting from {entry point}
2. Identify candidate causes
3. Rank them by likelihood
4. Tell me what additional info would help disambiguate (logs, a test, a value to inspect)

Do not change:
- Anything yet.

Output:
- Top 3 candidate causes with rationale
- What you'd need from me to narrow further
- A proposed minimal diagnostic step (e.g. "add a console.log here and re-run")
```

---

## Template 12: Quick Tweak

For genuinely trivial changes — a typo, a copy edit, a one-line fix — heavyweight templates are overkill.

```
Quick tweak: {one sentence describing the change}.

File: {path}
Change: {what to change}

Commit and push when done.
```

If you find yourself reaching for this template and the change isn't actually trivial, switch to a fuller template.

---

## Notes on Customization

These templates will evolve as we figure out what's working. Adjust freely. If a pattern emerges that warrants a new template, add it. If a template is consistently producing noise, prune it.

Two anti-patterns to watch for:

- **Bloat.** A template that's too long stops being copy-pasted and starts being skipped. If a section is rarely filled in, remove it.
- **Rigidity.** Templates are scaffolds, not contracts. If the task doesn't fit any template, write a freeform prompt that hits the 7 anatomy sections from `AI_BUILD_PROTOCOL.md` §3.
