# Known Issues & Decisions Log

> Single source of truth for things that happen during development that aren't (yet) reflected in the locked specs.
> Updated by Claude Code as work happens, and by the user as needed.
> Cross-reference: `CLAUDE.md` §8 for the discipline; `docs/PHASE_ACCEPTANCE_CRITERIA.md` for phase-level progress.

---

## How to Use This File

This file has three sections:

1. **Open Issues** — currently unresolved bugs or problems. New issues are added here.
2. **Decisions Log** — choices made during development that weren't covered by the existing specs. Captured at the moment of decision so they don't get re-litigated later.
3. **Resolved Issues** — archive of bugs/problems that have been fixed. Moved from "Open Issues" when resolved.

### When to log an issue

Claude Code logs an issue when it encounters:

- A bug that can't be fixed in the current task without scope expansion
- Unexpected behavior whose root cause isn't obvious
- An edge case the specs don't cover, where a workaround was applied
- A piece of code that's working but needs revisiting (smells, TODOs, hacks)

A bug fixed in the same task it was discovered does NOT need an entry — that's just a normal fix, captured in the commit history.

### When to log a decision

Claude Code logs a decision when:

- The specs don't cover the case at hand and a judgment call has to be made
- A trade-off is chosen between two reasonable options
- An implementation detail is decided that future Claude Code sessions might revisit (e.g. "use Tone library for sound" vs "build a thin wrapper")
- The user makes a call mid-session that affects future work

**Decisions are required, not optional.** Silent ad-hoc decisions accumulate into invisible technical debt. If you would otherwise make a judgment call, you must log it.

### Entry IDs

- Issues: `#NNN` (zero-padded, sequential: `#001`, `#002`, `#003`)
- Decisions: `#DNNN` (`#D001`, `#D002`)

Don't reuse IDs. When an issue moves from Open to Resolved, its ID stays the same.

### Entry format

See the examples below for the full shape. At minimum:

- Title (one line)
- Date discovered/decided
- Phase or context
- Status
- Description (what's wrong / what's the question)
- Resolution or current plan
- Related files / commits when applicable

---

## Open Issues

*Issues that are known but not yet resolved.*

(none yet — first issue will land during development)

---

## Decisions Log

*Decisions made during development that fill gaps in the specs.*

### Example entry format (delete after the first real entry is logged):

```markdown
### #D001 — [decision] <Short title>

**Date:** YYYY-MM-DD
**Phase:** <phase number, or "pre-development">
**Decided by:** <Claude Code | user | both>

**Question:**
<What was the fork in the road? What did the specs not cover?>

**Options considered:**
- (a) <Option A summary>
- (b) <Option B summary>
- (c) <Option C summary, if any>

**Decision:** <Chosen option>

**Why:**
<Short rationale — 1-3 sentences>

**Documented in:**
- `docs/specs/<file>.md` §<section>  (if the decision affected a spec)
- Commit `<sha>`  (if implementation followed immediately)
```

(none yet)

---

## Resolved Issues

*Issues from "Open Issues" that have been fixed. Kept for reference.*

### Example entry format (delete after the first real entry is logged):

```markdown
### #001 — [bug] <Short title>

**Found:** YYYY-MM-DD during Phase <N> <QA | dev | review>
**Resolved:** YYYY-MM-DD
**Phase:** <N>
**Status:** Resolved (commit <sha>)

**Description:**
<What was wrong, observed behavior>

**Context:**
<What was happening when we hit it; conditions that triggered it>

**Root cause:**
<Why it was happening — the actual bug, not the symptom>

**Resolution:**
<What was changed to fix it>

**Related files:**
- `<path>`
- `<path>`
```

(none yet)

---

## Conventions

### When to mark a Decision as superseded

Sometimes a decision logged here gets revisited and changed later. When that happens:

1. Don't delete the original decision entry. Mark it `[superseded by #DNNN]` in the title.
2. Add a new decision entry with the new choice, referencing the prior one.
3. This preserves the audit trail of how thinking evolved.

### When a decision affects a spec

If a decision rises to the level of "this should be in the locked specs," do BOTH:

1. Log it here for the audit trail.
2. Update the relevant spec in `docs/specs/` (per `CLAUDE.md` §8.1).

Once it's in the spec, the spec becomes the source of truth. The decision log entry remains as historical context.

### Pruning resolved issues

The Resolved Issues list grows over time. Don't delete entries, but if it gets unwieldy (say, 100+ entries), consider archiving the oldest into `docs/archive/RESOLVED_ISSUES_PRE_<date>.md`. For MVP, this won't be a problem.

---

## Quick Reference

- Bug found, fixing now → just commit normally, no entry needed
- Bug found, can't fix immediately → add to **Open Issues**
- Bug fixed that was previously in Open Issues → move to **Resolved Issues**
- Spec gap or unanticipated choice → add to **Decisions Log** BEFORE implementing
- Specs need updating to reflect the decision → update the spec AND log the decision here
