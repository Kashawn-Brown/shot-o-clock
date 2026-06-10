# Timeline

## Current Status
*Last updated: 2026-06-10*

Phase 7, "Server-Authoritative Timer," is complete and verified across two devices.
The countdown is now fully alive: when the host taps Start Game, `start_game`
creates round one and starts the server's countdown, and every device — including
guests still sitting in the lobby — navigates into the timer and shows the same
remaining time, computed from the session's `phase_ends_at` minus a server-corrected
clock rather than the device clock (each phone measures its offset from the
`get_server_time` RPC using the round-trip midpoint, D030). No client owns the timer
(CLAUDE.md §2.1): the screen only renders `phaseEndsAt − serverNow()` on a display
tick, and the real transition is the server's — each device polls
`advance_phase_if_due` every ~2 seconds once its own clock passes zero, the first
past the deadline performs the single database transition, and the losing-race
devices re-pull state on any due poll so they leave the expired countdown together
(D031). At zero every device routes to the Shot O'Clock screen. Two gaps surfaced in
testing and were fixed: the lobby now also subscribes to its `party_sessions` row —
`start_game` mutates only the session, so the roster subscription never fired —
which is what unsticks guests from "Waiting for host to start…", backed by a
migration publishing `party_sessions` to realtime; and the timer's testing escape
hatch no longer bounces the host back into the party on exit. Known gaps left to
their own phases: host controls show on the player device (Phase 10), and End Party
doesn't yet propagate to other devices (Phase 11). Next is Phase 8 — the full-screen
Shot O'Clock window and the player Done / I'm Out actions (`mark_done` /
`mark_self_out`).

---

## Phase 0 — Repo Skeleton
*May 2026*

Stood up the repository: the Expo mobile app (React Native + TypeScript with
file-based routing), an initialized Supabase backend folder, and the linting/
formatting tooling. The Expo "default" template ships demo screens to prove the
scaffold works; we deleted them and dropped in a minimal placeholder rather than
spend effort reformatting code we'd throw away (D006). A handful of small
locked-in choices here — npm as the package manager, staying on Expo SDK 54,
Prettier settings — are recorded in decisions.md as D001–D007.

## Phase 1 — Database Foundation
*May 2026*

Built the database itself through migrations (versioned SQL scripts that build
the schema from scratch): all the lookup types, the eight core tables, and
Row Level Security — the Postgres feature that stops one party from reading
another party's data. RLS helpers and policies went into a single migration
file (D008), and every policy was explicitly scoped to logged-in users (D009).
No seed data: our guest users are created at runtime by the app, so fake seeded
users wouldn't match the real flow.

## Phase 2 — RPC Layer
*May–June 2026*

This phase builds the controlled functions the app calls to change game state —
the client never writes to the tables directly. Batch A laid the shared plumbing
(a standard success/error envelope, security hardening, the typed client wrapper)
plus the read-only functions, locking the conventions every later function copies
(D010). Batch B added the party-lifecycle functions: create, join (with a
reconnect path for players who drop and come back), leave, and end — each
surfacing a few small spec decisions recorded as D011–D013.

Batch C is done, and it carried D014 — the one genuinely architectural shift
this phase. Originally the game paused at a "round complete" screen until the
host manually started the next round; that gate is gone, so the synced timer
just keeps running — rounds advance on their own in one atomic database step,
and the manual `start_next_round` function was dropped from the MVP entirely.
The work landed in two halves: first the specs were rewritten to match the
decision (with a follow-up that swept up stale references to the deleted
function), then the two functions themselves — `start_game`, which kicks off
round one, and `advance_phase_if_due`, the function every phone polls to drive
the timer, backed by a sealed-off helper that finalizes each round under the
party's grace rules and rolls straight into the next. The one exception to
auto-advance is when everyone has gone out: there the game deliberately stops
and waits for the host to step in.

Batch D added the two in-game taps — Done and I'm Out — that let players record
what they did during a shot. Until it landed, the Batch C finalizer had nothing
to read and would have scored everyone as a miss.

