# AI_BUILD_PROTOCOL.md

> **The operational workflow for building Shot O'Clock with Claude Code.**
> CLAUDE.md defines the rules. This doc defines how to actually run a build session against those rules.

---

## 1. Purpose

This project is intentionally AI-led: the user is in supervised QA mode, not hands-on coding mode. That means the *workflow* matters as much as the code. A loose, free-form prompting style produces drift, scope creep, and unreliable output. A tight, predictable workflow keeps Claude Code on rails.

This doc codifies that workflow. Both the user and Claude Code should follow it.

---

## 2. The Core Protocol

Every unit of work follows the same shape:

```
Pick one specific task
  → Reference the relevant spec(s)
  → Define files involved and files to leave alone
  → Define acceptance criteria
  → Claude Code explains the plan briefly BEFORE writing code
  → User confirms or redirects
  → Claude Code implements
  → Claude Code commits (often, in checkpoints)
  → User reviews
  → Move to next task
```

If any step is skipped, the protocol is broken. The most common skipped step is "Claude Code explains the plan briefly before writing code" — do not skip it on anything beyond trivial changes.

---

## 3. Anatomy of a Good Prompt

Every prompt the user sends to Claude Code should contain these sections (use the templates in `docs/PROMPT_TEMPLATES.md` as starting points):

1. **Context** — one sentence: what phase are we in, what just happened.
2. **Current task** — one specific goal, narrow enough to fit in a single chunk.
3. **Relevant locked rules** — paste or reference the specific spec sections that govern this task. Do not assume Claude Code has them memorized.
4. **Files involved** — exact paths Claude Code is expected to read, create, or modify.
5. **Do not change** — files, modules, or decisions that are out of scope for this task.
6. **Acceptance criteria** — a checklist the user will tick off after Claude Code is done.
7. **Output expectations** — what Claude Code should produce in chat (brief explanation, list of commits, mention of any blockers).

A prompt missing any of these is a prompt Claude Code will respond to with questions before starting. That is correct behavior.

---

## 4. Session Lifecycle

### 4.1. Start of session

Claude Code, on a new session:

1. Read `CLAUDE.md` in full. The standing rules apply regardless of what's in this session.
2. Read the relevant spec for the current task. If the task involves an RPC, that's `docs/specs/rpc-contracts.md`. If it's game logic, that's `docs/specs/game-rules.md`. Etc.
3. Check git status: are there uncommitted changes from a previous session? Stale branches? Confirm clean state before starting.
4. Confirm the current phase in `docs/PHASE_ACCEPTANCE_CRITERIA.md` so the work fits the larger build sequence.

If any of these reveals something unexpected (stale code, untracked files, missing docs), surface it to the user before starting the task.

### 4.2. During session

- One sub-task at a time. Commit between sub-tasks (see CLAUDE.md §7.3).
- Talk *less* than you code. The user wants diffs, not paragraphs. A brief plan, the implementation, a brief summary of what was committed — that's the rhythm.
- If a question comes up that can't be answered from CLAUDE.md, the specs, or the user's prompt, *ask*. Do not guess.
- If a scope-adjacent issue surfaces (a typo, a bug, a missing test), note it in chat but do not fix it without confirmation. See §6.

### 4.3. End of session

Before ending a session (or before the user closes the chat):

1. All work is committed. No uncommitted changes left in the working tree.
2. All commits are pushed. Default behavior is push-after-commit (see CLAUDE.md §9.5).
3. If a sub-task was abandoned mid-flight, the last commit is tagged `wip:` and the user is told what the WIP state contains.
4. Any open questions, blockers, or follow-up tasks are listed in chat so the user can carry them into the next session.
5. If a doc was supposed to be updated as part of the task and wasn't, flag it explicitly.

A clean session ends with the user able to walk away and resume cold tomorrow without needing this Claude Code session's memory.

---

## 5. The User's QA Loop

The user is not reading every line of code. The user is verifying:

- **Does the diff match the plan you described?** If Claude Code said "I'll add a join_party RPC and a join screen," the diff should be those two things. Surprise files = red flag.
- **Are the commits reasonable size and granularity?** One giant commit = red flag. Twenty commits for a small change = also red flag.
- **Did the right docs get updated?** If schema changed, `docs/specs/schema.md` should be in the diff. If an RPC was added, `docs/specs/rpc-contracts.md` should be in the diff.
- **Does the change pass the acceptance criteria the user set?** Not Claude Code's interpretation of them — the literal criteria.
- **Does the app still run?** A sanity check after each merge.

