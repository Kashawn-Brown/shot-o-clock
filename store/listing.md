## App Store Title *(max 30 chars)*

`Shot O'Clock` (12) — clean and brand-forward; a bare, confident title reads more "real product" (helps 4.3(b)), and the subtitle carries the descriptor.

## Subtitle *(max 30 chars)*

`The synced party drinking game` — honest about the category, leads with "synced" (depth).

## Description

> Shot O'Clock turns a chaotic group drinking game into a synced, organized party experience.
>
> The host sets the pace, everyone joins with a code, and a single shared countdown runs live so the whole party hits each moment together. When the timer reaches zero, it's Shot O'Clock!
>
> Everyone takes a shot together when the timer hits zero, then the timer resets a little longer for the next round. Simple enough on paper, but one phone, one manual timer, and a group of people getting progressively more distracted typically makes it messier than it sounds. Shot O'Clock was built to fix that.
>
> Let Shot O'Clock handle the game:
> • A synced countdown across every device
> • A live roster that updates in real time
> • Escalating rounds that stretch longer as the night goes on
> • Host controls — pause, add time, manage players
> • Grace and elimination modes to control how competitive your group wants it
> • Round-by-round results and an end-of-night summary
>
> You're always in control. Every round you choose whether you want to take the shot and continue, skip the shot that round, or end your night completely. The app never requires, checks, or pressures anyone to drink. Play it however your group likes, and sit any round out.
>
> Shot O'Clock is made for adults of legal drinking age. Know your limits, look out for each other, never pressure anyone, and never drink and drive. How much you drink is always your choice.
>
> Gather the group, set the timer, start the party and let Shot O'Clock run the night.

## Keywords *(Apple: 100-char field, comma-separated, no repeats of the title)*

`drinking,party,group,friends,social,pregame,nightout,shots,drinks,timer,adults,hangout,games,host` *(97 chars)* Note: Apple recombines terms, so `party` + `games` covers "party games," etc. Deliberately excludes every excess term.

## Apple Review Notes *(the preemptive paragraph)*

> Shot O'Clock is a social party game for adults of legal drinking age. On first launch the app requires the user to confirm they are of legal drinking age and accept our terms, and it shows prominent responsible-use messaging (know your limits, never pressure others, never drink and drive). The app never requires, verifies, or pressures alcohol consumption — participation is entirely optional and a player can choose "I'm Out" every round. It is a full multiplayer product: a server-synced countdown shared live across devices, a real-time roster, host controls, and multi-round game logic — not a single-screen utility.
>
> Privacy Policy: [https://kashawn-brown.github.io/shot-o-clock/privacy-policy.html](https://kashawn-brown.github.io/shot-o-clock/privacy-policy.html) Terms of Service: [https://kashawn-brown.github.io/shot-o-clock/terms-of-service.html](https://kashawn-brown.github.io/shot-o-clock/terms-of-service.html)

---

## Bonus — Google Play needs one more field

Play has no keyword field (keywords live in the description) but **does** require a **Short description (max 80 chars)**:

- `A synced party game for groups — one shared timer, everyone plays together.` (74)

Play's full description can reuse the App Store description above as-is.

---

## Screenshots

Order — both stores. App Store takes up to 10, Google Play 2–8; the first three are the search-facing heroes. "Official picture" is the curated source capture (in `store/listing/`) used for that slot.

| # | Screen | Official picture | Headline (working) |
|---|--------|------------------|--------------------|
| 1 | Home | `store/listing/home.png` | — (cover, no headline) |
| 2 | Create Party | `store/listing/create_party.png` | Your party, your rules |
| 3 | Lobby | `store/listing/lobby.png` | Get the party started |
| 4 | Timer | `store/listing/timer.png` | One clock, every phone |
| 5 | Shot O'Clock | `store/listing/shot_o_clock.png` | When it's Shot O'Clock… |
| 6 | Round results | `store/listing/round_results.png` | See who's still standing |
| 7 | Final summary | `store/listing/summary.png` | Crown the champion |

The clean, status-bar-stripped captures in `store/listing/` are the curated source set; the shipped store images are framed marketing versions (headline + subhead + device-framed screenshot on a soft light background).

**Nothing here is locked yet:**
- **Background** — soft lavender `#E7E3FA` is the current pick; alternates: cooler periwinkle `#E6E9F7`, or warm cream `#F4EEDF`.
- **Copy** — each screen has two headline/subhead options (fuller vs. shorter); only the working headline is shown above.
- **Framing** — the clean captures can ship bare as a fallback if the frames aren't built in time.

Full build brief, both copy options, and the exact design spec (Poppins Bold/Medium, sizes, positions, shadow) live in the local `store/screenshot-frames-brief.md` (not committed).