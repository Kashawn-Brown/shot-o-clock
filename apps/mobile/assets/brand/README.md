# Brand assets

Master brand / identity source for Shot O'Clock — the marks, wordmarks, lockups,
taglines, and splash concept. This is **design source**, kept separate from the flat,
Expo-consumed runtime exports in `../images/` (which `app.json` references by name).

## Conventions

- **Filenames:** kebab-case, following one of these accepted patterns:
  - `shot-oclock-<role>[-<variant>].<ext>` — the default, for marks, wordmarks, and lockups.
  - `<style>-shot-oclock-<role>[-<variant>].<ext>` — a leading **style prefix** when an asset has more than one stylistic treatment (e.g. `flat-` for the glass mark's flat-line version alongside its sketch version).
  - `<phrase>.<ext>` — taglines, named by their kebab-cased phrase rather than a role.
- **Master = SVG**, where one exists; PNGs are exports. `glass/` is intentionally **PNG-only** — it's a deferred Batch 2 alternate-icon asset, so the flat/sketch PNGs are sufficient and no vector master is planned for now (revisit if/when the alternate-icon-picker is actually built).
- **Variant suffixes:**
  | Suffix | Meaning |
  |---|---|
  | `-on-brand` | baked onto the brand-purple background |
  | `-on-light` | baked onto a white background |
  | `-white-on-dark` | white-ink artwork baked onto a dark background |
  | `-transparent-navy` | alpha background, navy-ink artwork (use on light surfaces) |
  | `-transparent-white` | alpha background, white-knockout artwork (use on dark surfaces) |
  | `-transparent` | alpha background (single-color asset, no light/dark split) |

## What's here

| Folder | Asset | Keeper files |
|---|---|---|
| `logo/` | **Primary mark** — dial + V-hands + liquid "smile". **Ships.** | SVG master + `on-brand`, `on-light`, `transparent-navy`, `white-on-dark`, `transparent-white` |
| `glass/` | **Glass-in-Dial** — shot glass in a dial. Alternate-icon option; **PNG-only** (deferred Batch 2). | sketch style (`transparent`, `on-light`) + flat style (`flat-…-transparent`, `flat-…-on-light`) |
| `meniscus/` | **Meniscus** — liquid wave + hands (frameless). Alternate-icon option. | SVG master + `transparent` (frameless) |
| `horizontal-wordmark/` | **Horizontal wordmark** "Shot O'Clock" | SVG master + `transparent` |
| `stacked-wordmark/` | **Stacked wordmark** "Shot / O'Clock" | SVG master + `.png` export |
| `icon-O/` | **Icon-O treatments** — the dial replaces the "O" in O'Clock | horizontal + stacked, each SVG master + `transparent` |
| `lockups/` | **Icon + wordmark lockups** | `icon-left`, `icon-top-stacked` (both `transparent`) |
| `splash/` | **Splash concept** — stopwatch + splash + cups | SVG master + `transparent` PNG |
| `tagline/` | **Taglines** — set-in-caps phrases with end-dashes | `fun-starts-when-it-hits-zero`, `set-the-timer-start-the-party` |
| `explorations/` | Set-aside material — not used by the app | mirrors origin folders; see below |

### Identity status (as of Phase 17)

- **Mark is locked:** the primary mark **ships**; **Glass-in-Dial** and **Meniscus**
  are deferred **alternate-icon-picker** options.
- **Wordmark / lockup / tagline configuration is NOT decided** — the horizontal and
  stacked wordmarks, the icon-O treatments, the icon-left / icon-top-stacked lockups,
  and the taglines are all live candidates, to be resolved later by mocking them into
  real screens for comparison.
- **Lockups** can come from a pre-combined asset (the ones here) or be hand-assembled
  from the mark master + a wordmark master for finer control over positioning/sizing.
  Both paths are valid; the choice is made per placement.

## `explorations/`

Set-aside material — **the app never references it**. Current contents mirror their
origin folders: `horizontal-wordmark/` (an alternate wordmark), `meniscus/` (the framed
squircle renders + AI dupes), `splash/` (the other busy-illustration renders),
`stacked-wordmark/` (leftover stacked explorations), and `tagline/` (four alternate
taglines). Material here can be promoted back at any time — it's just a move.

## Feeding the app

`app.json` and `../images/` are **untouched**. When the identity is wired in, the final
runtime exports go to `../images/` under the names Expo expects, or an SVG is imported
into a component via `react-native-svg`. SVG-vs-PNG per placement is decided once the
asset is visibly rendered in its real spot, not in the abstract.