The user's job is not to debug. If something is broken, the user reports it to Claude Code and Claude Code fixes it.

---

## 6. Scope Creep Prevention

This is the single most common protocol failure. Examples of scope creep:

- "While I was adding the join_party RPC, I noticed the create_party RPC has a small bug, so I fixed it too." → **No.** That's a separate fix, separate commit, separate confirmation.
- "While renaming this prop, I also reformatted the file and removed an unused import." → **No.** Reformatting and import cleanup are separate refactor commits.
- "I added the host controls, and also added tests for the player controls since they didn't have any." → **No.** Tests for player controls is its own task.
- "I noticed the spec doesn't cover this edge case, so I picked a reasonable default." → **No.** Stop and ask. Specs are the source of truth.

The rule: **note it, don't fix it.** Surface adjacent issues in chat. Let the user decide whether to spin them up as new tasks.

This applies even to "obvious" small fixes. The user is not optimizing for fewer keystrokes — the user is optimizing for being able to predict what every commit contains.

---

## 7. Multi-Session Continuity

Claude Code has no memory across sessions. The user has limited memory too — that's part of why this project is documented heavily. The continuity strategy is:

- **The docs are the memory.** If a decision is not in `docs/specs/` or in a code comment, it doesn't exist for the next session.
- **The git log is the memory.** Commits with good messages and bullets are how the next session learns what changed.
- **The PHASE_ACCEPTANCE_CRITERIA.md checkbox is the memory.** Tick off what's done so the next session knows where to pick up.

When resuming a session that's been paused for a while, use the "Resume from where we left off" template in `docs/PROMPT_TEMPLATES.md`. Claude Code will read CLAUDE.md, recent commits, the phase checkboxes, and any WIP commits to reconstruct context.

---

## 8. Anti-Patterns

Behaviors that break the protocol. Both the user and Claude Code should call these out when they happen.

### 8.1. User-side anti-patterns

- **Vague prompts.** "Add the lobby" without specifying which spec, which files, which acceptance criteria.
- **Multi-task prompts.** "Add the lobby, fix the join code regex, and bump Expo SDK" → three separate tasks, three separate prompts.
- **Skipping reviews.** Letting Claude Code stack 10 commits before reviewing any of them. Drift compounds.
- **Reactive scope changes.** Mid-implementation, adding "oh and also do X." Wait for the current task to finish, then prompt the new task.

### 8.2. Claude Code-side anti-patterns

- **Starting without a plan.** Diving into code before stating what the change will be.
- **Bundling commits.** One commit per logical change. Do not stack five changes into "feat: misc improvements."
- **Silent scope expansion.** Touching files the user didn't list, even with good intentions.
- **Inventing rules.** When the spec is silent, ask. Do not extrapolate.
- **Skipping doc updates.** If behavior changed, the spec must change in the same commit (or the very next one, with a clear `docs:` commit).
- **Long explanations, short code.** The ratio should be inverted. Brief plan, real code, brief summary.

---

## 9. When to Step Back and Replan

Some signals that mean stop implementing and have a planning conversation instead:

- The user has asked for the same kind of fix three times — the spec is probably wrong, not the code.
- A "small" task has produced more than ~10 files of change or more than ~30 minutes of work without finishing. It's probably actually two or three tasks.
- Claude Code is making decisions that aren't in any spec. Those decisions belong in a spec first.
- The user is unhappy with how something works. Spec it, then change it. Do not iterate the code blindly.

Stepping back to update the spec is *cheaper* than iterating code that's based on a wrong spec. The docs are not bureaucracy — they're the cheap part.

---

## 10. Summary

The whole protocol distills to:

1. **One task at a time, with explicit scope.**
2. **Plan before code.**
3. **Commit often, in checkpoints, with good messages.**
4. **Note adjacent issues, do not fix them.**
5. **Update the docs in the same diff as the code.**
6. **End each session clean and committed.**

If both sides follow this, the codebase stays trustworthy and the user stays in control. If either side drifts, stop and reset.