Batch E closed the phase with the host's manual controls, in four small steps
(D015). First a pure refactor: the "start the next round" logic that lived inside
the round-finalizer was pulled out into its own shared piece, so a second caller
could reuse it — needed because reinstating a player after everyone has gone out
must resume the loop without re-finalizing the round that already ended. Then the
timer controls (pause, resume, add time), which freeze and rebuild the synced
countdown without ever letting the client own it; each now also leaves a marker
in the timer's event history so the timeline can be replayed. Then the two "do it
now" controls — skip the countdown, or end the shot window early — which simply
trigger the same transitions the timer would have. Finally the player overrides:
the host can mark a player out, reinstate one (which restores their forgiven miss
and, if it un-sticks the all-players-out halt, kicks the game back into motion),
or remove someone entirely. With Batch E in, the host can steer every part of the
game by hand. The remaining Phase 2 work — exercising each function against a real
party — is deferred to Phase 3+, when the app's guest-login flow exists to drive
it (issue #003).

## Phase 3 — Expo App Skeleton
*June 2026*

This phase gave the database a face: every screen the game will show, built as an
empty shell and wired into a flow you can walk end to end, with no live data
behind any of it. A single design-tokens file became the one home for colors,
type sizes, and spacing — greyscale for now to match the wireframes, with the
app's real purple defined but pointedly unused so the theme is a later switch,
not a rewrite — and one shared button sits on top of it. The low-level utilities
were finished underneath: a typed environment loader that fails loudly on a
missing value, and the time helpers the synced timer will later pour into.
Thirteen route files mirror the wireframes, three of them built as single files
that will adapt to host-or-player views rather than as duplicated pairs. Two
deprecation and tooling wrinkles were squared away honestly — a deprecated
safe-area component swapped for its maintained replacement, and a Phase 2
formatting drift plus a set of dependency-version notices cleaned up so the
automated checks pass project-wide.

## Phase 4 — Guest Identity + Age/Terms
*June 2026*

Phase 4 put a real, persistent guest behind the shell. On first launch the app
signs in through Supabase Anonymous Auth and persists the session to encrypted
device storage so the same identity survives a force-close — written through a
custom adapter that chunks the session blob under Android's per-value size cap,
the one piece of genuinely custom logic and the reason the project's first test
runner (jest-expo) was stood up. Age and terms confirmation landed as two
surfaces: a one-time first-launch gate covering host and guest, plus per-join
checkboxes on the Join screen for point-of-action reaffirmation (D016). The
display name became the spine of identity — captured once at first launch,
reused as the host's name on Create and prefilled into Join (D017) — and the
name and consent steps were collapsed into a single onboarding screen. The phase
closed on reconnect: rather than track a party locally, the app asks the server
on launch which party the guest belongs to and routes them back into it, though
proving that end to end had to wait for parties to exist (#006). A shared-device
limitation was recorded with its planned fix — a "Reset this device" action —
which is why a lean Settings phase was inserted as Phase 12 (D018).

## Phase 5 — Create + Join Party
*June 2026*

Phase 5 connected the two front doors to the engine. The Create and Join screens
were wired to the create_party and join_party functions — the first time those
ran against real signed-in guests, the verification deferred since Phase 2 — with
the validation and the minute-to-second conversion pulled into small unit-tested
modules rather than buried in the screens, and a new shared error banner carrying
every failure. The Create form then went through an extended run of device-driven
polish: the numeric fields became stepper controls, the party name became a
silently-held dated default that shows as an empty placeholder but never submits
empty, and the grace-mode selector gained a live description. Join's code field
sanitizes as you type so a malformed code can't be entered, and a valid code
lands a fresh join, a reconnect, or a self-left rejoin in the lobby all the same.

Device testing then flushed out the phase's real substance. A host who created a
party was trapped in the placeholder lobby by the launch-reconnect, with no way
out, so a confirmation-gated back control was added that ends the party (or
leaves it, for a guest) and returns home — a small slice of Phase 6 pulled
forward to make testing possible. Two backend bugs were found and fixed with
migrations: a security-layer recursion latent since Phase 1, where the membership
helpers re-triggered the very policy that called them and overflowed the stack on
the first authenticated read (D020), and a rejoin rule that wrongly blocked a
player who had voluntarily left a lobby, conflating leaving with being kicked
(D024). Several post-MVP product decisions were also logged while fresh — a
shared party album, late joining, out-player notifications, and roster-row
contents (D019, D021–D023). The copyable join code was deferred to the Phase 6
lobby where it belongs.

## Phase 6 — Lobby + Realtime Roster
*June 2026*

Phase 6 turned the lobby from a Phase 3 placeholder — a hardcoded name, a fake
join code, four invented players — into a live, role-aware waiting room. A read
of `get_party_state` now feeds the screen the real party, its join code, and the
actual roster, and the screen works out who is looking at it from the caller's
own row: host and player share one file, branching on role. That role detection
and the shaping of the snapshot into a view were split into a pure, import-free
function so the logic — who's the host, who's "you," who counts as active, which
rows to drop — could be unit-tested without rendering, leaving the screen to just
display what it returns. A host sees a copyable join code, a Remove action on
every other player, and a Start button disabled until at least one active player
is present; a player sees a waiting state and a Leave button, with no code or
controls.

Making the roster live was the heart of the phase. Supabase Realtime only emits
changes for tables explicitly published to it, so a migration added
`party_players` to the realtime publication, and the lobby now subscribes to its
party and re-pulls the full authoritative snapshot on every change rather than
splicing the changed row into what it already holds (D027) — because the server
read already encodes the row-level-security rules about who may see whom, and
realtime delivery is gated by those same rules, so patching from raw event
payloads would quietly miss what a non-host isn't allowed to receive. The refresh
is silent, so an on-screen roster never flashes a spinner when someone joins.
Removal is two-sided and permanent by design (D028): the host's own row never
offers Remove and the function refuses to remove a host regardless, and when the
host removes someone, that device hears the change, its follow-up read comes back
"not a member," and it shows a brief "removed from party" notice and routes home
— so being removed is something the removed person experiences, not just a row
vanishing from the host's screen. The phase also paid back the join-code copy
deferred from Phase 5, adding `expo-clipboard` through Expo's installer so the
version matched the pinned SDK (~8.0.8). It was verified across two devices: the
roster synced live on a join, the player view showed the waiting state with no
code, and a host removal popped the alert on the kicked device and sent it home.
Next is Phase 7 — the server-authoritative timer.
