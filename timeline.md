# Timeline

## Current Status
*Last updated: 2026-06-13*

Phase 10B, "Mid-game joining," is code-complete (final device walk pending). A player can now enter a join code after the game has started and drop straight into the live round: the server's late-join gate accepts a fresh joiner into a running party (during a countdown or shot window, with late joining now on by default), and the join screen routes them by the party's current phase right into the timer or Shot O'Clock rather than flashing the lobby. The joiner's entry model was deliberately simplified — they participate fully in the round they walk into (take the shot or miss like anyone else, with the host able to reinstate them if they joined too late to act) rather than the more elaborate "active next round" exclusion that was built first and then removed; a recorded "which round did they join" column stays on the row as data but no longer drives any scoring. Their arrival shows up live on every device through the roster subscription already in place.

Two bugs from device testing were fixed alongside the feature. A device whose anonymous identity had been deleted underneath it (a `supabase db reset` during development wipes the auth user while the phone keeps reusing the old token) was hitting an opaque "something went wrong" on every create/join; the app now detects that orphaned session — at launch and at the data layer — and silently signs in a fresh guest, transparent to the user. And End Party was leaving non-host devices on the half-built summary placeholder from the timer and Shot O'Clock screens; those now route everyone home the same robust way the results screen already did, reading the end straight off the realtime payload. The in-game screens also lost their back arrows in favor of explicit End Party / Leave Party buttons, and the timer header was restyled (a back-style jump to the last round's results on the left, a settings placeholder on the right). Next is Phase 11 — the Final Summary — which will swap that End-Party-home routing to land everyone on the real game-over screen, with Phase 11B (host-only single-phone mode) still queued behind it.

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

## Phase 7 — Server-Authoritative Timer
*June 2026*

Phase 7 made the countdown real and, more importantly, made it the server's rather
than the phone's. The work opened with the clock: a drinking-game timer is worthless
if two phones disagree on how long is left, and device clocks drift, so `serverNow()`
— the single function every countdown reads — was taught to correct for that drift by
measuring its offset from the server once on mount via the `get_server_time` RPC,
assuming the server stamped its reply at the midpoint of the round trip so most of the
network latency cancels (D030). On top of that sits a hook that renders only
`phase_ends_at − serverNow()` on a quarter-second display tick and never owns or
advances anything — the locked rule that the timer is the server's (CLAUDE.md §2.1).
The host's Start Game button was wired to `start_game`, creating round one's countdown
and replacing the lobby with the timer, and the timer screen got a loader that pours
the real party — name, round number, deadline — into the countdown, retiring the
hardcoded placeholder.

The second half made the countdown actually go somewhere at zero. Because nothing on
the client may advance a phase, the transition is driven by polling: each device calls
`advance_phase_if_due` every couple of seconds once its corrected clock passes the
deadline, the first caller past zero performs the single real transition, and everyone
else is told nothing changed. The non-obvious part is that a device must re-pull
authoritative state after any successful poll, not only the one that won the race —
otherwise the losing phones sit forever on a countdown reading zero while one device
alone walks on (D031); at zero every device routes itself to the Shot O'Clock screen
by the session's phase. Two gaps surfaced on real hardware and were fixed: a guest
sitting in the lobby never followed the host into the game, because starting a game
touches only the session row and the lobby was only listening for roster changes — so
the lobby now also subscribes to its `party_sessions` row (a migration published it to
realtime), which is what unsticks guests from "Waiting for host to start…"; and the
timer's testing escape hatch no longer bounces the host back into the party on exit.
The referee / assigned-monitor system was also shelved entirely during the session
(D029) — social accountability in a friend group is enough, and the permission tier it
would need isn't worth the build.

## Phase 8 — Shot Window + Player Actions
*June 2026*

Phase 8 made the Shot O'Clock moment playable. Both the between-shots countdown and the full-screen shot window show the real server-authoritative time draining clockwise through a single react-native-svg progress ring (animated through one `strokeDashoffset`), and during the window a player taps Done (`mark_done`) or I'm Out (`mark_self_out`) with optimistic feedback that reconciles against the server. The session hook was taught to expose the caller's own roster row and their outcome for the current round at no extra query cost, and those drive the button states: Done is disabled for non-active players and once a self-out is recorded, with the server backstopping `SELF_OUT_IS_STICKY` so a force-close-and-reconnect can't tap Done after opting out, and I'm Out sits behind a confirmation gate. Out players see a plain "You're out" message rather than dead buttons. The phase deliberately shipped one piece ahead of its behavior, carried into Phase 9: when a player still held grace the button read "Skip this shot," but the underlying skip semantics weren't built yet — `mark_self_out` still permanently outed the player — so the label was correct ahead of the server fix (D034). Along the way every in-game screen gained a shared, always-works exit-to-home for testing (D032), and the progress ring prompted a standing rule to ask before hand-rolling around a missing library rather than building a fragile workaround (D033).

## Phase 9 — Grace Logic + Round Results
*June 2026*

Phase 9, "Grace Logic + Round Results," is complete and device-verified across all three grace modes. The headline fix made "I'm Out" a grace-aware skip rather than an automatic elimination: the server's round-finalizer now runs a voluntary self-out through the same elimination/grace ladder a miss does, so a player who skips with elimination off, with unlimited grace, or with their one grace still in hand returns to active next round (the grace case spending that grace), and only an unabsorbable skip eliminates — which also fixed an all-skip round that used to freeze the game in the "no active players" halt. On top of that sits the between-rounds experience: when a shot window closes, every device now lands on a Round Results screen that lingers for ten seconds before following the server into the next countdown (which is already running), grouping players into Took the Shot / Used Grace / Skipped / Missed / Out from a realtime outcome feed, with the viewer's own result pulled into a hero card. The same screen doubles as the terminal halt when everyone is out, where the host can End Party — and an end-party there now routes the other devices home rather than stranding them. The Skip/I'm Out button and its confirmation now also speak the real consequence (skip vs. consume-grace vs. permanent out) through a shared, tested copy helper. Next is Phase 10 — the host controls panel.

## Phase 10 — Host Controls
*June 2026*

Phase 10, "Host Controls," is complete and device-verified. Rather than a separate panel, the host's controls are integrated where the game already lives: a play/pause button and +30s / +1m circles sit on the countdown ring (host-only — a player sees just the timer, plus a PAUSED label when frozen), the party name opens a join-code popover for inviting people mid-game, and a draggable, sectioned Players sheet (Active / Out / Left) carries per-player Mark Out / Reinstate / Remove for the host and stays read-only for everyone else — all syncing across devices over realtime. Players gained a real Leave Party that actually gets them home and keeps them there: it records a self-out plus a new left_at marker (mark_self_left) and sets a local flag that suppresses the launch-reconnect, so a leaver isn't pulled back in. That marker also makes the roster and results tell "Left" apart from "Out." Round Results was rebuilt to a clean seven-group model — Took the Shot / Used Grace / Skipped / Missed / Out / Left / Kicked, each player in exactly one by a fixed priority — with Reinstated dropped entirely (it's a host action, not an outcome) and Left/Kicked read off player state and scoped to the round they actually happened in so they don't leak into later rounds. A server fix also lets the host reinstate a player who left and rejoined regardless of how many rounds passed. Two migrations this phase (mark_self_left, reinstate-rejoined) must be applied for those paths. Next is Phase 11 — the Final Summary — with Phase 10B (mid-game joining) and Phase 11B (host-only single-phone mode) newly scheduled.
